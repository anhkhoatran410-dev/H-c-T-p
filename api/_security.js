import crypto from 'node:crypto';

const buckets = new Map();
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;
const MAX_BODY_BYTES = 1_500_000;
const MAX_BUCKETS = 10_000;
const REDIS_TIMEOUT_MS = 1_500;

function clientIp(req) {
  const real = String(req.headers?.['x-real-ip'] || '').split(',')[0].trim();
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return real || forwarded || String(req.socket?.remoteAddress || 'unknown');
}

function redisConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

async function redisEval(script, keys, args) {
  const cfg = redisConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const r = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([[ 'EVAL', script, String(keys.length), ...keys, ...args.map(String) ]]),
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    return Array.isArray(data) ? data[0]?.result ?? null : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function applySecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

export function enforceMethod(req, res, methods) {
  const allowed = new Set(methods.map(String));
  if (!allowed.has(String(req.method || '').toUpperCase())) {
    res.setHeader('Allow', [...allowed].join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function enforceBodySize(req, res, maxBytes = MAX_BODY_BYTES) {
  const length = Number(req.headers?.['content-length']);
  if (Number.isFinite(length) && length > maxBytes) {
    res.status(413).json({ error: 'Request body quá lớn.' });
    return false;
  }
  return true;
}

export function enforceJsonContentType(req, res) {
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    res.status(415).json({ error: 'Content-Type phải là application/json.' });
    return false;
  }
  return true;
}

export function sameOrigin(req, res) {
  const configured = String(process.env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  if (!configured) return true;
  const origin = String(req.headers?.origin || '').trim().replace(/\/$/, '');
  const referer = String(req.headers?.referer || '').trim();
  if (!origin && !referer) return true;
  const source = origin || (() => { try { return new URL(referer).origin; } catch { return ''; } })();
  if (source !== configured) {
    res.status(403).json({ error: 'Origin không được phép.' });
    return false;
  }
  return true;
}

function localRateLimit(req, res, options) {
  const windowMs = Math.max(1_000, Number(options.windowMs || DEFAULT_WINDOW_MS));
  const max = Math.max(1, Number(options.max || DEFAULT_MAX));
  const keyPrefix = String(options.keyPrefix || 'api');
  const key = `${keyPrefix}:${clientIp(req)}`;
  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    for (const [k, v] of buckets) {
      if (now - v.start >= windowMs) buckets.delete(k);
      if (buckets.size < MAX_BUCKETS) break;
    }
  }
  const current = buckets.get(key);
  if (!current || now - current.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  if (current.count > max) {
    const retry = Math.max(1, Math.ceil((windowMs - (now - current.start)) / 1000));
    res.setHeader('Retry-After', String(retry));
    res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
    return false;
  }
  return true;
}

export function rateLimit(req, res, options = {}) {
  return localRateLimit(req, res, options);
}

const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return current
`;

export async function distributedRateLimit(req, res, options = {}) {
  const windowMs = Math.max(1_000, Number(options.windowMs || DEFAULT_WINDOW_MS));
  const max = Math.max(1, Number(options.max || DEFAULT_MAX));
  const prefix = String(options.keyPrefix || 'api');
  const cfg = redisConfig();
  if (!cfg) return localRateLimit(req, res, options);
  const key = `study-th:rate:${prefix}:${clientIp(req)}`;
  const count = Number(await redisEval(RATE_LIMIT_LUA, [key], [windowMs]) || 0);
  if (!count) return localRateLimit(req, res, options);
  if (count > max) {
    const retry = Math.max(1, Math.ceil(windowMs / 1000));
    res.setHeader('Retry-After', String(retry));
    res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
    return false;
  }
  return true;
}

export function safeRequestId() {
  return crypto.randomBytes(12).toString('hex');
}
