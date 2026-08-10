const MODEL='gemini-3.5-flash-lite';
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const message=String(req.body?.message||'').trim();
  if(!message)return res.status(400).json({error:'Thiếu câu hỏi.'});
  const key=String(process.env.GEMINI_API_KEY||'').replace(/^['"`]+|['"`]+$/g,'').trim();
  if(!key)return res.status(500).json({error:'GEMINI_API_KEY chưa được cấu hình trên Vercel.'});
  const subject=String(req.body?.subject||'').trim();
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-8):[];
  const system=`Bạn là AI hỗ trợ học tập của STUDY TH. Trả lời bằng tiếng Việt, thân thiện, ngắn gọn nhưng đủ bước. Bạn có thể giải thích kiến thức, hướng dẫn cách làm bài, sửa lỗi tư duy và hướng dẫn sử dụng website. Nếu câu hỏi là toán học, dùng ký hiệu Unicode/LaTeX rõ ràng như ∞, √, x², ≤, ≥ khi phù hợp. Không bịa dữ liệu của website. Nếu không biết một thông tin nội bộ, nói rõ rằng cần Admin kiểm tra. Không tự nhận là Admin.`;
  const prompt=`${system}\nMôn hiện tại: ${subject||'chưa chọn'}\nLịch sử chat:\n${history.map(x=>`${x.role||'user'}: ${String(x.message||'')}`).join('\n')}\nCâu hỏi mới: ${message}`;
  try{
    const models=[MODEL,'gemini-3.6-flash'];let last='';
    for(const model of models){
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.35,maxOutputTokens:900}})});
      const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
      if(r.ok){const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'Mình chưa có câu trả lời.';return res.status(200).json({answer})}
      last=data?.error?.message||`Gemini HTTP ${r.status}`;
      if(r.status!==404)break;
    }
    return res.status(502).json({error:last||'Gemini không phản hồi.'});
  }catch(e){return res.status(500).json({error:e.message||'Không gọi được AI hỗ trợ.'})}
}
