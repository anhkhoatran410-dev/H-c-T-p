const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'];
const MAX_OUTPUT_TOKENS = 9000;
const VERIFY_RETRIES = 2;

function cleanKey(v) { return String(v || '').replace(/^['"`]+|['"`]+$/g, '').trim(); }
function json(res, status, payload) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(payload)); }
function getBody(req) {
  const b = req?.body;
  if (b && typeof b === 'object' && !Array.isArray(b)) return b;
  if (typeof b === 'string') { try { const p = JSON.parse(b); if (p && typeof p === 'object') return p; } catch (_) {} }
  return {};
}
function subjectMode(subject, text) {
  const s = (String(subject || '') + ' ' + String(text || '')).toLowerCase();
  if (/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất/.test(s)) return 'math';
  if (/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s)) return 'physics';
  if (/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s)) return 'chemistry';
  return 'general';
}
function transient(status, msg, err) {
  const m = String(msg || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 ||
    name === 'aborterror' || name === 'timeouterror' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN' ||
    m.includes('high demand') || m.includes('resource exhausted') || m.includes('rate limit') || m.includes('temporarily unavailable') || m.includes('overloaded') || m.includes('timeout') || m.includes('timed out') || m.includes('fetch failed');
}
function providerError(status, msg) {
  if (status === 401 || status === 403) return 'API AI chưa được cấp quyền hoặc khóa API không hợp lệ.';
  if (status === 404) return 'Model AI không khả dụng.';
  if (transient(status, msg)) return 'AI đang bận hoặc kết nối bị gián đoạn tạm thời.';
  return 'Bộ giải AI không phản hồi hợp lệ.';
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function retryDelay(error, attempt) {
  const serverDelay = Number(error?.retryAfterMs);
  if (Number.isFinite(serverDelay) && serverDelay >= 0) return Math.min(10000, serverDelay);
  return Math.min(8000, 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 700));
}

async function wolfram(query) {
  const appid = cleanKey(process.env.WOLFRAM_APP_ID);
  if (!appid || !query) return { available: false };
  try {
    const r = await fetch('https://api.wolframalpha.com/v1/result?appid=' + encodeURIComponent(appid) + '&i=' + encodeURIComponent(query) + '&units=metric', { signal: AbortSignal.timeout(5000) });
    const t = await r.text();
    return r.ok && t.trim() ? { available: true, result: t.trim() } : { available: false };
  } catch (_) { return { available: false }; }
}

function solverPrompt(subject, mode, cas, message, history) {
  const mathGuard = mode === 'math' ? `
MATH ACCURACY GATE:
- Trước khi tính, xác định rõ loại bài, ẩn, miền xác định và các đại lượng bất biến.
- Lập kế hoạch giải ngắn trước khi biến đổi; không đoán đáp án rồi hợp thức hóa.
- Mọi kết quả số quan trọng phải được tính lại theo một cách độc lập (biến đổi khác, thế ngược, ước lượng hoặc CAS khi phù hợp).
- Không làm tròn trung gian nếu chưa được phép; giữ phân số/exact form càng lâu càng tốt.
- Sau khi ra đáp án, quay lại đề gốc và kiểm tra trực tiếp đáp án trong điều kiện của đề.
- Nếu phát hiện mâu thuẫn, không ép kết quả; giải lại từ bước đầu tiên đáng ngờ.
- Với bài Olympic/HARD: ưu tiên lập luận cấu trúc, bất biến, đối xứng, phản chứng, quy nạp, cực trị hoặc chia trường hợp phù hợp trước khi brute-force.
` : '';
  return `Bạn là STUDY TH — bộ giải học tập chuyên sâu.\nMôn: ${subject || 'chưa chọn'}\nDạng: ${mode}\n${mathGuard}\nBẮT BUỘC:\n1. Đọc toàn bộ đề/ảnh trước khi giải.\n2. Nếu có nhiều câu, giải hết tất cả câu nhìn thấy.\n3. Giải tận gốc: Dữ kiện → Cần tìm → Ý tưởng → biến đổi/chứng minh từng bước → điều kiện → kiểm tra → kết luận.\n4. Không nhảy bước quan trọng và không chỉ đưa đáp án.\n5. Kiểm tra phép biến đổi có thể làm mất/thêm nghiệm.\n6. Với phương trình/hàm/hệ/bất đẳng thức, thế ngược vào đề gốc và xét trường hợp đặc biệt phù hợp.\n7. Với bài phần trăm, tốc độ, năng suất, tiền lương, vật thể hao hụt hoặc tăng trưởng, phải xác định rõ phần trăm áp dụng trên đại lượng nào và theo từng bước thời gian; không tự giả định phần trăm tính trên giá trị ban đầu nếu đề không nói vậy.\n8. Nếu có cách hiểu cạnh tranh, nêu các cách hiểu ngắn gọn và chọn cách phù hợp nhất với câu chữ/dữ kiện của đề, rồi kiểm tra lại kết quả.\n9. Không bịa dữ kiện ảnh mờ.\n10. Công thức dùng LaTeX.\n${cas ? '\nCAS/Wolfram tham khảo:\n' + cas : ''}\nLịch sử:\n${Array.isArray(history) ? history.slice(-4).map(x => (x.role || 'user') + ': ' + String(x.message || '')).join('\n') : ''}\n\nĐề/Yêu cầu:\n${message}`;
}
function imagePart(image) {
  if (!image || !/^data:image\//i.test(image)) return null;
  const m = image.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

async function gemini({ message, subject, history, image, cas, model, deep = true, maxOutputTokens = MAX_OUTPUT_TOKENS, timeout = 22000 }) {
  const api = cleanKey(process.env.GEMINI_API_KEY);
  if (!api) throw new Error('GEMINI_API_KEY chưa được cấu hình.');
  const parts = [{ text: solverPrompt(subject, subjectMode(subject, message), cas, message, history) }];
  const img = imagePart(image); if (img) parts.push(img);
  const started = Date.now();
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens, ...(model === 'gemini-3.8-flash' ? { thinkingConfig: { thinkingLevel: deep ? 'high' : 'medium' } } : {}) } }),
      signal: AbortSignal.timeout(timeout)
    });
    const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!r.ok) {
      const e = Object.assign(new Error(providerError(r.status, d?.error?.message)), { status: r.status, providerMessage: d?.error?.message });
      const retryAfter = Number(r.headers.get('retry-after'));
      if (Number.isFinite(retryAfter)) e.retryAfterMs = retryAfter * 1000;
      throw e;
    }
    const c = d?.candidates?.[0];
    const answer = c?.content?.parts?.map(p => p.text || '').join('').trim();
    if (answer) return { answer, model, finishReason: c?.finishReason || null, providerLatencyMs: Date.now() - started };
    throw new Error('AI trả về rỗng.');
  } catch (e) {
    if (transient(e?.status, e?.providerMessage || e?.message, e)) e.isTransient = true;
    throw e;
  }
}

