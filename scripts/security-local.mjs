import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const mode = String(process.env.SECURITY_LOCAL_MODE || 'mock').toLowerCase();
const live = mode === 'live';
const liveAi = process.argv.includes('--live-ai');
const baseUrl = String(process.env.SECURITY_LOCAL_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const appOrigin = String(process.env.APP_ORIGIN || baseUrl).replace(/\/$/, '');
const adminPassword = String(process.env.ADMIN_PASSWORD || '');
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const redisUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const redisToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
const results = [];
const calls = [];
const redisState = new Map();
const supabaseRows = [];
let sessionCookie = '';

function pass(name, detail='') { results.push({ name, ok: true, detail }); console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
function fail(name, detail) { results.push({ name, ok: false, detail }); console.error(`FAIL  ${name} — ${detail}`); }
function skip(name, detail='') { results.push({ name, ok: null, detail }); console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`); }
function assert(condition, name, detail='') { if (condition) pass(name, detail); else fail(name, detail || 'assertion failed'); return condition; }

function redisResult(command) {
  const op = String(command?.[0] || '').toUpperCase();
  const key = String(command?.[1] || '');
  if (op === 'SET') { redisState.set(key, String(command?.[2] ?? '')); return 'OK'; }
  if (op === 'GET') return redisState.get(key) ?? null;
  if (op === 'DEL') return redisState.delete(key) ? 1 : 0;
  if (op === 'INCR') { const next = Number(redisState.get(key) || 0) + 1; redisState.set(key, String(next)); return next; }
  if (op === 'DECR') { const next = Number(redisState.get(key) || 0) - 1; redisState.set(key, String(next)); return next; }
  if (op === 'EXPIRE' || op === 'PEXPIRE') return 1;
  if (op === 'LPUSH') { const list = Array.isArray(redisState.get(key)) ? redisState.get(key) : []; list.unshift(String(command?.[2] ?? '')); redisState.set(key, list); return list.length; }
  if (op === 'LTRIM') return 'OK';
  if (op === 'HINCRBY') { const h = redisState.get(key) || {}; h[String(command?.[2])] = String(Number(h[String(command?.[2])] || 0) + Number(command?.[3] || 0)); redisState.set(key, h); return h[String(command?.[2])]; }
  if (op === 'HSET') { const h = redisState.get(key) || {}; for (let i = 2; i + 1 < command.length; i += 2) h[String(command[i])] = String(command[i + 1]); redisState.set(key, h); return 1; }
  if (op === 'HGETALL') { const h = redisState.get(key) || {}; return Object.entries(h).flatMap(([k, v]) => [k, v]); }
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
      const payload = target.endsWith('/pipeline')
        ? resultsLocal.map(result => ({ result }))
        : { result: resultsLocal[0] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
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

async function liveRequest(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    Origin: appOrigin,
    'User-Agent': 'STUDY-TH-security-local/1.0',
    ...(options.headers || {}),
  };
  if (sessionCookie) headers.Cookie = sessionCookie;
  return fetch(`${baseUrl}${path}`, { ...options, headers, redirect: 'manual' });
}

async function liveJson(response) {
  const text = await response.text();
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

async function liveRedis(commands) {
  if (!redisUrl || !redisToken) return null;
  try {
    const r = await fetch(`${redisUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return Array.isArray(data) ? data.map(x => x?.result) : null;
  } catch { return null; }
}

async function liveSupabase(path) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}

async function waitLiveAudit(requestId, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const rows = await liveSupabase(`ai_request_audit?select=id,request_id,endpoint,status_code,outcome,model,response_hash,response_length,latency_ms,created_at&request_id=eq.${encodeURIComponent(requestId)}&limit=1`);
    if (Array.isArray(rows) && rows[0]) return rows[0];
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

async function runLive() {
  console.log(`\nSTUDY TH security local integration — live mode`);
  console.log(`BASE_URL=${baseUrl}`);

  for (const [name, value] of [
    ['UPSTASH_REDIS_REST_URL', redisUrl],
    ['UPSTASH_REDIS_REST_TOKEN', redisToken],
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
  ]) assert(Boolean(value), `Live environment: ${name} configured`);

  try {
    const health = await liveRequest('/api/system-control', { method: 'GET' });
    assert(health.status === 200, 'Local Vercel dev reachable', `HTTP ${health.status}`);
  } catch (e) {
    fail('Local Vercel dev reachable', `${e.message}. Hãy chạy vercel dev trước.`);
    return;
  }

  try {
    const r = await liveRequest('/api/solve', { method: 'GET' });
    assert(r.status === 405, 'GET /api/solve rejected', `HTTP ${r.status}`);
  } catch (e) { fail('GET /api/solve rejected', e.message); }

  try {
    const r = await liveRequest('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'security-local-content-type-probe',
    });
    assert(r.status === 415, 'AI JSON boundary', `HTTP ${r.status}`);
  } catch (e) { fail('AI JSON boundary', e.message); }

  if (!adminPassword) {
    skip('Admin → Redis end-to-end', 'Thiếu ADMIN_PASSWORD; không thực hiện thao tác Admin.');
  } else {
    try {
      const login = await liveRequest('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const loginBody = await liveJson(login);
      if (!login.ok) {
        fail('Admin login', `HTTP ${login.status}: ${loginBody.error || 'unknown error'}`);
      } else {
        const setCookie = login.headers.get('set-cookie') || '';
        const match = setCookie.match(/study_admin_session_v3=([^;]+)/);
        sessionCookie = match ? `study_admin_session_v3=${match[1]}` : '';
        assert(Boolean(sessionCookie), 'Admin HttpOnly session captured');

        const subject = `security-local-${crypto.randomUUID()}`;
        const block = await liveRequest('/api/system-control?route=subject-block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, enabled: true, seconds: 120, confirmAction: true }),
        });
        assert(block.ok, 'Admin → Redis subject quarantine write', `HTTP ${block.status}`);

        const blocked = await liveRequest('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Study-TH-Device': subject },
          body: JSON.stringify({ message: 'security-local blocked-path probe' }),
        });
        assert(blocked.status === 403, 'Redis quarantine observed by next request', `HTTP ${blocked.status}`);

        const unblock = await liveRequest('/api/system-control?route=subject-block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, enabled: false, confirmAction: true }),
        });
        assert(unblock.ok, 'Admin → Redis subject quarantine clear', `HTTP ${unblock.status}`);

        const afterUnblock = await liveRequest('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Study-TH-Device': subject },
          body: JSON.stringify({}),
        });
        assert(afterUnblock.status !== 403, 'Unblock observed by next request', `HTTP ${afterUnblock.status}`);

        const lockdown = await liveRequest('/api/system-control?route=lockdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true, seconds: 60, confirmAction: true }),
        });
        assert(lockdown.ok, 'Admin → Redis global AI lockdown write', `HTTP ${lockdown.status}`);
        const locked = await liveRequest('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Study-TH-Device': subject },
          body: JSON.stringify({ message: 'security-local lockdown probe' }),
        });
        assert(locked.status === 503, 'Global Redis lockdown observed by next request', `HTTP ${locked.status}`);
        const unlock = await liveRequest('/api/system-control?route=lockdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false, seconds: 60, confirmAction: true }),
        });
        assert(unlock.ok, 'Admin → Redis global AI unlock', `HTTP ${unlock.status}`);
      }
    } catch (e) { fail('Admin → Redis end-to-end', e.message); }
  }

  if (!redisUrl || !redisToken) {
    skip('Monitoring/security signal → Redis', 'Thiếu Redis credentials.');
  } else {
    try {
      const probeUa = `STUDY-TH-security-signal/${Date.now()}`;
      const r = await fetch(`${baseUrl}/api/solve`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: `${appOrigin}/wrong-origin`,
          'User-Agent': probeUa,
          'X-Real-IP': '203.0.113.77',
        },
        body: JSON.stringify({ message: 'security-local monitoring signal probe' }),
      });
      assert(r.status === 403, 'Security signal rejected at boundary', `HTTP ${r.status}`);
      const actorHash = crypto.createHash('sha256').update(`203.0.113.77|${probeUa}`).digest('hex').slice(0, 32);
      const rows = await liveRedis([['GET', `study-th:shield:score:${actorHash}`]]);
      const score = Number(rows?.[0] || 0);
      assert(score >= 1, 'Threat signal visible in Redis shared state', `score=${score}`);
    } catch (e) { fail('Monitoring/security signal → Redis', e.message); }
  }

  if (!liveAi) {
    skip('Response → Supabase audit sink', 'Thêm --live-ai để tạo đúng 1 request AI và xác minh audit end-to-end.');
  } else if (!supabaseUrl || !supabaseServiceRoleKey) {
    fail('Response → Supabase audit sink', 'Thiếu Supabase service-role credentials.');
  } else {
    try {
      const auditDevice = `security-audit-${crypto.randomUUID()}`;
      const r = await liveRequest('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Study-TH-Device': auditDevice },
        body: JSON.stringify({ message: 'Local security audit probe: tính 2 + 2 và trả lời thật ngắn.' }),
      });
      const requestId = r.headers.get('x-request-id') || '';
      const row = requestId ? await waitLiveAudit(requestId) : null;
      assert(Boolean(row), 'Response → Supabase audit row created', `HTTP ${r.status}`);
      if (row) {
        assert(Boolean(row.response_hash), 'Audit stores response hash');
        assert(!Object.prototype.hasOwnProperty.call(row, 'response_text'), 'Audit API exposes no raw response field');
        assert(Number(row.response_length) >= 0, 'Audit response length is bounded metadata', `length=${row.response_length}`);
      }
    } catch (e) { fail('Response → Supabase audit sink', e.message); }
  }
}

