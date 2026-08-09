export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try{
    const {question,userAnswer,correctAnswer,explanation,subject}=req.body||{};
    if(!question)return res.status(400).json({error:"Thiếu câu hỏi"});
    const key=String(process.env.GEMINI_API_KEY||"").replace(/^['"`]+|['"`]+$/g,"").replace(/[\u0000-\u0020\u007f-\u009f]/g,"").trim();
    if(!key)return res.status(500).json({error:"GEMINI_API_KEY chưa được cấu hình."});
    const prompt=`Bạn là gia sư AI. Hãy giúp học sinh sửa một câu sai.\nMôn: ${subject||"tự xác định"}\nCâu hỏi: ${JSON.stringify(question)}\nHọc sinh trả lời: ${JSON.stringify(userAnswer)}\nĐáp án đúng: ${JSON.stringify(correctAnswer)}\nGiải thích hiện có: ${JSON.stringify(explanation||"")}\n\nHãy kiểm tra lại đáp án dựa trên câu hỏi. Nếu đáp án đúng trong dữ liệu có vẻ sai, hãy nói rõ và đưa đáp án đúng hơn. Trả JSON thuần theo cấu trúc: {"whyWrong":"...","correctAnswer":"...","explanation":"...","memoryTip":"...","practice":{"question":"...","options":["...","...","...","..."],"answer":0}}. Câu luyện tập phải tương tự kiến thức, không quá dễ, và chỉ có một đáp án đúng.`;
    const models=["gemini-3.5-flash-lite","gemini-3.6-flash"];
    let last=null;
    for(const model of models){
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}})});
      const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{}
      if(!r.ok){last=new Error(`Gemini ${r.status}: ${d?.error?.message||raw.slice(0,200)}`);if(r.status===404||r.status>=500||r.status===429)continue;throw last}
      const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim()||"";
      try{return res.status(200).json(JSON.parse(text.replace(/^```json\s*/i,"").replace(/\s*```$/,"")))}catch{throw new Error("Gemini trả về JSON không hợp lệ.")}
    }
    throw last||new Error("Không gọi được Gemini.");
  }catch(e){console.error("review-wrong",e);return res.status(500).json({error:e.message||"Lỗi máy chủ."})}
}
