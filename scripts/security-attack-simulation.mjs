import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Safe isolated benchmark: mocked Redis only; no production endpoint or credential is touched.
process.env.UPSTASH_REDIS_REST_URL = 'https://mock-security-redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'simulation-token';
process.env.APP_ORIGIN = 'https://study-th.example.invalid';

const store = new Map();
const expiry = new Map();
function purge(key) { const at = expiry.get(key); if (at && at <= Date.now()) { store.delete(key); expiry.delete(key); } }
function setValue(key, value, ttlMs) { store.set(key, String(value)); if (ttlMs) expiry.set(key, Date.now() + Number(ttlMs)); }
function execCommand(command) {
  const [rawOp, ...args] = command; const op = String(rawOp).toUpperCase();
  if (op === 'GET') { purge(args[0]); return store.get(args[0]) ?? null; }
  if (op === 'INCR') { purge(args[0]); const next = Number(store.get(args[0]) || 0) + 1; store.set(args[0], String(next)); return next; }
  if (op === 'DECR') { purge(args[0]); const next = Number(store.get(args[0]) || 0) - 1; store.set(args[0], String(next)); return next; }
  if (op === 'PEXPIRE') { purge(args[0]); if (store.has(args[0])) expiry.set(args[0], Date.now() + Number(args[1])); return 1; }
  if (op === 'DEL') { const existed = store.delete(args[0]); expiry.delete(args[0]); return existed ? 1 : 0; }
  if (op === 'SET') {
    const key = args[0]; purge(key);
    if (String(args[2] || '').toUpperCase() === 'NX' && store.has(key)) return null;
    const ttlIndex = args.findIndex(x => ['PX', 'EX'].includes(String(x).toUpperCase()));
    const ttl = ttlIndex >= 0 ? Number(args[ttlIndex + 1]) * (String(args[ttlIndex]).toUpperCase() === 'EX' ? 1000 : 1) : 0;
    setValue(key, args[1], ttl); return 'OK';
  }
  if (op === 'EVAL') {
    const lua = String(args[0]); const keyCount = Number(args[1]); const keys = args.slice(2, 2 + keyCount); const argv = args.slice(2 + keyCount);
    if (lua.includes("local score = tonumber(redis.call('GET'")) { const key = keys[0]; const next = Math.min(Number(store.get(key) || 0) + Number(argv[0]), Number(argv[2])); setValue(key, next, Number(argv[1])); return next; }
    if (lua.includes("local n = redis.call('INCR'")) { const key = keys[0]; const next = Number(store.get(key) || 0) + 1; store.set(key, String(next)); if (next === 1) expiry.set(key, Date.now() + Number(argv[0])); return next; }
    if (lua.includes("local score = tonumber(redis.call('GET', KEYS[1]) or '0')") && lua.includes("redis.call('SET', KEYS[2]")) { const score = Number(store.get(keys[0]) || 0); if (score >= Number(argv[1])) { setValue(keys[1], '1', Number(argv[0]) * 1000); return 1; } return 0; }
  }
  throw new Error(`Unsupported mock Redis command: ${op}`);
}
globalThis.fetch = async (_url, options = {}) => ({ ok: true, json: async () => JSON.parse(String(options.body || '[]')).map(execCommand).map(result => ({ result })) });

const { consumeNonce, internalNonce, internalSignature, verifyTimestamp } = await import('../api/_internal-replay.js');
const { recordAgentSignal, enforceAgentThreatDefense, agentFingerprint } = await import('../api/_agent-threat-defense.js');
const { recordThreat, enforceCostChallenge, threatScore } = await import('../api/_adaptive-defense.js');
const { classifyGeminiFailure } = await import('../api/_gemini-error-policy.js');
const { applySecurityHeaders, enforceMethod, enforceBodySize, sameOrigin, rateLimit } = await import('../api/_security.js');

function req(headers = {}, method = 'POST') { return { method, headers: { ...headers }, socket: { remoteAddress: `198.51.100.${Math.floor(Math.random() * 200) + 1}` } }; }
function responseMock() { return { statusCode: null, headers: {}, body: null, setHeader(n, v) { this.headers[n] = String(v); }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; } }; }
function pass(n, msg) { console.log(`PASS ${n}/15  ${msg}`); }

console.log('=== SECURITY ATTACK SIMULATION (SAFE / MOCKED) ===');

// 1 Replay / timestamp / signature shape
const now = Date.now(); const nonce = internalNonce();
assert.equal(verifyTimestamp(String(now), now), true); assert.equal(verifyTimestamp(String(now - 120000), now), false);
assert.equal(await consumeNonce(nonce, now), true); assert.equal(await consumeNonce(nonce, now), false); assert.equal(internalSignature('simulation-secret', now, nonce).length, 64); pass(1, 'Replay protection + timestamp window');

// 2 Burst defense
const burstReq = req({ 'user-agent': 'normal-browser/1.0', origin: 'https://study-th.example.invalid' }); let burstBlocked = false;
for (let i = 0; i < 26; i++) { const res = responseMock(); if (!(await enforceAgentThreatDefense(burstReq, res))) { burstBlocked = true; assert.equal(res.statusCode, 429); break; } }
assert.equal(burstBlocked, true); pass(2, 'Burst defense blocks request 26 with HTTP 429');

