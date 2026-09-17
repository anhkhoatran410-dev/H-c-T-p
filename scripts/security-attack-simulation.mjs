import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Isolated in-memory Redis simulation. No production endpoint, credential, or real service is touched.
process.env.UPSTASH_REDIS_REST_URL = 'https://mock-security-redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'simulation-token';

const store = new Map();
const expiry = new Map();

function purge(key) {
  const at = expiry.get(key);
  if (at && at <= Date.now()) {
    store.delete(key);
    expiry.delete(key);
  }
}

function setValue(key, value, ttlMs) {
  store.set(key, String(value));
  if (ttlMs) expiry.set(key, Date.now() + Number(ttlMs));
}

function execCommand(command) {
  const [rawOp, ...args] = command;
  const op = String(rawOp).toUpperCase();

  if (op === 'GET') {
    purge(args[0]);
    return store.get(args[0]) ?? null;
  }
  if (op === 'INCR') {
    purge(args[0]);
    const next = Number(store.get(args[0]) || 0) + 1;
    store.set(args[0], String(next));
    return next;
  }
  if (op === 'DECR') {
    purge(args[0]);
    const next = Number(store.get(args[0]) || 0) - 1;
    store.set(args[0], String(next));
    return next;
  }
  if (op === 'PEXPIRE') {
    purge(args[0]);
    if (store.has(args[0])) expiry.set(args[0], Date.now() + Number(args[1]));
    return 1;
  }
  if (op === 'DEL') {
    const existed = store.delete(args[0]);
    expiry.delete(args[0]);
    return existed ? 1 : 0;
  }
  if (op === 'SET') {
    const key = args[0];
    purge(key);
    if (String(args[2] || '').toUpperCase() === 'NX' && store.has(key)) return null;
    const ttlIndex = args.findIndex(x => String(x).toUpperCase() === 'PX' || String(x).toUpperCase() === 'EX');
    const ttl = ttlIndex >= 0 ? Number(args[ttlIndex + 1]) * (String(args[ttlIndex]).toUpperCase() === 'EX' ? 1000 : 1) : 0;
    setValue(key, args[1], ttl);
    return 'OK';
  }
  if (op === 'EVAL') {
    const lua = String(args[0]);
    const keyCount = Number(args[1]);
    const keys = args.slice(2, 2 + keyCount);
    const argv = args.slice(2 + keyCount);

    if (lua.includes("local score = tonumber(redis.call('GET'")) {
      const key = keys[0];
      const current = Number(store.get(key) || 0);
      const next = Math.min(current + Number(argv[0]), Number(argv[2]));
      setValue(key, next, Number(argv[1]));
      return next;
    }
    if (lua.includes("local n = redis.call('INCR'")) {
      const key = keys[0];
      const next = Number(store.get(key) || 0) + 1;
      store.set(key, String(next));
      if (next === 1) expiry.set(key, Date.now() + Number(argv[0]));
      return next;
    }
    if (lua.includes("local score = tonumber(redis.call('GET', KEYS[1]) or '0')") && lua.includes("redis.call('SET', KEYS[2]")) {
      const score = Number(store.get(keys[0]) || 0);
      if (score >= Number(argv[1])) {
        setValue(keys[1], '1', Number(argv[0]) * 1000);
        return 1;
      }
      return 0;
    }
  }
  throw new Error(`Unsupported mock Redis command: ${op}`);
}

globalThis.fetch = async (_url, options = {}) => {
  const commands = JSON.parse(String(options.body || '[]'));
  const results = commands.map(execCommand).map(result => ({ result }));
  return { ok: true, json: async () => results };
};

const { consumeNonce, internalNonce, internalSignature, verifyTimestamp } = await import('../api/_internal-replay.js');
const { recordAgentSignal, enforceAgentThreatDefense, agentFingerprint } = await import('../api/_agent-threat-defense.js');
const { recordThreat, enforceCostChallenge, threatScore } = await import('../api/_adaptive-defense.js');
const { classifyGeminiFailure } = await import('../api/_gemini-error-policy.js');

