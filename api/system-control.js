import { isAdminRequest } from './admin-login.js';
import { applySecurityHeaders, enforceBodySize, enforceMethod, enforceJsonContentType, rateLimit, sameOrigin, safeRequestId } from './_security.js';
import { aiLockdownStatus, setAiLockdown } from './_emergency-lock.js';
import { setShieldSubjectBlock, clearShieldSubjectBlock, shieldSubjectStatus } from './_intrusion-shield.js';

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

export default async function handler(req, res) {
  const route = String(req.query?.route || '').replace(/^\/+|\/+$/g, '');

  if (route === 'incidents') {
    if (!protect(req, res, ['GET'])) return;
    if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });
    try {
      const d = await sb('system_incidents?select=*&order=created_at.desc&limit=30');
      return res.status(200).json(d || []);
    } catch {
      return res.status(500).json({ error: 'Không đọc được sự cố.' });
    }
  }

  if (route === 'lockdown') {
    if (!protect(req, res, req.method === 'GET' ? ['GET'] : ['POST'])) return;
    if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });
    if (req.method === 'GET') return res.status(200).json(await aiLockdownStatus());
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.confirmAction !== true) return res.status(409).json({ error: 'Xác nhận Admin bắt buộc để đổi trạng thái lockdown.' });
    const enabled = body.enabled === true;
    const seconds = Math.max(60, Math.min(24 * 60 * 60, Number(body.seconds || 3600)));
    const state = await setAiLockdown(enabled, seconds);
    await incident(enabled ? 'critical' : 'info', enabled ? 'AI lockdown enabled' : 'AI lockdown disabled', 'Admin thay đổi trạng thái AI lockdown.', enabled ? 'redis-ai-lockdown' : 'clear-redis-ai-lockdown');
    return res.status(200).json({ ok: true, ...state });
  }

  if (route === 'subject-block') {
    if (!protect(req, res, req.method === 'GET' ? ['GET'] : ['POST'])) return;
    if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const subject = String(body.subject || req.query?.subject || '').trim();
    if (!subject || subject.length > 180) return res.status(400).json({ error: 'Device/user fingerprint không hợp lệ.' });
    if (req.method === 'GET') return res.status(200).json(await shieldSubjectStatus(subject));
    if (body.confirmAction !== true) return res.status(409).json({ error: 'Xác nhận Admin bắt buộc để đổi trạng thái block.' });
    if (body.enabled === false) {
      const state = await clearShieldSubjectBlock(subject);
      await incident('info', 'Admin subject quarantine cleared', `Đã gỡ block cho fingerprint ${state.subjectHash}.`, 'redis-subject-unblock');
      return res.status(200).json({ ok: true, enabled: false, ...state });
    }
    const seconds = Math.max(60, Math.min(24 * 60 * 60, Number(body.seconds || 24 * 60 * 60)));
    const state = await setShieldSubjectBlock(subject, seconds);
    await incident('high', 'Admin subject quarantine enabled', `Đã block fingerprint ${state.subjectHash}.`, 'redis-subject-block');
    return res.status(200).json({ ok: true, enabled: true, ...state });
  }

  if (req.method === 'GET') {
    if (!protect(req, res, ['GET'])) return;
    try {
      const d = await sb('system_control?select=maintenance,maintenance_title,maintenance_message,updated_at&id=eq.true');
      return res.status(200).json(d?.[0] || { maintenance: false });
    } catch {
      return res.status(200).json({ maintenance: false, unavailable: true });
    }
  }

  if (!protect(req, res, ['POST'])) return;
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });

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
