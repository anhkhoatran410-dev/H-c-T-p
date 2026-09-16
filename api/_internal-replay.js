import crypto from 'node:crypto';

const WINDOW_MS = 30_000;
const REDIS_TIMEOUT = 1_500;
const localNonces = new Map();

function redisConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

async function redis(command) {
  const cfg = redisConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT);
  try {
    const r = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([command]),
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

export function internalTimestamp() {
  return Date.now();
}

export function internalNonce() {
  return crypto.randomBytes(18).toString('hex');
}

export function internalSignature(secret, timestamp, nonce) {
  return crypto
    .createHmac('sha256', secret)
    .update(`study-th-ai-gateway:${timestamp}:${nonce}`)
    .digest('hex');
}

export async function consumeNonce(nonce, now = Date.now()) {
  if (!nonce || !/^[a-f0-9]{36}$/i.test(nonce)) return false;
  const cfg = redisConfig();
  if (cfg) {
    const key = `study-th:replay:${nonce}`;
    const result = await redis(['SET', key, String(now), 'NX', 'PX', WINDOW_MS]);
    return result === 'OK';
  }

  for (const [key, expiresAt] of localNonces) {
    if (expiresAt <= now) localNonces.delete(key);
  }
  if (localNonces.has(nonce)) return false;
  localNonces.set(nonce, now + WINDOW_MS);
  return true;
}

export function verifyTimestamp(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return false;
  return Math.abs(now - value) <= WINDOW_MS;
}

export function timingSafeHexEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
