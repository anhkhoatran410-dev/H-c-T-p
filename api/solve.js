const GEMINI_MODELS=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash'];

function cleanKey(value){return String(value||'').replace(/^['"`]+|['"`]+$/g,'').trim()}
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify(payload))}
function subjectMode(subject,text){
  const s=(String(subject||'')+' '+String(text||'')).toLowerCase();
  if(/toán|math|algebra|calculus|đạo hàm|tích phân|hình học|phương trình|bất đẳng thức|xác suất/.test(s))return 'math';
  if(/vật lý|physics|cơ học|điện|quang|dao động|sóng|nhiệt/.test(s))return 'physics';
  if(/hóa|chemistry|phản ứng|mol|acid|base|oxi hóa|hữu cơ/.test(s))return 'chemistry';
  return 'general';
}

async function wolfram(query){
  const appid=cleanKey(process.env.WOLFRAM_APP_ID);
  if(!appid||!query)return {available:false};
  const url='https://api.wolframalpha.com/v1/result?appid='+encodeURIComponent(appid)+'&i='+encodeURIComponent(query)+'&units=metric';
  const r=await fetch(url);
  const text=await r.text();
  if(!r.ok)return {available:false,error:text||('Wolfram HTTP '+r.status)};
  return {available:true,result:text.trim()};
}

async function gemini({message,subject,history,imageDataUrl,verified}){
  const key=cleanKey(process.env.GEMINI_API_KEY);
  if(!key)throw new Error('GEMINI_API_KEY chưa được cấu hình.');
  const mode=subjectMode(subject,message);
  const system=`Bạn là STUDY TH — trợ lý giải bài học tập chính xác.\n\nMôn: ${subject||'chưa chọn'}\nChế độ suy luận: ${mode}\n\nNguyên tắc:\n1) Nếu có ảnh, phải đọc toàn bộ đề trong ảnh trước khi giải; không đoán phần bị mờ.\n2) Với Toán/Vật lý/Hóa, kiểm tra đơn vị, điều kiện, dấu và kết quả cuối.\n3) Khi có kết quả từ bộ máy tính chính xác bên ngoài, coi đó là dữ liệu kiểm chứng và giải thích cách đi tới kết quả; nếu mâu thuẫn, nói rõ mâu thuẫn thay vì bịa.\n4) Không khẳng định tuyệt đối nếu đề thiếu dữ kiện hoặc ảnh không đủ rõ.\n5) Trình bày từng bước, dễ học, kết luận rõ.\n6) Công thức toán phải dùng LaTeX với delimiter \\( ... \\) hoặc \\[ ... \\].\n7) Với bài cực khó, ưu tiên suy luận sâu; có thể đưa ra nhiều kiểm tra độc lập.\n\n${verified?`KẾT QUẢ KIỂM CHỨNG TỪ CÔNG CỤ:\n${verified}\n`:''}`;
  const parts=[{text:system+'\n\nLịch sử gần đây:\n'+(Array.isArray(history)?history.slice(-8).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):'')+'\n\nCâu hỏi: '+message}];
  if(imageDataUrl && /^data:image\//i.test(imageDataUrl)){
    const m=imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
    if(m)parts.push({inlineData:{mimeType:m[1],data:m[2]}});
  }
  let last='';
  for(const model of GEMINI_MODELS){
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:5000}})});
    const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
    if(r.ok){const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();if(answer)return {answer,model}}
    last=data?.error?.message||('Gemini HTTP '+r.status);
  }
  throw new Error(last||'Gemini không phản hồi.');
}

async function openaiFallback({message,subject,history,imageDataUrl,verified}){
  const key=cleanKey(process.env.OPENAI_API_KEY); if(!key)return null;
  const content=[{type:'input_text',text:`Bạn là trợ lý học tập của STUDY TH. Môn: ${subject||'chưa chọn'}. Hãy giải bài chính xác, từng bước. Nếu có kiểm chứng bên ngoài, dùng nó để đối chiếu.\n\n${verified||''}\n\n${message}`}];
  if(imageDataUrl && /^data:image\//i.test(imageDataUrl))content.push({type:'input_image',image_url:imageDataUrl,detail:'high'});
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:'gpt-5',reasoning:{effort:'high'},input:[{role:'user',content}],max_output_tokens:5000})});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok)throw new Error(data?.error?.message||('OpenAI HTTP '+r.status));
  return {answer:data.output_text||'Mình chưa có câu trả lời.',model:'gpt-5'};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const message=String(req.body?.message||'').trim(); if(!message)return json(res,400,{error:'Thiếu câu hỏi.'});
    const subject=String(req.body?.subject||'');
    const history=Array.isArray(req.body?.history)?req.body.history:[];
    const imageDataUrl=String(req.body?.imageDataUrl||'');
    const mode=subjectMode(subject,message);
    let verified=null;
    if(mode==='math'||mode==='physics'||mode==='chemistry'){
      try{
        const w=await wolfram(message);
        if(w.available)verified=w.result;
      }catch(e){verified=null}
    }
    try{
      const g=await gemini({message,subject,history,imageDataUrl,verified});
      return json(res,200,{...g,tool:verified?'WolframAlpha':'Gemini'});
    }catch(primary){
      const fallback=await openaiFallback({message,subject,history,imageDataUrl,verified}).catch(()=>null);
      if(fallback)return json(res,200,{...fallback,tool:verified?'WolframAlpha + OpenAI':'OpenAI fallback',warning:String(primary.message||primary)});
      return json(res,502,{error:String(primary.message||primary)});
    }
  }catch(e){return json(res,500,{error:e.message||'Không thể xử lý yêu cầu.'})}
}
