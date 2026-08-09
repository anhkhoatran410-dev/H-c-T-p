const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_KEY = "sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";
let db = null;

function loadSupabase(){
  return new Promise((resolve,reject)=>{
    if(window.supabase){ db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY); return resolve(db); }
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload=()=>{db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);resolve(db)};
    s.onerror=()=>reject(new Error("Không tải được Supabase JS"));
    document.head.appendChild(s);
  });
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function openTab(id){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");
  if(id==="tests") renderTests();
  if(id==="students") loadOnline();
  if(id==="dashboard") updateStats();
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>openTab(b.dataset.tab));

document.getElementById("file")?.addEventListener("change",e=>{
  document.getElementById("fileName").textContent=e.target.files[0]?.name||"Chưa chọn file";
});

async function createExam(){
  const file=document.getElementById("file")?.files[0];
  const title=document.getElementById("title")?.value.trim();
  const msg=document.getElementById("msg");
  const subject=document.getElementById("subject")?.value||"";
  const difficulty=document.getElementById("level")?.value||"Trung bình";
  const duration=Number(document.getElementById("minutes")?.value||0);
  const questionCount=Number(document.getElementById("questions")?.value||0);
  const types=[...document.querySelectorAll('input[name="questionType"]:checked')].map(x=>x.value);
  if(!file) return msg.textContent="⚠️ Hãy chọn tài liệu.";
  if(!title) return msg.textContent="⚠️ Hãy đặt tên bài kiểm tra.";
  if(!questionCount) return msg.textContent="⚠️ Hãy nhập số câu.";
  if(!types.length) return msg.textContent="⚠️ Chọn ít nhất một dạng câu hỏi.";
  try{
    msg.textContent="⏳ Đang đọc tài liệu và nhờ AI tạo câu hỏi...";
    const buf=await file.arrayBuffer();
    const bytes=new Uint8Array(buf);
    let binary="";
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    const fileData=btoa(binary);
    const aiRes=await fetch("/api/generate-exam",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:file.name,mimeType:file.type||"application/pdf",fileData,subject,difficulty,questionCount,types})});
    const ai=await aiRes.json();
    if(!aiRes.ok) throw new Error(ai.error||"AI không tạo được đề");
    const questions=ai.questions||[];
    if(questions.length!==questionCount) throw new Error(`AI tạo ${questions.length}/${questionCount} câu.`);
    await loadSupabase();
    const {data,error}=await db.from("exams").insert({title,subject,difficulty,duration,question_count:questionCount,questions,status:"active"}).select().single();
    if(error) throw error;
    console.log("Exam đã tạo",data);
    msg.textContent=`✅ Đã tạo ${questions.length} câu và lưu bài kiểm tra.`;
    document.getElementById("title").value="";
    document.getElementById("file").value="";
    document.getElementById("fileName").textContent="Chưa chọn file";
    await renderTests(); await updateStats();
  }catch(e){console.error(e);msg.textContent="❌ "+e.message;}
}
document.getElementById("createBtn")?.addEventListener("click",createExam);

async function renderTests(){
  const box=document.getElementById("testList"); if(!box)return;
  try{await loadSupabase();const {data,error}=await db.from("exams").select("*").order("created_at",{ascending:false});if(error)throw error;
    box.innerHTML=data?.length?data.map(t=>`<div class="test"><div><h3>${esc(t.title||"Chưa đặt tên")}</h3><p>${esc(t.subject||"—")} · ${esc(t.difficulty||"—")} · ${Number(t.question_count||0)} câu · ${Number(t.duration||0)} phút</p></div><span class="badge">${esc(t.status||"active")}</span></div>`).join(""):"Chưa có bài kiểm tra.";
  }catch(e){console.error(e);box.innerHTML="🔴 Không đọc được bài kiểm tra từ Supabase.";}
}
async function updateStats(){
  try{await loadSupabase();
    const {data:exams}=await db.from("exams").select("id"); document.getElementById("statTests").textContent=exams?.length||0;
    const {data:ps}=await db.from("participants").select("id"); document.getElementById("statStudents").textContent=ps?.length||0;
    const {data:as}=await db.from("attempts").select("id"); document.getElementById("statAttempts").textContent=as?.length||0;
  }catch(e){console.error(e)}
}
async function loadOnline(){
  try{await loadSupabase();
    const [{data:ps,error:pe},{data:as,error:ae}]=await Promise.all([db.from("participants").select("*").order("created_at",{ascending:false}),db.from("attempts").select("*").order("created_at",{ascending:false})]);
    if(pe)throw pe;if(ae)throw ae;window.onlineParticipants=ps||[];window.onlineAttempts=as||[];
    document.getElementById("onlineStatus").textContent="🟢 Supabase đã kết nối";renderStudents();
  }catch(e){console.error(e);document.getElementById("onlineStatus").textContent="🔴 Chưa đọc được dữ liệu Supabase";renderStudents();}
}
function pick(o,n){for(const k of n)if(o?.[k]!==undefined&&o?.[k]!==null&&o?.[k]!=="")return o[k];return ""}
function renderStudents(){
  const box=document.getElementById("studentList");if(!box)return;const ps=window.onlineParticipants||[],as=window.onlineAttempts||[];
  if(!ps.length&&!as.length){box.innerHTML="Chưa có dữ liệu người tham gia/lượt làm bài trên Supabase.";return;}
  box.innerHTML=`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><tr><th>Người tham gia</th><th>Lượt làm</th><th>Mã / Email</th></tr>${ps.map(p=>{const id=pick(p,["id","participant_id"]);const count=as.filter(a=>String(pick(a,["participant_id","participantId","user_id","userId"]))===String(id)).length;return `<tr><td>${esc(pick(p,["name","full_name","student_name","username"])||"Không tên")}</td><td>${count||pick(p,["attempts_count"])||0}</td><td>${esc(String(pick(p,["code","student_code","email"])||"—"))}</td></tr>`}).join("")}</table></div>`;
  const rb=document.getElementById("attemptList");if(rb)rb.innerHTML=as.slice(0,100).map(a=>`<div class="test"><div><b>${esc(String(pick(a,["student_name","name","candidate","participant_name"])||"Không tên"))}</b><p>${esc(String(pick(a,["exam_title","exam_name","title","exam"])||"—"))} · Điểm: ${esc(String(pick(a,["score","points","result"])||"—"))}</p></div><span class="badge">${a.created_at?esc(new Date(a.created_at).toLocaleString("vi-VN")):"—"}</span></div>`).join("");
}
(async()=>{await updateStats();await renderTests();await loadOnline()})();