function req(headers = {}) {
  return { headers: { ...headers }, socket: { remoteAddress: '198.51.100.10' } };
}

function responseMock() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
  };
}

console.log('=== SECURITY ATTACK SIMULATION (SAFE / MOCKED) ===');

// 1) Replay attack: a valid nonce can be consumed once, then is rejected.
const now = Date.now();
const nonce = internalNonce();
assert.equal(verifyTimestamp(String(now), now), true);
assert.equal(verifyTimestamp(String(now - 120_000), now), false);
assert.equal((await consumeNonce(nonce, now)), true);
assert.equal((await consumeNonce(nonce, now)), false);
assert.equal(internalSignature('simulation-secret', now, nonce).length, 64);
console.log('PASS 1/5  Replay protection: first nonce accepted, replay rejected');

// 2) Automated burst: >25 requests in the 10-second window receives a cooldown response.
const burstReq = req({ 'user-agent': 'normal-browser/1.0', origin: 'https://example.invalid' });
let burstBlocked = false;
for (let i = 0; i < 26; i += 1) {
  const res = responseMock();
  const allowed = await enforceAgentThreatDefense(burstReq, res);
  if (!allowed) {
    burstBlocked = true;
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, 'Traffic burst requires cooldown.');
    break;
  }
}
assert.equal(burstBlocked, true);
console.log('PASS 2/5  Burst defense: request 26 blocked with HTTP 429');

// 3) Repeated suspicious signals accumulate an actor score and quarantine at the threshold.
const suspiciousReq = req({ 'user-agent': 'curl/8.0' });
for (let i = 0; i < 9; i += 1) await recordAgentSignal(suspiciousReq, 'simulation');
const quarantineRes = responseMock();
assert.equal(await enforceAgentThreatDefense(suspiciousReq, quarantineRes), false);
assert.equal(quarantineRes.statusCode, 403);
assert.equal(quarantineRes.body.error, 'Request quarantined.');
console.log('PASS 3/5  Threat scoring: repeated suspicious actor quarantined with HTTP 403');

// 4) Adaptive cost challenge: suspicious traffic is challenged before expensive work.
const challengeReq = req({ 'user-agent': 'curl/8.0' });
await recordThreat(challengeReq, 'simulation');
await recordThreat(challengeReq, 'simulation');
await recordThreat(challengeReq, 'simulation');
assert.equal(await threatScore(challengeReq), 3);
const challengeRes = responseMock();
assert.equal(await enforceCostChallenge(challengeReq, challengeRes), false);
assert.equal(challengeRes.statusCode, 429);
assert.equal(challengeRes.body.algorithm, 'SHA-256');
const { challenge, difficulty } = challengeRes.body;
let solution = 0;
while (!crypto.createHash('sha256').update(`${challenge}:${solution}`).digest('hex').startsWith('0'.repeat(difficulty))) solution += 1;
const solvedReq = req({ 'user-agent': 'curl/8.0', 'x-study-th-pow-id': challenge, 'x-study-th-pow': String(solution) });
const solvedRes = responseMock();
assert.equal(await enforceCostChallenge(solvedReq, solvedRes), true);
console.log(`PASS 4/5  Proof-of-work: challenge issued at difficulty ${difficulty}, valid proof accepted`);

// 5) Gemini failure policy: credential errors trip immediately; transient/upstream errors accumulate.
assert.equal(classifyGeminiFailure(401).action, 'trip-immediately');
assert.equal(classifyGeminiFailure(403).circuit, 'open');
for (const code of [429, 500, 502, 503, 504]) assert.equal(classifyGeminiFailure(code).action, 'accumulate');
assert.equal(classifyGeminiFailure(404).countFailure, false);
console.log('PASS 5/5  AI resilience policy: credential errors trip; transient/upstream errors accumulate');

console.log('=== RESULT: 5/5 defensive scenarios passed ===');
console.log(`Actor fingerprinting active: ${agentFingerprint(burstReq).slice(0, 12)}… (hashed, non-secret)`);
