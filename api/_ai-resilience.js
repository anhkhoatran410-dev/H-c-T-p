import crypto from 'node:crypto';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;
const MAX_KEYS = 20;
const state = new Map();

function envKeys(prefix) {
  const out = [];
  const base = String(process.env[`${prefix}_API_KEY`] || '').trim();
  if (base) out.push({ id: `${prefix}_API_KEY`, key: base });
  for (let i = 2; i <= MAX_KEYS; i += 1) {
    const value = String(process.env[`${prefix}_API_KEY_${i}`] || '').trim();
    if (value) out.push({ id: `${prefix}_API_KEY_${i}`, key: value });
  }
  const packed = String(process.env[`${prefix}_API_KEYS`] || '').trim();
  if (packed) {
    for (const [index, value] of packed.split(',').map(v => v.trim()).filter(Boolean).entries()) {
      out.push({ id: `${prefix}_API_KEYS_${index + 1}`, key: value });
    }
  }
  return out;
}

function fingerprint(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function getState(id) {
  let s = state.get(id);
  if (!s) {
    s = { failures: 0, openedUntil: 0, probing: false, successes: 0, lastFailure: 0 };
    state.set(id, s);
  }
  return s;
}

function availableKey(entry, now) {
  const s = getState(entry.id);
  if (s.openedUntil > now) return false;
  if (s.openedUntil && !s.probing) s.probing = true;
  return !s.probing || s.openedUntil <= now;
}

export function getAiKeyPool(prefix = 'GEMINI') {
  return envKeys(prefix).map(entry => ({ ...entry, fingerprint: fingerprint(entry.key) }));
}

export function acquireAiKey(prefix = 'GEMINI') {
  const pool = getAiKeyPool(prefix);
  if (!pool.length) return null;
  const now = Date.now();
  const healthy = pool.filter(k => availableKey(k, now));
  const candidates = healthy.length ? healthy : pool.filter(k => getState(k.id).openedUntil <= now);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const sa = getState(a.id);
    const sb = getState(b.id);
    return (sa.failures - sb.failures) || (sa.lastFailure - sb.lastFailure) || (sa.successes - sb.successes);
  });
  const selected = candidates[0];
  const s = getState(selected.id);
  if (s.openedUntil > 0 && s.openedUntil <= now) s.probing = true;
  return selected;
}

export function reportAiSuccess(prefix, id) {
  const s = getState(id);
  s.failures = 0;
  s.openedUntil = 0;
  s.probing = false;
  s.successes += 1;
}

export function reportAiFailure(prefix, id, error) {
  const s = getState(id);
  s.failures += 1;
  s.lastFailure = Date.now();
  if (s.failures >= FAILURE_THRESHOLD) {
    s.openedUntil = Date.now() + COOLDOWN_MS;
    s.probing = false;
  }
  return { opened: s.openedUntil > Date.now(), failures: s.failures, retryAt: s.openedUntil || null };
}

export function aiPoolSnapshot(prefix = 'GEMINI') {
  return getAiKeyPool(prefix).map(k => {
    const s = getState(k.id);
    return {
      id: k.id,
      fingerprint: k.fingerprint,
      failures: s.failures,
      successes: s.successes,
      circuit: s.openedUntil > Date.now() ? 'open' : 'closed',
      retryAt: s.openedUntil || null
    };
  });
}
