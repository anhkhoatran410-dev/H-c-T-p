let supportLiveChannel=null;
let supportLivePoll=null;
let supportAccountsCache=[];
let supportActiveAccount=null;

async function loadSupportAccounts(){
  try{await loadSupabase();const {data,error}=await db.from("support_accounts").select("*").eq("is_active",true).order("created_at",{ascending:true});if(error)throw error;supportAccountsCache=data||[]}catch{supportAccountsCache=[]}return supportAccountsCache}
async function ensureUpgradeThread(accountId){
  await loadSupabase();
  const id=deviceId();
  let {data,error}=await db.from("support_threads").select("*").eq("device_id",id).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(error)throw error;
  if(!data){
    const name=state.candidate||localStorage.getItem("study_candidate")||"Người dùng";
    const payload={device_id:id,student_name:name,status:"open",account_id:accountId||null,last_message:""};
    const r=await db.from("support_threads").insert(payload).select().single();if(r.error)throw r.error;data=r.data;
  }else if(accountId&&String(data.account_id||"")!==String(accountId)){
    const r=await db.from("support_threads").update({account_id:accountId,updated_at:new Date().toISOString()}).eq("id",data.id).select().single();if(!r.error)data=r.data;
  }
  state.thread=data;return data
}
async function loadUpgradeMessages(){
  if(!state.thread?.id)return;
  await loadSupabase();const {data,error}=await db.from("support_messages").select("*").eq("thread_id",state.thread.id).order("created_at",{ascending:true});if(error)throw error;state.messages=data||[]
}
function supportPage(){
  const accounts=supportAccountsCache.length?supportAccountsCache:[{id:"",name:"Hỗ trợ chung",avatar:"💬",description:"Kênh hỗ trợ chính"}];
  const active=accounts.find(a=>String(a.id)===String(state.thread?.account_id))||supportActiveAccount||accounts[0];
  supportActiveAccount=active;
  return `<main class="support-shell"><div class="support-card"><div class="support-top"><div><span class="support-kicker">STUDY SUPPORT</span><h1>💬 Trò chuyện với hỗ trợ</h1><p class="muted">Tin nhắn đến Admin theo thời gian thực.</p></div><button class="theme-chip" onclick="toggleStudyTheme()">◐ <span>Giao diện</span></button></div><div class="support-layout"><aside class="support-accounts"><div class="support-section-title">Kênh hỗ trợ</div>${accounts.map(a=>`<button class="support-account ${String(a.id)===String(active.id)?"active":""}" onclick="switchSupportAccount('${a.id}')"><span class="support-avatar">${esc(a.avatar||"💬")}</span><span><b>${esc(a.name)}</b><small>${esc(a.description||"Sẵn sàng hỗ trợ")}</small></span><i></i></button>`).join("")}<div class="support-tip"><b>🤖 Bot trực tuyến</b><small>Có thể trả lời trước. Admin sẽ tiếp quản khi cần.</small></div></aside><section class="support-conversation"><header class="support-chat-head"><span class="support-avatar">${esc(active.avatar||"💬")}</span><div><b>${esc(active.name||"Hỗ trợ chung")}</b><small><span class="live-dot"></span> Đang hoạt động</small></div></header><div id="supportMessageList" class="support-message-list">${renderSupportMessagesHtml()}</div><form class="support-composer" onsubmit="sendUpgradeSupport(event)"><button type="button" class="composer-icon">＋</button><textarea id="upgradeSupportInput" rows="1" placeholder="Nhập tin nhắn..."></textarea><button class="composer-send" type="submit">➤</button></form></section></div></div></main>`
}
function renderSupportMessagesHtml(){
  if(!state.messages?.length)return `<div class="support-empty"><span>✨</span><b>Bắt đầu cuộc trò chuyện</b><small>Hãy mô tả vấn đề hoặc điều bạn cần hỗ trợ.</small></div>`;
  return state.messages.map(m=>`<div class="support-bubble-row ${m.sender||"user"}"><div class="support-bubble ${m.sender||"user"}">${m.sender_name?`<b>${esc(m.sender_name)}</b>`:""}<div>${esc(m.message)}</div><small>${m.created_at?esc(new Date(m.created_at).toLocaleString("vi-VN")):""}</small></div></div>`).join("")
}
async function renderSupportOnly(){if(state.page!=="support")return;await loadSupportAccounts();if(!state.thread)await ensureUpgradeThread(supportActiveAccount?.id||supportAccountsCache[0]?.id);await loadUpgradeMessages();render()}
async function switchSupportAccount(id){
  supportActiveAccount=supportAccountsCache.find(a=>String(a.id)===String(id))||supportAccountsCache[0];
  if(state.thread&&id){await loadSupabase();const {data,error}=await db.from("support_threads").update({account_id:id,updated_at:new Date().toISOString()}).eq("id",state.thread.id).select().single();if(!error)state.thread=data}
  await loadUpgradeMessages();render();startUpgradeSupportRealtime()
}
async function sendUpgradeSupport(event){
  event?.preventDefault();const input=document.getElementById("upgradeSupportInput"),text=input?.value.trim();if(!text)return;
  input.value="";try{await loadSupabase();if(!state.thread)await ensureUpgradeThread(supportActiveAccount?.id);const payload={thread_id:state.thread.id,account_id:state.thread.account_id||null,sender:"user",sender_name:state.candidate||localStorage.getItem("study_candidate")||"Người dùng",message:text};const {error}=await db.from("support_messages").insert(payload);if(error)throw error;await loadUpgradeMessages();render();startUpgradeSupportRealtime()}catch(e){input.value=text;alert("Không gửi được tin nhắn: "+e.message)}}
