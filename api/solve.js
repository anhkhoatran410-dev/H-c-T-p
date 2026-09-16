const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const MAX_OUTPUT = 12000;
const RETRIES = 2;

const clean = (v) => String(v || '').replace(/^['"`]+|['"`]+$/g, '').trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(data));
}

function bodyOf(req) {
  if (req?.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body === 'string') {
    try { return JSON.parse(req.body) || {}; } catch (_) {}
  }
  return {};
}

function modeOf(subject, message) {
  const s = `${subject || ''} ${message || ''}`.toLowerCase();
  if (/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất|vmo|aime|olymp|number theory|combinatorics|geometry/.test(s)) return 'math';
  if (/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s)) return 'physics';
  if (/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s)) return 'chemistry';
  return 'general';
}

function olympiadOf(subject, message) {
  const s = `${subject || ''} ${message || ''}`.toLowerCase();
  return /vmo|aime|olympiad|olympic|chứng minh|prove|inequality|bất đẳng thức|số học|number theory|combinator|tổ hợp|geometry|hình học/.test(s);
}

function transient(status, msg, err) {
  const m = String(msg || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 ||
    name === 'aborterror' || name === 'timeouterror' || m.includes('rate limit') ||
    m.includes('resource exhausted') || m.includes('temporarily unavailable') ||
    m.includes('overloaded') || m.includes('timeout') || m.includes('fetch failed');
}

function imagePart(dataUrl) {
  if (!/^data:image\//i.test(dataUrl || '')) return null;
  const m = String(dataUrl).match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

function promptFor(subject, mode, message, history, olympiad) {
  return `Bạn là STUDY TH, trợ lý học tập chính xác và dễ hiểu.\nMôn: ${subject || 'chưa chọn'}\nDạng: ${mode}\n${olympiad ? '\nĐÂY LÀ BÀI OLYMPIAD/VMO: ưu tiên lập luận chứng minh chặt chẽ, không đoán đáp án.\n' : ''}\nYêu cầu:\n- Đọc toàn bộ đề và ảnh trước khi giải.\n- Xác định dữ kiện, điều kiện và mục tiêu.\n- Giải từng bước, không bịa dữ kiện và không bỏ qua bước then chốt.\n- Với toán: giữ dạng chính xác, kiểm tra nghiệm và điều kiện.\n- Với bài trong ảnh: đọc chữ, ký hiệu, hình và số thật cẩn thận. Nếu ảnh không đủ rõ, nói đúng phần không đọc được thay vì đoán.\n- Công thức dùng LaTeX.\n${Array.isArray(history) && history.length ? `Lịch sử gần đây:\n${history.slice(-4).map(x => `${x.role || 'user'}: ${String(x.message || '')}`).join('\n')}\n` : ''}\nĐề/Yêu cầu:\n${message || 'Giải bài trong ảnh.'}`;
}

async function callGemini({ api, model, subject, message, history, image, deep }) {
  const img = imagePart(image);
  const mode = modeOf(subject, message);
  const olympiad = olympiadOf(subject, message);
  const parts = [{ text: promptFor(subject, mode, message, history, olympiad) }];
  if (img) parts.push(img);

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT,
      ...(model !== 'gemini-3.5-flash-lite' ? { thinkingConfig: { thinkingLevel: deep ? 'high' : 'medium' } } : {})
    }
  };

  // Code execution is deliberately disabled for image-first requests.
  // This keeps OCR/multimodal solving on the simplest stable path.
  if (mode === 'math' && deep && !img) body.tools = [{ codeExecution: {} }];

  const started = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(img ? 45000 : 35000)
  });

  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
  if (!r.ok) {
    const e = new Error(data?.error?.message || `Gemini HTTP ${r.status}`);
    e.status = r.status;
    e.providerMessage = data?.error?.message || '';
    const retryAfter = Number(r.headers.get('retry-after'));
    if (Number.isFinite(retryAfter)) e.retryAfterMs = retryAfter * 1000;
    throw e;
  }

  const candidate = data?.candidates?.[0];
  const answer = candidate?.content?.parts?.filter((p) => p.text).map((p) => p.text).join('').trim();
  if (!answer) {
    const e = new Error('Gemini trả về rỗng.');
    e.status = 502;
    throw e;
  }

  return {
    answer,
    model,
    providerLatencyMs: Date.now() - started,
    codeExecutionUsed: Boolean(candidate?.content?.parts?.some((p) => p.executableCode || p.codeExecutionResult))
  };
}

