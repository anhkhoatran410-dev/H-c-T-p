const SUPABASE_URL="https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_KEY="sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";
const KEY="study_admin_tests_v1";

const getTests=()=>JSON.parse(localStorage.getItem(KEY)||"[]");
const saveTests=x=>localStorage.setItem(KEY,JSON.stringify(x));

let db=null;
function loadSupabase(){
  return new Promise((resolve,reject)=>{
    if(window.supabase){db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return resolve(db)}
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload=()=>{db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);resolve(db)};
    s.onerror=()=>reject(new Error("Không tải được Supabase JS"));
    document.head.appendChild(s);
  });
}

async function loadOnline(){
  const status=document.getElementById("onlineStatus");
  try{
    await loadSupabase();
    const [{data:participants,error:pErr},{data:attempts,error:aErr}]=await Promise.all([
      db.from("participants").select("*").order("created_at",{ascending:false}),
      db.from("attempts").select("*").order("created_at",{ascending:false})
    ]);
    if(pErr) throw pErr;
    if(aErr) throw aErr;
    window.onlineParticipants=participants||[];
    window.onlineAttempts=attempts||[];
    if(status) status.textContent="🟢 Supabase đã kết nối";
    updateOnlineStats();
    renderStudents();
  }catch(e){
    console.error(e);
    if(status) status.textContent="🔴 Chưa đọc được dữ liệu Supabase";
    updateOnlineStats();
    renderStudents();
  }
}

function openTab(id){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  const nav=document.querySelector(`[data-tab="${id}"]`); if(nav) nav.classList.add("active");
  if(id==="tests") renderTests();
  if(id==="students") renderStudents();
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>openTab(b.dataset.tab));

document.getElementById("file").onchange=e=>{
  document.getElementById("fileName").textContent=e.target.files[0]?.name||"Chưa chọn file";
};

document.getElementById("createBtn").onclick=()=>{
  const file=document.getElementById("file").files[0];
  const title=document.getElementById("title").value.trim();
  const msg=document.getElementById("msg");
  if(!file) return msg.textContent="⚠️ Hãy chọn tài liệu.";
  if(!title) return msg.textContent="⚠️ Hãy đặt tên bài kiểm tra.";
  const test={
    id:crypto.randomUUID(),title,subject:subject.value,level:level.value,
    minutes:Number(minutes.value),questions:Number(questions.value),
    type:type.value,sourceFile:file.name,createdAt:new Date().toISOString(),status:"Bản nháp"
  };
  const tests=getTests(); tests.unshift(test); saveTests(tests);
  msg.textContent="✅ Đã tạo khung bài kiểm tra.";
  document.getElementById("title").value="";
  renderTests(); updateStats();
};

function renderTests(){
  const box=document.getElementById("testList"), tests=getTests();
  if(!tests.length){box.innerHTML='<div class="panel">Chưa có bài kiểm tra.</div>';return}
  box.innerHTML=tests.map(t=>`<div class="test"><div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.subject)} · ${escapeHtml(t.level)} · ${t.questions} câu · ${t.minutes} phút · ${escapeHtml(t.sourceFile)}</p></div><span class="badge">${escapeHtml(t.status)}</span></div>`).join("");
}

function pick(obj,names){for(const n of names) if(obj && obj[n]!==undefined && obj[n]!==null && obj[n]!=="") return obj[n];return ""}
function updateOnlineStats(){
  const ps=window.onlineParticipants||[], as=window.onlineAttempts||[];
  const s=document.getElementById("statStudents"), a=document.getElementById("statAttempts");
  if(s)s.textContent=ps.length;
  if(a)a.textContent=as.length;
}
function renderStudents(){
  const box=document.getElementById("studentList"); if(!box)return;
  const ps=window.onlineParticipants||[], as=window.onlineAttempts||[];
  if(!ps.length && !as.length){box.innerHTML='<p class="muted">Chưa có dữ liệu người tham gia/lượt làm bài trên Supabase.</p>';return}
  const rows=ps.map(p=>{
    const name=pick(p,["name","full_name","student_name","username"])||"Không tên";
    const id=pick(p,["id","participant_id"]);
    const related=as.filter(x=>String(pick(x,["participant_id","participantId","user_id","userId"]))===String(id));
    const attempts=related.length || pick(p,["attempts_count"] ) || 0;
    return `<tr><td>${escapeHtml(name)}</td><td>${attempts}</td><td>${escapeHtml(String(pick(p,["code","student_code","email"])||"—"))}</td></tr>`;
  }).join("");
  box.innerHTML=`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><tr><th>Người tham gia</th><th>Lượt làm</th><th>Mã / Email</th></tr>${rows}</table></div>`;
  if(as.length){
    const resultBox=document.getElementById("attemptList");
    if(resultBox) resultBox.innerHTML=as.slice(0,100).map(x=>{
      const name=pick(x,["student_name","name","candidate","participant_name"])||"Không tên";
      const exam=pick(x,["exam_title","exam_name","title","exam"])||"—";
      const score=pick(x,["score","points","result"]);
      const time=pick(x,["submitted_at","completed_at","created_at"]);
      return `<div class="test"><div><b>${escapeHtml(String(name))}</b><p>${escapeHtml(String(exam))} · Điểm: ${escapeHtml(String(score||"—"))}</p></div><span class="badge">${time?escapeHtml(new Date(time).toLocaleString("vi-VN")):"—"}</span></div>`;
    }).join("");
  }
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function updateStats(){document.getElementById("statTests").textContent=getTests().length}

updateStats(); renderTests();
loadSupabase().then(()=>loadOnline()).catch(()=>loadOnline());
