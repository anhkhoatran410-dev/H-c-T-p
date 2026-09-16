import crypto from 'node:crypto';

const REDIS_TIMEOUT_MS = 1200;
const WINDOW_MS = 5 * 60 * 1000;
const BLOCK_TTL = 30 * 60;
const MAX_SCORE = 12;
const CHALLENGE_SCORE = 4;
const BLOCK_SCORE = 9;
const BURST_WINDOW_MS = 10_000;
const BURST_MAX = 25;

function redisConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

function actorId(req) {
  const ip = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  const ua = String(req.headers?.['user-agent'] || '').slice(0, 160);
  const lang = String(req.headers?.['accept-language'] || '').slice(0, 80);
  const clientHints = String(req.headers?.['sec-ch-ua'] || '').slice(0, 160);
  return crypto.createHash('sha256').update(`${ip}|${ua}|${lang}|${clientHints}`).digest('hex').slice(0, 32);
}

async function redis(commands) {
  const cfg = redisConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const r = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return Array.isArray(data) ? data.map(x => x?.result) : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function key(id, suffix = 'score') {
  return `study-th:agent:${suffix}:${id}`;
}

const ADD_SCORE_LUA = `
local score = tonumber(redis.call('GET', KEYS[1]) or '0')
score = math.min(score + tonumber(ARGV[1]), tonumber(ARGV[3]))
redis.call('SET', KEYS[1], score, 'PX', ARGV[2])
return score
`;

const BURST_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`;

const BLOCK_LUA = `
local score = tonumber(redis.call('GET', KEYS[1]) or '0')
if score >= tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[1])
  return 1
end
return 0
`;

async function addScore(id, delta, reason) {
  const cfg = redisConfig();
  if (!cfg) return { score: 0, stored: false };
  const rows = await redis([
    ['EVAL', ADD_SCORE_LUA, '1', key(id), delta, WINDOW_MS, MAX_SCORE],
  ]);
  const score = Number(rows?.[0] || 0);
  await redis([
    ['INCR', key(id, 'reason:' + String(reason).replace(/[^a-z0-9_-]/gi, '_').slice(0, 30))],
    ['PEXPIRE', key(id, 'reason:' + String(reason).replace(/[^a-z0-9_-]/gi, '_').slice(0, 30)), WINDOW_MS],
  ]);
  return { score, stored: Boolean(rows) };
}

async function isBlocked(id) {
  const rows = await redis([['GET', key(id, 'block')]]);
  return rows?.[0] === '1';
}

export async function recordAgentSignal(req, reason = 'suspicious') {
  const id = actorId(req);
  const result = await addScore(id, 1, reason);
  if (result.score >= BLOCK_SCORE && redisConfig()) {
    await redis([
      ['EVAL', BLOCK_LUA, '2', key(id), key(id, 'block'), BLOCK_TTL, BLOCK_SCORE],
    ]);
  }
  return { ...result, actor: id };
}

export async function enforceAgentThreatDefense(req, res) {
  const id = actorId(req);
  if (await isBlocked(id)) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', String(BLOCK_TTL));
    res.status(403).json({ error: 'Request quarantined.' });
    return false;
  }

  const burstRows = await redis([
    ['EVAL', BURST_LUA, '1', key(id, 'burst'), BURST_WINDOW_MS],
  ]);
  const burst = Number(burstRows?.[0] || 0);
  if (burst > BURST_MAX) {
    await addScore(id, 2, 'burst-abuse');
    res.setHeader('Retry-After', '10');
    res.status(429).json({ error: 'Traffic burst requires cooldown.' });
    return false;
  }

  // Never trust User-Agent alone: AI agents may imitate ordinary browsers.
  // Detect behavior, not the identity of the client.
  const ua = String(req.headers?.['user-agent'] || '').toLowerCase();
  const origin = String(req.headers?.origin || '');
  const referer = String(req.headers?.referer || '');
  let softSignal = 0;
  if (!origin && !referer) softSignal += 1;
  if (!ua || ua.length < 8) softSignal += 1;
  if (/curl|wget|python-requests|httpclient|go-http-client|scrapy/i.test(ua)) softSignal += 1;
  if (softSignal >= 2) {
    const result = await addScore(id, 1, 'automation-signal');
    if (result.score >= CHALLENGE_SCORE) {
      res.setHeader('Retry-After', '1');
      res.status(429).json({ error: 'Automated traffic requires additional verification.' });
      return false;
    }
  }
  return true;
}

export function agentFingerprint(req) {
  return actorId(req);
}