async function solveWithFallback(args) {
  let last = null;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt === 0) await sleep(150 + Math.floor(Math.random() * 500));
        return await gemini({ ...args, model, deep: args.deep });
      } catch (e) {
        last = e;
        if (e?.status === 401 || e?.status === 403) break;
        if (e?.status === 404) break;
        if (!transient(e?.status, e?.providerMessage || e?.message, e)) break;
        if (attempt < 2) await sleep(retryDelay(e, attempt));
      }
    }
    if (last?.status === 401 || last?.status === 403) break;
  }
  throw last || new Error('Không có model Gemini khả dụng.');
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(raw); } catch (_) {}
  const m = raw.match(/\{[\s\S]*\}$/); if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

async function verify({ message, image, cas, candidate }) {
  const api = cleanKey(process.env.GEMINI_API_KEY); if (!api || !candidate) return null;
  const prompt = `Bạn là VERIFICATION ENGINE của STUDY TH. Kiểm tra lời giải sau từ đầu đến cuối.\n\nPHẢI KIỂM TRA:\nA. Đọc lại đề/ảnh và miền điều kiện.\nB. Kiểm tra từng biến đổi quan trọng.\nC. Thế ngược vào đề gốc.\nD. Thử giá trị mẫu, biên, trường hợp đặc biệt và cố tìm phản ví dụ khi phù hợp.\nE. Kiểm tra mất/thêm nghiệm.\nF. Với bài phần trăm/tăng giảm/hao hụt, kiểm tra phần trăm áp dụng trên giá trị ban đầu hay giá trị hiện tại theo đúng câu chữ.\nG. Với bài toán số, tính lại các phép toán quan trọng bằng ít nhất một cách độc lập khi có thể.\nH. Nếu có một lỗi toán học chắc chắn, verdict=FAIL. Nếu bằng chứng kiểm tra chưa đủ, verdict=UNCERTAIN. Không dùng UNCERTAIN chỉ vì bài khó.\n\nTrả JSON duy nhất:\n{"verdict":"PASS|FAIL|UNCERTAIN","issues":["..."],"tests":[{"test":"...","result":"PASS|FAIL|NOT_APPLICABLE","note":"..."}],"repair_hint":"..."}\n\nĐỀ:\n${message}\n\nCAS/WOLFRAM:\n${cas || 'Không có'}\n\nLỜI GIẢI:\n${candidate.answer}`;
  const parts = [{ text: prompt }]; const img = imagePart(image); if (img) parts.push(img);
  for (let attempt = 0; attempt < VERIFY_RETRIES; attempt++) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 3200, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(12000)
      });
      const raw = await r.text();
      if (!r.ok) { if (transient(r.status, '', { status: r.status }) && attempt < VERIFY_RETRIES - 1) { await sleep(1200); continue; } return null; }
      let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {}
      const txt = d?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      const parsed = parseJson(txt);
      if (parsed) return parsed;
    } catch (e) {
      if (transient(e?.status, e?.message, e) && attempt < VERIFY_RETRIES - 1) { await sleep(1200); continue; }
      return null;
    }
  }
  return null;
}

