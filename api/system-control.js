import { isAdminRequest } from './admin-login.js';
import { applySecurityHeaders, enforceBodySize, enforceMethod, rateLimit, sameOrigin, safeRequestId } from './_security.js';

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

function protect(req, res, methods) {
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', safeRequestId());
  if (!enforceMethod(req, res, methods)) return false;
  if (!enforceBodySize(req, res, 64 * 1024)) return false;
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
    } catch (e) {
      return res.status(500).json({ error: 'Không đọc được sự cố.' });
    }
  }

  if (req.method === 'GET') {
    if (!protect(req, res, ['GET'])) return;
    try {
      const d = await sb('system_control?select=maintenance,maintenance_title,maintenance_message,updated_at&id=eq.true');
      return res.status(200).json(d?.[0] || { maintenance: false });
    } catch (e) {
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
  } catch (e) {
    return res.status(500).json({ error: 'Không cập nhật được trạng thái hệ thống.' });
  }
}
