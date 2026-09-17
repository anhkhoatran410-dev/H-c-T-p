import { isAdminRequest, getAdminRole } from './admin-login.js';
import { applySecurityHeaders, enforceBodySize, enforceMethod, enforceJsonContentType, rateLimit, sameOrigin, safeRequestId } from './_security.js';
import { aiLockdownStatus, setAiLockdown } from './_emergency-lock.js';
import { setShieldSubjectBlock, clearShieldSubjectBlock, shieldSubjectStatus, setShieldWhitelist, clearShieldWhitelist, shieldWhitelistStatus } from './_intrusion-shield.js';
import { roleAllows, denyRole, createAdminApproval, consumeSecondApproval, ADMIN_APPROVAL_TTL_SECONDS } from './_admin-policy.js';

const URL = String(process.env.SUPABASE_URL || '').trim();
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function sb(path, options = {}) {
  if (!URL || !KEY) throw new Error('Supabase server credentials chưa được cấu hình.');
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(data?.message || data?.hint || `Supabase ${r.status}`);
  return data;
}

async function incident(severity, title, detail, autoAction) {
  try {
    await sb('system_incidents', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ severity, area: 'security', title, detail, status: 'open', auto_action: autoAction })
    });
  } catch {}
}

function protect(req, res, methods) {
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', safeRequestId());
  if (!enforceMethod(req, res, methods)) return false;
  if (!enforceBodySize(req, res, 64 * 1024)) return false;
  if (req.method !== 'GET' && !enforceJsonContentType(req, res)) return false;
  if (!sameOrigin(req, res)) return false;
  if (!rateLimit(req, res, { max: 20, windowMs: 60_000, keyPrefix: 'system-control' })) return false;
  return true;
}

function requireRole(req, res, roles) {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Admin session required' });
    return false;
  }
  return roleAllows(getAdminRole(req), roles) || denyRole(res, roles);
}

function multisigEnabled() {
  return String(process.env.SECURITY_REQUIRE_CISO_MULTISIG || '').trim().toLowerCase() === 'true';
}

