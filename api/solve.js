const GEMINI_MODELS=['gemini-3.8-flash','gemini-3.6-flash'];
const MAX_OUTPUT_TOKENS=12000;
const VERIFY_RETRIES=2;

function cleanKey(value){return String(value||'').replace(/^['"`]+|['"`]+$/g,'').trim()}
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(payload))}
function subjectMode(subject,text){const s=(String(subject||'')+' '+String(text||'')).toLowerCase();if(/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất/.test(s))return 'math';if(/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s))return 'physics';if(/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s))return 'chemistry';return 'general'}
function busy(status,message){const m=String(message||'').toLowerCase();return status===429||status===408||status>=500||m.includes('high demand')||m.includes('resource exhausted')||m.includes('rate limit')}
function providerError(status,message){if(status===401||status===403)return 'API AI chưa được cấp quyền hoặc khóa API không hợp lệ.';if(busy(status,message))return 'AI chính đang bận; hệ thống sẽ thử bộ giải dự phòng.';return 'Bộ giải AI không phản hồi hợp lệ.'}
async function wolfram(query){const appid=cleanKey(process.env.WOLFRAM_APP_ID);if(!appid||!query)return {available:false};try{const r=await fetch('https://api.wolframalpha.com/v1/result?appid='+encodeURIComponent(appid)+'&i='+encodeURIComponent(query)+'&units=metric',{signal:AbortSignal.timeout(7000)});const t=await r.text();return r.ok?{available:true,result:t.trim()}:{available:false}}catch{return {available:false}}}
function solverPrompt(subject,mode,verified,message,history){return `Bạn là STUDY TH — bộ giải bài học tập chuyên sâu.
Môn: ${subject||'chưa chọn'}
Chế độ: ${mode}

MỤC TIÊU: tạo một lời giải có thể đem đi kiểm định, không chỉ đoán đáp án.

BẮT BUỘC:
1. Nếu có ảnh: đọc toàn bộ đề và tất cả phần nhìn thấy trước khi giải.
2. Nếu có nhiều câu: giải hết từ câu đầu tới câu cuối; tuyệt đối không dừng sau một phần.
3. Giải tận gốc: Dữ kiện → Cần tìm → Ý tưởng → biến đổi/chứng minh từng bước → trường hợp đặc biệt → kiểm tra → kết luận.
4. Mọi phép biến đổi quan trọng phải nêu điều kiện. Chú ý các thao tác có thể làm mất/nghiệm thừa như chia cho biểu thức, bình phương, căn, log, mẫu số, đổi dấu bất đẳng thức.
5. Với bài hàm số/phương trình/hệ/bất đẳng thức: phải có thế ngược hoặc kiểm tra tương đương; xét trường hợp biên và trường hợp đặc biệt phù hợp với đề.
6. Không bịa phần ảnh mờ hoặc dữ kiện thiếu.
7. Công thức toán dùng LaTeX.
8. Phần cuối phải nêu rõ những gì đã được kiểm tra.
${verified?'\nKẾT QUẢ CAS/WOLFRAM THAM KHẢO:\n'+verified+'\nChỉ dùng nếu thực sự liên quan; nếu mâu thuẫn phải tự kiểm tra lại.':''}

LỊCH SỬ:\n${Array.isArray(history)?history.slice(-6).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):''}

ĐỀ/YÊU CẦU:\n${message}`} }
async function geminiOnce({message,subject,history,imageDataUrl,verified,model,maxOutputTokens=MAX_OUTPUT_TOKENS,timeout=25000}){const key=cleanKey(process.env.GEMINI_API_KEY);if(!key)throw new Error('GEMINI_API_KEY chưa được cấu hình.');const mode=subjectMode(subject,message);const parts=[{text:solverPrompt(subject,mode,verified,message,history)}];if(imageDataUrl&&/^data:image\//i.test(imageDataUrl)){const m=imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);if(m)parts.push({inlineData:{mimeType:m[1],data:m[2]}})}const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens}}),signal:AbortSignal.timeout(timeout)});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok)throw Object.assign(new Error(providerError(r.status,d?.error?.message)),{status:r.status,providerMessage:d?.error?.message});const answer=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();if(!answer)throw new Error('Gemini trả về rỗng.');return {answer,model,finishReason:d?.candidates?.[0]?.finishReason||null}}
async function independentSolves(args){const jobs=GEMINI_MODELS.map(model=>geminiOnce({...args,model}));const settled=await Promise.allSettled(jobs);const good=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);if(good.length)return good;throw settled.find(x=>x.status==='rejected')?.reason||new Error('Gemini không phản hồi.')}
function parseJson(text){const raw=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();try{return JSON.parse(raw)}catch{const m=raw.match(/\{[\s\S]*\}$/);if(m)try{return JSON.parse(m[0])}catch{}return null}}
async function verifySolution({message,subject,imageDataUrl,verified,candidates,model='gemini-3.6-flash'}){const key=cleanKey(process.env.GEMINI_API_KEY);if(!key)return null;const joined=candidates.map((x,i)=>`=== LỜI GIẢI ${i+1} (${x.model}) ===\n${x.answer}`).join('\n\n');const prompt=`Bạn là VERIFICATION ENGINE của STUDY TH. Đây là bộ kiểm định độc lập.

Kiểm tra đề và lời giải từ đầu đến cuối. Không chấp nhận "có vẻ đúng".

PHẢI LÀM:
A) Đọc lại đề/ảnh, xác định đầy đủ yêu cầu và miền điều kiện.
B) So sánh các lời giải độc lập; tìm điểm khác nếu chúng không giống nhau.
C) Lập bộ test phù hợp: thế ngược vào đề gốc; giá trị mẫu trong miền xác định; trường hợp biên/đặc biệt; dấu/đơn vị; và cố ý tìm phản ví dụ.
D) Với biến đổi đại số, kiểm tra tính tương đương và các bước có nguy cơ mất nghiệm/sinh nghiệm.
E) Với chứng minh, kiểm tra logic từng mệnh đề.
F) Chỉ PASS khi các kiểm tra quan trọng đều qua. Chỉ cần một lỗi toán học là FAIL.
G) Nếu FAIL, nêu lỗi cụ thể và đưa repair_hint có thể dùng để giải lại từ gốc.

TRẢ JSON DUY NHẤT:
{"verdict":"PASS|FAIL|UNCERTAIN","issues":["..."],"tests":[{"test":"...","result":"PASS|FAIL|NOT_APPLICABLE","note":"..."}],"repair_hint":"...","preferred":0}

ĐỀ:\n${message}\n\nCAS/WOLFRAM:\n${verified||'Không có'}\n\n${joined}`;const parts=[{text:prompt}];if(imageDataUrl&&/^data:image\//i.test(imageDataUrl)){const m=imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);if(m)parts.push({inlineData:{mimeType:m[1],data:m[2]}})}try{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:4500,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(18000)});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok)return null;const txt=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();const parsed=parseJson(txt);return parsed?{...parsed,model}:null}catch{return null}}
async function repairSolution({message,subject,imageDataUrl,verified,candidates,audit,attempt}){const bestIndex=Number.isInteger(audit?.preferred)?audit.preferred:0;const base=candidates[Math.max(0,Math.min(bestIndex,candidates.length-1))];const prompt=`Bạn là REPAIR ENGINE của STUDY TH. Lời giải dưới đây đã FAIL kiểm định. Giải lại TOÀN BỘ từ gốc, không vá một dòng rồi dừng.

ĐỀ:\n${message}\n\nLỜI GIẢI FAIL:\n${base.answer}\n\nBỘ KIỂM ĐỊNH:\n${JSON.stringify(audit||{})}\n\nCAS/WOLFRAM:\n${verified||'Không có'}\n\nSửa toàn bộ lỗi đã nêu, tự kiểm tra lại bằng các test tương ứng, rồi xuất lời giải hoàn chỉnh. Không chỉ nhận xét. Lần sửa: ${attempt}.`;return geminiOnce({message:prompt,subject,history:[],imageDataUrl,verified:null,model:'gemini-3.8-flash',maxOutputTokens:MAX_OUTPUT_TOKENS,timeout:30000})}
async function openaiFallback({message,subject,imageDataUrl,verified}){const key=cleanKey(process.env.OPENAI_API_KEY);if(!key)return null;const model=cleanKey(process.env.OPENAI_SOLVER_MODEL||'gpt-5');const prompt=`Giải toàn bộ bài từ gốc, không chỉ kết luận. Môn: ${subject||'chưa chọn'}. Kiểm tra thế ngược, điều kiện, trường hợp đặc biệt và phản ví dụ trước khi kết luận. ${verified?'Đối chiếu CAS/Wolfram: '+verified:''}\n\n${message}`;const content=[{type:'input_text',text:prompt}];if(imageDataUrl&&/^data:image\//i.test(imageDataUrl))content.push({type:'input_image',image_url:imageDataUrl,detail:'high'});const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model,reasoning:{effort:'high'},input:[{role:'user',content}],max_output_tokens:MAX_OUTPUT_TOKENS}),signal:AbortSignal.timeout(45000)});const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok)throw new Error(d?.error?.message||('OpenAI HTTP '+r.status));return {answer:d.output_text||'Mình chưa có câu trả lời.',model}}
module.exports=async function handler(req,res){if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});try{
 const message=String(req.body?.message||'').trim();if(!message)return json(res,400,{error:'Thiếu câu hỏi.'});const subject=String(req.body?.subject||'');const history=Array.isArray(req.body?.history)?req.body.history:[];const imageDataUrl=String(req.body?.imageDataUrl||'');const deep=req.body?.deep!==false;const mode=subjectMode(subject,message);
 const verificationPromise=(mode==='math'||mode==='physics'||mode==='chemistry')?wolfram(message):Promise.resolve({available:false});
 let candidates;try{candidates=await independentSolves({message,subject,history,imageDataUrl,verified:null})}catch(primaryError){const w=await verificationPromise;const fallback=await openaiFallback({message,subject,imageDataUrl,verified:w.available?w.result:null}).catch(()=>null);if(fallback)return json(res,200,{...fallback,tool:w.available?'WolframAlpha + OpenAI':'OpenAI fallback'});return json(res,503,{error:String(primaryError?.message||'Các bộ giải AI hiện chưa phản hồi.')})}
 let w=await verificationPromise;let verified=w.available?w.result:null;let audit=null;let chosen=candidates[0];
 if(deep&&(mode==='math'||mode==='physics'||mode==='chemistry')){
   audit=await verifySolution({message,subject,imageDataUrl,verified,candidates});
   for(let attempt=1;attempt<=VERIFY_RETRIES && audit?.verdict==='FAIL';attempt++){
     const repaired=await repairSolution({message,subject,imageDataUrl,verified,candidates,audit,attempt}).catch(()=>null);if(!repaired)break;
     candidates=[repaired];
     audit=await verifySolution({message,subject,imageDataUrl,verified,candidates}).catch(()=>null);
     chosen=repaired;
     if(audit?.verdict==='PASS')break;
   }
   if(audit?.verdict==='PASS'){const index=Number.isInteger(audit.preferred)?audit.preferred:0;chosen=candidates[Math.max(0,Math.min(index,candidates.length-1))]||chosen}
 }
 const toolParts=[];if(verified)toolParts.push('WolframAlpha');if(candidates.length>1)toolParts.push('2 AI độc lập');if(audit)toolParts.push('Verification Engine');
 return json(res,200,{answer:chosen.answer,model:chosen.model,auditModel:audit?.model||null,auditVerdict:audit?.verdict||'UNCERTAIN',auditIssues:audit?.issues||[],tests:audit?.tests||[],tool:toolParts.join(' + ')||'Gemini',verified:!!verified});
}catch(e){return json(res,500,{error:e.message||'Không thể xử lý yêu cầu.'})}}