async function runMock() {
  console.log(`\nSTUDY TH security local test — mode=mock`);
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
  const blockedReq = { method: 'POST', headers: { 'x-real-ip': '203.0.113.10', 'user-agent': 'STUDY-TH-local-security-test/1.0', 'x-study-th-device': subject }, body: { device_id: subject } };
  assert((await shieldStatus(blockedReq)).blocked, 'Admin → Redis: next request observes quarantine');
  await clearShieldSubjectBlock(subject);
  assert(!(await shieldSubjectStatus(subject)).blocked, 'Admin → Redis: targeted quarantine clears');

  const responseReq = { method: 'POST', headers: { 'x-real-ip': '203.0.113.10', 'user-agent': 'STUDY-TH-local-security-test/1.0', 'x-study-th-device': 'device-local-001' }, body: {} };
  const audit = auditRecord(responseReq, { request_id: crypto.randomUUID(), endpoint: '/api/solve', status_code: 200, outcome: 'response_delivered', model: 'gemini-test', response_text: 'SAFE TEST RESPONSE', latency_ms: 42 });
  await persistAudit(audit);
  assert(supabaseRows.length === 1, 'Response → Audit: audit row sent to Supabase');
  assert(Boolean(supabaseRows[0]?.response_hash) && !supabaseRows[0]?.response_text, 'Response → Audit: raw response is not stored');
  assert(Boolean(supabaseRows[0]?.actor_hash) && Boolean(supabaseRows[0]?.device_hash), 'Response → Audit: actor/device are one-way hashes');
  const auditRecent = redisState.get('study-th:audit:recent');
  assert(Array.isArray(auditRecent) && auditRecent.length >= 1, 'Response → Audit: event mirrored to Redis audit stream');

  const threatReq = { method: 'POST', headers: { 'x-real-ip': '203.0.113.77', 'user-agent': 'STUDY-TH-local-security-test/1.0', 'x-study-th-device': 'device-local-threat' }, body: {} };
  for (let i = 0; i < 5; i++) await recordShieldViolation(threatReq, `local-probe-${i}`);
  assert((await shieldStatus(threatReq)).blocked, 'Monitoring → Redis: repeated threat score produces quarantine');
  const threatKeys = [...redisState.keys()].filter(k => k.startsWith('study-th:shield:score:'));
  assert(threatKeys.length >= 1, 'Monitoring → Redis: threat score persisted');
}

if (live) await runLive();
else await runMock();

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
const failed = results.filter(x => x.ok === false);
const skipped = results.filter(x => x.ok === null);
console.log(`\nSummary: ${results.length - failed.length - skipped.length} pass, ${failed.length} fail, ${skipped.length} skipped.`);
if (failed.length) { console.error('Local security test failed.'); process.exitCode = 1; }
else console.log(live ? 'Live local integration test completed.' : 'Mock local security architecture test passed.');
