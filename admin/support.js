let adminSupportThread=null;
let adminSupportRealtime=null;
let adminSupportPoll=null;

const originalOpenTab=window.openTab;
window.openTab=async function(id){
  originalOpenTab(id);
  if(id==="history")await loadAdminHistory();
  if(id==="support"){
    await loadSupportThreads();
    startAdminSupportRealtime();
  }
};

async function loadAdminHistory(){
  const box=document.getElementById("historyList");
  if(!box)return;
  try{
    await loadSupabase();
    const {data,error}=await db.from("user_attempts").select("*").order("created_at",{ascending:false}).limit(200);
    if(error)throw error;
    const rows=data||[];
    box.innerHTML=rows.length?rows.map(r=>`<div class="test"><div><b>${esc(r.student_name||"Không tên")}</b><p>${esc(r.exam_title||"—")} · ${Number(r.score||0)}% · ${Number(r.correct||0)}/${Number(r.total||0)} câu</p><small class="muted">Thiết bị ${esc(String(r.device_id||"").slice(0,8))} · ${r.created_at?new Date(r.created_at).toLocaleString("vi-VN"):"—"}</small></div><span class="badge">${Array.isArray(r.wrong_indexes)&&r.wrong_indexes.length?`Sai ${r.wrong_indexes.length}`:"Đúng hết"}</span></div>`).join(""):"Chưa có lịch sử mới.";
  }catch(e){box.textContent="Không đọc được lịch sử: "+e.message}
}

async function loadSupportThreads(){
  const box=document.getElementById("supportThreads");
  if(!box)return;
  try{
    await loadSupabase();
    const {data,error}=await db.from("support_threads").select("*").order("updated_at",{ascending:false});
    if(error)throw error;
    const rows=data||[];
    box.innerHTML=rows.length?rows.map(t=>`<button class="test" style="width:100%;text-align:left;border:0;cursor:pointer" onclick="openSupportThread('${t.id}')"><div><b>${esc(t.student_name||"Người dùng")}</b><p>Mã thiết bị: ${esc(String(t.device_id||"").slice(0,8))}</p></div><span class="badge">${esc(t.status||"open")}</span></button>`).join(""):`<div><p class="muted">Chưa có cuộc trò chuyện nào.</p><p class="muted">Mở trang học sinh → <b>Hỗ trợ</b> → gửi một tin nhắn. Cuộc trò chuyện sẽ xuất hiện tự động.</p></div>`;
  }catch(e){box.innerHTML=`<div class="danger-text">Không đọc được tin nhắn hỗ trợ: ${esc(e.message)}<br><small>Hãy chạy migration <b>20260810_support_chat_fix.sql</b> trong Supabase SQL Editor.</small></div>`}
}

async function openSupportThread(id){
  adminSupportThread=id;
  const box=document.getElementById("supportChat");
  try{
    await loadSupabase();
    const {data,error}=await db.from("support_messages").select("*").eq("thread_id",id).order("created_at",{ascending:true});
    if(error)throw error;
    box.innerHTML=`<div style="max-height:420px;overflow:auto">${(data||[]).map(m=>`<div style="padding:10px;margin:8px 0;border-radius:10px;background:${m.sender==="admin"?"#eef6ff":"#f5f5f5"}"><b>${m.sender==="admin"?"Admin":"Người dùng"}</b><div>${esc(m.message)}</div><small class="muted">${new Date(m.created_at).toLocaleString("vi-VN")}</small></div>`).join("")||"<p class='muted'>Chưa có tin nhắn.</p>"}</div><div style="display:flex;gap:8px;margin-top:12px"><input id="adminSupportInput" placeholder="Nhập trả lời..."><button class="primary" onclick="sendAdminReply()">Trả lời</button></div>`;
  }catch(e){box.innerHTML=`<div class="danger-text">Không mở được cuộc trò chuyện: ${esc(e.message)}</div>`}
}

async function sendAdminReply(){
  const input=document.getElementById("adminSupportInput");
  const text=input?.value.trim();
  if(!text||!adminSupportThread)return;
  try{
    await loadSupabase();
    const {error}=await db.from("support_messages").insert({thread_id:adminSupportThread,sender:"admin",message:text});
    if(error)throw error;
    const {error:updateError}=await db.from("support_threads").update({updated_at:new Date().toISOString(),status:"open"}).eq("id",adminSupportThread);
    if(updateError)throw updateError;
    input.value="";
    await openSupportThread(adminSupportThread);
    await loadSupportThreads();
  }catch(e){alert("Không gửi được trả lời: "+e.message)}
}

function stopAdminSupportRealtime(){
  if(adminSupportRealtime&&db){db.removeChannel(adminSupportRealtime).catch(()=>{});adminSupportRealtime=null;}
  clearInterval(adminSupportPoll);
  adminSupportPoll=null;
}

async function startAdminSupportRealtime(){
  try{
    await loadSupabase();
    if(adminSupportRealtime)db.removeChannel(adminSupportRealtime).catch(()=>{});
    adminSupportRealtime=db.channel("admin-support-live")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"support_messages"},async payload=>{
        if(document.getElementById("support")?.classList.contains("active")){
          if(adminSupportThread&&String(payload.new.thread_id)===String(adminSupportThread))await openSupportThread(adminSupportThread);
          await loadSupportThreads();
        }
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"support_threads"},async()=>{
        if(document.getElementById("support")?.classList.contains("active"))await loadSupportThreads();
      })
      .subscribe(status=>console.log("Admin support realtime:",status));

    clearInterval(adminSupportPoll);
    adminSupportPoll=setInterval(async()=>{
      if(!document.getElementById("support")?.classList.contains("active"))return;
      await loadSupportThreads();
      if(adminSupportThread)await openSupportThread(adminSupportThread);
    },1500);
  }catch(e){
    console.warn("Admin support realtime unavailable:",e);
  }
}

startAdminSupportRealtime();

/* Load the final Admin UX layer after the existing support/admin code. */
(function(){
  if(window.__studyAdminUxLoader)return;window.__studyAdminUxLoader=true;
  const s=document.createElement("script");
  s.src="/admin/ux-admin-v2.js?v=20260811-1";
  s.defer=true;
  s.onload=()=>console.log("STUDY Admin UX v2 loaded");
  s.onerror=e=>console.warn("Admin UX v2 failed to load",e);
  document.head.appendChild(s);
})();
