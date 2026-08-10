import { isAdminRequest } from "./admin-login.js";

const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const REPO = "anhkhoatran410-dev/H-c-T-p";
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

async function supabaseFetch(path, options={}){
  if(!SUPABASE_SERVICE_KEY) return null;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    ...options,
    headers:{...(options.headers||{}),"Content-Type":"application/json",apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}
  });
  if(!r.ok)return null;
  return r.json().catch(()=>null);
}

async function supabaseInsert(row){
  if(!SUPABASE_SERVICE_KEY)return;
  await fetch(`${SUPABASE_URL}/rest/v1/admin_assistant_messages`,{
    method:"POST",
    headers:{"Content-Type":"application/json",apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`},
    body:JSON.stringify(row)
  });
}

async function githubFile(path){
  try{
    const r=await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path}`);
    if(!r.ok)return null;
    return (await r.text()).slice(0,18000);
  }catch{return null}
}

async function projectContext(clientContext){
  const codeFiles=[
    "index.html","app.js","app-loader.js","support-fix.js","public-enhancements.js","public-final-fix.js","public-hardening.js","public-last-fix.js","public-runtime-final.js",
    "admin/index.html","admin/app.js","admin-final-fix.js","admin-last-fix.js","admin-final-fix.css","admin-hardening.js"
  ];
  const [exams,participants,attempts,threads,accounts,rules,messages,...code] = await Promise.all([
    supabaseFetch("exams?select=id,title,subject,difficulty,duration,question_count,status,created_at&order=created_at.desc&limit=100"),
    supabaseFetch("participants?select=id,name,code,email,created_at&order=created_at.desc&limit=300"),
    supabaseFetch("user_attempts?select=id,device_id,exam_id,exam_title,student_name,student_code,score,correct,total,duration_seconds,auto_submitted,answers,wrong_indexes,created_at&order=created_at.desc&limit=300"),
    supabaseFetch("support_threads?select=id,device_id,student_name,account_id,status,last_message,unread_admin,unread_user,bot_waiting_admin,updated_at&order=updated_at.desc&limit=200"),
    supabaseFetch("support_accounts?select=id,name,handle,avatar,description,is_active,bot_enabled,created_at&order=created_at.asc"),
    supabaseFetch("support_bot_rules?select=id,account_id,keywords,reply,priority,enabled,created_at&order=priority.desc"),
    supabaseFetch("support_messages?select=id,thread_id,account_id,sender,sender_name,message,attachment_type,sticker,created_at&order=created_at.desc&limit=500"),
    ...codeFiles.map(githubFile)
  ]);
  const sourceFiles={};codeFiles.forEach((name,i)=>{if(code[i])sourceFiles[name]=code[i]});
  return {
    project:{name:"STUDY TH",repository:REPO,architecture:"Vercel static HTML/CSS/JS + Vercel Functions + Supabase + Gemini",sourceFiles},
    ui:{pages:["home","subject","exam","result","history","review","support","admin"],adminTabs:["dashboard","support","participants","history","tests","accounts","bot","assistant"],themes:["light","dark"],mathQuestionTypes:["mcq","true_false","short"]},
    data:{exams:exams||[],participants:participants||[],recentAttempts:attempts||[],supportThreads:threads||[],supportAccounts:accounts||[],botRules:rules||[],recentSupportMessages:messages||[]},
    live:clientContext||{}
  };
}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!isAdminRequest(req))return res.status(401).json({error:"Admin session required"});
  const message=String(req.body?.message||"").trim();
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-12):[];
  if(!message)return res.status(400).json({error:"Thiếu nội dung"});
  const key=String(process.env.GEMINI_API_KEY||"").trim();
  if(!key)return res.status(500).json({error:"GEMINI_API_KEY chưa được cấu hình trên Vercel."});

  const context=await projectContext(req.body?.context||{});
  const system=`Bạn là STUDY Admin Copilot, trợ lý kỹ thuật riêng cho chủ website STUDY TH.
Bạn được cung cấp dữ liệu hệ thống thật ở CONTEXT bên dưới. Hãy dùng nó thay vì hỏi lại những thứ đã có.
Bạn có thể phân tích dữ liệu, tìm lỗi logic, đề xuất và viết thay đổi HTML/CSS/JS/SQL/API cụ thể.
Không được nói đã sửa code/deploy nếu request hiện tại không thực sự có công cụ ghi code.
Khi người dùng yêu cầu chỉnh giao diện, hãy xác định đúng file/khu vực cần sửa và đưa patch hoặc mã thay thế rõ ràng.
Ưu tiên kiến trúc hiện tại: Vercel HTML/CSS/JS + Vercel Functions, Supabase realtime/database, Gemini.
Các bảng quan trọng: exams, user_attempts, participants, support_threads, support_messages, support_accounts, support_bot_rules, admin_assistant_messages.
Chat hỗ trợ phải realtime nhưng luôn có polling fallback; Admin phải có composer luôn hiển thị khi mở cuộc trò chuyện.
Đề Toán hỗ trợ 3 dạng: mcq (4 lựa chọn), true_false (4 mệnh đề), short (4 ô ký tự/đáp án ngắn).
Không tự bịa dữ liệu. Nếu cần dữ liệu không có trong CONTEXT, nói rõ phần nào còn thiếu.

CONTEXT JSON:\n${JSON.stringify(context).slice(0,140000)}`;
  const transcript=history.map(x=>`${x.role||"user"}: ${String(x.content||x.message||"")}`).join("\n");
  const prompt=`${system}\n\nLịch sử gần đây:\n${transcript}\n\nYêu cầu mới của Admin:\n${message}`;

  try{
    let last="";
    for(const model of MODELS){
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1800}})
      });
      const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{}
      if(response.ok){
        const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim()||"Mình chưa có câu trả lời.";
        await Promise.all([supabaseInsert({role:"user",message}),supabaseInsert({role:"assistant",message:answer})]);
        return res.status(200).json({answer,model,contextSummary:{exams:(context.data.exams||[]).length,participants:(context.data.participants||[]).length,attempts:(context.data.recentAttempts||[]).length,threads:(context.data.supportThreads||[]).length,messages:(context.data.recentSupportMessages||[]).length}});
      }
      last=data?.error?.message||`Gemini HTTP ${response.status}`;
      if(![400,404,429,500,502,503].includes(response.status))break;
    }
    return res.status(502).json({error:last||"Gemini không phản hồi."});
  }catch(e){return res.status(500).json({error:e.message||"Không gọi được Admin Copilot"})}
}
