import { isAdminRequest } from "./admin-login.js";

const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function supabaseInsert(row){
  if(!SUPABASE_SERVICE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/admin_assistant_messages`,{
    method:"POST",
    headers:{"Content-Type":"application/json","apikey":SUPABASE_SERVICE_KEY,"Authorization":`Bearer ${SUPABASE_SERVICE_KEY}`},
    body:JSON.stringify(row)
  });
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!isAdminRequest(req)) return res.status(401).json({error:"Admin session required"});
  const message=String(req.body?.message||"").trim();
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-12):[];
  if(!message) return res.status(400).json({error:"Thiếu nội dung"});
  const key=String(process.env.GEMINI_API_KEY||"").trim();
  if(!key) return res.status(500).json({error:"GEMINI_API_KEY chưa được cấu hình trên Vercel."});

  const system=`Bạn là STUDY Admin Copilot, trợ lý kỹ thuật riêng cho chủ website STUDY TEST AI.
Mục tiêu: giúp quản trị viên phân tích lỗi, đề xuất nâng cấp, bảo trì và thiết kế UX/UI.
Bạn không được tự nhận là đã sửa code hay đã deploy nếu không có công cụ thực hiện việc đó.
Khi được yêu cầu thay đổi hệ thống, hãy trả lời theo 3 phần ngắn: (1) chẩn đoán, (2) việc cần sửa, (3) kiểm tra sau khi sửa.
Ưu tiên kiến trúc hiện tại: HTML/CSS/JS tĩnh trên Vercel, Supabase cho dữ liệu/realtime, Gemini qua Vercel Functions.
Giữ giao diện nhẹ, mượt, responsive, có light/dark theme và không làm mất nội dung khi đổi theme.
`;
  const transcript=history.map(x=>`${x.role||"user"}: ${String(x.content||x.message||"")}`).join("\n");
  const prompt=`${system}\n\nLịch sử gần đây:\n${transcript}\n\nYêu cầu mới của Admin:\n${message}`;

  try{
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.35,maxOutputTokens:1200}})
    });
    const raw=await response.text();
    let data={}; try{data=JSON.parse(raw)}catch{}
    if(!response.ok) return res.status(502).json({error:data?.error?.message||`Gemini HTTP ${response.status}`});
    const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim()||"Mình chưa có câu trả lời.";
    await Promise.all([supabaseInsert({role:"user",message}),supabaseInsert({role:"assistant",message:answer})]);
    return res.status(200).json({answer});
  }catch(e){
    return res.status(500).json({error:e.message||"Không gọi được Admin Copilot"});
  }
}
