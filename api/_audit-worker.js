import crypto from 'node:crypto';

const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
const REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CRON_SECRET = String(process.env.CRON_SECRET || '').trim();
const QUEUE_KEY = 'study-th:audit:queue';
const DEFAULT_BATCH = 50;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 1_200;

function unauthorized(req) {
  const header = String(req?.headers?.authorization || '').trim();
  const expected = `Bearer ${CRON_SECRET}`;
  if (!CRON_SECRET || !header) return true;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length !== b.length || !crypto.timingSafeEqual(a, b);
}

async function redis(command, timeout = 2500) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: ac.signal,
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d && d.error === undefined ? d.result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const POP_LUA = `
local k=KEYS[1]
local n=tonumber(ARGV[1])
local out={}
for i=1,n do
  local v=redis.call('RPOP',k)
  if not v then break end
  table.insert(out,v)
end
return out
`;

async function restore(rows) {
  if (!rows.length) return true;
  return (await redis(['RPUSH', QUEUE_KEY, ...rows], 2500)) !== null;
}

function shouldRetry(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(attempt, retryAfterMs) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return Math.min(RETRY_MAX_MS, retryAfterMs);
  const exponential = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** attempt));
  return Math.floor(Math.random() * (exponential + 1));
}

async function insertBatchOnce(rows) {
  if (!SUPABASE_URL || !SERVICE_KEY || !rows.length) return { ok: false, status: 0, retryable: false };
  let parsed;
  try {
    parsed = rows.map((x) => typeof x === 'string' ? JSON.parse(x) : x);
  } catch {
    return { ok: false, status: 400, retryable: false };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_request_audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(parsed),
      signal: AbortSignal.timeout(2500),
    });
    const retryAfterSeconds = Number(r.headers.get('retry-after'));
    return {
      ok: r.ok,
      status: r.status,
      retryable: shouldRetry(r.status),
      retryAfterMs: Number.isFinite(retryAfterSeconds) ? Math.max(0, retryAfterSeconds * 1000) : null,
    };
  } catch {
    return { ok: false, status: 0, retryable: true, retryAfterMs: null };
  }
}

async function insertBatchWithRetry(rows) {
  let last = { ok: false, status: 0, retryable: true, retryAfterMs: null, attempts: 0 };
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    last = await insertBatchOnce(rows);
    last.attempts = attempt + 1;
    if (last.ok || !last.retryable || attempt === MAX_RETRIES - 1) return last;
    await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, last.retryAfterMs)));
  }
  return last;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (String(req.method || '').toUpperCase() !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (unauthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!REDIS_URL || !REDIS_TOKEN || !SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: 'Audit worker chưa được cấu hình đầy đủ.' });

  const requested = Number(req.query?.batch || DEFAULT_BATCH);
  const batchSize = Math.max(1, Math.min(100, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_BATCH));
  const rows = await redis(['EVAL', POP_LUA, '1', QUEUE_KEY, batchSize], 3000);
  if (!Array.isArray(rows)) return res.status(503).json({ error: 'Không đọc được audit queue.' });
  if (!rows.length) return res.status(200).json({ ok: true, queued: 0, synced: 0 });

  try {
    const result = await insertBatchWithRetry(rows);
    if (!result.ok) {
      const restored = await restore(rows);
      return res.status(503).json({ error: 'Supabase audit batch thất bại; queue đã được khôi phục.', queued: rows.length, restored, attempts: result.attempts });
    }
    return res.status(200).json({ ok: true, queued: rows.length, synced: rows.length, attempts: result.attempts });
  } catch {
    await restore(rows);
    return res.status(503).json({ error: 'Audit worker gặp lỗi; queue đã được khôi phục.', queued: rows.length });
  }
}