async function repair({ message, subject, image, cas, candidate, audit, attempt }) {
  if (!candidate) return null;
  return solveWithFallback({
    message: `REPAIR ENGINE. Lời giải dưới đây đã FAIL kiểm định. Không được vá một dòng riêng lẻ. GIẢI LẠI TOÀN BỘ từ đề gốc, sau đó tự kiểm tra. Sửa tất cả lỗi trong kiểm định, đặc biệt lỗi tính toán, đơn vị, miền điều kiện, mất/thêm nghiệm, diễn giải phần trăm và suy luận thiếu. Nếu lời giải cũ đúng ở phần nào thì vẫn phải tái dựng phần đó thay vì sao chép mù quáng. Vòng sửa ${attempt}.\n\nĐỀ GỐC:\n${message}\n\nLỜI GIẢI CŨ:\n${candidate.answer}\n\nKIỂM ĐỊNH:\n${JSON.stringify(audit)}`,
    subject, history: [], image, cas, deep: true
  });
}

async function openaiFallback({ message, subject, image, cas }) {
  const api = cleanKey(process.env.OPENAI_API_KEY); if (!api) return null;
  const model = cleanKey(process.env.OPENAI_SOLVER_MODEL || 'gpt-5');
  const content = [{ type: 'input_text', text: `Giải toàn bộ bài từ gốc, trình bày từng bước, kiểm tra điều kiện, thế ngược và trường hợp đặc biệt. Với phần trăm/tăng giảm/hao hụt, xác định rõ phần trăm áp dụng trên đại lượng nào ở từng bước. Với toán khó, lập kế hoạch trước khi tính và kiểm tra độc lập kết quả số. ${cas ? 'Đối chiếu CAS/Wolfram: ' + cas : ''}\n\n${message}` }];
  const img = imagePart(image); if (img) content.push({ type: 'input_image', image_url: image, detail: 'high' });
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api },
        body: JSON.stringify({ model, reasoning: { effort: 'high' }, input: [{ role: 'user', content }], max_output_tokens: MAX_OUTPUT_TOKENS }), signal: AbortSignal.timeout(30000)
      });
      const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (!r.ok) {
        last = Object.assign(new Error(d?.error?.message || providerError(r.status, 'openai')), { status: r.status });
        if (transient(r.status, d?.error?.message || '', last) && attempt === 0) { await sleep(1500); continue; }
        return null;
      }
      const answer = String(d?.output_text || d?.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '').trim();
      return answer ? { answer, model, providerLatencyMs: Date.now() - (Date.now() - 1) } : null;
    } catch (e) {
      last = e; if (transient(e?.status, e?.message, e) && attempt === 0) { await sleep(1500); continue; } return null;
    }
  }
  return null;
}

