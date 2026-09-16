import crypto from 'node:crypto';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;
const HALF_OPEN_PROBE_MS = 15_000;
const MAX_KEYS = 50;
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
    for (const [index, value] of packed.split(',').map(v => v.trim()).filter(Boolean).entries()) out.push({ id: `${prefix}_API_KEYS_${index + 1}`, key: value });
  }
  return out;
}
function fingerprint(key) { return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16); }
function getState(id) {
  let s = state.get(id);
  if (!s) { s = { failures: 0, successes: 0, uses: 0, openedUntil: 0, probeUntil: 0, lastFailure: 0, lastUsed: 0 }; state.set(id, s); }
  return s;
}
function isOpen(s, now) { return s.openedUntil > now; }
function isProbeLocked(s, now) { return s.probeUntil > now; }
export function getAiKeyPool(prefix = 'GEMINI') { return envKeys(prefix).map(entry => ({ ...entry, fingerprint: fingerprint(entry.key) })); }
export function acquireAiKey(prefix = 'GEMINI', excludedIds = []) {
  const excluded = new Set((Array.isArray(excludedIds) ? excludedIds : []).map(String));
  const pool = getAiKeyPool(prefix).filter(k => !excluded.has(k.id));
  if (!pool.length) return null;
  const now = Date.now();
  const healthy = pool.filter(k => { const s = getState(k.id); return !isOpen(s, now) && !isProbeLocked(s, now); });
  let candidates = healthy;
  if (!candidates.length) candidates = pool.filter(k => { const s = getState(k.id); return s.openedUntil > 0 && s.openedUntil <= now && !isProbeLocked(s, now); });
  if (!candidates.length) return null;
  candidates.sort((a, b) => { const sa = getState(a.id); const sb = getState(b.id); return (sa.failures - sb.failures) || (sa.lastUsed - sb.lastUsed) || (sa.uses - sb.uses); });
  const selected = candidates[0];
  const s = getState(selected.id); s.lastUsed = now; s.uses += 1;
  if (s.openedUntil > 0 && s.openedUntil <= now) s.probeUntil = now + HALF_OPEN_PROBE_MS;
  return selected;
}
export function reportAiSuccess(prefix, id) { const s = getState(id); s.failures = 0; s.openedUntil = 0; s.probeUntil = 0; s.successes += 1; }
export function reportAiFailure(prefix, id, error = {}) {
  const s = getState(id); const status = Number(error?.status || 0); s.lastFailure = Date.now();
  // Only key-specific auth failures immediately open the circuit. 429/5xx/timeouts use the threshold.
  if (status === 401 || status === 403) { s.failures = FAILURE_THRESHOLD; s.openedUntil = Date.now() + COOLDOWN_MS; s.probeUntil = 0; }
  else if (status === 429 || status >= 500 || error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET' || error?.code === 'EAI_AGAIN') {
    s.failures += 1;
    if (s.failures >= FAILURE_THRESHOLD) { s.openedUntil = Date.now() + COOLDOWN_MS; s.probeUntil = 0; }
  }
  return { opened: s.openedUntil > Date.now(), failures: s.failures, retryAt: s.openedUntil || null };
}
export function aiPoolSnapshot(prefix = 'GEMINI') {
  const now = Date.now();
  return getAiKeyPool(prefix).map(k => { const s = getState(k.id); const circuit = isOpen(s, now) ? 'open' : (isProbeLocked(s, now) ? 'half-open' : 'closed'); return { id: k.id, fingerprint: k.fingerprint, failures: s.failures, successes: s.successes, uses: s.uses, circuit, retryAt: s.openedUntil || null, lastFailure: s.lastFailure || null, lastUsed: s.lastUsed || null }; });
}
