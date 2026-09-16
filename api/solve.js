const GEMINI_MODELS=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash-lite'];
const MAX_OUTPUT_TOKENS=12000;

function cleanKey(value){return String(value||'').replace(/^['"`]+|['"`]+$/g,'').trim()}
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(payload))}
function subjectMode(subject,text){
  const s=(String(subject||'')+' '+String(text||'')).toLowerCase();
  if(/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất/.test(s))return 'math';
  if(/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s))return 'physics';
  if(/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s))return 'chemistry';
  return 'general';
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function friendlyProviderError(status,message){
  const m=String(message||'').toLowerCase();
  if(status===429||m.includes('high demand')||m.includes('rate limit')||m.includes('resource exhausted'))return 'AI Gemini đang quá tải tạm thời.';
  if(status===401||status===403)return 'API AI chưa được cấp quyền hoặc khóa API không hợp lệ.';
  return 'AI chính đang bận; hệ thống đang chuyển sang bộ giải dự phòng.';
}
async function wolfram(query){
  const appid=cleanKey(process.env.WOLFRAM_APP_ID);
  if(!appid||!query)return {available:false};
  const url='https://api.wolframalpha.com/v1/result?appid='+encodeURIComponent(appid)+'&i='+encodeURIComponent(query)+'&units=metric';
  const r=await fetch(url,{signal:AbortSignal.timeout(12000)});
  const text=await r.text();
  if(!r.ok)return {available:false,error:text||('Wolfram HTTP '+r.status)};
  return {available:true,result:text.trim()};
}
async function gemini({message,subject,history,imageDataUrl,verified}){
  const key=cleanKey(process.env.GEMINI_API_KEY);
  if(!key)throw new Error('GEMINI_API_KEY chưa được cấu hình.');
  const mode=subjectMode(subject,message);
  const system=`Bạn là STUDY TH — trợ lý giải bài học tập chính xác.\n\nMôn: ${subject||'chưa chọn'}\nChế độ suy luận: ${mode}\n\nQUY TẮC BẮT BUỘC:\n1) Nếu có ảnh, đọc toàn bộ đề trước rồi giải TOÀN BỘ phần nhìn thấy trong ảnh.\n2) Không tự ý dừng sau một câu hoặc một bước. Với đề nhiều câu, phải đi từ Câu 1 đến câu cuối.\n3) Nếu lời giải dài, vẫn phải hoàn thành đầy đủ trước khi kết thúc. Không để câu trả lời dang dở giữa câu, giữa công thức hoặc giữa bước giải.\n4) Nếu ảnh mờ/thiếu dữ kiện, nói rõ phần nào không đọc được; không bịa.\n5) Kiểm tra điều kiện, dấu, đơn vị và kết quả cuối.\n6) Công thức toán dùng LaTeX \\( ... \\) hoặc \\[ ... \\].\n7) Trình bày từng bước, dễ học, có kết luận cuối rõ ràng.\n${verified?'\nKẾT QUẢ KIỂM CHỨNG TỪ CÔNG CỤ:\n'+verified+'\n':''}`;
  const historyText=Array.isArray(history)?history.slice(-8).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):'';
  const parts=[{text:system+'\n\nLịch sử gần đây:\n'+historyText+'\n\nYêu cầu mới:\n'+message}];
  if(imageDataUrl && /^data:image\//i.test(imageDataUrl)){
    const m=imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
    if(m)parts.push({inlineData:{mimeType:m[1],data:m[2]}});
  }
  let last='';
  for(const model of GEMINI_MODELS){
    let r;
    try{
      r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:MAX_OUTPUT_TOKENS}}),signal:AbortSignal.timeout(45000)});
    }catch(e){last=e?.message||String(e);continue}
    const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
    if(r.ok){
      const candidate=data?.candidates?.[0];
      const answer=candidate?.content?.parts?.map(p=>p.text||'').join('').trim();
      if(answer){
        if(candidate?.finishReason==='MAX_TOKENS' && !/[.!?。！？]\s*$/.test(answer)){
          return {answer:answer+'\n\n⚠️ Phần trên đã chạm giới hạn độ dài. Bạn có thể bấm gửi tiếp “Tiếp tục từ chỗ đang dở” để hoàn tất.',model};
        }
        return {answer,model};
      }
    }
    last=data?.error?.message||('Gemini HTTP '+r.status);
    if(r.status===429)await sleep(350);
  }
  throw new Error(friendlyProviderError(429,last)+' '+String(last||''));
}
async function openaiFallback({message,subject,history,imageDataUrl,verified}){
  const key=cleanKey(process.env.OPENAI_API_KEY); if(!key)return null;
  const model=cleanKey(process.env.OPENAI_SOLVER_MODEL||'gpt-5.6-luna');
  const historyText=Array.isArray(history)?history.slice(-8).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):'';
  const prompt=`Bạn là trợ lý học tập của STUDY TH. Môn: ${subject||'chưa chọn'}. Hãy giải TOÀN BỘ bài/các câu trong ảnh, không dừng giữa chừng. Nếu đề dài, hoàn thành đến câu cuối trước khi kết thúc. Trình bày từng câu rõ ràng, kiểm tra lại kết quả. Nếu có kiểm chứng bên ngoài, dùng nó để đối chiếu.\n\nLịch sử:\n${historyText}\n\nKiểm chứng:\n${verified||'Không có'}\n\nCâu hỏi:\n${message}`;
  const content=[{type:'input_text',text:prompt}];
  if(imageDataUrl && /^data:image\//i.test(imageDataUrl))content.push({type:'input_image',image_url:imageDataUrl,detail:'high'});
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model,reasoning:{effort:'high'},input:[{role:'user',content}],max_output_tokens:MAX_OUTPUT_TOKENS}),signal:AbortSignal.timeout(60000)});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok)throw new Error(data?.error?.message||('OpenAI HTTP '+r.status));
  return {answer:data.output_text||'Mình chưa có câu trả lời.',model};
}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const message=String(req.body?.message||'').trim(); if(!message)return json(res,400,{error:'Thiếu câu hỏi.'});
    const subject=String(req.body?.subject||'');
    const history=Array.isArray(req.body?.history)?req.body.history:[];
    const imageDataUrl=String(req.body?.imageDataUrl||'');
    const mode=subjectMode(subject,message); let verified=null;
    if(mode==='math'||mode==='physics'||mode==='chemistry'){
      try{const w=await wolfram(message);if(w.available)verified=w.result}catch(e){verified=null}
    }
    try{
      const g=await gemini({message,subject,history,imageDataUrl,verified});
      return json(res,200,{...g,tool:verified?'WolframAlpha':'Gemini'});
    }catch(primary){
      const fallback=await openaiFallback({message,subject,history,imageDataUrl,verified}).catch(()=>null);
      if(fallback)return json(res,200,{...fallback,tool:verified?'WolframAlpha + OpenAI':'OpenAI fallback'});
      const pm=String(primary?.message||'');
      if(pm.includes('quá tải')||pm.includes('API AI chưa'))return json(res,503,{error:pm});
      return json(res,503,{error:'Các bộ giải AI hiện chưa phản hồi. Vui lòng thử lại sau ít phút.'});
    }
  }catch(e){return json(res,500,{error:e.message||'Không thể xử lý yêu cầu.'})}
}
