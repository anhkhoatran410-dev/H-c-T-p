import { getAiKeyPool } from '../api/_ai-resilience.js';
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const MAX_OUTPUT_TOKENS = 12000;
const VERIFY_RETRIES = 1;
const ROUTER_MODEL = 'gemini-3.8-flash';
function cleanKey(v) { return String(v || '').replace(/^['"`]+|['"`]+$/g, '').trim(); }
function json(res, status, payload) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(payload)); }
function getBody(req) { const b = req?.body; if (b && typeof b === 'object' && !Array.isArray(b)) return b; if (typeof b === 'string') { try { const p = JSON.parse(b); if (p && typeof p === 'object') return p; } catch (_) {} } return {}; }
function subjectMode(subject, text) { const s = (String(subject || '') + ' ' + String(text || '')).toLowerCase(); if (/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất|vmo|aime|olymm|olymp|number theory|combinatorics|geometry/.test(s)) return 'math'; if (/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s)) return 'physics'; if (/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s)) return 'chemistry'; return 'general'; }
function isOlympiadMath(subject, text) { const s = (String(subject || '') + ' ' + String(text || '')).toLowerCase(); return /vmo|aime|olymm|olympiad|olympic|hard|challenge|chứng minh|prove|inequality|bất đẳng thức|số học|number theory|combinator|tổ hợp|geometry|hình học/.test(s); }
function transient(status, msg, err) { const m = String(msg || '').toLowerCase(); const name = String(err?.name || '').toLowerCase(); const code = String(err?.code || '').toUpperCase(); return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 || name === 'aborterror' || name === 'timeouterror' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN' || m.includes('high demand') || m.includes('resource exhausted') || m.includes('rate limit') || m.includes('temporarily unavailable') || m.includes('overloaded') || m.includes('timeout') || m.includes('timed out') || m.includes('fetch failed'); }
function providerError(status, msg) { if (status === 401 || status === 403) return 'API AI chưa được cấp quyền hoặc khóa API không hợp lệ.'; if (status === 404) return 'Model AI không khả dụng.'; if (transient(status, msg)) return 'AI đang bận hoặc kết nối bị gián đoạn tạm thời.'; return 'Bộ giải AI không phản hồi hợp lệ.'; }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function retryDelay(error, attempt) { const d = Number(error?.retryAfterMs); if (Number.isFinite(d) && d >= 0) return Math.min(10000, d); return Math.min(8000, 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 700)); }
async function wolfram(query) { const appid = cleanKey(process.env.WOLFRAM_APP_ID); if (!appid || !query) return { available: false }; try { const r = await fetch('https://api.wolframalpha.com/v1/result?appid=' + encodeURIComponent(appid) + '&i=' + encodeURIComponent(query) + '&units=metric', { signal: AbortSignal.timeout(5000) }); const t = await r.text(); return r.ok && t.trim() ? { available: true, result: t.trim() } : { available: false }; } catch (_) { return { available: false }; } }
function solverPrompt(subject, mode, cas, message, history, olympiad, needsCode) { const mathGuard = mode === 'math' ? `\nMATH ACCURACY GATE:\n- Xác định dạng bài, biến, miền điều kiện và mục tiêu trước khi biến đổi.\n- Lập kế hoạch giải rồi mới tính; tuyệt đối không đoán đáp án rồi hợp thức hóa.\n- Giữ dạng chính xác, không làm tròn trung gian.\n- Code Execution chỉ là công cụ hỗ trợ khi Router đánh dấu needs_code=true; nó không thay thế lập luận toán học.\n- Thế ngược, kiểm tra biên, trường hợp đặc biệt và phản ví dụ khi phù hợp.\n- Với phương trình/hệ/hàm phải kiểm tra mất hoặc thêm nghiệm.\n` : ''; const olympiadGuard = olympiad ? `\nOLYMPIAD / VMO MODE:\n- Giải như một bài thi chứng minh, không chỉ săn đáp số.\n- Tìm cấu trúc cốt lõi: bất biến, đối xứng, cực trị, phản chứng, quy nạp, modulo, đánh giá, đơn điệu hoặc chia trường hợp phù hợp.\n- Nếu nhiều hướng, tự tạo kiểm tra chéo cho ý tưởng chính.\n- Nếu Router cho phép code, dùng Python để kiểm tra giả thuyết, nghiệm nhỏ, số đếm hoặc số học; không dùng brute-force như bằng chứng duy nhất.\n- Với hình học, ưu tiên chứng minh quan hệ hình học; tọa độ/vector chỉ là công cụ hỗ trợ.\n- Trước kết luận, tự đóng vai giám khảo và tìm lỗ hổng.\n` : ''; const codeDirective = needsCode ? `\nHYBRID CODE ROUTE:\n- Router đã đánh dấu bài này có lợi khi dùng Code Execution.\n- Khi gặp phép tính lớn, đếm, duyệt hữu hạn hoặc kiểm tra thuật toán, hãy chủ động viết và chạy Python để kiểm chứng phần đó.\n- Dùng kết quả thực thi làm dữ kiện phụ trợ rồi tiếp tục lập luận toán học.\n- Không coi việc Python chạy thành công là bằng chứng toàn bộ lời giải đúng.\n` : `\nNO-CODE ROUTE:\n- Router đánh giá không cần Code Execution; ưu tiên suy luận toán học trực tiếp.\n`; return `Bạn là STUDY TH — bộ giải học tập chuyên sâu.\nMôn: ${subject || 'chưa chọn'}\nDạng: ${mode}\n${mathGuard}${olympiadGuard}${codeDirective}\nBẮT BUỘC:\n1. Đọc toàn bộ đề/ảnh trước khi giải.\n2. Dữ kiện → cần tìm → ý tưởng → lời giải từng bước → điều kiện → kiểm tra → kết luận.\n3. Không nhảy bước then chốt và không bịa dữ kiện.\n4. Với phần trăm/tăng giảm/hao hụt, xác định rõ đại lượng làm mốc ở từng bước.\n5. Công thức toán phải đặt trong delimiters \\( ... \\) hoặc \\[ ... \\]; không để TeX trần giữa câu.\n6. Dùng các toán tử ASCII <=, >=, <, > trong biểu thức để tránh lỗi font/ký hiệu. Không sinh chuỗi '[object Object]'.\n${cas ? '\nCAS/Wolfram tham khảo (chỉ kiểm chứng):\n' + cas : ''}\nLịch sử:\n${Array.isArray(history) ? history.slice(-4).map(x => (x.role || 'user') + ': ' + String(x.message || '')).join('\n') : ''}\n\nĐề/Yêu cầu:\n${message}`; }
function imagePart(image) { if (!image || !/^data:image\//i.test(image)) return null; const m = image.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s); return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null; }
const ROUTER_SCHEMA = { type: 'OBJECT', properties: { needs_code: { type: 'BOOLEAN' }, reason: { type: 'STRING' }, problem_type: { type: 'STRING' }, difficulty: { type: 'STRING' } }, required: ['needs_code', 'problem_type', 'difficulty'] };
async function analyzeRoute({ message, subject, image }) { const api = cleanKey(process.env.GEMINI_API_KEY); if (!getAiKeyPool('GEMINI').length) return null; const parts = [{ text: `Bạn là ROUTER của STUDY TH. Hãy phân tích bài toán trước khi Solver giải. Chỉ quyết định xem Code Execution có thực sự hữu ích hay không.\n\nQUY TẮC:\n- needs_code=true nếu bài có tính toán số học lớn, đếm tổ hợp/phân hoạch phức tạp, kiểm tra số dư/số nguyên tố, duyệt tập hữu hạn lớn, hoặc cần kiểm tra thuật toán/giả thuyết bằng Python.\n- needs_code=false nếu bài chủ yếu là chứng minh logic, hình học thuần túy, biến đổi đại số hoặc lập luận mà code không giúp đáng kể.\n- Không chọn true chỉ vì bài được gắn HARD/CHALLENGE.\n- problem_type là nhãn ngắn gọn như geometry, combinatorics, number_theory, algebra, proof, arithmetic, other.\n- difficulty là EASY, MEDIUM, HARD hoặc CHALLENGE.\n- reason giải thích ngắn gọn vì sao chọn nhánh.\n\nMÔN: ${subject || 'Toán'}\nĐỀ:\n${message}` }]; const img = imagePart(image); if (img) parts.push(img); try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + ROUTER_MODEL + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 700, responseMimeType: 'application/json', responseSchema: ROUTER_SCHEMA, thinkingConfig: { thinkingLevel: 'medium' } } }), signal: AbortSignal.timeout(6500) }); const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {} if (!r.ok) return null; const txt = d?.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('').trim(); const parsed = parseJson(txt); if (!parsed || typeof parsed.needs_code !== 'boolean' || !parsed.problem_type || !parsed.difficulty) return null; return { needs_code: parsed.needs_code, reason: String(parsed.reason || ''), problem_type: String(parsed.problem_type), difficulty: String(parsed.difficulty).toUpperCase(), model: ROUTER_MODEL, used: true }; } catch (_) { return null; } }
async function gemini({ message, subject, history, image, cas, model, deep = true, maxOutputTokens = MAX_OUTPUT_TOKENS, timeout = 30000, codeExecutionTools = false }) { const api = cleanKey(process.env.GEMINI_API_KEY); if (!getAiKeyPool('GEMINI').length) { const e = new Error('GEMINI_API_KEY chưa được cấu hình.'); e.code='AI_CONFIG_MISSING'; throw e; } const mode = subjectMode(subject, message); const olympiad = isOlympiadMath(subject, message); const parts = [{ text: solverPrompt(subject, mode, cas, message, history, olympiad, codeExecutionTools) }]; const img = imagePart(image); if (img) parts.push(img); const started = Date.now(); const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: deep ? Math.min(maxOutputTokens, 9000) : Math.min(maxOutputTokens, 6000), ...(model !== 'gemini-3.5-flash-lite' ? { thinkingConfig: { thinkingLevel: deep ? 'high' : 'low' } } : {}) } }; if (codeExecutionTools === true) body.tools = [{ codeExecution: {} }]; try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.min(timeout, 20000)) }); const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {} if (!r.ok) { const e = Object.assign(new Error(providerError(r.status, d?.error?.message)), { status: r.status, providerMessage: d?.error?.message }); const retryAfter = Number(r.headers.get('retry-after')); if (Number.isFinite(retryAfter)) e.retryAfterMs = retryAfter * 1000; throw e; } const c = d?.candidates?.[0]; const answer = c?.content?.parts?.filter(p => p.text).map(p => p.text).join('').trim(); if (answer) return { answer, model, finishReason: c?.finishReason || null, providerLatencyMs: Date.now() - started, codeExecutionUsed: Boolean(c?.content?.parts?.some(p => p.executableCode || p.codeExecutionResult)), codeExecutionRequested: codeExecutionTools === true }; throw new Error('AI trả về rỗng.'); } catch (e) { if (transient(e?.status, e?.providerMessage || e?.message, e)) e.isTransient = true; throw e; } }
async function solveWithFallback(args) {
  const models = args.deep ? GEMINI_MODELS.slice(0, 2) : GEMINI_MODELS.slice(0, 1);
  const attemptsPerModel = 1;
  let last = null;
  const started = Date.now();
  const budget = args.deep ? 30000 : 22000;
  for (const model of models) {
    for (let attempt = 0; attempt < attemptsPerModel; attempt++) {
      if (Date.now() - started > budget) break;
      try {
        if (attempt === 0) await sleep(80 + Math.floor(Math.random() * 180));
        return await gemini({
          ...args,
          model,
          deep: args.deep,
          codeExecutionTools: args.codeExecutionTools === true,
          timeout: args.deep ? 18000 : 12000,
        });
      } catch (e) {
        last = e;
        if (e?.status === 401 || e?.status === 403 || e?.status === 404) break;
        if (!transient(e?.status, e?.providerMessage || e?.message, e)) break;
        if (attempt < attemptsPerModel - 1 && Date.now() - started < budget - 6000) await sleep(retryDelay(e, attempt));
      }
    }
    if (Date.now() - started > budget) break;
  }
  throw last || new Error('Không có model Gemini khả dụng.');
}
function parseJson(text) { const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim(); try { return JSON.parse(raw); } catch (_) {} const m = raw.match(/\{[\s\S]*\}$/); if (m) { try { return JSON.parse(m[0]); } catch (_) {} } return null; }
async function verify({ message, subject, image, cas, candidate }) { const api = cleanKey(process.env.GEMINI_API_KEY); if (!api || !candidate) return null; const prompt = `Bạn là GIÁM KHẢO ĐỘC LẬP của STUDY TH. Không được tin lời giải ứng viên. Hãy tự giải bài từ đề gốc trước, sau đó đối chiếu.\n\nKIỂM TRA:\n1. Xác định chính xác yêu cầu, điều kiện và dữ kiện.\n2. Tự tìm đáp án/kết luận độc lập.\n3. Kiểm tra biến đổi, suy luận, điều kiện, mất/thêm nghiệm và tính toán.\n4. Thế ngược/kiểm tra trực tiếp khi phù hợp.\n5. Với Olympic/AIME, nếu hai cách khác nhau phải tìm điểm phân kỳ; không chấp nhận lời giải chỉ vì có vẻ hợp lý.\n6. Nếu có phản ví dụ hoặc suy luận không hợp lệ dẫn tới kết luận sai: FAIL.\n7. Nếu hai cách độc lập khớp và điều kiện quan trọng được kiểm tra: PASS.\n8. Chỉ UNCERTAIN khi dữ liệu thực sự không đủ.\n\nTrả JSON duy nhất:\n{"verdict":"PASS|FAIL|UNCERTAIN","expected_answer":"...","issues":["..."],"tests":[{"test":"...","result":"PASS|FAIL|NOT_APPLICABLE","note":"..."}],"repair_hint":"..."}\n\nMÔN: ${subject || 'Toán'}\nĐỀ:\n${message}\nCAS/WOLFRAM:\n${cas || 'Không có'}\nLỜI GIẢI ỨNG VIÊN:\n${candidate.answer}`; const parts = [{ text: prompt }]; const img = imagePart(image); if (img) parts.push(img); const models = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']; for (const model of models) { for (let attempt = 0; attempt < VERIFY_RETRIES; attempt++) { try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 4200, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'high' } } }), signal: AbortSignal.timeout(11000) }); const raw = await r.text(); if (!r.ok) { if (transient(r.status, '', { status: r.status }) && attempt < VERIFY_RETRIES - 1) { await sleep(1000); continue; } break; } let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {} const txt = d?.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('').trim(); const parsed = parseJson(txt); if (parsed && ['PASS', 'FAIL', 'UNCERTAIN'].includes(String(parsed.verdict || '').toUpperCase())) { parsed.verdict = String(parsed.verdict).toUpperCase(); return parsed; } } catch (e) { if (transient(e?.status, e?.message, e) && attempt < VERIFY_RETRIES - 1) { await sleep(1000); continue; } } } } return null; }
async function repair({ message, subject, image, cas, candidate, audit, attempt, codeExecutionTools }) { if (!candidate) return null; return solveWithFallback({ message: `REPAIR ENGINE — GIẢI LẠI TOÀN BỘ, không vá một dòng. Lời giải ứng viên đã FAIL. Dùng Code Execution khi Router đã cho phép hoặc khi phần lỗi cần xác nhận bằng tính toán; bằng chứng cuối phải là lập luận toán học. Sửa toàn bộ lỗi trong kiểm định và tự kiểm tra lại. Vòng sửa ${attempt}.\n\nĐỀ GỐC:\n${message}\n\nLỜI GIẢI CŨ:\n${candidate.answer}\n\nKIỂM ĐỊNH:\n${JSON.stringify(audit)}`, subject, history: [], image, cas, deep: true, codeExecutionTools: codeExecutionTools === true }); }
async function openaiFallback({ message, subject, image, cas }) { const api = cleanKey(process.env.OPENAI_API_KEY); if (!api) return null; const model = cleanKey(process.env.OPENAI_SOLVER_MODEL || 'gpt-5'); const content = [{ type: 'input_text', text: `Giải bài từ gốc. Với toán Olympic/VMO: lập kế hoạch, chứng minh chặt chẽ, kiểm tra điều kiện và tính toán độc lập. ${cas ? 'CAS/Wolfram chỉ dùng kiểm chứng: ' + cas : ''}\n\n${message}` }]; const img = imagePart(image); if (img) content.push({ type: 'input_image', image_url: image, detail: 'high' }); const started = Date.now(); for (let attempt = 0; attempt < 2; attempt++) { try { const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api }, body: JSON.stringify({ model, reasoning: { effort: 'high' }, input: [{ role: 'user', content }], max_output_tokens: MAX_OUTPUT_TOKENS }), signal: AbortSignal.timeout(35000) }); const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {} if (!r.ok) { if (transient(r.status, d?.error?.message || '', { status: r.status }) && attempt === 0) { await sleep(1500); continue; } return null; } const answer = String(d?.output_text || d?.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '').trim(); return answer ? { answer, model, providerLatencyMs: Date.now() - started } : null; } catch (e) { if (transient(e?.status, e?.message, e) && attempt === 0) { await sleep(1500); continue; } return null; } } return null; }
function normalizeAnswer(answer) { return String(answer || '').trim().replace(/^(?:final answer|đáp án cuối|kết luận)\s*[:：]\s*/i, '').trim(); }
async function run() {
  const req=globalThis.__REQ__,res=globalThis.__RES__,body=getBody(req);
  if(!body.message&&!body.imageDataUrl)return json(res,400,{error:'Thiếu đề bài hoặc ảnh.'});
  const message=String(body.message||'Giải bài trong ảnh.'),subject=String(body.subject||''),history=Array.isArray(body.history)?body.history:[],image=String(body.imageDataUrl||''),deep=body.deep!==false,math=subjectMode(subject,message)==='math',olympiad=isOlympiadMath(subject,message);
  let cas=''; const needsCas = math && !image && /(?:x\s*[=<>]|\bsolve\b|\bgiải\b|phương trình|hệ phương trình|tích phân|đạo hàm|log|ln|sin|cos|tan|căn|sqrt|\^)/i.test(message); if(needsCas){const w=await wolfram(message);if(w.available)cas=w.result;}
  let route={needs_code:false,reason:'MER/fast path',problem_type:math?'other':'general',difficulty:olympiad?'HARD':'MEDIUM',model:null,used:false};
  let codeExecutionTools=false,candidate=null,source='gemini',audit=null,repairCount=0,solverError=null,merUsed=false,merExperts=[];
  try{
    if(deep){
      const { merSolve } = await import('./mer-engine.js');
      const mer=await merSolve({message,subject,history,image});
      candidate={answer:mer.answer,model:mer.model,providerLatencyMs:null,codeExecutionUsed:false,codeExecutionRequested:false};
      source='mer';merUsed=true;merExperts=Array.isArray(mer.experts)?mer.experts:[];
    }else{
      candidate=await solveWithFallback({message,subject,history,image,cas,deep:false,codeExecutionTools:false});
    }
  }catch(e){
    solverError=e;
    try{
      if(deep&&math){
        route=await analyzeRoute({message,subject,image})||route;
        codeExecutionTools=route.needs_code===true;
      }
      candidate=await solveWithFallback({message,subject,history,image,cas,deep,codeExecutionTools});
      source='gemini';
    }catch(fe){
      solverError=fe||solverError;
      candidate=await openaiFallback({message,subject,image,cas});
      source=candidate?'openai':'none';
    }
  }
  if(!candidate){
    if(solverError?.code==='AI_CONFIG_MISSING')return json(res,503,{error:'AI chưa được cấu hình GEMINI_API_KEY trên Vercel.',code:'gemini-config-missing',retryable:false});
    return json(res,502,{error:providerError(solverError?.status,solverError?.providerMessage||solverError?.message),code:'ai-provider-unavailable',providerStatus:Number(solverError?.status)||null,retryable:true});
  }
  if(!merUsed&&olympiad)audit=await verify({message,subject,image,cas,candidate});
  const answer=normalizeAnswer(candidate.answer);
  return json(res,200,{
    answer,
    tool:merUsed?'MER • Multi-Expert Reasoning':(cas?'Wolfram + Verification':(audit?'Verification':null)),
    model:candidate.model||null,
    auditVerdict:audit?.verdict||null,
    auditIssues:Array.isArray(audit?.issues)?audit.issues.slice(0,6):[],
    repairEngineUsed:repairCount>0,
    repairCount,
    source,
    merUsed,
    merExperts,
    codeExecutionUsed:Boolean(candidate.codeExecutionUsed),
    codeExecutionRequested:codeExecutionTools,
    router:route,
    olympiadMode:olympiad,
    providerLatencyMs:candidate.providerLatencyMs||null
  });
}
export default async function handler(req, res) { globalThis.__REQ__ = req; globalThis.__RES__ = res; try { return await run(); } catch (e) { return json(res, 500, { error: 'Solver error: ' + String(e?.message || e) }); } }
