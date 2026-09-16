import crypto from 'node:crypto';

const REDIS_TIMEOUT_MS = 1200;
const THREAT_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_TTL_MS = 90 * 1000;
const SCORE_DELAY_MS = 650;
const MAX_DIFFICULTY = 6;

function redisConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

function clientIp(req) {
  const real = String(req.headers?.['x-real-ip'] || '').split(',')[0].trim();
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return real || forwarded || String(req.socket?.remoteAddress || 'unknown');
}

function actorId(req) {
  return crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 24);
}

async function redisPipeline(commands) {
  const cfg = redisConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return Array.isArray(data) ? data.map(x => x?.result) : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function hexDigest(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function difficultyForScore(score) {
  return Math.min(MAX_DIFFICULTY, 4 + Math.max(0, Math.floor((score - 3) / 4)));
}

function validPow(challenge, solution, difficulty) {
  if (!challenge || !solution || !Number.isInteger(difficulty)) return false;
  const digest = hexDigest(`${challenge}:${solution}`);
  return digest.startsWith('0'.repeat(difficulty));
}

export async function recordThreat(req, reason = 'suspicious') {
  const cfg = redisConfig();
  if (!cfg) return { score: 0, stored: false };
  const id = actorId(req);
  const key = `study-th:threat:${id}`;
  const reasonKey = `${key}:${String(reason).replace(/[^a-z0-9:_-]/gi, '_').slice(0, 40)}`;
  const results = await redisPipeline([
    ['INCR', key],
    ['PEXPIRE', key, THREAT_TTL_MS],
    ['INCR', reasonKey],
    ['PEXPIRE', reasonKey, THREAT_TTL_MS],
  ]);
  const score = Number(results?.[0] || 0);
  return { score, stored: Boolean(results) };
}

export async function threatScore(req) {
  const cfg = redisConfig();
  if (!cfg) return 0;
  const id = actorId(req);
  const key = `study-th:threat:${id}`;
  const results = await redisPipeline([['GET', key]]);
  return Number(results?.[0] || 0);
}

export async function enforceCostChallenge(req, res) {
  const score = await threatScore(req);
  if (score < 3) return true;

  const cfg = redisConfig();
  if (!cfg) return true;

  const solved = String(req.headers?.['x-study-th-pow'] || '').trim();
  const challengeId = String(req.headers?.['x-study-th-pow-id'] || '').trim();
  const difficulty = difficultyForScore(score);

  if (solved && challengeId) {
    const challengeKey = `study-th:pow:${challengeId}`;
    const rows = await redisPipeline([['GET', challengeKey]]);
    const raw = String(rows?.[0] || '');
    if (raw) {
      const parts = raw.split(':');
      const storedActor = parts[0];
      const expires = Number(parts[1] || 0);
      const storedDifficulty = Number(parts[2] || 0);
      if (
        storedActor === actorId(req) &&
        expires > Date.now() &&
        storedDifficulty === difficulty &&
        validPow(challengeId, solved, difficulty)
      ) {
        // Single-use proof. A successful challenge removes one unit of accumulated risk.
        await redisPipeline([
          ['DEL', challengeKey],
          ['DECR', `study-th:threat:${actorId(req)}`],
        ]);
        return true;
      }
    }
  }

  const challengeIdNew = crypto.randomBytes(18).toString('hex');
  const expires = Date.now() + CHALLENGE_TTL_MS;
  const challengeKey = `study-th:pow:${challengeIdNew}`;
  await redisPipeline([
    ['SET', challengeKey, `${actorId(req)}:${expires}:${difficulty}`, 'PX', CHALLENGE_TTL_MS],
  ]);

  // Cost is deliberately borne by the suspicious requester, not by the protected app.
  const response = {
    error: 'Security challenge required.',
    challenge: challengeIdNew,
    difficulty,
    expiresAt: expires,
    algorithm: 'SHA-256',
    proofFormat: 'find a value whose SHA-256(challenge + ":" + value) starts with N zeroes',
  };
  res.setHeader('Retry-After', '1');
  res.status(429).json(response);
  return false;
}

export async function adaptivePenalty(req, res, reason = 'suspicious') {
  const result = await recordThreat(req, reason);
  if (result.score >= 3) {
    await new Promise(resolve => setTimeout(resolve, Math.min(SCORE_DELAY_MS * Math.min(result.score - 2, 3), 2000)));
  }
  return result;
}