async function startUpgradeSupportRealtime(){
  try{await loadSupabase();if(!state.thread?.id)return;if(supportLiveChannel)db.removeChannel(supportLiveChannel).catch(()=>{});supportLiveChannel=db.channel(`study-support-${state.thread.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"support_messages",filter:`thread_id=eq.${state.thread.id}`},payload=>{if(!state.messages.some(x=>String(x.id)===String(payload.new.id))){state.messages=[...state.messages,payload.new].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));if(state.page==="support")render()}}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"support_threads",filter:`id=eq.${state.thread.id}`},payload=>{state.thread={...state.thread,...payload.new};if(state.page==="support")render()}).subscribe((status,err)=>{if(err)console.warn(status,err)});clearInterval(supportLivePoll);supportLivePoll=setInterval(async()=>{if(state.page!=="support")return;const before=state.messages.length;await loadUpgradeMessages().catch(()=>{});if(before!==state.messages.length)render()},1500)}catch(e){console.warn("Support realtime",e)}
}
function toggleStudyTheme(){const dark=document.body.classList.toggle("study-dark");localStorage.setItem("study_theme",dark?"dark":"light")}
function applyStudyTheme(){document.body.classList.toggle("study-dark",localStorage.getItem("study_theme")==="dark")}
const oldSupportPage=window.supportPage;window.supportPage=supportPage;
const oldHeader=window.header;window.header=function(){return `<header class="top upgraded-top"><div class="brand">🎓 STUDY TEST AI</div><div class="nav"><button onclick="go('home')">Trang chủ</button><button onclick="go('history')">📊 Lịch sử</button><button onclick="go('support')">💬 Hỗ trợ</button><button onclick="go('admin')">Admin</button><button onclick="toggleStudyTheme()">◐</button></div></header>`};
const oldGo=window.go;window.go=async function(page){await oldGo(page);if(page==="support"){await loadSupportAccounts();await ensureUpgradeThread(supportActiveAccount?.id||supportAccountsCache[0]?.id);await loadUpgradeMessages();render();startUpgradeSupportRealtime()}};
applyStudyTheme();