function normalizeAnswer(answer) {
  const text = String(answer || '').trim();
  return text.replace(/^(?:final answer|đáp án cuối|kết luận)\s*[:：]\s*/i, '').trim();
}

async function run() {
  const req = globalThis.__REQ__, res = globalThis.__RES__; const body = getBody(req);
  if (!body.message && !body.imageDataUrl) return json(res, 400, { error: 'Thiếu đề bài hoặc ảnh.' });
  const message = String(body.message || 'Giải bài trong ảnh.');
  const subject = String(body.subject || ''); const history = Array.isArray(body.history) ? body.history : [];
  const image = String(body.imageDataUrl || ''); const deep = body.deep !== false;
  let cas = '';
  if (subjectMode(subject, message) === 'math' && !image) {
    const w = await wolfram(message); if (w.available) cas = w.result;
  }
  let candidate = null; let source = 'gemini'; let audit = null; let repairCount = 0;
  try { candidate = await solveWithFallback({ message, subject, history, image, cas, deep }); }
  catch (e) {
    candidate = await openaiFallback({ message, subject, image, cas }); source = candidate ? 'openai' : 'none';
  }
  if (!candidate) return json(res, 502, { error: 'Không thể tạo lời giải lúc này.' });

  // MATH: verification-first. Repair is actually reachable whenever a verifier proves FAIL.
  if (subjectMode(subject, message) === 'math' || deep) {
    audit = await verify({ message, image, cas, candidate });
    for (let i = 1; i <= VERIFY_RETRIES && audit?.verdict === 'FAIL'; i++) {
      const repaired = await repair({ message, subject, image, cas, candidate, audit, attempt: i });
      if (!repaired) break;
      candidate = repaired; repairCount++;
      const reAudit = await verify({ message, image, cas, candidate });
      audit = reAudit || audit;
      if (audit?.verdict !== 'FAIL') break;
    }
  }
  const answer = normalizeAnswer(candidate.answer);
  return json(res, 200, {
    answer,
    tool: cas ? 'Wolfram + Verification' : (audit ? 'Verification' : null),
    model: candidate.model || null,
    auditVerdict: audit?.verdict || null,
    auditIssues: Array.isArray(audit?.issues) ? audit.issues.slice(0, 6) : [],
    repairEngineUsed: repairCount > 0,
    repairCount,
    source,
    providerLatencyMs: candidate.providerLatencyMs || null
  });
}

export default async function handler(req, res) {
  globalThis.__REQ__ = req; globalThis.__RES__ = res;
  try { return await run(); } catch (e) { return json(res, 500, { error: 'Solver error: ' + String(e?.message || e) }); }
}
