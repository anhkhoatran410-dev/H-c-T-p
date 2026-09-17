import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const redisState = new Map();
const supabaseRows = [];

function redisResult(command) {
  const op = String(command?.[0] || '').toUpperCase();
  const key = String(command?.[1] || '');
  if (op === 'SET') {
    const nx = command.includes('NX');
    if (nx && redisState.has(key)) return null;
    redisState.set(key, String(command?.[2] ?? ''));
    return 'OK';
  }
  if (op === 'GET') return redisState.get(key) ?? null;
  if (op === 'DEL') return redisState.delete(key) ? 1 : 0;
  if (op === 'INCR') {
    const next = Number(redisState.get(key) || 0) + 1;
    redisState.set(key, String(next));
    return next;
  }
  if (op === 'EXPIRE' || op === 'PEXPIRE') return 1;
  if (op === 'LPUSH') {
    const list = Array.isArray(redisState.get(key)) ? redisState.get(key) : [];
    for (let i = 2; i < command.length; i += 1) list.unshift(String(command[i] ?? ''));
    redisState.set(key, list);
    return list.length;
  }
  if (op === 'RPUSH') {
    const list = Array.isArray(redisState.get(key)) ? redisState.get(key) : [];
    for (let i = 2; i < command.length; i += 1) list.push(String(command[i] ?? ''));
    redisState.set(key, list);
    return list.length;
  }
  if (op === 'RPOP') {
    const list = Array.isArray(redisState.get(key)) ? redisState.get(key) : [];
    const value = list.pop() ?? null;
    redisState.set(key, list);
    return value;
  }
  if (op === 'LLEN') return Array.isArray(redisState.get(key)) ? redisState.get(key).length : 0;
  if (op === 'LPOP') {
    const list = Array.isArray(redisState.get(key)) ? redisState.get(key) : [];
    const value = list.shift() ?? null;
    redisState.set(key, list);
    return value;
  }
  if (op === 'LTRIM') return 'OK';
  if (op === 'SADD') return 1;
  if (op === 'SREM') return 1;
  if (op === 'HINCRBY') return 1;
  if (op === 'HSET') return 1;
  if (op === 'HGETALL') return [];
  if (op === 'EVAL') return null;
  return null;
}

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (/redis/i.test(target)) {
    let body = [];
    try { body = JSON.parse(String(options.body || '[]')); } catch {}
    const commands = Array.isArray(body?.[0]) ? body : [body];
    const command = commands[0] || [];
    let result = null;

    if (String(command[0] || '').toUpperCase() === 'EVAL') {
      const keyCount = Number(command[2] || 0);
      const keys = command.slice(3, 3 + keyCount);
      const args = command.slice(3 + keyCount);
      const script = String(command[1] || '');
      if (script.includes('AUDIT_QUEUE') || keys[0] === 'study-th:audit:queue') {
        const queueKey = keys[0];
        const recentKey = keys[1];
        const droppedKey = keys[2];
        const max = Number(args[0] || 5000);
        const payload = String(args[1] || '');
        const queue = Array.isArray(redisState.get(queueKey)) ? redisState.get(queueKey) : [];
        if (queue.length >= max) {
          const dropped = Number(redisState.get(droppedKey) || 0) + 1;
          redisState.set(droppedKey, String(dropped));
          result = [0, queue.length, dropped];
        } else {
          queue.push(payload);
          redisState.set(queueKey, queue);
          const recent = Array.isArray(redisState.get(recentKey)) ? redisState.get(recentKey) : [];
          recent.unshift(payload);
          redisState.set(recentKey, recent.slice(0, 200));
          result = [1, queue.length, 0];
        }
      } else if (keys[0] === 'study-th:audit:dlq') {
        const dlqKey = keys[0];
        const droppedKey = keys[1];
        const max = Number(args[0] || 1000);
        const payload = String(args[1] || '');
        const dlq = Array.isArray(redisState.get(dlqKey)) ? redisState.get(dlqKey) : [];
        let dropped = 0;
        if (dlq.length >= max) {
          dlq.shift();
          dropped = 1;
          redisState.set(droppedKey, String(Number(redisState.get(droppedKey) || 0) + 1));
        }
        dlq.push(payload);
        redisState.set(dlqKey, dlq);
        result = [dlq.length, dropped];
      } else {
        result = redisResult(command);
      }
    } else {
      result = redisResult(command);
    }

    return new Response(JSON.stringify(target.endsWith('/pipeline')
      ? [{ result }]
      : { result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (/supabase/i.test(target) && /ai_request_audit/.test(target)) {
    try { supabaseRows.push(JSON.parse(String(options.body || 'null'))); } catch {}
    return new Response('', { status: 201 });
  }
  return new Response('', { status: 404 });
};

process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token';
process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role';
process.env.GEMINI_API_KEY = 'mock-gemini-key';

const { auditRecord, persistAudit, AUDIT_QUEUE_LIMIT } = await import('../api/_audit-log.js');
const { guardAiResponse } = await import('../api/_response-guard.js');
const { consumeNonce } = await import('../api/_internal-replay.js');

const req = { method: 'POST', headers: { 'x-real-ip': '203.0.113.10', 'user-agent': 'security-bounded-test' }, body: {} };
const row = auditRecord(req, {
  request_id: crypto.randomUUID(), endpoint: '/api/solve', status_code: 200,
  outcome: 'response_delivered', model: 'test', response_text: 'SAFE TEST', latency_ms: 12,
});
assert.equal(await persistAudit(row), true);
const queue = redisState.get('study-th:audit:queue');
assert.equal(Array.isArray(queue), true);
assert.equal(queue.length, 1);
assert.equal(JSON.parse(queue[0]).response_text, undefined);
assert.ok(JSON.parse(queue[0]).response_hash);

redisState.set('study-th:audit:queue', Array.from({ length: AUDIT_QUEUE_LIMIT }, () => 'x'));
const droppedBefore = Number(redisState.get('study-th:audit:dropped') || 0);
assert.equal(await persistAudit(row), false);
assert.equal(Number(redisState.get('study-th:audit:dropped') || 0), droppedBefore + 1);

const normal = guardAiResponse(JSON.stringify({ answer: '2 + 2 = 4' }));
assert.equal(normal.ok, true);
const blocked = guardAiResponse('-----BEGIN PRIVATE KEY-----fake-----END PRIVATE KEY-----');
assert.equal(blocked.ok, false);
assert.equal(blocked.status, 502);

const nonce = crypto.randomBytes(18).toString('hex');
assert.equal(await consumeNonce(nonce), true);
assert.equal(await consumeNonce(nonce), false);

const worker = await readFile(new URL('../api/_audit-worker.js', import.meta.url), 'utf8');
assert.ok(worker.includes('DLQ_KEY'));
assert.ok(worker.includes('DLQ_MAX'));
assert.ok(worker.includes('moveToDlq'));
assert.equal(worker.includes('restore(rows)'), false);
assert.equal(worker.includes('queue đã được khôi phục'), false);

console.log('Bounded audit security checks passed.');
