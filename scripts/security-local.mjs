import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const mode = String(process.env.SECURITY_LOCAL_MODE || 'mock').toLowerCase();
const live = mode === 'live';
const results = [];
const calls = [];
const redisState = new Map();
const supabaseRows = [];

function pass(name, detail='') { results.push({ name, ok: true, detail }); console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
function fail(name, detail) { results.push({ name, ok: false, detail }); console.error(`FAIL  ${name} — ${detail}`); }
function assert(condition, name, detail='') { if (condition) pass(name, detail); else fail(name, detail || 'assertion failed'); return condition; }

function redisResult(command) {
  const op = String(command?.[0] || '').toUpperCase();
  const key = String(command?.[1] || '');
  if (op === 'SET') { redisState.set(key, String(command?.[2] ?? '')); return 'OK'; }
  if (op === 'GET') return redisState.get(key) ?? null;
  if (op === 'DEL') return redisState.delete(key) ? 1 : 0;
  if (op === 'INCR') { const next = Number(redisState.get(key) || 0) + 1; redisState.set(key, String(next)); return next; }
  if (op === 'EXPIRE' || op === 'PEXPIRE') return 1;
  if (op === 'LPUSH') { const list = Array.isArray(redisState.get(key)) ? redisState.get(key) : []; list.unshift(String(command?.[2] ?? '')); redisState.set(key, list); return list.length; }
  if (op === 'LTRIM') return 'OK';
  if (op === 'HINCRBY') { const h = redisState.get(key) || {}; h[String(command?.[2])] = String(Number(h[String(command?.[2])] || 0) + Number(command?.[3] || 0)); redisState.set(key, h); return h[String(command?.[2])]; }
  if (op === 'HSET') { const h = redisState.get(key) || {}; for (let i = 2; i + 1 < command.length; i += 2) h[String(command[i])] = String(command[i + 1]); redisState.set(key, h); return 1; }
  if (op === 'EVAL') return '1';
  return null;
}

const realFetch = globalThis.fetch;
if (!live) {
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (/redis\.invalid|upstash|redis/i.test(target)) {
      let commands = [];
      try { commands = JSON.parse(String(options.body || '[]')); } catch {}
      const arr = Array.isArray(commands?.[0]) ? commands : [commands];
      const resultsLocal = arr.map(redisResult);
      return new Response(JSON.stringify(resultsLocal.map(result => ({ result }))), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (/supabase/i.test(target) && /\/rest\/v1\/ai_request_audit/.test(target)) {
      try { supabaseRows.push(JSON.parse(String(options.body || '{}'))); } catch {}
      return new Response('', { status: 201 });
    }
    return new Response('', { status: 404 });
  };
  process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';
  process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role';
}

const { auditRecord, persistAudit } = await import('../api/_audit-log.js');
const { recordShieldViolation, shieldStatus, shieldSubjectFingerprint, setShieldSubjectBlock, clearShieldSubjectBlock, shieldSubjectStatus } = await import('../api/_intrusion-shield.js');
const { aiLockdownStatus, setAiLockdown } = await import('../api/_emergency-lock.js');

function req(extra = {}) {
  return { method: 'POST', headers: { 'x-real-ip': '203.0.113.10', 'user-agent': 'STUDY-TH-local-security-test/1.0', 'x-study-th-device': 'device-local-001', origin: 'https://hoc-va-choi.vercel.app', ...extra }, body: {} };
}

console.log(`\nSTUDY TH security local test — mode=${mode}`);

if (live) {
  for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) assert(Boolean(process.env[name]), `Live mode env: ${name} is configured`);
} else {
  await setAiLockdown(true, 120);
  assert((await aiLockdownStatus()).locked, 'Admin → Redis: AI lockdown visible from shared state');
  assert(redisState.has('study-th:security:ai-lockdown'), 'Admin → Redis: lockdown key written');
  await setAiLockdown(false, 120);
  assert(!(await aiLockdownStatus()).locked, 'Admin → Redis: unlock clears shared state');

  const subject = 'device-local-001';
  await setShieldSubjectBlock(subject, 180);
  const subjectState = await shieldSubjectStatus(subject);
  assert(subjectState.blocked, 'Admin → Redis: targeted subject quarantine visible');
  assert(subjectState.subjectHash === shieldSubjectFingerprint(subject), 'Admin → Redis: one-way subject fingerprint used');
  const blockedReq = req();
  blockedReq.body = { device_id: subject };
  assert((await shieldStatus(blockedReq)).blocked, 'Admin → Redis: next request observes quarantine');
  await clearShieldSubjectBlock(subject);
  assert(!(await shieldSubjectStatus(subject)).blocked, 'Admin → Redis: targeted quarantine clears');

  const responseReq = req();
  const audit = auditRecord(responseReq, { request_id: crypto.randomUUID(), endpoint: '/api/solve', status_code: 200, outcome: 'response_delivered', model: 'gemini-test', response_text: 'SAFE TEST RESPONSE', latency_ms: 42 });
  await persistAudit(audit);
  assert(supabaseRows.length === 1, 'Response → Audit: audit row sent to Supabase');
  assert(Boolean(supabaseRows[0]?.response_hash) && !supabaseRows[0]?.response_text, 'Response → Audit: raw response is not stored');
  assert(Boolean(supabaseRows[0]?.actor_hash) && Boolean(supabaseRows[0]?.device_hash), 'Response → Audit: actor/device are one-way hashes');
  const auditRecent = redisState.get('study-th:audit:recent');
  assert(Array.isArray(auditRecent) && auditRecent.length >= 1, 'Response → Audit: event mirrored to Redis audit stream');

  const threatReq = req({ 'x-real-ip': '203.0.113.77' });
  for (let i = 0; i < 5; i++) await recordShieldViolation(threatReq, `local-probe-${i}`);
  assert((await shieldStatus(threatReq)).blocked, 'Monitoring → Redis: repeated threat score produces quarantine');
  const threatKeys = [...redisState.keys()].filter(k => k.startsWith('study-th:shield:score:'));
  assert(threatKeys.length >= 1, 'Monitoring → Redis: threat score persisted');
}

for (const [name, file, needle] of [
  ['AI gateway JSON boundary', '../api/_ai-gateway.js', 'enforceJsonContentType(req,res)'],
  ['AI gateway DLP/semantic guard', '../api/_ai-gateway.js', 'sanitizeAiIngress'],
  ['AI core replay proof', '../api/_solve-core.js', 'consumeNonce'],
  ['Support AI audit sink', '../api/support-ai.js', 'persistAudit'],
  ['Admin lockdown Redis state', '../api/_emergency-lock.js', 'study-th:security:ai-lockdown'],
  ['Subject quarantine Redis state', '../api/_intrusion-shield.js', 'study-th:shield:subject:block:'],
]) {
  try { const text = await fs.readFile(new URL(file, import.meta.url), 'utf8'); assert(text.includes(needle), `Source: ${name}`, needle); }
  catch (e) { fail(`Source: ${name}`, e.message); }
}

globalThis.fetch = realFetch;
const failed = results.filter(x => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) { console.error('Local security test failed.'); process.exitCode = 1; }
else console.log(live ? 'Live connectivity smoke test completed.' : 'Mock local security architecture test passed.');
