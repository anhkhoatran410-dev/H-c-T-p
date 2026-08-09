const KEY="study_test_ai_v1";
const defaultData={
  exams:[
    {id:"math01",title:"Toán 11 — Hàm số cơ bản",subject:"Toán",duration:20,open:"",close:"",
     questions:[
      {q:"Tập xác định của hàm số f(x)=1/x là:",opts:["R","R\\{0}","[0;+∞)","(0;+∞)"],a:1},
      {q:"Nếu f(x)=2x+3 thì f(1) bằng:",opts:["3","4","5","6"],a:2},
      {q:"Phương trình 2x+4=0 có nghiệm:",opts:["-2","0","2","4"],a:0}
     ]},
    {id:"eng01",title:"English — Vocabulary Starter",subject:"Tiếng Anh",duration:10,open:"",close:"",
     questions:[
      {q:"'achieve' gần nghĩa nhất với:",opts:["đạt được","từ bỏ","phân tích","tránh"],a:0},
      {q:"'accurate' có nghĩa là:",opts:["nhanh","chính xác","khó","rộng"],a:1},
      {q:"'benefit' có nghĩa là:",opts:["lợi ích","thất bại","thay đổi","mục tiêu"],a:0}
     ]},
    {id:"lit01",title:"Ngữ Văn — Kiến thức nền",subject:"Ngữ Văn",duration:15,open:"",close:"",
     questions:[
      {q:"Nhân vật trong tác phẩm văn học thường góp phần thể hiện:",opts:["nội dung và tư tưởng","chỉ số liệu","chỉ thời gian","chỉ địa điểm"],a:0},
      {q:"Biện pháp tu từ so sánh thường có tác dụng:",opts:["làm hình ảnh cụ thể, gợi hình","xóa bỏ cảm xúc","chỉ cung cấp số liệu","không tạo hiệu quả"],a:0}
     ]}
  ],
  results:[],
  users:[]
};

let data=JSON.parse(localStorage.getItem(KEY)||"null")||defaultData;
function save(){localStorage.setItem(KEY,JSON.stringify(data))}
let state={page:"home",candidate:"",exam:null,answers:{},startedAt:0,timer:null};

// Supabase online sync
const SUPABASE_URL="https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_KEY="sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";
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
async function syncResultOnline(r){
 try{
  await loadSupabase();
  let participantId=null;
  const lookup=await db.from("participants").select("id").eq("name",r.candidate).limit(1).maybeSingle();
  if(!lookup.error && lookup.data) participantId=lookup.data.id;
  if(!participantId){
   const ins=await db.from("participants").insert({name:r.candidate}).select("id").single();
   if(ins.error) throw ins.error;
   participantId=ins.data.id;
  }
  const a=await db.from("attempts").insert({
   participant_id:participantId,exam_id:r.examId,exam_title:r.examTitle,
   score:r.score,correct:r.correct,total:r.total,time_sec:r.timeSec,submitted_at:r.submittedAt
  }).select("id").single();
  if(a.error) throw a.error;
  const attemptId=a.data?.id;
  if(attemptId){
   const rows=Object.entries(state.answers).map(([i,selected])=>({
    attempt_id:attemptId,question_index:Number(i),selected_option:Number(selected),
    is_correct:state.exam?.questions?.[Number(i)]?.a===Number(selected)
   }));
   if(rows.length){const ans=await db.from("answers").insert(rows);if(ans.error) console.warn("answers sync:",ans.error)}
  }
  console.log("Supabase: đã lưu kết quả");
 }catch(e){console.warn("Supabase sync failed:",e)}
}
loadSupabase().catch(()=>{});

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function header(admin=false){
 return `<header class="top"><div class="brand">🎓 STUDY TEST AI</div>
 <div class="nav"><button onclick="go('home')">Trang chủ</button>${admin?`<button onclick="go('admin')">Admin</button>`:`<button onclick="go('history')">📊 Lịch sử</button><button onclick="go('admin')">Admin demo</button>`}</div></header>`
}
function render(){document.getElementById("app").innerHTML=header(state.page==="admin")+page();}

