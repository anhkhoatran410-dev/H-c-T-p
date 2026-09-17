import crypto from 'node:crypto';

const ROLE_ORDER = Object.freeze(['operator', 'secops', 'ciso']);
const APPROVAL_TTL_SECONDS = 120;
const REDIS_TIMEOUT_MS = 1200;

export function normalizeAdminRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ROLE_ORDER.includes(role) ? role : '';
}

export function roleAllows(role, allowed = []) {
  const current = normalizeAdminRole(role);
  const list = Array.isArray(allowed) ? allowed.map(normalizeAdminRole).filter(Boolean) : [];
  return Boolean(current && list.includes(current));
}

export function denyRole(res, allowed = []) {
  const labels = allowed.map(normalizeAdminRole).filter(Boolean).join(', ');
  res.status(403).json({ error: `Quyền Admin không đủ. Yêu cầu: ${labels || 'privileged role'}.` });
  return false;
}

function redisConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

async function redis(command) {
  const cfg = redisConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
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
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function authMaterial(req) {
  const cookieHeader = String(req?.headers?.cookie || '');
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key === 'study_admin_session_v3') return decodeURIComponent(part.slice(i + 1).trim());
  }
  const bearer = String(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return bearer;
}

export function adminSessionFingerprint(req) {
  const material = authMaterial(req);
  if (!material) return '';
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 32);
}

function approvalKey(requestId) {
  return `study-th:security:admin-approval:${encodeURIComponent(String(requestId || ''))}`;
}

export async function createAdminApproval(action, payload, req) {
  const id = crypto.randomBytes(12).toString('hex');
  const proposer = adminSessionFingerprint(req);
  if (!proposer) return null;
  const body = JSON.stringify({
    action: String(action || ''),
    payload: payload && typeof payload === 'object' ? payload : {},
    proposer,
    createdAt: Date.now(),
  });
  const stored = await redis(['SET', approvalKey(id), body, 'EX', APPROVAL_TTL_SECONDS]);
  if (stored !== 'OK') return null;
  return { requestId: id, expiresIn: APPROVAL_TTL_SECONDS };
}

export async function consumeSecondApproval(requestId, req, expectedAction) {
  const id = String(requestId || '').trim();
  const approver = adminSessionFingerprint(req);
  if (!id || !approver) return null;
  const raw = await redis(['GET', approvalKey(id)]);
  if (!raw) return null;
  let record;
  try { record = JSON.parse(String(raw)); } catch { return null; }
  if (String(record?.action || '') !== String(expectedAction || '')) return null;
  if (!record?.proposer || record.proposer === approver) return null;
  const deleted = await redis(['DEL', approvalKey(id)]);
  if (deleted === null) return null;
  return record;
}

export const ADMIN_APPROVAL_TTL_SECONDS = APPROVAL_TTL_SECONDS;
export const ADMIN_ROLES = ROLE_ORDER;