export default async function handler(req, res) {
  const route = String(req.query?.route || '').replace(/^\/+|\/+$/g, '');

  if (route === 'incidents') {
    if (!protect(req, res, ['GET'])) return;
    if (!requireRole(req, res, ['operator', 'secops', 'ciso'])) return;
    try {
      const d = await sb('system_incidents?select=*&order=created_at.desc&limit=30');
      return res.status(200).json(d || []);
    } catch {
      return res.status(500).json({ error: 'Không đọc được sự cố.' });
    }
  }

  if (route === 'lockdown') {
    if (!protect(req, res, req.method === 'GET' ? ['GET'] : ['POST'])) return;
    if (req.method === 'GET') {
      if (!requireRole(req, res, ['operator', 'secops', 'ciso'])) return;
      return res.status(200).json(await aiLockdownStatus());
    }
    if (!requireRole(req, res, ['ciso'])) return;
    if (multisigEnabled()) {
      return res.status(409).json({ error: 'CISO lockdown yêu cầu 2 phiên Admin phê duyệt.', multisigRequired: true, requestRoute: 'lockdown-request', approvalRoute: 'lockdown-approve', expiresIn: ADMIN_APPROVAL_TTL_SECONDS });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.confirmAction !== true) return res.status(409).json({ error: 'Xác nhận Admin bắt buộc để đổi trạng thái lockdown.' });
    const enabled = body.enabled === true;
    const seconds = Math.max(60, Math.min(24 * 60 * 60, Number(body.seconds || 3600)));
    const state = await setAiLockdown(enabled, seconds);
    await incident(enabled ? 'critical' : 'info', enabled ? 'AI lockdown enabled' : 'AI lockdown disabled', `CISO thay đổi trạng thái AI lockdown (${getAdminRole(req)}).`, enabled ? 'redis-ai-lockdown' : 'clear-redis-ai-lockdown');
    return res.status(200).json({ ok: true, ...state });
  }

  if (route === 'lockdown-request') {
    if (!protect(req, res, ['POST'])) return;
    if (!requireRole(req, res, ['ciso'])) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.confirmAction !== true) return res.status(409).json({ error: 'Xác nhận CISO bắt buộc.' });
    const enabled = body.enabled === true;
    const seconds = Math.max(60, Math.min(24 * 60 * 60, Number(body.seconds || 3600)));
    const approval = await createAdminApproval('ai-lockdown', { enabled, seconds }, req);
    if (!approval) return res.status(503).json({ error: 'Không tạo được yêu cầu phê duyệt bảo mật trên Redis.' });
    await incident('high', 'CISO AI lockdown approval requested', `Đã tạo yêu cầu phê duyệt 2 phiên cho AI lockdown (${enabled ? 'enable' : 'disable'}).`, 'redis-admin-approval-pending');
    return res.status(202).json({ ok: true, multisigRequired: true, ...approval });
  }

  if (route === 'lockdown-approve') {
    if (!protect(req, res, ['POST'])) return;
    if (!requireRole(req, res, ['secops', 'ciso'])) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const record = await consumeSecondApproval(body.requestId, req, 'ai-lockdown');
    if (!record) return res.status(409).json({ error: 'Yêu cầu phê duyệt không hợp lệ, đã hết hạn hoặc cùng một phiên Admin.' });
    const enabled = record.payload?.enabled === true;
    const seconds = Math.max(60, Math.min(24 * 60 * 60, Number(record.payload?.seconds || 3600)));
    const state = await setAiLockdown(enabled, seconds);
    await incident(enabled ? 'critical' : 'info', enabled ? 'AI lockdown enabled by multi-sig' : 'AI lockdown disabled by multi-sig', `Yêu cầu AI lockdown được phê duyệt bởi 2 phiên Admin; approver=${getAdminRole(req)}.`, enabled ? 'redis-ai-lockdown' : 'clear-redis-ai-lockdown');
    return res.status(200).json({ ok: true, multiSigApproved: true, ...state });
  }

  if (route === 'subject-block') {
    if (!protect(req, res, req.method === 'GET' ? ['GET'] : ['POST'])) return;
    if (req.method === 'GET') {
      if (!requireRole(req, res, ['operator', 'secops', 'ciso'])) return;
    } else if (!requireRole(req, res, ['secops', 'ciso'])) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const subject = String(body.subject || req.query?.subject || '').trim();
    if (!subject || subject.length > 180) return res.status(400).json({ error: 'Device/user fingerprint không hợp lệ.' });
    if (req.method === 'GET') return res.status(200).json(await shieldSubjectStatus(subject));
    if (body.confirmAction !== true) return res.status(409).json({ error: 'Xác nhận Admin bắt buộc để đổi trạng thái block.' });
    if (body.enabled === false) {
      const state = await clearShieldSubjectBlock(subject);
      await incident('info', 'Admin subject quarantine cleared', `Đã gỡ block cho fingerprint ${state.subjectHash} (${getAdminRole(req)}).`, 'redis-subject-unblock');
      return res.status(200).json({ ok: true, enabled: false, ...state });
    }
    const seconds = Math.max(60, Math.min(24 * 60 * 60, Number(body.seconds || 24 * 60 * 60)));
    const state = await setShieldSubjectBlock(subject, seconds);
    await incident('high', 'Admin subject quarantine enabled', `Đã block fingerprint ${state.subjectHash} (${getAdminRole(req)}).`, 'redis-subject-block');
    return res.status(200).json({ ok: true, enabled: true, ...state });
  }

  if (route === 'whitelist') {
    if (!protect(req, res, req.method === 'GET' ? ['GET'] : ['POST'])) return;
    if (req.method === 'GET') {
      if (!requireRole(req, res, ['operator', 'secops', 'ciso'])) return;
    } else if (!requireRole(req, res, ['secops', 'ciso'])) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const type = String(body.type || req.query?.type || '').trim().toLowerCase();
    const value = String(body.value || req.query?.value || '').trim();
    if (!['ip', 'subject'].includes(type) || !value || value.length > 180) return res.status(400).json({ error: 'Whitelist entry không hợp lệ.' });
    if (req.method === 'GET') return res.status(200).json(await shieldWhitelistStatus(type, value));
    if (body.confirmAction !== true) return res.status(409).json({ error: 'Xác nhận Admin bắt buộc để đổi whitelist.' });
    if (body.enabled === false) {
      const state = await clearShieldWhitelist(type, value);
      await incident('info', 'Security whitelist cleared', `Đã gỡ whitelist ${state.type}:${state.fingerprint} (${getAdminRole(req)}).`, 'redis-security-whitelist-clear');
      return res.status(200).json({ ok: true, enabled: false, ...state });
    }
    const seconds = Math.max(60, Math.min(30 * 24 * 60 * 60, Number(body.seconds || 30 * 24 * 60 * 60)));
    const state = await setShieldWhitelist(type, value, seconds);
    await incident('info', 'Security whitelist enabled', `Đã whitelist ${state.type}:${state.fingerprint} (${getAdminRole(req)}).`, 'redis-security-whitelist-set');
    return res.status(200).json({ ok: true, enabled: true, ...state });
  }

  if (req.method === 'GET') {
    if (!protect(req, res, ['GET'])) return;
    if (!requireRole(req, res, ['operator', 'secops', 'ciso'])) return;
    try {
      const d = await sb('system_control?select=maintenance,maintenance_title,maintenance_message,updated_at&id=eq.true');
      return res.status(200).json(d?.[0] || { maintenance: false });
    } catch {
      return res.status(200).json({ maintenance: false, unavailable: true });
    }
  }

  if (!protect(req, res, ['POST'])) return;
  if (!requireRole(req, res, ['secops', 'ciso'])) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const title = String(body.title || '').slice(0, 160);
  const message = String(body.message || '').slice(0, 2000);

  try {
    const d = await sb('system_control?id=eq.true', {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        maintenance: body.maintenance === true,
        maintenance_title: title || 'Hệ thống đang được chăm sóc một chút 💛',
        maintenance_message: message || 'STUDY TH đang được bảo trì để mọi thứ chạy ổn định hơn.',
        updated_at: new Date().toISOString()
      })
    });
    return res.status(200).json(d?.[0] || {});
  } catch {
    return res.status(500).json({ error: 'Không cập nhật được trạng thái hệ thống.' });
  }
}