function page(){
 if(state.page==="home")return `<main class="container">
 <div class="card"><h1>Tạo và làm bài kiểm tra</h1><p class="muted">Nhập tên thí sinh trước khi chọn bài. Bài kiểm tra được Admin tạo và có thời gian làm riêng.</p>
 <label>Họ và tên</label><input id="candidate" placeholder="Ví dụ: Nguyễn Văn A" value="${esc(state.candidate)}">
 <label>Mã học sinh <span class="muted">(không bắt buộc)</span></label><input id="code" placeholder="HS001">
 </div>
 <div class="card"><h2>Chọn môn</h2><div class="grid">
 ${["Toán","Tiếng Anh","Ngữ Văn"].map((s,i)=>`<button class="subject" onclick="chooseSubject('${s}')"><b>${["📐","🇬🇧","📖"][i]} ${s}</b><span class="muted">${data.exams.filter(e=>e.subject===s).length} bài kiểm tra</span></button>`).join("")}
 </div></div></main>`;
 if(state.page==="subject")return `<main class="container"><div class="card"><button class="btn secondary" onclick="go('home')">← Quay lại</button><h1>${state.subject}</h1><p class="muted">Chọn bài kiểm tra. Mỗi bài có thời lượng riêng do Admin thiết lập.</p>
 ${data.exams.filter(e=>e.subject===state.subject).map(e=>examCard(e)).join("")||"<p>Chưa có bài.</p>"}</div></main>`;
 if(state.page==="exam")return examPage();
 if(state.page==="result")return resultPage();
 if(state.page==="history")return historyPage();
 if(state.page==="admin")return adminPage();
}
function examCard(e){
 const done=data.results.find(r=>r.examId===e.id&&r.candidate===state.candidate);
 const now=Date.now(), open=e.open?new Date(e.open).getTime():0, close=e.close?new Date(e.close).getTime():Infinity;
 let status="";
 if(now<open)status=`<span class="danger-text">Chưa mở</span>`;
 else if(now>close)status=`<span class="danger-text">Đã đóng</span>`;
 else status=`<span class="success">Đang mở</span>`;
 return `<div class="exam"><div><span class="pill">${e.question_count || e.questions?.length || 0} câu</span> <span class="pill">⏱ ${e.duration} phút</span>
 <h3>${esc(e.title)}</h3><div class="muted">${status}${done?` · Đã làm: ${done.score}%`:``}</div></div>
 <div class="actions"><button class="btn" ${now<open||now>close?"disabled":""} onclick="startExam('${e.id}')">${done?"Làm lại":"Bắt đầu"}</button></div></div>`;
}
function chooseSubject(s){state.candidate=document.getElementById("candidate")?.value.trim()||state.candidate;if(!state.candidate){alert("Hãy nhập họ tên trước.");return}state.subject=s;state.page="subject";render()}
function startExam(id){
 state.exam=data.exams.find(e=>e.id===id);state.answers={};state.startedAt=Date.now();state.page="exam";render();startTimer();
}
function startTimer(){clearInterval(state.timer);state.timer=setInterval(()=>{if(state.page!=="exam"){clearInterval(state.timer);return}updateTimer()},1000);updateTimer()}
function updateTimer(){let left=Math.max(0,state.exam.duration*60-Math.floor((Date.now()-state.startedAt)/1000));let el=document.getElementById("timer");if(el)el.textContent="⏱ "+Math.floor(left/60).toString().padStart(2,"0")+":"+String(left%60).padStart(2,"0");if(left<=0)submitExam(true)}
function examPage(){let e=state.exam;return `<main class="container"><div class="timer" id="timer">⏱ --:--</div><div class="card"><h1>${esc(e.title)}</h1><p class="muted">Thí sinh: <b>${esc(state.candidate)}</b> · ${e.questions.length} câu · ${e.duration} phút</p>
 ${e.questions.map((q,i)=>`<div class="q"><b>Câu ${i+1}. ${esc(q.q)}</b>${q.opts.map((o,j)=>`<label class="option"><input type="radio" name="q${i}" ${state.answers[i]===j?"checked":""} onchange="state.answers[${i}]=${j}"> ${String.fromCharCode(65+j)}. ${esc(o)}</label>`).join("")}</div>`).join("")}
 <button class="btn" onclick="submitExam(false)">NỘP BÀI</button></div></main>`}
function submitExam(auto){
 if(!state.exam)return;clearInterval(state.timer);let e=state.exam,correct=0;
 e.questions.forEach((q,i)=>{if(state.answers[i]===q.a)correct++});
 let pct=Math.round(correct/e.questions.length*100);
 data.results.push({id:Date.now(),examId:e.id,examTitle:e.title,candidate:state.candidate,score:pct,correct,total:e.questions.length,timeSec:Math.min(Math.floor((Date.now()-state.startedAt)/1000),e.duration*60),submittedAt:new Date().toISOString(),auto});
 save();state.lastResult=data.results.at(-1);syncResultOnline(state.lastResult);state.page="result";render();
}
function resultPage(){let r=state.lastResult;return `<main class="container"><div class="card"><h1>🎉 Hoàn thành</h1><p class="muted" style="text-align:center">${esc(r.candidate)} · ${esc(r.examTitle)}</p><div class="score">${r.score}%</div><p style="text-align:center;font-size:18px">Đúng <b>${r.correct}/${r.total}</b> câu · ${Math.floor(r.timeSec/60)} phút ${r.timeSec%60}s</p><p style="text-align:center">${r.auto?"⏰ Hết giờ, hệ thống đã tự động nộp bài.":"Bài đã được nộp thành công."}</p><div style="text-align:center"><button class="btn" onclick="go('history')">Xem lịch sử</button><button class="btn secondary" onclick="go('home')">Về trang chủ</button></div></div></main>`}
function historyPage(){let rs=data.results.filter(r=>r.candidate===state.candidate);return `<main class="container"><div class="card"><h1>📊 Lịch sử làm bài</h1><p>Thí sinh: <b>${esc(state.candidate||"Chưa nhập tên")}</b></p>${rs.length?rs.slice().reverse().map(r=>`<div class="exam"><div><b>${esc(r.examTitle)}</b><div class="muted">${new Date(r.submittedAt).toLocaleString("vi-VN")}</div></div><strong>${r.score}%</strong></div>`).join(""):"<p class='muted'>Chưa có kết quả.</p>"}</div></main>`}

