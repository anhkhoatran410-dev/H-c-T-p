const KEY="study_admin_tests_v1";
const getTests=()=>JSON.parse(localStorage.getItem(KEY)||"[]");
const saveTests=x=>localStorage.setItem(KEY,JSON.stringify(x));

function openTab(id){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelector(`[data-tab="${id}"]`).classList.add("active");
  if(id==="tests") renderTests();
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
    id:crypto.randomUUID(),
    title, subject:subject.value, level:level.value,
    minutes:Number(minutes.value), questions:Number(questions.value),
    type:type.value, sourceFile:file.name,
    createdAt:new Date().toISOString(), status:"Bản nháp"
  };
  const tests=getTests(); tests.unshift(test); saveTests(tests);
  msg.textContent="✅ Đã tạo khung bài kiểm tra. AI tạo câu hỏi sẽ được nối ở bước tiếp theo.";
  document.getElementById("title").value="";
  renderTests(); updateStats();
};

function renderTests(){
  const box=document.getElementById("testList"), tests=getTests();
  if(!tests.length){box.innerHTML='<div class="panel">Chưa có bài kiểm tra.</div>';return}
  box.innerHTML=tests.map(t=>`<div class="test">
    <div><h3>${escapeHtml(t.title)}</h3><p>${t.subject} · ${t.level} · ${t.questions} câu · ${t.minutes} phút · ${escapeHtml(t.sourceFile)}</p></div>
    <span class="badge">${t.status}</span>
  </div>`).join("");
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function updateStats(){document.getElementById("statTests").textContent=getTests().length}
updateStats(); renderTests();