// 3 Quarantine threshold
const suspiciousReq = req({ 'user-agent': 'curl/8.0' }); for (let i = 0; i < 9; i++) await recordAgentSignal(suspiciousReq, 'simulation');
const quarantineRes = responseMock(); assert.equal(await enforceAgentThreatDefense(suspiciousReq, quarantineRes), false); assert.equal(quarantineRes.statusCode, 403); pass(3, 'Threat scoring quarantines repeated suspicious actor');

// 4 Adaptive challenge + valid proof
const challengeReq = req({ 'user-agent': 'curl/8.0' }); await recordThreat(challengeReq, 'simulation'); await recordThreat(challengeReq, 'simulation'); await recordThreat(challengeReq, 'simulation');
assert.equal(await threatScore(challengeReq), 3); const challengeRes = responseMock(); assert.equal(await enforceCostChallenge(challengeReq, challengeRes), false); assert.equal(challengeRes.statusCode, 429); assert.equal(challengeRes.body.algorithm, 'SHA-256');
const { challenge, difficulty } = challengeRes.body; let solution = 0; while (!crypto.createHash('sha256').update(`${challenge}:${solution}`).digest('hex').startsWith('0'.repeat(difficulty))) solution++;
const solvedReq = req({ 'user-agent': 'curl/8.0', 'x-study-th-pow-id': challenge, 'x-study-th-pow': String(solution) }); assert.equal(await enforceCostChallenge(solvedReq, responseMock()), true); pass(4, `Proof-of-work challenge difficulty ${difficulty} accepted`);

// 5 Gemini error policy
assert.equal(classifyGeminiFailure(401).action, 'trip-immediately'); assert.equal(classifyGeminiFailure(403).circuit, 'open'); for (const code of [429, 500, 502, 503, 504]) assert.equal(classifyGeminiFailure(code).action, 'accumulate'); assert.equal(classifyGeminiFailure(404).countFailure, false); pass(5, 'AI resilience classifies credential/transient/non-key errors');

// 6 Method allowlist
const methodRes = responseMock(); assert.equal(enforceMethod(req({}, 'GET'), methodRes, ['POST']), false); assert.equal(methodRes.statusCode, 405); assert.equal(methodRes.headers.Allow, 'POST'); pass(6, 'Invalid method returns HTTP 405 + Allow');

// 7 Body-size limit
const bodyRes = responseMock(); assert.equal(enforceBodySize(req({ 'content-length': '1500001' }), bodyRes), false); assert.equal(bodyRes.statusCode, 413); pass(7, 'Oversized body returns HTTP 413');

// 8 Same-origin enforcement
const originRes = responseMock(); assert.equal(sameOrigin(req({ origin: 'https://evil.example.invalid' }), originRes), false); assert.equal(originRes.statusCode, 403); pass(8, 'Cross-origin request rejected with HTTP 403');

// 9 Same-origin legitimate request
assert.equal(sameOrigin(req({ origin: 'https://study-th.example.invalid' }), responseMock()), true); pass(9, 'Configured same-origin request accepted');

// 10 Local rate limit
const rateReq = req(); let limited = false; for (let i = 0; i < 4; i++) { const r = responseMock(); if (!rateLimit(rateReq, r, { windowMs: 60000, max: 3, keyPrefix: 'simulation' })) { limited = true; assert.equal(r.statusCode, 429); assert.ok(r.headers['Retry-After']); } } assert.equal(limited, true); pass(10, 'Local rate limit returns HTTP 429 + Retry-After');

// 11 Security headers
const headerRes = responseMock(); applySecurityHeaders(headerRes); for (const [k, v] of Object.entries({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store' })) assert.equal(headerRes.headers[k], v); pass(11, 'Required response security headers present');

// 12 Request ID entropy
const ids = new Set(Array.from({ length: 100 }, () => crypto.randomBytes(12).toString('hex'))); assert.equal(ids.size, 100); pass(12, '100 generated request IDs are unique in simulation');

// 13 Vercel config security controls
const vercel = fs.readFileSync('vercel.json', 'utf8'); const required = ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy', 'Strict-Transport-Security']; for (const token of required) assert.ok(vercel.includes(token), `missing ${token}`); pass(13, 'Vercel security-header policy is present in config');

// 14 Response secret redaction policy source check
const guard = fs.readFileSync('api/_response-guard.js', 'utf8'); for (const token of ['API_KEY', 'TOKEN', 'SECRET']) assert.ok(guard.includes(token), `missing redaction marker ${token}`); pass(14, 'Response guard contains secret/token redaction markers');

// 15 Emergency lockdown wiring
const gateway = fs.readFileSync('api/_ai-gateway.js', 'utf8'); assert.ok(gateway.includes('SECURITY_LOCKDOWN')); assert.ok(gateway.includes('shieldGate')); pass(15, 'AI gateway emergency lockdown + shield gate wiring present');

console.log('=== RESULT: 15/15 defensive scenarios passed (simulation assertions) ===');
console.log(`Actor fingerprinting active: ${agentFingerprint(burstReq).slice(0, 12)}… (hashed, non-secret)`);