function adminPage(){return `<main class="container">
<div class="card"><h1>👨‍💼 Admin Dashboard</h1><div class="grid">
<div class="subject"><b>${data.exams.length}</b><span class="muted">Bài kiểm tra</span></div>
<div class="subject"><b>${data.results.length}</b><span class="muted">Lượt làm bài</span></div>
<div class="subject"><b>${new Set(data.results.map(r=>r.candidate)).size}</b><span class="muted">Thí sinh</span></div>
</div></div>
<div class="card"><h2>➕ Tạo bài kiểm tra</h2>
<div class="row"><div><label>Tên bài</label><input id="etitle" placeholder="Ví dụ: Toán 11 — Hàm số"></div><div><label>Môn</label><select id="esub"><option>Toán</option><option>Tiếng Anh</option><option>Ngữ Văn</option></select></div></div>
<div class="row"><div><label>Thời gian làm (phút)</label><input id="edur" type="number" value="30" min="1"></div><div><label>Ngày giờ mở (không bắt buộc)</label><input id="eopen" type="datetime-local"></div></div>
<div class="row"><div><label>Ngày giờ đóng (không bắt buộc)</label><input id="eclose" type="datetime-local"></div><div><label>File nguồn</label><input id="efile" type="file" accept=".txt,.json"></div></div>
<label>Câu hỏi (mỗi câu một dòng theo dạng: câu | A | B | C | D | đáp án 1-4)</label>
<textarea id="questions" rows="7" placeholder="2+2 bằng bao nhiêu? | 3 | 4 | 5 | 6 | 2&#10;'accurate' nghĩa là gì? | nhanh | chính xác | khó | rộng | 2"></textarea>
<p class="small muted">V1 hỗ trợ tạo đề trực tiếp từ form hoặc file TXT/JSON. Bước AI đọc PDF/DOCX sẽ được nối ở phiên bản tiếp theo.</p>
<button class="btn" onclick="createExam()">Tạo bài</button>
</div>
<div class="card"><h2>📚 Quản lý bài</h2>${data.exams.map(e=>`<div class="exam"><div><b>${esc(e.title)}</b><div class="muted">${e.subject} · ${e.questions.length} câu · ${e.duration} phút</div></div><button class="btn danger" onclick="deleteExam('${e.id}')">Xóa</button></div>`).join("")}</div>
<div class="card"><h2>📈 Kết quả thí sinh</h2>${data.results.length?`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><tr><th>Thí sinh</th><th>Bài</th><th>Điểm</th><th>Thời gian</th><th>Nộp</th></tr>${data.results.slice().reverse().map(r=>`<tr><td>${esc(r.candidate)}</td><td>${esc(r.examTitle)}</td><td>${r.score}%</td><td>${Math.floor(r.timeSec/60)}p</td><td>${new Date(r.submittedAt).toLocaleString("vi-VN")}</td></tr>`).join("")}</table></div>`:"<p class='muted'>Chưa có dữ liệu.</p>"}</div>
</main>`}
function createExam(){
 let title=document.getElementById("etitle").value.trim();if(!title){alert("Nhập tên bài.");return}
 let qs=document.getElementById("questions").value.trim().split("\n").filter(Boolean).map(line=>{let p=line.split("|").map(x=>x.trim());return p.length>=6?{q:p[0],opts:p.slice(1,5),a:Number(p[5])-1}:null}).filter(Boolean);
 if(!qs.length){alert("Hãy nhập ít nhất một câu theo mẫu.");return}
 let e={id:"e"+Date.now(),title,subject:document.getElementById("esub").value,duration:Number(document.getElementById("edur").value)||30,open:document.getElementById("eopen").value,close:document.getElementById("eclose").value,questions:qs};
 data.exams.push(e);save();alert("Đã tạo bài kiểm tra.");render();
}
function deleteExam(id){if(confirm("Xóa bài này?")){data.exams=data.exams.filter(e=>e.id!==id);save();render()}}
function go(p){state.page=p;if(p==="home")state.exam=null;render()}
render();
