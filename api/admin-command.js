import { isAdminRequest } from "./admin-login.js";

const SUPABASE_URL=String(process.env.SUPABASE_URL||"https://mlqaeginqsgqacdqdzbm.supabase.co");
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
const GEMINI_KEY=String(process.env.GEMINI_API_KEY||"").trim();

async function sb(path,options={}){
  if(!SERVICE_KEY)throw new Error("SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên Vercel.");
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})},...options});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data=text}
  if(!r.ok)throw new Error(data?.message||data?.error||`Supabase HTTP ${r.status}`);
  return data;
}
async function askGemini(message,history){
  if(!GEMINI_KEY)throw new Error("GEMINI_API_KEY chưa được cấu hình trên Vercel.");
  const prompt=`Bạn là bộ điều khiển Admin Copilot của STUDY TEST AI. Chỉ chọn hành động trong danh sách sau và trả JSON thuần, không markdown.
Hành động: none, inspect_dashboard, list_participants, list_exams, toggle_bot, reply_support, archive_thread, rename_exam.
Quy tắc:
- inspect_dashboard: kiểm tra tổng số đề, người tham gia, lượt làm, tin chưa đọc.
- list_participants: lấy danh sách người tham gia/hoạt động gần nhất.
- list_exams: lấy danh sách đề.
- toggle_bot: bật/tắt bot cho một kênh hỗ trợ. target là tên hoặc handle; value là on/off.
- reply_support: gửi tin nhắn cho một cuộc chat. target là tên người dùng hoặc id; reply là nội dung cần gửi.
- archive_thread: lưu trữ cuộc chat. target là tên người dùng hoặc id.
- rename_exam: đổi tên đề. target là tên đề hiện tại; value là tên mới.
- Nếu yêu cầu chỉ hỏi/giải thích, dùng none.
JSON: {"action":"none","target":"","value":"","reply":""}
Yêu cầu: ${message}
Lịch sử: ${JSON.stringify(history||[]).slice(0,9000)}`;
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":GEMINI_KEY},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:.1,responseMimeType:"application/json"}})});
  const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
  if(!r.ok)throw new Error(data?.error?.message||`Gemini HTTP ${r.status}`);
  const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim()||"{}";
  return JSON.parse(text.replace(/^```json\s*/i,"").replace(/\s*```$/,""));
}
function first(v){return Array.isArray(v)?v[0]:v}
function answer(title,lines){return `(1) ${title}\n${lines.map(x=>`- ${x}`).join("\n")}`}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!isAdminRequest(req))return res.status(401).json({error:"Admin session required"});
  const message=String(req.body?.message||"").trim();
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-14):[];
  if(!message)return res.status(400).json({error:"Thiếu nội dung"});
  try{
    const plan=await askGemini(message,history);
    const action=String(plan.action||"none");
    if(action==="inspect_dashboard"){
      const [exams,people,attempts,threads]=await Promise.all([sb("exams?select=id"),sb("participants?select=id"),sb("user_attempts?select=id"),sb("support_threads?select=unread_admin")]);
      const unread=(threads||[]).reduce((s,x)=>s+Number(x.unread_admin||0),0);
      return res.json({action,actionLabel:"Đã kiểm tra hệ thống",answer:answer("Tổng quan hệ thống",[`Bài kiểm tra: ${exams.length}`,`Người tham gia: ${people.length}`,`Lượt làm bài: ${attempts.length}`,`Tin hỗ trợ chưa đọc: ${unread}`])});
    }
    if(action==="list_participants"){
      const attempts=await sb("user_attempts?select=student_name,student_code,device_id,score,correct,total,created_at&order=created_at.desc&limit=100");
      const map=new Map();for(const a of attempts){const key=String(a.student_code||a.device_id||a.student_name||"");if(!key)continue;const x=map.get(key)||{name:a.student_name||"Không tên",code:a.student_code||a.device_id,count:0,score:a.score,at:a.created_at};x.count++;if(new Date(a.created_at)>new Date(x.at)){x.score=a.score;x.at=a.created_at}map.set(key,x)}
      const lines=Array.from(map.values()).slice(0,12).map(x=>`${x.name} · ${x.code||"—"} · ${x.count} lượt · ${x.score??0}%`);
      return res.json({action,actionLabel:"Đã đọc danh sách người tham gia",answer:answer(`Có ${map.size} người tham gia`,lines.length?lines:["Chưa có lượt làm bài nào."])});
    }
    if(action==="list_exams"){
      const exams=await sb("exams?select=id,title,subject,question_count,duration,status,created_at&order=created_at.desc&limit=20");
      const lines=exams.map(x=>`${x.title} · ${x.subject||"—"} · ${x.question_count||0} câu · ${x.duration||0} phút · ${x.status||"active"}`);
      return res.json({action,actionLabel:"Đã đọc danh sách đề",answer:answer(`Có ${exams.length} đề`,lines.length?lines:["Chưa có đề."])});
    }
    if(action==="toggle_bot"){
      const target=String(plan.target||"").trim();const value=String(plan.value||"").toLowerCase();
      if(!target||!["on","off"].includes(value))throw new Error("Chưa xác định rõ kênh và trạng thái bot.");
      const rows=await sb(`support_accounts?or=(name.ilike.*${encodeURIComponent(target)}*,handle.ilike.*${encodeURIComponent(target)}*)&select=id,name,handle`);
      const acc=first(rows);if(!acc)throw new Error(`Không tìm thấy kênh hỗ trợ “${target}”.`);
      await sb(`support_accounts?id=eq.${acc.id}`,{method:"PATCH",body:JSON.stringify({bot_enabled:value==="on",updated_at:new Date().toISOString()})});
      return res.json({action,actionLabel:`Đã ${value==="on"?"bật":"tắt"} bot`,answer:answer("Đã cập nhật bot",[`Kênh: ${acc.name} (@${acc.handle||"—"})`,`Trạng thái: ${value==="on"?"BẬT":"TẮT"}`])});
    }
    if(action==="reply_support"){
      const target=String(plan.target||"").trim(),reply=String(plan.reply||"").trim();if(!target||!reply)throw new Error("Thiếu người nhận hoặc nội dung trả lời.");
      const rows=await sb(`support_threads?or=(id.eq.${encodeURIComponent(target)},student_name.ilike.*${encodeURIComponent(target)}*)&select=id,student_name,account_id&order=updated_at.desc&limit=5`);
      const thread=first(rows);if(!thread)throw new Error(`Không tìm thấy cuộc chat của “${target}”.`);
      await sb("support_messages",{method:"POST",body:JSON.stringify({thread_id:thread.id,account_id:thread.account_id||null,sender:"admin",sender_name:"Admin",message:reply})});
      return res.json({action,actionLabel:"Đã gửi tin nhắn",answer:answer("Đã xử lý chat",[`Người nhận: ${thread.student_name||target}`,`Nội dung: ${reply}`])});
    }
    if(action==="archive_thread"){
      const target=String(plan.target||"").trim();if(!target)throw new Error("Thiếu cuộc chat cần lưu trữ.");
      const rows=await sb(`support_threads?or=(id.eq.${encodeURIComponent(target)},student_name.ilike.*${encodeURIComponent(target)}*)&select=id,student_name&order=updated_at.desc&limit=5`);const thread=first(rows);if(!thread)throw new Error(`Không tìm thấy cuộc chat “${target}”.`);
      await sb(`support_threads?id=eq.${thread.id}`,{method:"PATCH",body:JSON.stringify({archived:true,updated_at:new Date().toISOString()})});
      return res.json({action,actionLabel:"Đã lưu trữ cuộc chat",answer:answer("Đã lưu trữ",[`Cuộc chat: ${thread.student_name||target}`])});
    }
    if(action==="rename_exam"){
      const target=String(plan.target||"").trim(),value=String(plan.value||"").trim();if(!target||!value)throw new Error("Thiếu tên đề cũ hoặc tên mới.");
      const rows=await sb(`exams?title=ilike.*${encodeURIComponent(target)}*&select=id,title&order=created_at.desc&limit=5`);const exam=first(rows);if(!exam)throw new Error(`Không tìm thấy đề “${target}”.`);
      await sb(`exams?id=eq.${exam.id}`,{method:"PATCH",body:JSON.stringify({title:value})});
      return res.json({action,actionLabel:"Đã đổi tên đề",answer:answer("Đã cập nhật bài kiểm tra",[`Tên cũ: ${exam.title}`,`Tên mới: ${value}`])});
    }
    return res.json({action:"none",actionLabel:"Không có thao tác hệ thống",answer:answer("Phân tích",["Mình đã phân tích yêu cầu nhưng không tự ý thay đổi dữ liệu.","Bạn có thể yêu cầu rõ thao tác như: kiểm tra người tham gia, tắt bot Kỹ thuật, trả lời cuộc chat của một người, lưu trữ chat hoặc đổi tên đề."]) });
  }catch(e){return res.status(500).json({error:e.message||"Admin Copilot không thực hiện được yêu cầu."})}
}
