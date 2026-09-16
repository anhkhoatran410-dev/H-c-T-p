import { isAdminRequest } from './admin-login.js';
import { applySecurityHeaders, enforceBodySize, enforceMethod, rateLimit, sameOrigin, safeRequestId } from './_security.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

async function guard(req, res) {
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', safeRequestId());
  if (!enforceMethod(req, res, ['POST'])) return false;
  if (!enforceBodySize(req, res, 256 * 1024)) return false;
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
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  res.setHeader('Cache-Control', 'no-store');
  const path = String(req.query?.route || '').replace(/^\/+|\/+$/g, '');
  if (path === 'admin-health') return health(req, res);
  if (path === 'admin-delete-exam') return singleDelete(req, res);
  if (path === 'admin-delete-exams-bulk') return bulkDelete(req, res);
  if (path === 'admin-update-exam') return updateExam(req, res);
  if (path === 'client-meta') return clientMeta(req, res);
  return res.status(404).json({ error: 'Admin utility route not found' });
}
