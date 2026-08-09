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

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src===src);
    if(existing){existing.addEventListener("load",()=>resolve());if(window.pdfjsLib||window.mammoth)resolve();return;}
    const s=document.createElement("script");s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`Không tải được thư viện: ${src}`));document.head.appendChild(s);
  });
}

async function extractPdfText(file){
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const data=await file.arrayBuffer();
  const pdf=await window.pdfjsLib.getDocument({data}).promise;
  const parts=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const text=await page.getTextContent();
    parts.push(`\n--- Trang ${i} ---\n`+text.items.map(x=>x.str||"").join(" "));
  }
  return parts.join("\n").trim();
}

async function extractDocumentText(file){
  const name=(file.name||"").toLowerCase();
  if(name.endsWith(".txt")||name.endsWith(".md")||name.endsWith(".csv")||name.endsWith(".rtf")) return await file.text();
  if(name.endsWith(".pdf")||file.type==="application/pdf") return await extractPdfText(file);
  if(name.endsWith(".docx")||file.type==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
    await loadScript("https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js");
    const result=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return result.value||"";
  }
  return "";
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
    reader.onerror=()=>reject(reader.error||new Error("Không đọc được file"));
    reader.readAsDataURL(file);
  });
}

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
    msg.textContent="⏳ Đang đọc toàn bộ tài liệu trên trình duyệt...";
    let documentText="";
    try{documentText=await extractDocumentText(file);}catch(ex){console.warn("Không trích xuất được văn bản:",ex)}

    // Vercel Functions giới hạn request body 4.5 MB. Không gửi base64 của file
    // lớn qua function vì base64 làm payload phình thêm khoảng 33%.
    // Ưu tiên gửi phần text đã trích xuất để request luôn nhỏ.
    if(documentText){
      documentText=documentText.trim();
      const MAX_TEXT_CHARS=180000;
      if(documentText.length>MAX_TEXT_CHARS){
        documentText=documentText.slice(0,MAX_TEXT_CHARS)+"\n[Đã giới hạn phần văn bản gửi lên để tránh vượt giới hạn request của Vercel]";
      }
    }

    let fileData="";
    if(!documentText){
      // Với PDF/DOCX không trích xuất được chữ, chỉ cho phép file nhỏ.
      // File lớn cần OCR/Storage riêng thay vì nhét base64 vào JSON request.
      if(file.size>2500000) throw new Error("File không trích xuất được chữ và quá lớn. Hãy dùng PDF có thể bôi đen/copy chữ, hoặc file nhỏ hơn 2.5 MB.");
      msg.textContent="⏳ Đang chuẩn bị file...";
      fileData=await fileToBase64(file);
    }

    msg.textContent="⏳ Đang nhờ AI tạo câu hỏi...";
    const aiRes=await fetch("/api/generate-exam",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:file.name,mimeType:file.type||"application/pdf",fileData,documentText,subject,difficulty,questionCount,types})});
    const raw=await aiRes.text();
    let ai={};
    try{ai=raw?JSON.parse(raw):{}}catch{
      if(aiRes.status===413 || /request entity too large|payload too large/i.test(raw)){
        throw new Error("Request quá lớn. Hãy dùng PDF có text hoặc tài liệu ngắn hơn.");
      }
      throw new Error(`Server trả về dữ liệu không hợp lệ (${aiRes.status}). ${raw.slice(0,250)}`);
    }
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
