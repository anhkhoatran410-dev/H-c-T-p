const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const MAX_OUTPUT_TOKENS = 9000;
const VERIFY_RETRIES = 1;

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
function transient(status, msg) {
  const m = String(msg || '').toLowerCase();
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 || m.includes('high demand') || m.includes('resource exhausted') || m.includes('rate limit') || m.includes('temporarily unavailable') || m.includes('overloaded');
}
function providerError(status, msg) {
  if (status === 401 || status === 403) return 'API AI chưa được cấp quyền hoặc khóa API không hợp lệ.';
  if (status === 404) return 'Model AI không khả dụng.';
  if (transient(status, msg)) return 'AI đang bận tạm thời.';
  return 'Bộ giải AI không phản hồi hợp lệ.';
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
  return `Bạn là STUDY TH — bộ giải học tập chuyên sâu.\nMôn: ${subject || 'chưa chọn'}\nDạng: ${mode}\n\nBẮT BUỘC:\n1. Đọc toàn bộ đề/ảnh trước khi giải.\n2. Nếu có nhiều câu, giải hết tất cả câu nhìn thấy.\n3. Giải tận gốc: Dữ kiện → Cần tìm → Ý tưởng → biến đổi/chứng minh từng bước → điều kiện → kiểm tra → kết luận.\n4. Không nhảy bước quan trọng và không chỉ đưa đáp án.\n5. Kiểm tra phép biến đổi có thể làm mất/thêm nghiệm.\n6. Với phương trình/hàm/hệ/bất đẳng thức, thế ngược vào đề gốc và xét trường hợp đặc biệt phù hợp.\n7. Không bịa dữ kiện ảnh mờ.\n8. Công thức dùng LaTeX.\n${cas ? '\nCAS/Wolfram tham khảo:\n' + cas : ''}\nLịch sử:\n${Array.isArray(history) ? history.slice(-4).map(x => (x.role || 'user') + ': ' + String(x.message || '')).join('\n') : ''}\n\nĐề/Yêu cầu:\n${message}`;
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
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens, ...(model === 'gemini-3.8-flash' ? { thinkingConfig: { thinkingLevel: deep ? 'high' : 'medium' } } : {}) }
    }),
    signal: AbortSignal.timeout(timeout)
  });
  const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {}
  if (!r.ok) throw Object.assign(new Error(providerError(r.status, d?.error?.message)), { status: r.status, providerMessage: d?.error?.message });
  const c = d?.candidates?.[0];
  const answer = c?.content?.parts?.map(p => p.text || '').join('').trim();
  if (answer) return { answer, model, finishReason: c?.finishReason || null };
  throw new Error('AI trả về rỗng.');
}

async function solveWithFallback(args) {
  let last = null;
  for (const model of GEMINI_MODELS) {
    try { return await gemini({ ...args, model, deep: args.deep }); }
    catch (e) { last = e; if (e?.status === 401 || e?.status === 403) break; if (e?.status === 404) continue; if (transient(e?.status, e?.providerMessage || e?.message)) { await sleep(250); continue; } }
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
  const prompt = `Bạn là VERIFICATION ENGINE của STUDY TH. Kiểm tra lời giải sau từ đầu đến cuối.\n\nPHẢI KIỂM TRA:\nA. Đọc lại đề/ảnh và miền điều kiện.\nB. Kiểm tra từng biến đổi quan trọng.\nC. Thế ngược vào đề gốc.\nD. Thử giá trị mẫu, biên, trường hợp đặc biệt và cố tìm phản ví dụ khi phù hợp.\nE. Kiểm tra mất/thêm nghiệm.\nF. Với chứng minh, kiểm tra logic từng mệnh đề.\nG. Nếu có một lỗi toán học chắc chắn, verdict=FAIL. Nếu chưa đủ dữ kiện để kết luận, verdict=UNCERTAIN.\n\nTrả JSON duy nhất:\n{"verdict":"PASS|FAIL|UNCERTAIN","issues":["..."],"tests":[{"test":"...","result":"PASS|FAIL|NOT_APPLICABLE","note":"..."}],"repair_hint":"..."}\n\nĐỀ:\n${message}\n\nCAS/WOLFRAM:\n${cas || 'Không có'}\n\nLỜI GIẢI:\n${candidate.answer}`;
  const parts = [{ text: prompt }]; const img = imagePart(image); if (img) parts.push(img);
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 3200, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(12000)
    });
    const raw = await r.text(); if (!r.ok) return null; let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {}
    const txt = d?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    return parseJson(txt);
  } catch (_) { return null; }
}

