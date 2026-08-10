import { isAdminRequest } from "./admin-login.js";

const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const REPO = "anhkhoatran410-dev/H-c-T-p";
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

async function supabaseFetch(path){
  if(!SUPABASE_SERVICE_KEY) return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
      headers:{"Content-Type":"application/json",apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`},
      signal:AbortSignal.timeout(7000)
    });
    if(!r.ok)return null;
    return await r.json().catch(()=>null);
  }catch{return null}
}

async function supabaseInsert(row){
  if(!SUPABASE_SERVICE_KEY)return;
  try{await fetch(`${SUPABASE_URL}/rest/v1/admin_assistant_messages`,{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`},body:JSON.stringify(row),signal:AbortSignal.timeout(5000)});}catch{}
}

async function githubFile(path){
  try{
    const r=await fetch(`https://raw.githubusercontent.com/${REPO}/main/${path}`,{signal:AbortSignal.timeout(5000)});
    if(!r.ok)return null;
    return (await r.text()).slice(0,12000);
  }catch{return null}
}

async function projectContext(live){
  const codeFiles=[
    "index.html","app.js","public-enhancements.js","public-runtime-final.js",
    "admin/index.html","admin/app.js","admin-final-fix.js","admin-last-fix.js",
    "api/support-ai.js","api/admin-assistant.js"
  ];
  const [exams,participants,attempts,threads,accounts,rules,messages,...code]=await Promise.all([
    supabaseFetch("exams?select=id,title,subject,difficulty,duration,question_count,status,created_at&order=created_at.desc&limit=80"),
    supabaseFetch("participants?select=id,name,code,email,created_at&order=created_at.desc&limit=200"),
    supabaseFetch("user_attempts?select=id,device_id,exam_id,exam_title,student_name,student_code,score,correct,total,duration_seconds,auto_submitted,answers,wrong_indexes,created_at&order=created_at.desc&limit=200"),
    supabaseFetch("support_threads?select=id,device_id,student_name,account_id,status,last_message,unread_admin,unread_user,bot_waiting_admin,updated_at&order=updated_at.desc&limit=120"),
    supabaseFetch("support_accounts?select=id,name,handle,avatar,description,is_active,bot_enabled,created_at&order=created_at.asc"),
    supabaseFetch("support_bot_rules?select=id,account_id,keywords,reply,priority,enabled,created_at&order=priority.desc&limit=100"),
    supabaseFetch("support_messages?select=id,thread_id,account_id,sender,sender_name,message,attachment_type,sticker,created_at&order=created_at.desc&limit=250"),
    ...codeFiles.map(githubFile)
  ]);
  const sourceFiles={};codeFiles.forEach((name,i)=>{if(code[i])sourceFiles[name]=code[i]});
  return {
    project:{name:"STUDY TH",repository:REPO,architecture:"Vercel static HTML/CSS/JS + Vercel Functions + Supabase + Gemini",sourceFiles},
    ui:{pages:["home","subject","exam","result","history","review","support","admin"],adminTabs:["dashboard","support","participants","history","tests","accounts","bot","assistant"],themes:["light","dark"],mathQuestionTypes:["mcq","true_false","short"]},
    data:{exams:exams||[],participants:participants||[],recentAttempts:attempts||[],supportThreads:threads||[],supportAccounts:accounts||[],botRules:rules||[],recentSupportMessages:messages||[]},
    live:live||{}
  };
}

function cleanKey(raw){return String(raw||"").replace(/^['"`]+|['"`]+$/g,"").replace(/[\u0000-\u001f\u007f-\u009f]/g,"").trim()}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!isAdminRequest(req))return res.status(401).json({error:"Admin session required"});
  const message=String(req.body?.message||"").trim();
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-10):[];
  if(!message)return res.status(400).json({error:"Thiếu nội dung"});
  const key=cleanKey(process.env.GEMINI_API_KEY);
  if(!key)return res.status(500).json({error:"GEMINI_API_KEY chưa được cấu hình trên Vercel."});

  const context=await projectContext(req.body?.context||{});
  const contextJson=JSON.stringify(context);
  const system=`Bạn là STUDY Admin Copilot, trợ lý kỹ thuật riêng cho chủ website STUDY TH.
Bạn đang được cấp CONTEXT THẬT của website: dữ liệu Supabase hiện tại và mã nguồn các file quan trọng. Hãy đọc context trước khi trả lời; tuyệt đối không hỏi lại dữ liệu đã có trong context.
Bạn có thể: chẩn đoán lỗi, đọc dữ liệu người học/bài làm/chat, kiểm tra UX/UI, chỉ ra file và hàm cần sửa, viết patch HTML/CSS/JS/SQL/API cụ thể, và đề xuất cách triển khai an toàn.
Khi được hỏi "bạn có thể làm gì", hãy trả lời dựa trên khả năng và dữ liệu thật trong context, không dùng câu trả lời mẫu chung chung.
Khi người dùng báo lỗi, hãy xác định nguyên nhân có khả năng cao nhất từ code/context rồi đưa cách sửa cụ thể theo từng file.
Không được nói đã sửa hoặc deploy nếu request hiện tại không có thao tác ghi code. Không bịa dữ liệu. Nếu một dữ liệu không có trong context, nói rõ dữ liệu đó thiếu.
Chat hỗ trợ dùng Supabase realtime + polling fallback. Admin cần composer luôn hiện khi mở support. AI học tập dùng /api/support-ai. Admin Copilot dùng chính endpoint này.
Đề Toán hỗ trợ mcq (4 lựa chọn), true_false (4 mệnh đề) và short (4 ô đáp án ngắn).

CONTEXT JSON:\n${contextJson.slice(0,115000)}`;
  const transcript=history.map(x=>`${x.role||"user"}: ${String(x.content||x.message||"")}`).join("\n");
  const prompt=`${system}\n\nLịch sử gần đây:\n${transcript}\n\nYêu cầu mới của Admin:\n${message}`;

  let lastError="";
  try{
    for(const model of MODELS){
      try{
        const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
          method:"POST",
          headers:{"Content-Type":"application/json","x-goog-api-key":key},
          body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1800}}),
          signal:AbortSignal.timeout(18000)
        });
        const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
        if(response.ok){
          const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
          if(!answer)throw new Error("Gemini trả về rỗng.");
          await Promise.all([supabaseInsert({role:"user",message}),supabaseInsert({role:"assistant",message:answer})]);
          return res.status(200).json({answer,model,contextSummary:{exams:(context.data.exams||[]).length,participants:(context.data.participants||[]).length,attempts:(context.data.recentAttempts||[]).length,threads:(context.data.supportThreads||[]).length,messages:(context.data.recentSupportMessages||[]).length,sourceFiles:Object.keys(context.project.sourceFiles||{}).length}});
        }
        lastError=data?.error?.message||`Gemini HTTP ${response.status}`;
        if(![400,404,429,500,502,503].includes(response.status))break;
      }catch(e){lastError=e?.message||String(e)}
    }
    return res.status(502).json({error:lastError||"Gemini không phản hồi.",hint:"Kiểm tra GEMINI_API_KEY và quyền truy cập model trên Vercel."});
  }catch(e){return res.status(500).json({error:e?.message||"Không gọi được Admin Copilot"})}
}
