import { isAdminRequest } from './admin-login.js';
import '../lib/api/_gemini-network-guard.js';
import { getAiKeyPool } from '../lib/api/_ai-resilience.js';
import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, rateLimit, sameOrigin, safeRequestId } from '../lib/api/_security.js';
import adminAssistantHandler from '../lib/admin-assistant.js';
import { supabasePublicReady, supabasePublicRequest } from '../lib/api/_supabase-public.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://mlqaeginqsgqacdqdzbm.supabase.co').trim();
const SERVICE_KEYS = [
  process.env.SUPABASE_SECRET_KEY,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SERVICE_KEY,
].map(v => String(v || '').trim()).filter(Boolean).filter((v,i,a) => a.indexOf(v) === i);
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

async function guard(req, res, options = {}) {
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
  if (options.requireService !== false && (!SERVICE_KEYS.length || !SUPABASE_URL)) {
    res.status(500).json({ error: 'Thiếu khóa Supabase server trên Vercel.' });
    return false;
  }
  return true;
}

async function sb(path, options = {}) {
  let last = new Error('Supabase request failed.');
  for (const key of SERVICE_KEYS) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          ...(options.headers || {}),
        },
        signal: options.signal || AbortSignal.timeout(8000),
      });
      const text = await r.text();
      let data = [];
      try { data = text ? JSON.parse(text) : []; } catch { data = []; }
      if (!r.ok) {
        last = new Error(data?.message || data?.error || `Supabase HTTP ${r.status}`);
        continue;
      }
      return data;
    } catch (e) { last = e; }
  }
  throw last;
}