async function repair({ message, subject, image, cas, candidate, audit }) {
  if (!candidate) return null;
  return gemini({
    message: `REPAIR ENGINE. Lời giải dưới đây đã FAIL kiểm định. Giải lại TOÀN BỘ từ đầu, không vá một dòng. Sửa tất cả lỗi được nêu trong kiểm định, rồi tự kiểm tra lại.\n\nLỜI GIẢI CŨ:\n${candidate.answer}\n\nKIỂM ĐỊNH:\n${JSON.stringify(audit)}`,
    subject, history: [], image, cas, model: 'gemini-3.8-flash', deep: true, timeout: 26000
  });
}

async function openaiFallback({ message, subject, image, cas }) {
  const api = cleanKey(process.env.OPENAI_API_KEY); if (!api) return null;
  const model = cleanKey(process.env.OPENAI_SOLVER_MODEL || 'gpt-5');
  const content = [{ type: 'input_text', text: `Giải toàn bộ bài từ gốc, trình bày từng bước, kiểm tra điều kiện, thế ngược và trường hợp đặc biệt. ${cas ? 'Đối chiếu CAS/Wolfram: ' + cas : ''}\n\n${message}` }];
  const img = imagePart(image); if (img) content.push({ type: 'input_image', image_url: image, detail: 'high' });
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api },
    body: JSON.stringify({ model, reasoning: { effort: 'medium' }, input: [{ role: 'user', content }], max_output_tokens: MAX_OUTPUT_TOKENS }), signal: AbortSignal.timeout(30000)
  });
  const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {}
  if (!r.ok) throw new Error(d?.error?.message || ('OpenAI HTTP ' + r.status));
  return { answer: d.output_text || '', model };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const b = getBody(req);
  try {
    const message = String(b.message || '').trim(); const image = String(b.imageDataUrl || '');
    if (!message && !image) return json(res, 400, { error: 'Thiếu đề bài hoặc ảnh.' });
    const subject = String(b.subject || ''); const history = Array.isArray(b.history) ? b.history : [];
    const deep = b.deep !== false; const kind = subjectMode(subject, message);
    const casPromise = (kind === 'math' || kind === 'physics' || kind === 'chemistry') ? wolfram(message) : Promise.resolve({ available: false });
    let candidate;
    try {
      candidate = await solveWithFallback({ message, subject, history, image, cas: null, deep });
    } catch (primaryError) {
      let cas = null; try { const w = await casPromise; cas = w.available ? w.result : null; } catch (_) {}
      try { const fallback = await openaiFallback({ message, subject, image, cas }); if (fallback?.answer) return json(res, 200, { ...fallback, auditVerdict: 'FALLBACK', tool: cas ? 'WolframAlpha + OpenAI' : 'OpenAI fallback' }); } catch (fallbackError) { console.error('openai fallback', fallbackError?.message); }
      console.error('primary solver failed', primaryError?.message);
      return json(res, 503, { error: 'Không có bộ giải AI khả dụng lúc này. Hãy kiểm tra API key/quota rồi thử lại.' });
    }
    let cas = null; try { const w = await casPromise; cas = w.available ? w.result : null; } catch (_) {}
    let audit = null; let chosen = candidate;
    if (deep && (kind === 'math' || kind === 'physics' || kind === 'chemistry')) {
      audit = await verify({ message, image, cas, candidate });
      if (audit?.verdict === 'FAIL') {
        const repaired = await repair({ message, subject, image, cas, candidate, audit }).catch(() => null);
        if (repaired) { chosen = repaired; const recheck = await verify({ message, image, cas, candidate: chosen }); if (recheck) audit = recheck; }
      }
      if (audit?.verdict === 'FAIL') return json(res, 409, { error: 'Lời giải chưa vượt qua kiểm định toán học.', auditVerdict: 'FAIL', auditIssues: audit.issues || [], tests: audit.tests || [] });
    }
    const tools = []; if (cas) tools.push('WolframAlpha'); tools.push(chosen.model); if (audit) tools.push('Verification Engine'); if (chosen !== candidate) tools.push('Repair Engine');
    return json(res, 200, { answer: chosen.answer, model: chosen.model, auditModel: audit ? 'gemini-3.6-flash' : null, auditVerdict: audit?.verdict || 'UNCERTAIN', auditIssues: audit?.issues || [], tests: audit?.tests || [], tool: tools.join(' + '), verified: !!cas });
  } catch (e) {
    console.error('solver handler error', e);
    return json(res, 503, { error: e?.message || 'Solver tạm thời gặp lỗi.' });
  }
};
