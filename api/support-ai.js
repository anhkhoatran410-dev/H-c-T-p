const MODELS=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite'];

function cleanKey(value){
  return String(value||'')
    .replace(/^['"`]+|['"`]+$/g,'')
    .replace(/[\u0000-\u0020\u007f-\u009f]/g,'')
    .trim();
}

function providerMessage(data,status){
  return data?.error?.message || data?.message || `Gemini HTTP ${status}`;
}

function extractInteractionText(data){
  const direct=String(data?.output_text||'').trim();
  if(direct)return direct;
  const outputs=Array.isArray(data?.outputs)?data.outputs:[];
  for(const item of outputs){
    const text=Array.isArray(item?.content)
      ? item.content.filter(x=>x?.type==='text').map(x=>String(x.text||'')).join(' ').trim()
      : '';
    if(text)return text;
  }
  const steps=Array.isArray(data?.steps)?data.steps:[];
  for(let i=steps.length-1;i>=0;i--){
    const content=steps[i]?.content;
    const text=Array.isArray(content)
      ? content.filter(x=>x?.type==='text').map(x=>String(x.text||'')).join(' ').trim()
      : '';
    if(text)return text;
  }
  return '';
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const message=String(req.body?.message||'').trim();
  if(!message)return res.status(400).json({error:'Thiếu câu hỏi.'});

  const key=cleanKey(process.env.GEMINI_API_KEY);
  if(!key)return res.status(500).json({error:'GEMINI_API_KEY chưa được cấu hình trên Vercel.'});
  const badIndex=[...key].findIndex(ch=>ch.charCodeAt(0)>127);
  if(badIndex>=0)return res.status(500).json({error:`GEMINI_API_KEY trên Vercel chứa ký tự không hợp lệ tại vị trí ${badIndex}.`});

  const subject=String(req.body?.subject||'').trim();
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-8):[];
  const system=`Bạn là AI hỗ trợ học tập của STUDY TH. Trả lời bằng tiếng Việt, thân thiện, ngắn gọn nhưng đủ bước. Bạn có thể giải thích kiến thức, hướng dẫn cách làm bài, sửa lỗi tư duy và hướng dẫn sử dụng website. Không bịa dữ liệu của website. Nếu câu hỏi cần dữ liệu nội bộ mà bạn không được cung cấp, nói rõ rằng cần Admin kiểm tra. Không tự nhận là Admin.

QUY TẮC ĐỊNH DẠNG TOÁN BẮT BUỘC:
- Mọi công thức toán phải dùng LaTeX có delimiter. Công thức inline bắt buộc viết dạng \\( ... \\). Công thức đứng riêng/bảng công thức bắt buộc viết dạng \\[ ... \\].
- Không được trả về LaTeX trần như \\frac{a}{b}, \\sqrt{x}, x^2 hoặc \\infty bên ngoài delimiter.
- Có thể dùng Unicode đơn giản như ∞, √, ≤, ≥, × khi không cần công thức LaTeX.
- Khi có phân số, căn, đạo hàm, tích phân, giới hạn, ma trận hoặc công thức nhiều bước, ưu tiên LaTeX có delimiter để giao diện KaTeX render chính xác.`;
  const prompt=`${system}\nMôn hiện tại: ${subject||'chưa chọn'}\nLịch sử chat:\n${history.map(x=>`${x.role||'user'}: ${String(x.message||'')}`).join('\n')}\nCâu hỏi mới: ${message}`;

  let last='';
  try{
    // Primary path: Gemini Interactions API, the current recommended API for new apps.
    const interaction=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-goog-api-key':key,
        'Api-Revision':'2026-05-20'
      },
      body:JSON.stringify({model:'gemini-3.8-flash',store:false,input:prompt})
    });
    const raw=await interaction.text();
    let data={};
    try{data=raw?JSON.parse(raw):{}}catch{}
    if(interaction.ok){
      const answer=extractInteractionText(data);
      if(answer)return res.status(200).json({answer,model:data?.model||'gemini-3.8-flash',api:'interactions'});
      last='Interactions API trả về rỗng.';
    }else{
      last=providerMessage(data,interaction.status);
    }

    // Compatibility fallback for transient/provider issues.
    for(const model of MODELS){
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
        method:'POST',
        headers:{'Content-Type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({
          contents:[{role:'user',parts:[{text:prompt}]}],
          generationConfig:{maxOutputTokens:1200}
        })
      });
      const raw2=await r.text();
      let data2={};
      try{data2=raw2?JSON.parse(raw2):{}}catch{}
      if(r.ok){
        const answer=data2?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
        if(answer)return res.status(200).json({answer,model});
        last=`${model}: AI trả về rỗng.`;
      }else{
        last=providerMessage(data2,r.status);
        if(![400,404,408,409,425,429,500,502,503,504].includes(r.status))break;
      }
    }

    return res.status(502).json({error:last||'Gemini không phản hồi.'});
  }catch(e){
    return res.status(500).json({error:e?.message||'Không gọi được AI hỗ trợ.'});
  }
}
