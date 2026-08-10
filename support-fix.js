async function ensureThread(){
  if(state.thread)return state.thread;
  await loadSupabase();
  let {data,error}=await db.from("support_threads").select("*").eq("device_id",deviceId()).maybeSingle();
  if(error)throw error;
  if(!data){
    const r=await db.from("support_threads").insert({device_id:deviceId(),student_name:state.candidate||localStorage.getItem("study_candidate")||"Người dùng",account_id:state.supportAccountId||null}).select().single();
    if(r.error)throw r.error;data=r.data;
  }else if(state.supportAccountId&&String(data.account_id||"")!==String(state.supportAccountId)){
    const r=await db.from("support_threads").update({account_id:state.supportAccountId}).eq("id",data.id).select().single();
    if(!r.error&&r.data)data=r.data;
  }
  state.thread=data;return data;
}
async function selectSupportAccount(id){state.supportAccountId=id;state.thread=null;state.messages=[];await startSupportLive();render()}

/* Keep the support conversation pinned to the newest message while the user is at the bottom.
   This also handles long messages whose height changes after wrapping/media/layout. */
(function installSupportAutoScroll(){
  var list=null;
  var observer=null;
  var resizeObserver=null;
  var stickToBottom=true;
  var lastHeight=0;
  var raf=0;

  function distanceFromBottom(el){
    return el.scrollHeight-el.scrollTop-el.clientHeight;
  }

  function scrollToBottom(force){
    if(!list||(!force&&!stickToBottom))return;
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(function(){
      if(!list)return;
      list.scrollTop=list.scrollHeight;
      requestAnimationFrame(function(){
        if(list&&(force||stickToBottom))list.scrollTop=list.scrollHeight;
      });
    });
  }

  function bind(){
    var next=document.querySelector('.support-message-list');
    if(!next)return;
    if(next===list){scrollToBottom(false);return;}
    if(observer)observer.disconnect();
    if(resizeObserver)resizeObserver.disconnect();
    list=next;
    stickToBottom=true;
    lastHeight=list.scrollHeight;

    list.addEventListener('scroll',function(){
      stickToBottom=distanceFromBottom(list)<60;
    },{passive:true});

    observer=new MutationObserver(function(){
      if(!list)return;
      var changed=list.scrollHeight!==lastHeight;
      lastHeight=list.scrollHeight;
      if(changed)scrollToBottom(false);
    });
    observer.observe(list,{childList:true,subtree:true,characterData:true});

    if(window.ResizeObserver){
      resizeObserver=new ResizeObserver(function(){
        if(!list)return;
        var changed=list.scrollHeight!==lastHeight;
        lastHeight=list.scrollHeight;
        if(changed)scrollToBottom(false);
      });
      resizeObserver.observe(list);
    }

    scrollToBottom(true);
  }

  function scheduleBind(){
    requestAnimationFrame(bind);
    setTimeout(bind,80);
    setTimeout(bind,300);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleBind);
  else scheduleBind();
  window.addEventListener('study-app-loaded',scheduleBind);

  var root=document.getElementById('app');
  if(root)new MutationObserver(scheduleBind).observe(root,{childList:true,subtree:true});
})();