async function solve({ api, subject, message, history, image, deep }) {
  let last = null;
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        if (attempt) await wait(Math.min(5000, 700 * 2 ** (attempt - 1)));
        return await callGemini({ api, model, subject, message, history, image, deep });
      } catch (e) {
        last = e;
        if (e?.status === 401 || e?.status === 403) throw e;
        if (!transient(e?.status, e?.providerMessage || e?.message, e)) break;
      }
    }
  }
  throw last || new Error('Không có model Gemini khả dụng.');
}

async function verify({ api, subject, message, image, candidate }) {
  if (!candidate || !api) return null;
  const img = imagePart(image);
  const parts = [{ text: `Bạn là giám khảo độc lập. Tự kiểm tra bài gốc rồi đối chiếu lời giải dưới đây. Trả JSON duy nhất theo mẫu {"verdict":"PASS|FAIL|UNCERTAIN","issues":["..."],"expected_answer":"..."}. Nếu ảnh hoặc đề không đủ dữ kiện, dùng UNCERTAIN.\n\nMôn: ${subject || 'Toán'}\nĐề:\n${message}\n\nLời giải ứng viên:\n${candidate.answer}` }];
  if (img) parts.push(img);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 2200, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'medium' } } }),
      signal: AbortSignal.timeout(img ? 15000 : 12000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    const txt = d?.candidates?.[0]?.content?.parts?.filter((p) => p.text).map((p) => p.text).join('').trim();
    if (!txt) return null;
    const parsed = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
    if (!['PASS', 'FAIL', 'UNCERTAIN'].includes(parsed?.verdict)) return null;
    return parsed;
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  try {
    const body = bodyOf(req);
    if (!body.message && !body.imageDataUrl) return send(res, 400, { error: 'Thiếu đề bài hoặc ảnh.' });

    const api = clean(process.env.GEMINI_API_KEY);
    if (!api) return send(res, 500, { error: 'Thiếu GEMINI_API_KEY trên Vercel.' });

    const message = String(body.message || 'Giải bài trong ảnh.');
    const subject = String(body.subject || '');
    const history = Array.isArray(body.history) ? body.history : [];
    const image = String(body.imageDataUrl || '');
    const deep = body.deep !== false;

    // First pass: image-safe or math-capable Gemini route.
    let candidate;
    try {
      candidate = await solve({ api, subject, message, history, image, deep });
    } catch (e) {
      // Last lightweight pass is intentionally no-tools and is useful during provider spikes.
      try {
        candidate = await solve({ api, subject, message, history, image, deep: false });
      } catch (e2) {
        return send(res, 502, {
          error: 'Không thể tạo lời giải lúc này.',
          detail: String(e2?.providerMessage || e2?.message || e?.message || '').slice(0, 300)
        });
      }
    }

    const mode = modeOf(subject, message);
    let audit = null;
    // Verification never blocks the answer: if it times out/fails, return the solved result anyway.
    if (deep && (mode === 'math' || image)) audit = await verify({ api, subject, message, image, candidate });

    return send(res, 200, {
      answer: candidate.answer.trim(),
      tool: audit ? 'Verification' : null,
      model: candidate.model,
      auditVerdict: audit?.verdict || null,
      auditIssues: Array.isArray(audit?.issues) ? audit.issues.slice(0, 6) : [],
      repairEngineUsed: false,
      repairCount: 0,
      source: 'gemini',
      codeExecutionUsed: Boolean(candidate.codeExecutionUsed),
      providerLatencyMs: candidate.providerLatencyMs || null,
      olympiadMode: olympiadOf(subject, message)
    });
  } catch (e) {
    return send(res, 500, { error: 'Solver error.', detail: String(e?.message || e).slice(0, 300) });
  }
}