async function authAdmin(path, options = {}) {
  let last = new Error('Supabase Auth request failed.');
  for (const key of SERVICE_KEYS) {
    try {
      const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/${path}`, {
        ...options,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        signal: options.signal || AbortSignal.timeout(9000),
      });
      const text = await r.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (!r.ok) {
        last = new Error(data?.msg || data?.message || data?.error_description || `Supabase Auth HTTP ${r.status}`);
        continue;
      }
      return data;
    } catch (e) { last = e; }
  }
  throw last;
}

async function adminUsers(req, res) {
  if (!await guard(req, res, { requireService: false })) return;
  const action = String(req.body?.action || 'list');
  try {
    if (action === 'list') {
      const page = Math.max(1, Math.trunc(Number(req.body?.page || 1)));
      const perPage = Math.min(100, Math.max(1, Math.trunc(Number(req.body?.perPage || 100))));

      if (SERVICE_KEYS.length) {
        try {
          const rows = await sb('rpc/admin_list_user_accounts', {
            method: 'POST',
            body: JSON.stringify({}),
          });
          const users = Array.isArray(rows) ? rows : [];
          if (users.length) {
            return res.status(200).json({ ok:true, total:users.length, users, syncedAt:new Date().toISOString() });
          }
        } catch (_) {}

        try {
          const data = await authAdmin('users?page=' + page + '&per_page=' + perPage);
          const users = Array.isArray(data?.users) ? data.users : [];
          if (users.length) {
            return res.status(200).json({
              ok:true,
              total:Number(data?.total || users.length),
              users:users.map(u=>({
                id:u.id,
                email:u.email||'',
                full_name:u.user_metadata?.full_name||'',
                student_code:u.user_metadata?.student_code||'',
                role:u.app_metadata?.role||'student',
                status:'active',
                email_confirmed:!!u.email_confirmed_at,
                last_sign_in_at:u.last_sign_in_at||null,
                created_at:u.created_at||null,
                updated_at:u.updated_at||null
              })),
              syncedAt:new Date().toISOString()
            });
          }
        } catch (_) {}
      }

      const rows = await sbReadOnly('admin_student_accounts_snapshot?select=id,full_name,student_code,role,status,created_at,updated_at,email_masked&order=created_at.desc&limit=100');
      const users = Array.isArray(rows) ? rows.map(u=>({
        id:u.id,
        email:u.email_masked||'—',
        full_name:u.full_name||'',
        student_code:u.student_code||'',
        role:u.role||'student',
        status:u.status||'active',
        email_confirmed:true,
        last_sign_in_at:null,
        created_at:u.created_at||null,
        updated_at:u.updated_at||null
      })) : [];
      return res.status(200).json({
        ok:true,
        total:users.length,
        users,
        warning:'safe profile snapshot',
        syncedAt:new Date().toISOString()
      });
    }

    if (!SERVICE_KEYS.length) {
      return res.status(503).json({error:'Chức năng chỉnh sửa tài khoản cần khóa Supabase server trên Vercel.'});
    }

    const id = String(req.body?.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'User ID không hợp lệ.' });

    if (action === 'update') {

async function health(req, res) {
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', safeRequestId());
  if (!enforceMethod(req, res, ['GET'])) return;
  if (!sameOrigin(req, res)) return;
  if (!rateLimit(req, res, { max: 10, windowMs: 60_000, keyPrefix: 'admin-health' })) return;
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });
  if (!SERVICE_KEY || !SUPABASE_URL) return res.status(500).json({ error: 'Supabase server credentials chưa được cấu hình.' });

  const geminiConfigured = getAiKeyPool('GEMINI').length > 0;
  const checks = { GEMINI_API_KEY: geminiConfigured, Gemini_generateContent: false, SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY, Supabase_database: false };
  const details = {};

  if (geminiConfigured) {
    for (const model of GEMINI_MODELS) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly OK.' }] }], generationConfig: { maxOutputTokens: 8 } }),
          signal: AbortSignal.timeout(7000),
          timeoutMs: 7000
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


async function sbReadOnly(path) {
  try { return await sb(path); }
  catch (e) {
    const result = await supabasePublicRequest(path, { method: 'GET' });
    if (!result.ok) throw e;
    return Array.isArray(result.data) ? result.data : [];
  }
}

async function exactCount(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error('Count failed');
  const range = String(r.headers.get('content-range') || '');
  const total = range.includes('/') ? Number(range.split('/').pop()) : 0;
  return Number.isFinite(total) ? total : 0;
}

async function publicExams(req, res) {
  if (!enforceMethod(req, res, ['GET'])) return;
  if (!sameOrigin(req, res)) return;
  if (!supabasePublicReady()) return res.status(500).json({ error: 'Supabase public credentials chưa được cấu hình.' });
  const result = await supabasePublicRequest(
    'exams?status=eq.active&select=id,title,subject,difficulty,duration,question_count,flashcard_only,status,open_at,close_at,created_at&order=created_at.desc&limit=200',
    { method: 'GET' }
  );
  if (!result.ok || !Array.isArray(result.data)) return res.status(502).json({ error: 'Không tải được bài kiểm tra.' });
  const exams = result.data
    .filter((e) => e?.flashcard_only !== true)
    .map((e) => ({ ...e, questions: [] }));
  return res.status(200).json({ ok: true, exams });
}

async function adminSummary(req, res) {
  if (!await guard(req, res, { requireService: false })) return;
  const safe = async (fn, fallback) => { try { return await fn(); } catch (_) { return fallback; } };
  const testRows = await safe(() => sbReadOnly('exams?select=id&status=eq.active&flashcard_only=eq.false&limit=200'), []);
  const attemptRows = await safe(() => sbReadOnly('admin_attempts_snapshot?select=id,created_at&order=created_at.desc&limit=500'), []);
  const threadRows = await safe(() => sbReadOnly('support_threads?select=unread_admin&limit=1000'), []);
  let students = 0;
  if (SERVICE_KEYS.length) {
    students = await safe(() => sb('rpc/admin_list_user_accounts', {method:'POST',body:JSON.stringify({})}), []).then(rows => Array.isArray(rows) ? rows.length : 0);
  }
  if (!students) students = await safe(() => sbReadOnly('profiles?select=id&role=eq.student&limit=500'), []).then(rows => Array.isArray(rows) ? rows.length : 0);
  if (!students) students = await safe(() => sbReadOnly('participants?select=id&limit=500'), []).then(rows => Array.isArray(rows) ? rows.length : 0);
  const unread = (threadRows || []).reduce((sum, row) => sum + Number(row.unread_admin || 0), 0);
  return res.status(200).json({
    ok: true,
    stats: { tests: testRows.length, students, attempts: attemptRows.length, unread },
    recentActivity: Array.isArray(attemptRows) ? attemptRows.slice(0,5) : [],
    syncedAt: new Date().toISOString(),
  });
}

async function adminParticipants(req, res) {
  if (!await guard(req, res, { requireService: false })) return;
  try {
    const [participants, attempts] = await Promise.all([
      sbReadOnly('admin_participants_snapshot?select=id,name,code,created_at,attempts_count,latest_activity,latest_score&order=created_at.desc&limit=500'),
      sbReadOnly('admin_attempts_snapshot?select=id,student_name,student_code,score,created_at&order=created_at.desc&limit=1000'),
    ]);
    const ps = Array.isArray(participants) ? participants : [];
    const as = Array.isArray(attempts) ? attempts : [];
    // If an older deployment somehow has empty participants, derive them from
    // attempts here as a safe read-time repair. The canonical DB trigger also
    // keeps participants synchronized for future submissions.
    const byCode = new Map(ps.map(p => [String(p.code || ''), p]));
    for (const a of as) {
      const code = String(a.student_code || a.device_id || '').trim();
      if (!code || byCode.has(code)) continue;
      byCode.set(code, {id:'derived-'+code, name:a.student_name || 'Người học', email:null, code, created_at:a.created_at});
    }
    return res.status(200).json({ ok:true, participants:Array.from(byCode.values()), attempts:as, syncedAt:new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Không tải được danh sách người tham gia.' });
  }
}

async function adminAttempts(req, res) {
  if (!await guard(req, res, { requireService: false })) return;
  const requestedLimit = Number(req.body?.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500) : 300;
  try {
    const rows = await sbReadOnly(`admin_attempts_snapshot?select=id,created_at,student_name,student_code,exam_title,score,correct,total,wrong_count&order=created_at.desc&limit=${limit}`);
    if (!Array.isArray(rows)) return res.status(502).json({ error: 'Không tải được lịch sử làm bài.' });
    return res.status(200).json({ ok:true, attempts:rows, syncedAt:new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ error:e?.message || 'Không tải được lịch sử làm bài.' });
  }
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
  if (path === 'public-exams') return publicExams(req, res);
  if (path === 'admin-health') return health(req, res);
  if (path === 'admin-summary') return adminSummary(req, res);
  if (path === 'admin-users') return adminUsers(req, res);
  if (path === 'admin-participants') return adminParticipants(req, res);
  if (path === 'admin-attempts') return adminAttempts(req, res);
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
