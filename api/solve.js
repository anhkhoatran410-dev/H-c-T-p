const GEMINI_MODELS=['gemini-3.8-flash','gemini-3.6-flash'];
const MAX_OUTPUT_TOKENS=9000;

function cleanKey(value){return String(value||'').replace(/^['"`]+|['"`]+$/g,'').trim()}
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(payload))}
function subjectMode(subject,text){
  const s=(String(subject||'')+' '+String(text||'')).toLowerCase();
  if(/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất/.test(s))return 'math';
  if(/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s))return 'physics';
  if(/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s))return 'chemistry';
  return 'general';
}
function friendlyProviderError(status,message){
  const m=String(message||'').toLowerCase();
  if(status===429||m.includes('high demand')||m.includes('rate limit')||m.includes('resource exhausted'))return 'AI chính đang bận, hệ thống sẽ thử bộ giải dự phòng.';
  if(status===401||status===403)return 'API AI chưa được cấp quyền hoặc khóa API không hợp lệ.';
  return 'AI chính không phản hồi, hệ thống sẽ thử bộ giải dự phòng.';
}
async function wolfram(query){
  const appid=cleanKey(process.env.WOLFRAM_APP_ID);
  if(!appid||!query)return {available:false};
  try{
    const url='https://api.wolframalpha.com/v1/result?appid='+encodeURIComponent(appid)+'&i='+encodeURIComponent(query)+'&units=metric';
    const r=await fetch(url,{signal:AbortSignal.timeout(7000)});
    const text=await r.text();
    if(!r.ok)return {available:false,error:text||('Wolfram HTTP '+r.status)};
    return {available:true,result:text.trim()};
  }catch(e){return {available:false,error:e?.message||String(e)}}
}
async function gemini({message,subject,history,imageDataUrl,verified}){
  const key=cleanKey(process.env.GEMINI_API_KEY);
  if(!key)throw new Error('GEMINI_API_KEY chưa được cấu hình.');
  const mode=subjectMode(subject,message);
  const system=`Bạn là STUDY TH — trợ lý giải bài học tập chính xác và nhanh.\n\nMôn: ${subject||'chưa chọn'}\nChế độ: ${mode}\n\nQUY TẮC:\n1) Nếu có ảnh, đọc toàn bộ phần đề nhìn thấy trước khi giải.\n2) Nếu có nhiều câu, giải từ câu đầu đến câu cuối; không dừng giữa chừng.\n3) Không bịa phần ảnh mờ hoặc dữ kiện không có.\n4) Tự kiểm tra lại phép tính, dấu, điều kiện, đơn vị và đáp án cuối trước khi trả lời.\n5) Trình bày đủ để học sinh hiểu nhưng tránh lan man.\n6) Công thức toán dùng LaTeX \\( ... \\) hoặc \\[ ... \\].\n${verified?'\nKẾT QUẢ KIỂM CHỨNG ĐỘC LẬP:\n'+verified+'\nHãy đối chiếu kết quả này với lời giải và sửa nếu cần.':''}`;
  const historyText=Array.isArray(history)?history.slice(-8).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):'';
  const parts=[{text:system+'\n\nLịch sử gần đây:\n'+historyText+'\n\nYêu cầu:\n'+message}];
  if(imageDataUrl && /^data:image\//i.test(imageDataUrl)){
    const m=imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
    if(m)parts.push({inlineData:{mimeType:m[1],data:m[2]}});
  }
  let last='';
  for(const model of GEMINI_MODELS){
    try{
      const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:MAX_OUTPUT_TOKENS}}),signal:AbortSignal.timeout(25000)});
      const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
      if(r.ok){
        const candidate=data?.candidates?.[0];
        const answer=candidate?.content?.parts?.map(p=>p.text||'').join('').trim();
        if(answer){
          if(candidate?.finishReason==='MAX_TOKENS' && !/[.!?。！？]\s*$/.test(answer))return {answer:answer+'\n\n⚠️ Lời giải bị giới hạn độ dài. Hãy gửi "tiếp tục" để hoàn tất.',model};
          return {answer,model};
        }
      }
      last=data?.error?.message||('Gemini HTTP '+r.status);
    }catch(e){last=e?.message||String(e)}
  }
  throw new Error(friendlyProviderError(429,last)+' '+String(last||''));
}
async function openaiFallback({message,subject,history,imageDataUrl,verified}){
  const key=cleanKey(process.env.OPENAI_API_KEY);if(!key)return null;
  const model=cleanKey(process.env.OPENAI_SOLVER_MODEL||'gpt-5');
  const prompt=`Bạn là trợ lý học tập của STUDY TH. Hãy giải toàn bộ bài/các câu trong ảnh, không dừng giữa chừng. Môn: ${subject||'chưa chọn'}. Kiểm tra lại kết quả trước khi kết luận.\n\n${verified?'Kiểm chứng độc lập:\n'+verified+'\n\n':''}Câu hỏi:\n${message}`;
  const content=[{type:'input_text',text:prompt}];
  if(imageDataUrl && /^data:image\//i.test(imageDataUrl))content.push({type:'input_image',image_url:imageDataUrl,detail:'high'});
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model,reasoning:{effort:'high'},input:[{role:'user',content}],max_output_tokens:MAX_OUTPUT_TOKENS}),signal:AbortSignal.timeout(35000)});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok)throw new Error(data?.error?.message||('OpenAI HTTP '+r.status));
  return {answer:data.output_text||'Mình chưa có câu trả lời.',model};
}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const message=String(req.body?.message||'').trim();if(!message)return json(res,400,{error:'Thiếu câu hỏi.'});
    const subject=String(req.body?.subject||'');
    const history=Array.isArray(req.body?.history)?req.body.history:[];
    const imageDataUrl=String(req.body?.imageDataUrl||'');
    const mode=subjectMode(subject,message);

    // Start independent math/physics/chemistry verification immediately so it can overlap with model work.
    const verificationPromise=(mode==='math'||mode==='physics'||mode==='chemistry')?wolfram(message):Promise.resolve({available:false});
    let verified=null;
    try{
      const early=await Promise.race([verificationPromise,new Promise(resolve=>setTimeout(()=>resolve(null),650))]);
      if(early?.available)verified=early.result;
    }catch{}

    try{
      const g=await gemini({message,subject,history,imageDataUrl,verified});
      return json(res,200,{...g,tool:verified?'WolframAlpha + Gemini':'Gemini'});
    }catch(primary){
      // If verification finishes while the fallback starts, include it without making the primary path wait.
      if(!verified)try{const late=await Promise.race([verificationPromise,new Promise(resolve=>setTimeout(()=>resolve(null),400))]);if(late?.available)verified=late.result}catch{}
      const fallback=await openaiFallback({message,subject,history,imageDataUrl,verified}).catch(()=>null);
      if(fallback)return json(res,200,{...fallback,tool:verified?'WolframAlpha + OpenAI':'OpenAI fallback'});
      return json(res,503,{error:String(primary?.message||'Các bộ giải AI hiện chưa phản hồi. Vui lòng thử lại sau ít phút.')});
    }
  }catch(e){return json(res,500,{error:e.message||'Không thể xử lý yêu cầu.'})}
}
