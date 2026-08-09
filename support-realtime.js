let supportRealtimeChannel=null;
let supportPollTimer=null;

async function startSupportRealtime(){
  try{
    await loadSupabase();
    const thread=await ensureThread();
    if(!thread?.id)return;

    if(supportRealtimeChannel){
      db.removeChannel(supportRealtimeChannel).catch(()=>{});
      supportRealtimeChannel=null;
    }

    supportRealtimeChannel=db.channel(`support-user-${thread.id}`)
      .on("postgres_changes",{
        event:"INSERT",
        schema:"public",
        table:"support_messages",
        filter:`thread_id=eq.${thread.id}`
      },payload=>{
        const msg=payload.new;
        if(!msg)return;
        const exists=(state.messages||[]).some(x=>String(x.id)===String(msg.id));
        if(!exists)state.messages=[...(state.messages||[]),msg].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
        if(state.page==="support")render();
      })
      .on("postgres_changes",{
        event:"UPDATE",
        schema:"public",
        table:"support_threads",
        filter:`id=eq.${thread.id}`
      },payload=>{
        state.thread={...(state.thread||{}),...(payload.new||{})};
      })
      .subscribe(status=>console.log("Student support realtime:",status));

    clearInterval(supportPollTimer);
    supportPollTimer=setInterval(async()=>{
      if(state.page!=="support")return;
      const before=JSON.stringify((state.messages||[]).map(m=>m.id));
      await loadMessages();
      const after=JSON.stringify((state.messages||[]).map(m=>m.id));
      if(before!==after)render();
    },1500);
  }catch(e){
    console.warn("Student support realtime unavailable:",e);
  }
}

const originalSupportGo=window.go;
window.go=async function(page){
  await originalSupportGo(page);
  if(page==="support")startSupportRealtime();
};

const originalSendSupport=window.sendSupport;
window.sendSupport=async function(){
  await originalSendSupport();
  if(!supportRealtimeChannel)startSupportRealtime();
};

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>{if(state.page==="support")startSupportRealtime()},{once:true});
}
