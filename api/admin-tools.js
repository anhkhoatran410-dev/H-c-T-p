import { isAdminRequest } from './admin-login.js';
import './_gemini-network-guard.js';
import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, rateLimit, sameOrigin, safeRequestId } from './_security.js';
import adminAssistantHandler from '../lib/admin-assistant.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

async function guard(req, res) {
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', safeRequestId());
  if (!enforceMethod(req, res, ['POST'])) return false;
  if (!enforceBodySize(req, res, 256 * 1024)) return false;
  if (!enforceJsonContentType(req, res)) return false;
  if (!sameOrigin(req, res)) return false;
  if (!rateLimit(req, res, { max: 20, windowMs: 60_000, keyPrefix: 'admin-tools' })) return false;
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Admin session required' });
    return false;
  }
  if (!SERVICE_KEY || !SUPABASE_URL) {
    res.status(500).json({ error: 'Supabase server credentials chưa được cấu hình trên Vercel.' });
    return false;
  }
  return true;
}

async function sb(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(8000),
  });
  const text = await r.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch { data = []; }
  if (!r.ok) throw new Error('Supabase request failed.');
  return data;
}

async function health(req, res) {
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', safeRequestId());
  if (!enforceMethod(req, res, ['GET'])) return;
  if (!sameOrigin(req, res)) return;
  if (!rateLimit(req, res, { max: 10, windowMs: 60_000, keyPrefix: 'admin-health' })) return;
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });
  if (!SERVICE_KEY || !SUPABASE_URL) return res.status(500).json({ error: 'Supabase server credentials chưa được cấu hình.' });

  const gemini = String(process.env.GEMINI_API_KEY || '').replace(/^['"`]+|['"`]+$/g, '').replace(/[\u0000-\u0020\u007f-\u009f]/g, '').trim();
  const checks = { GEMINI_API_KEY: !!gemini, Gemini_generateContent: false, SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY, Supabase_database: false };
  const details = {};

  if (gemini) {
    for (const model of GEMINI_MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gemini },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly OK.' }] }], generationConfig: { maxOutputTokens: 8 } }),
          signal: AbortSignal.timeout(7000)
        });
        const raw = await r.text();
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch {}
        if (r.ok) { checks.Gemini_generateContent = true; details.gemini_model = model; break; }
        details[model] = data?.error?.message || `HTTP ${r.status}`;
      } catch (e) { details[model] = 'request failed'; }
    }
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/exams?select=id&limit=1`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      signal: AbortSignal.timeout(5000)
    });
    checks.Supabase_database = r.ok;
  } catch {}

  return res.status(200).json({ checks, details });
}

async function adminListAccounts(req, res) {
  if (!await guard(req, res)) return;
  try {
    const rows = await sb('support_accounts?select=id,name,handle,avatar,description,bot_enabled,is_active,created_at,updated_at&order=created_at.asc&limit=100');
    return res.status(200).json({ ok: true, accounts: Array.isArray(rows) ? rows : [] });
  } catch { return res.status(502).json({ error: 'Không tải được tài khoản hỗ trợ.' }); }
}

async function adminCreateAccount(req, res) {
  if (!await guard(req, res)) return;
  const name = String(req.body?.name || '').trim();
  const handle = String(req.body?.handle || '').trim();
  const avatar = String(req.body?.avatar || '💬').trim();
  const description = String(req.body?.description || '').trim();
  const botEnabled = req.body?.bot_enabled !== false;
  if (!name || name.length > 200 || handle.length > 100 || avatar.length > 20 || description.length > 1000) {
    return res.status(400).json({ error: 'Dữ liệu tài khoản hỗ trợ không hợp lệ.' });
  }
  try {
    const rows = await sb('support_accounts', {
      method: 'POST',
      body: JSON.stringify({ name, handle: handle || null, avatar: avatar || '💬', description: description || null, bot_enabled: botEnabled, is_active: true, updated_at: new Date().toISOString() }),
    });
    return res.status(200).json({ ok: true, account: rows?.[0] || null });
  } catch { return res.status(502).json({ error: 'Không tạo được tài khoản hỗ trợ.' }); }
}

async function adminListBotRules(req, res) {
  if (!await guard(req, res)) return;
  try {
    const rows = await sb('support_bot_rules?select=*,support_accounts(name,handle,avatar)&order=priority.desc&limit=200');
    return res.status(200).json({ ok: true, rules: Array.isArray(rows) ? rows : [] });
  } catch { return res.status(502).json({ error: 'Không tải được quy tắc bot.' }); }
}

async function adminCreateBotRule(req, res) {
  if (!await guard(req, res)) return;
  const accountId = String(req.body?.account_id || '').trim();
  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.map(x => String(x || '').trim()).filter(Boolean).slice(0, 30)
    : [];
  const reply = String(req.body?.reply || '').trim();
  const priority = Number(req.body?.priority ?? 10);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId) || !keywords.length || keywords.some(x => x.length > 100) || !reply || reply.length > 10_000 || !Number.isFinite(priority) || priority < -1000 || priority > 1000) {
    return res.status(400).json({ error: 'Dữ liệu quy tắc bot không hợp lệ.' });
  }
  try {
    const rows = await sb('support_bot_rules', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId, keywords, reply, priority: Math.trunc(priority), enabled: true, updated_at: new Date().toISOString() }),
    });
    return res.status(200).json({ ok: true, rule: rows?.[0] || null });
  } catch { return res.status(502).json({ error: 'Không lưu được quy tắc bot.' }); }
}

async function singleDelete(req, res) {
  if (!await guard(req, res)) return;
  const id = String(req.body?.id || '').trim();
  if (!id || id.length > 128) return res.status(400).json({ error: 'ID bài kiểm tra không hợp lệ.' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/exams?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
      signal: AbortSignal.timeout(7000)
    });
    if (!r.ok) return res.status(502).json({ error: 'Không thể xóa dữ liệu.' });
    return res.status(200).json({ ok: true, id });
  } catch { return res.status(500).json({ error: 'Không xóa được bài kiểm tra.' }); }
}

async function bulkDelete(req, res) {
  if (!await guard(req, res)) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ids = Array.isArray(body.ids) ? body.ids.map(x => String(x).trim()).filter(Boolean).slice(0, 100) : [];
  const from = body.from ? new Date(body.from) : null;
  const to = body.to ? new Date(body.to) : null;
  if (from && !Number.isFinite(from.getTime())) return res.status(400).json({ error: 'Ngày bắt đầu không hợp lệ.' });
  if (to && !Number.isFinite(to.getTime())) return res.status(400).json({ error: 'Ngày kết thúc không hợp lệ.' });
  if (!ids.length && !from && !to) return res.status(400).json({ error: 'Phải chỉ rõ phạm vi xóa.' });
  try {
    let url = `${SUPABASE_URL}/rest/v1/exams?`;
    if (ids.length) url += `id=in.(${ids.map(x => encodeURIComponent(x)).join(',')})`;
    else {
      const parts = [];
      if (from) parts.push(`created_at=gte.${encodeURIComponent(from.toISOString())}`);
      if (to) parts.push(`created_at=lt.${encodeURIComponent(to.toISOString())}`);
      url += parts.join('&');
    }
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=representation' },
      signal: AbortSignal.timeout(10000)
    });
    const text = await r.text();
    if (!r.ok) return res.status(502).json({ error: 'Không thể xóa dữ liệu.' });
    let deleted = [];
    try { deleted = JSON.parse(text) || []; } catch {}
    return res.status(200).json({ ok: true, count: Array.isArray(deleted) ? deleted.length : 0 });
  } catch { return res.status(500).json({ error: 'Không xóa được dữ liệu.' }); }
}

async function updateExam(req, res) {
  if (!await guard(req, res)) return;
  const id = String(req.body?.id || '').trim();
  const questions = Array.isArray(req.body?.questions) ? req.body.questions : null;
  if (!id || id.length > 128 || !questions || questions.length > 500) return res.status(400).json({ error: 'Dữ liệu bài kiểm tra không hợp lệ.' });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/exams?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=representation' },
      body: JSON.stringify({ questions, question_count: questions.length }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return res.status(502).json({ error: 'Không thể cập nhật bài kiểm tra.' });
    const raw = await r.text();
    let data = [];
    try { data = JSON.parse(raw) || []; } catch {}
    return res.status(200).json({ ok: true, exam: data?.[0] || null });
  } catch { return res.status(500).json({ error: 'Không cập nhật được bài kiểm tra.' }); }
}

async function clientMeta(req, res) {
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', safeRequestId());
  if (!enforceMethod(req, res, ['GET'])) return;
  if (!sameOrigin(req, res)) return;
  if (!rateLimit(req, res, { max: 30, windowMs: 60_000, keyPrefix: 'client-meta' })) return;
  // Public, read-only metadata endpoint. It exposes no secrets or admin state,
  // so ordinary client probes must not be rejected as admin requests.
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  res.setHeader('Cache-Control', 'no-store');
  const path = String(req.query?.route || '').replace(/^\/+|\/+$/g, '');
  if (path === 'admin-health') return health(req, res);
  if (path === 'admin-accounts') return adminListAccounts(req, res);
  if (path === 'admin-create-account') return adminCreateAccount(req, res);
  if (path === 'admin-bot-rules') return adminListBotRules(req, res);
  if (path === 'admin-create-bot-rule') return adminCreateBotRule(req, res);
  if (path === 'admin-delete-exam') return singleDelete(req, res);
  if (path === 'admin-delete-exams-bulk') return bulkDelete(req, res);
  if (path === 'admin-update-exam') return updateExam(req, res);
  if (path === 'client-meta') return clientMeta(req, res);
  if (path === 'admin-assistant') return adminAssistantHandler(req, res);
  return res.status(404).json({ error: 'Admin utility route not found' });
}
