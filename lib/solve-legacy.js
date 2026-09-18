const FAST_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const DEEP_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
const MAX_OUTPUT_TOKENS = 12000;
const VERIFY_RETRIES = 1;
const VERIFY_MODELS = ['gemini-3.6-flash'];
const MAX_REPAIR_ROUNDS = 2;
const ROUTER_MODEL = 'gemini-3.8-flash';
const ROUTER_TIMEOUT_MS = 5000;
const FAST_SOLVER_TIMEOUT_MS = 14000;
const BALANCED_SOLVER_TIMEOUT_MS = 17000;
const DEEP_SOLVER_TIMEOUT_MS = 18000;
const VERIFY_TIMEOUT_MS = 4500;
const REPAIR_TIMEOUT_MS = 6500;
const FALLBACK_TIMEOUT_MS = 7000;
const OPENAI_FALLBACK_TIMEOUT_MS = 9000;
function cleanKey(v) { return String(v || '').replace(/^['"`]+|['"`]+$/g, '').trim(); }
function json(res, status, payload) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify(payload)); }
function getBody(req) { const b = req?.body; if (b && typeof b === 'object' && !Array.isArray(b)) return b; if (typeof b === 'string') { try { const p = JSON.parse(b); if (p && typeof p === 'object') return p; } catch (_) {} } return {}; }
function subjectMode(subject, text) { const s = (String(subject || '') + ' ' + String(text || '')).toLowerCase(); if (/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất|vmo|aime|olymm|olymp|number theory|combinatorics|geometry/.test(s)) return 'math'; if (/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s)) return 'physics'; if (/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s)) return 'chemistry'; return 'general'; }
function isOlympiadMath(subject, text) { const s = (String(subject || '') + ' ' + String(text || '')).toLowerCase(); return /vmo|aime|olymm|imo|olympiad|olympic|hard|challenge|chứng minh|prove|inequality|bất đẳng thức|số học|number theory|combinator|tổ hợp|geometry|hình học/.test(s); }
function isDeepCandidate(subject, text, forcedDeep) {
  if (forcedDeep) return true;
  const s = (String(subject || '') + ' ' + String(text || '')).toLowerCase();
  const math = subjectMode(subject, text) === 'math';
  if (!math) return false;
  return isOlympiadMath(subject, text) || /proof|prove|chứng minh|hãy chứng minh|tìm tất cả|find all|maximize|minimize|cực trị|bất đẳng thức|inequality|diophantine|số nguyên|modulo|đồng dư|functional equation|phương trình hàm|recurrence|dãy truy hồi/.test(s);
}
function isTheorySubject(subject, text) {
  const s=(String(subject||'')+' '+String(text||'')).toLowerCase();
  return /(văn|ngữ văn|literature|vietnamese literature|lịch sử|history|địa lý|geography|gdcd|giáo dục công dân|civics|kinh tế|social studies|social science)/.test(s);
}
function isBalancedCandidate(subject, text, forcedDeep) {
  if (forcedDeep) return false;
  const s=String(text||'').trim();
  if (!s || isOlympiadMath(subject,text)) return false;
  const math=subjectMode(subject,text)==='math';
  const theory=isTheorySubject(subject,text);
  if (!math && !theory) return s.length>=420;
  if (s.length>=180) return true;
  return /(giải thích|phân tích|tại sao|vì sao|so sánh|nhận xét|trình bày|giải|calculate|solve|explain|analyze)/i.test(s);
}
function isDeepTheoryCandidate(subject, text, forcedDeep) {
  if (!isTheorySubject(subject,text)) return false;
  if (forcedDeep) return true;
  const s=String(text||'').toLowerCase();
  return s.length>=700 || /(phân tích sâu|đánh giá|so sánh|nhận định|tư liệu|trích dẫn|nguyên nhân và hệ quả|đúng hay sai|phản biện|bình luận|evidence|source|critique|compare|evaluate)/.test(s);
}
function visualIntent(subject, text, image) {
  const s=(String(subject||'')+' '+String(text||'')).toLowerCase();
  const explicit=/(đồ thị|vẽ|biểu diễn|sơ đồ|hình minh họa|hình vẽ|graph|plot|diagram|chart|trục tọa độ|bảng biến thiên|visualize|minh họa)/i.test(s);
  if (/sin|cos|tan|hàm số|hàm y\s*=|đồ thị|bảng biến thiên|cực đại|cực tiểu|tiệm cận|giao điểm|trục tọa độ|đường cong/.test(s))
    return {enabled:true,type:'function',reason:explicit?'user_requested':'graph_explanation'};
  if (/hình học|tam giác|tứ giác|đa giác|đường tròn|tiếp tuyến|tiếp điểm|góc|đường thẳng|vuông góc|song song|trung điểm|trọng tâm|thể tích|diện tích hình|hình chóp|hình lăng trụ|mặt phẳng/.test(s))
    return {enabled:true,type:'geometry',reason:explicit?'user_requested':'geometry_explanation'};
  if (/vật lý|physics|lực|vectơ|vector|chuyển động|gia tốc|vận tốc|tia sáng|thấu kính|mạch điện|điện trở|dòng điện|sóng|dao động/.test(s))
    return {enabled:true,type:'diagram',reason:explicit?'user_requested':'physics_diagram'};
  if (/sinh học|biology|tế bào|dna|rna|nhiễm sắc thể|di truyền|cơ chế|quang hợp|hô hấp tế bào|cấu tạo/.test(s))
    return {enabled:true,type:'diagram',reason:explicit?'user_requested':'biology_diagram'};
  if (/hóa|chemistry|phản ứng|cơ chế phản ứng|cấu tạo phân tử|liên kết hóa học|chuỗi phản ứng|sơ đồ phản ứng/.test(s))
    return {enabled:true,type:'diagram',reason:explicit?'user_requested':'chemistry_diagram'};
  if (image && /hình|ảnh|đề bài|quan sát|cấu tạo|mô hình/.test(s))
    return {enabled:true,type:'diagram',reason:'image_explanation'};
  return {enabled:false,type:'none',reason:'text_is_clear'};
}
function transient(status, msg, err) { const m = String(msg || '').toLowerCase(); const name = String(err?.name || '').toLowerCase(); const code = String(err?.code || '').toUpperCase(); return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 || name === 'aborterror' || name === 'timeouterror' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN' || m.includes('high demand') || m.includes('resource exhausted') || m.includes('rate limit') || m.includes('temporarily unavailable') || m.includes('overloaded') || m.includes('timeout') || m.includes('timed out') || m.includes('fetch failed'); }
function providerError(status, msg) { if (status === 401 || status === 403) return 'API AI chưa được cấp quyền hoặc khóa API không hợp lệ.'; if (status === 404) return 'Model AI không khả dụng.'; if (transient(status, msg)) return 'AI đang bận hoặc kết nối bị gián đoạn tạm thời.'; return 'Bộ giải AI không phản hồi hợp lệ.'; }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function retryDelay(error, attempt) { const d = Number(error?.retryAfterMs); if (Number.isFinite(d) && d >= 0) return Math.min(10000, d); return Math.min(8000, 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 700)); }
async function wolfram(query) { const appid = cleanKey(process.env.WOLFRAM_APP_ID); if (!appid || !query) return { available: false }; try { const r = await fetch('https://api.wolframalpha.com/v1/result?appid=' + encodeURIComponent(appid) + '&i=' + encodeURIComponent(query) + '&units=metric', { signal: AbortSignal.timeout(5000) }); const t = await r.text(); return r.ok && t.trim() ? { available: true, result: t.trim() } : { available: false }; } catch (_) { return { available: false }; } }
function solverPrompt(subject, mode, cas, message, history, olympiad, needsCode, visual, theory) { const mathGuard = mode === 'math' ? `\nMATH ACCURACY GATE:\n- Xác định dạng bài, biến, miền điều kiện và mục tiêu trước khi biến đổi.\n- Lập kế hoạch giải rồi mới tính; tuyệt đối không đoán đáp án rồi hợp thức hóa.\n- Giữ dạng chính xác, không làm tròn trung gian.\n- Code Execution chỉ là công cụ hỗ trợ khi Router đánh dấu needs_code=true; nó không thay thế lập luận toán học.\n- Thế ngược, kiểm tra biên, trường hợp đặc biệt và phản ví dụ khi phù hợp.\n- Với phương trình/hệ/hàm phải kiểm tra mất hoặc thêm nghiệm.\n` : ''; const olympiadGuard = olympiad ? `\nOLYMPIAD / VMO MODE:\n- Giải như một bài thi chứng minh, không chỉ săn đáp số.\n- Tìm cấu trúc cốt lõi: bất biến, đối xứng, cực trị, phản chứng, quy nạp, modulo, đánh giá, đơn điệu hoặc chia trường hợp phù hợp.\n- Nếu nhiều hướng, tự tạo kiểm tra chéo cho ý tưởng chính.\n- Nếu Router cho phép code, dùng Python để kiểm tra giả thuyết, nghiệm nhỏ, số đếm hoặc số học; không dùng brute-force như bằng chứng duy nhất.\n- Với hình học, ưu tiên chứng minh quan hệ hình học; tọa độ/vector chỉ là công cụ hỗ trợ.\n- Trước kết luận, tự đóng vai giám khảo và tìm lỗ hổng.\n` : ''; const theoryGuard = theory ? `\nTHEORY / HUMANITIES ACCURACY GATE:\n- Tách dữ kiện trong đề, kiến thức nền và suy luận.\n- Không bịa niên đại, tên tác phẩm, sự kiện, nhân vật, trích dẫn hoặc nguồn.\n- Khi dữ kiện không đủ chắc chắn, nói rõ mức độ chắc chắn.\n- Với Văn: bám sát văn bản, không gán ý định cho tác giả khi không có căn cứ.\n- Với Sử/Địa/GDCD: kiểm tra mốc thời gian, bối cảnh, nguyên nhân và hệ quả.\n` : ''; const codeDirective = needsCode ? `\nHYBRID CODE ROUTE:\n- Router đã đánh dấu bài này có lợi khi dùng Code Execution.\n- Khi gặp phép tính lớn, đếm, duyệt hữu hạn hoặc kiểm tra thuật toán, hãy chủ động viết và chạy Python để kiểm chứng phần đó.\n- Dùng kết quả thực thi làm dữ kiện phụ trợ rồi tiếp tục lập luận toán học.\n- Không coi việc Python chạy thành công là bằng chứng toàn bộ lời giải đúng.\n` : `\nNO-CODE ROUTE:\n- Router đánh giá không cần Code Execution; ưu tiên suy luận toán học trực tiếp.\n`; return `Bạn là STUDY TH — bộ giải học tập chuyên sâu.\nMôn: ${subject || 'chưa chọn'}\nDạng: ${mode}\n${mathGuard}${olympiadGuard}${theoryGuard}${codeDirective}\nVISUALIZATION MODE:\n- Hệ thống đã tự đánh giá nhu cầu trực quan: ${visual && visual.enabled ? 'CÓ' : 'KHÔNG'}; loại=${visual?.type||'none'}; lý do=${visual?.reason||'text_is_clear'}.\n- Khi CÓ: phải kết hợp lời giải với đúng một code fence study-graph. Đừng chỉ nói "hãy tưởng tượng hình"; hãy dựng hình/sơ đồ để người học nhìn và bám theo.\n- Phần chữ phải tham chiếu trực tiếp các nhãn/điểm trên hình, ví dụ "nhìn điểm A", "đoạn AB", "giao tại M"; annotations chỉ giữ các ý then chốt, không nhồi chữ dài.\n- Có thể tự thêm hình ngay cả khi người dùng không yêu cầu, nhưng chỉ khi hình giúp giảm độ khó hiểu đáng kể. Không tạo hình trang trí.\n- Khi KHÔNG: không tạo study-graph.\n- Không viết SVG/HTML. Chỉ trả JSON trong fence.\n- Với đồ thị hàm số: {"type":"function","title":"...","caption":"Một câu giải thích hình đang thể hiện gì","xMin":-6.283185,"xMax":6.283185,"yMin":-1.5,"yMax":1.5,"xLabel":"x","yLabel":"y","functions":[{"equation":"y = sin(x)","label":"y = sin(x)"}],"points":[{"x":0,"y":0,"label":"O"}],"annotations":[{"x":1.5708,"y":1,"text":"Cực đại: y = 1","dx":28,"dy":-34}]}\n- Hỗ trợ equation dạng sin/cos/tan, hàm bậc nhất, bậc hai và nhiều hàm trong cùng một đồ thị.\n- Với hình học: {"type":"geometry","title":"...","caption":"...","points":[{"name":"A","x":0,"y":0}],"segments":[["A","B"]],"circles":[{"cx":0,"cy":0,"r":1}],"polygons":[["A","B","C"]],"annotations":[{"point":"A","text":"...","dx":28,"dy":-28}]}\n- Với sơ đồ quy trình/vật lý/sinh/hóa: {"type":"diagram","title":"...","caption":"...","nodes":[{"id":"A","x":0.2,"y":0.5,"label":"..."}],"arrows":[["A","B"]],"annotations":[{"node":"A","text":"..."}]}\n\nBẮT BUỘC:\n1. Đọc toàn bộ đề/ảnh trước khi giải.\n2. Dữ kiện → cần tìm → ý tưởng → lời giải từng bước → điều kiện → kiểm tra → kết luận.\n3. Không nhảy bước then chốt và không bịa dữ kiện.\n4. Với phần trăm/tăng giảm/hao hụt, xác định rõ đại lượng làm mốc ở từng bước.\n5. Công thức dùng LaTeX.\n${cas ? '\nCAS/Wolfram tham khảo (chỉ kiểm chứng):\n' + cas : ''}\nLịch sử:\n${Array.isArray(history) ? history.slice(-4).map(x => (x.role || 'user') + ': ' + String(x.message || '')).join('\n') : ''}\n\nĐề/Yêu cầu:\n${message}`; }
function imagePart(image) { if (!image || !/^data:image\//i.test(image)) return null; const m = image.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s); return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null; }
const ROUTER_SCHEMA = { type: 'OBJECT', properties: { needs_code: { type: 'BOOLEAN' }, reason: { type: 'STRING' }, problem_type: { type: 'STRING' }, difficulty: { type: 'STRING' } }, required: ['needs_code', 'problem_type', 'difficulty'] };
async function analyzeRoute({ message, subject, image }) { const api = cleanKey(process.env.GEMINI_API_KEY); if (!api) return null; const parts = [{ text: `Bạn là ROUTER của STUDY TH. Hãy phân tích bài toán trước khi Solver giải. Chỉ quyết định xem Code Execution có thực sự hữu ích hay không.\n\nQUY TẮC:\n- needs_code=true nếu bài có tính toán số học lớn, đếm tổ hợp/phân hoạch phức tạp, kiểm tra số dư/số nguyên tố, duyệt tập hữu hạn lớn, hoặc cần kiểm tra thuật toán/giả thuyết bằng Python.\n- needs_code=false nếu bài chủ yếu là chứng minh logic, hình học thuần túy, biến đổi đại số hoặc lập luận mà code không giúp đáng kể.\n- Không chọn true chỉ vì bài được gắn HARD/CHALLENGE.\n- problem_type là nhãn ngắn gọn như geometry, combinatorics, number_theory, algebra, proof, arithmetic, other.\n- difficulty là EASY, MEDIUM, HARD hoặc CHALLENGE.\n- reason giải thích ngắn gọn vì sao chọn nhánh.\n\nMÔN: ${subject || 'Toán'}\nĐỀ:\n${message}` }]; const img = imagePart(image); if (img) parts.push(img); try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + ROUTER_MODEL + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api, 'x-study-th-ai-tier': deep ? 'deep' : 'fast' }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 450, responseMimeType: 'application/json', responseSchema: ROUTER_SCHEMA, thinkingConfig: { thinkingLevel: 'low' } } }), signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS) }); const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {} if (!r.ok) return null; const txt = d?.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('').trim(); const parsed = parseJson(txt); if (!parsed || typeof parsed.needs_code !== 'boolean' || !parsed.problem_type || !parsed.difficulty) return null; return { needs_code: parsed.needs_code, reason: String(parsed.reason || ''), problem_type: String(parsed.problem_type), difficulty: String(parsed.difficulty).toUpperCase(), model: ROUTER_MODEL, used: true }; } catch (_) { return null; } }
async function gemini({ message, subject, history, image, cas, model, deep = true, tier = 'fast', maxOutputTokens = MAX_OUTPUT_TOKENS, timeout = 30000, codeExecutionTools = false }) { const api = cleanKey(process.env.GEMINI_API_KEY); if (!api) throw new Error('GEMINI_API_KEY chưa được cấu hình.'); const mode = subjectMode(subject, message); const olympiad = isOlympiadMath(subject, message); const visual = visualIntent(subject, message, image); const theory = isTheorySubject(subject, message); const parts = [{ text: solverPrompt(subject, mode, cas, message, history, olympiad, codeExecutionTools, visual, theory) }]; const img = imagePart(image); if (img) parts.push(img); const started = Date.now(); const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens, ...(model !== 'gemini-3.5-flash-lite' ? { thinkingConfig: { thinkingLevel: deep ? 'high' : (tier === 'balanced' ? 'medium' : 'low') } } : {}) } }; if (codeExecutionTools === true) body.tools = [{ codeExecution: {} }]; try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': api }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) }); const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {} if (!r.ok) { const e = Object.assign(new Error(providerError(r.status, d?.error?.message)), { status: r.status, providerMessage: d?.error?.message }); const retryAfter = Number(r.headers.get('retry-after')); if (Number.isFinite(retryAfter)) e.retryAfterMs = retryAfter * 1000; throw e; } const c = d?.candidates?.[0]; const answer = c?.content?.parts?.filter(p => p.text).map(p => p.text).join('').trim(); if (answer) return { answer, model, finishReason: c?.finishReason || null, providerLatencyMs: Date.now() - started, codeExecutionUsed: Boolean(c?.content?.parts?.some(p => p.executableCode || p.codeExecutionResult)), codeExecutionRequested: codeExecutionTools === true }; throw new Error('AI trả về rỗng.'); } catch (e) { if (transient(e?.status, e?.providerMessage || e?.message, e)) e.isTransient = true; throw e; } }
async function solveWithFallback(args) {
  let last=null;
  const models=args.deep ? DEEP_MODELS : FAST_MODELS;
  const maxOutputTokens=args.maxOutputTokensOverride || (args.deep ? MAX_OUTPUT_TOKENS : (args.tier === 'balanced' ? 7000 : 6500));
  const timeout=args.timeoutOverride || (args.deep ? DEEP_SOLVER_TIMEOUT_MS : (args.tier === 'balanced' ? BALANCED_SOLVER_TIMEOUT_MS : FAST_SOLVER_TIMEOUT_MS));
  for(const model of models){
    try{
      return await gemini({...args,model,deep:args.deep,tier:args.tier||'fast',maxOutputTokens,timeout,codeExecutionTools:args.codeExecutionTools===true});
    }catch(e){
      last=e;
      if(e?.status===401||e?.status===403)break;
      if(!transient(e?.status,e?.providerMessage||e?.message,e))break;
    }
  }
  throw last||new Error('Không có model Gemini khả dụng.');
}
function parseJson(text) { const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim(); try { return JSON.parse(raw); } catch (_) {} const m = raw.match(/\{[\s\S]*\}$/); if (m) { try { return JSON.parse(m[0]); } catch (_) {} } return null; }
async function verifyTheory({ message, subject, image, candidate }) {
  const api=cleanKey(process.env.GEMINI_API_KEY);
  if(!api||!candidate)return null;
  const prompt=`Bạn là FACT-CHECKER ĐỘC LẬP của STUDY TH cho Văn, Sử, Địa, GDCD và môn xã hội.
Không được tin lời giải ứng viên. Kiểm tra đề gốc và lời giải.
- Không chấp nhận chi tiết bịa, nguồn hoặc trích dẫn không có căn cứ.
- Kiểm tra mốc thời gian, nhân quả, thuật ngữ và mức độ chắc chắn.
- Với Văn, phân biệt phân tích/diễn giải với sự kiện chắc chắn.
Trả JSON duy nhất:
{"verdict":"PASS|FAIL|UNCERTAIN","issues":["..."],"checkedClaims":[{"claim":"...","status":"PASS|FAIL|UNCERTAIN","note":"..."}],"repair_hint":"..."}

MÔN: ${subject||'Xã hội'}
ĐỀ GỐC:
${message}
LỜI GIẢI ỨNG VIÊN:
${candidate.answer}`;
  const parts=[{text:prompt}]; const img=imagePart(image); if(img)parts.push(img);
  try{
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+VERIFY_MODELS[0]+':generateContent',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':api},
      body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:1300,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'medium'}}}),
      signal:AbortSignal.timeout(VERIFY_TIMEOUT_MS)
    });
    if(!r.ok)return null;
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}
    const txt=d?.candidates?.[0]?.content?.parts?.filter(p=>p.text).map(p=>p.text).join('').trim();
    const parsed=parseJson(txt);
    if(!parsed||!['PASS','FAIL','UNCERTAIN'].includes(String(parsed.verdict||'').toUpperCase()))return null;
    parsed.verdict=String(parsed.verdict).toUpperCase(); return parsed;
  }catch(_){return null;}
}
async function verify({ message, subject, image, cas, candidate }) {
  const api=cleanKey(process.env.GEMINI_API_KEY);
  if(!api||!candidate)return null;
  const prompt=`Bạn là GIÁM KHẢO ĐỘC LẬP của STUDY TH. Không được tin lời giải ứng viên. Hãy tự giải bài từ đề gốc trước, sau đó đối chiếu.

KIỂM TRA:
1. Xác định chính xác yêu cầu, điều kiện và dữ kiện.
2. Tự tìm đáp án/kết luận độc lập.
3. Kiểm tra biến đổi, suy luận, điều kiện, mất/thêm nghiệm và tính toán.
4. Thế ngược/kiểm tra trực tiếp khi phù hợp.
5. Với Olympic/AIME, nếu hai cách khác nhau phải tìm điểm phân kỳ; không chấp nhận lời giải chỉ vì có vẻ hợp lý.
6. Nếu có phản ví dụ hoặc suy luận không hợp lệ dẫn tới kết luận sai: FAIL.
7. Nếu hai cách độc lập khớp và điều kiện quan trọng được kiểm tra: PASS.
8. Chỉ UNCERTAIN khi dữ liệu thực sự không đủ.

Trả JSON duy nhất:
{"verdict":"PASS|FAIL|UNCERTAIN","expected_answer":"...","issues":["..."],"tests":[{"test":"...","result":"PASS|FAIL|NOT_APPLICABLE","note":"..."}],"repair_hint":"..."}

MÔN: ${subject || 'Toán'}
ĐỀ:
${message}
CAS/WOLFRAM:
${cas || 'Không có'}
LỜI GIẢI ỨNG VIÊN:
${candidate.answer}`;
  const parts=[{text:prompt}];
  const img=imagePart(image);
  if(img)parts.push(img);
  for(const model of VERIFY_MODELS){
    for(let attempt=0;attempt<VERIFY_RETRIES;attempt++){
      try{
        const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-goog-api-key':api},
          body:JSON.stringify({
            contents:[{role:'user',parts}],
            generationConfig:{maxOutputTokens:1800,responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'medium'}}
          }),
          signal:AbortSignal.timeout(VERIFY_TIMEOUT_MS)
        });
        const raw=await r.text();
        if(!r.ok)break;
        let d={};try{d=raw?JSON.parse(raw):{}}catch{}
        const txt=d?.candidates?.[0]?.content?.parts?.filter(p=>p.text).map(p=>p.text).join('').trim();
        const parsed=parseJson(txt);
        if(parsed&&['PASS','FAIL','UNCERTAIN'].includes(String(parsed.verdict||'').toUpperCase())){
          parsed.verdict=String(parsed.verdict).toUpperCase();
          return parsed;
        }
      }catch(_){}
    }
  }
  return null;
}
async function repair({ message, subject, image, cas, candidate, audit, attempt, codeExecutionTools, visual, theory }) {
  if(!candidate)return null;
  const instruction=theory ? 'Bài này thuộc Văn/Sử/Xã hội. Fact-check lại từng luận điểm, loại chi tiết không có căn cứ, không bịa nguồn/trích dẫn và nói rõ điều chưa đủ dữ kiện.' : 'Bài này thuộc Toán/VMO. Giải lại từ gốc, kiểm tra điều kiện, biến đổi và kết luận.';
  return solveWithFallback({message:`REPAIR ENGINE — Vòng sửa ${attempt}. ${instruction}\nKhông vá một câu; viết lại lời giải hoàn chỉnh dựa trên đề gốc và lỗi kiểm định.\n\nĐỀ GỐC:\n${message}\n\nLỜI GIẢI CŨ:\n${candidate.answer}\n\nKIỂM ĐỊNH:\n${JSON.stringify(audit)}`,subject,history:[],image,cas,deep:true,tier:'deep',codeExecutionTools:codeExecutionTools===true,visual,timeoutOverride:REPAIR_TIMEOUT_MS,maxOutputTokensOverride:8500});
}
async function independentFallback({ message, subject, image, cas, visual, theory }) {
  const prefix=theory ? 'INDEPENDENT FALLBACK: giải lại bài Văn/Sử/Xã hội từ đề gốc, không dựa vào lời giải cũ, kiểm tra fact và không bịa nguồn.' : 'INDEPENDENT FALLBACK: giải lại bài Toán/VMO từ đề gốc, không dựa vào lời giải cũ, tự kiểm tra kết quả và chứng minh.';
  try { return await solveWithFallback({message:prefix+'\\n\\n'+message,subject,history:[],image,cas,deep:true,tier:'deep',codeExecutionTools:false,visual,timeoutOverride:FALLBACK_TIMEOUT_MS,maxOutputTokensOverride:8500}); } catch(_) { return null; }
}
async function openaiFallback({ message, subject, image, cas, visual }) { const api = cleanKey(process.env.OPENAI_API_KEY); if (!api) return null; const model = cleanKey(process.env.OPENAI_SOLVER_MODEL || 'gpt-5'); const content = [{ type: 'input_text', text: `Giải bài từ gốc. Với toán Olympic/VMO: lập kế hoạch, chứng minh chặt chẽ, kiểm tra điều kiện và tính toán độc lập. ${visual?.enabled ? 'Nhu cầu trực quan đang BẬT ('+(visual.type||'diagram')+'). Hãy kèm đúng một fence study-graph JSON, dùng nhãn/annotations để hình giải thích phần khó; không viết SVG/HTML.' : 'Không cần study-graph nếu hình không giúp hiểu bài.'} ${cas ? 'CAS/Wolfram chỉ dùng kiểm chứng: ' + cas : ''}\n\n${message}` }]; const img = imagePart(image); if (img) content.push({ type: 'input_image', image_url: image, detail: 'high' }); const started = Date.now(); for (let attempt = 0; attempt < 2; attempt++) { try { const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api }, body: JSON.stringify({ model, reasoning: { effort: 'high' }, input: [{ role: 'user', content }], max_output_tokens: MAX_OUTPUT_TOKENS }), signal: AbortSignal.timeout(35000) }); const raw = await r.text(); let d = {}; try { d = raw ? JSON.parse(raw) : {}; } catch (_) {} if (!r.ok) { if (transient(r.status, d?.error?.message || '', { status: r.status }) && attempt === 0) { await sleep(1500); continue; } return null; } const answer = String(d?.output_text || d?.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '').trim(); return answer ? { answer, model, providerLatencyMs: Date.now() - started } : null; } catch (e) { if (transient(e?.status, e?.message, e) && attempt === 0) { await sleep(1500); continue; } return null; } } return null; }
function normalizeAnswer(answer) { return String(answer || '').trim().replace(/^(?:final answer|đáp án cuối|kết luận)\s*[:：]\s*/i, '').trim(); }
async function run() {
  const req=globalThis.__REQ__,res=globalThis.__RES__; const started=Date.now();
  const body=getBody(req); if(!body.message&&!body.imageDataUrl)return json(res,400,{error:'Thiếu đề bài hoặc ảnh.'});
  const message=String(body.message||'Giải bài trong ảnh.'); const subject=String(body.subject||'');
  const history=Array.isArray(body.history)?body.history:[]; const image=String(body.imageDataUrl||'');
  const forcedDeep=body.deep===true; const visual=visualIntent(subject,message,image);
  const math=subjectMode(subject,message)==='math'; const olympiad=isOlympiadMath(subject,message); const theory=isTheorySubject(subject,message);
  const deepCandidate=isDeepCandidate(subject,message,forcedDeep)||isDeepTheoryCandidate(subject,message,forcedDeep);
  const balancedCandidate=!deepCandidate&&isBalancedCandidate(subject,message,forcedDeep);
  let cas=''; let route=null;
  if(deepCandidate&&math){
    const [w,routed]=await Promise.all([!image?wolfram(message):Promise.resolve({available:false}),analyzeRoute({message,subject,image})]);
    if(w?.available)cas=w.result; route=routed;
  } else if(deepCandidate&&theory){
    route={needs_code:false,reason:'Theory deep path: independent knowledge verification; CAS/code disabled.',problem_type:'humanities',difficulty:'HARD',model:null,used:false};
  }
  if(!route)route={needs_code:false,reason:balancedCandidate?'Balanced path: one careful solver, no heavy tools.':'Fast path: heavy tools skipped.',problem_type:math?'other':(theory?'humanities':'general'),difficulty:deepCandidate?'HARD':(balancedCandidate?'MEDIUM':'EASY'),model:null,used:false};
  const autoDeep=forcedDeep||olympiad||deepCandidate; const tier=autoDeep?'deep':(balancedCandidate?'balanced':'fast');
  const codeExecutionTools=route.needs_code===true&&autoDeep&&math;
  let candidate=null; let source='gemini'; let audit=null; let repairCount=0; let fallbackUsed=false;
  try{candidate=await solveWithFallback({message,subject,history,image,cas,tier,deep:autoDeep,codeExecutionTools});}
  catch(_){candidate=await openaiFallback({message,subject,image,cas,visual});source=candidate?'openai':'none';}
  if(!candidate)return json(res,502,{error:'Không thể tạo lời giải lúc này.'});
  if(autoDeep&&(math||theory)){
    audit=theory?await verifyTheory({message,subject,image,candidate}):await verify({message,subject,image,cas,candidate});
    for(let i=1;i<=MAX_REPAIR_ROUNDS&&audit?.verdict==='FAIL'&&(Date.now()-started)<48000;i++){
      const repaired=await repair({message,subject,image,cas,candidate,audit,attempt:i,codeExecutionTools,visual,theory}); if(!repaired)break;
      candidate=repaired; repairCount++;
      const reAudit=theory?await verifyTheory({message,subject,image,candidate}):await verify({message,subject,image,cas,candidate}); audit=reAudit||audit;
      if(audit?.verdict!=='FAIL')break;
    }
    if(audit?.verdict==='FAIL'){
      const fallback=await independentFallback({message,subject,image,cas,visual,theory});
      if(fallback){candidate=fallback;fallbackUsed=true;const fa=theory?await verifyTheory({message,subject,image,candidate}):await verify({message,subject,image,cas,candidate});if(fa)audit=fa;}
      if(audit?.verdict==='FAIL'){
        const second=await openaiFallback({message,subject,image,cas,visual});
        if(second){candidate=second;source='openai';fallbackUsed=true;const fa=theory?await verifyTheory({message,subject,image,candidate}):await verify({message,subject,image,cas,candidate});if(fa)audit=fa;}
      }
    }
  }
  const answer=normalizeAnswer(candidate.answer);
  return json(res,200,{answer,tool:cas?'Wolfram + Verification':(audit?'Independent Verification':null),model:candidate.model||null,auditVerdict:audit?.verdict||null,auditIssues:Array.isArray(audit?.issues)?audit.issues.slice(0,6):[],repairEngineUsed:repairCount>0,repairCount,fallbackUsed,source,codeExecutionUsed:Boolean(candidate.codeExecutionUsed),codeExecutionRequested:codeExecutionTools,router:route,visualIntent:visual,processingTier:tier,deepMode:autoDeep,olympiadMode:olympiad,theoryMode:theory,totalLatencyMs:Date.now()-started,providerLatencyMs:candidate.providerLatencyMs||null});
}
export default async function handler(req, res) { globalThis.__REQ__ = req; globalThis.__RES__ = res; try { return await run(); } catch (e) { return json(res, 500, { error: 'Solver error: ' + String(e?.message || e) }); } }
