/* Support runtime fix: race-safe thread lookup/creation + stable auto-scroll. */
function supportRuntimeState(){return window.state||window.studyState||null}
function supportRuntimeDeviceId(){try{if(typeof window.deviceId==='function')return window.deviceId();var key='study_device_id_v2',id=localStorage.getItem(key);if(!id){id=(crypto&&crypto.randomUUID)?crypto.randomUUID():'dev_'+Date.now()+'_'+Math.random().toString(36).slice(2);localStorage.setItem(key,id)}return id}catch(e){return 'dev_fallback'}}

async function ensureThread(){
  var s=supportRuntimeState();
  if(!s)throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');
  if(s.thread)return s.thread;
  var load=window.loadSupabase||loadSupabase;
  await load();
  var id=supportRuntimeDeviceId();
  var candidate=s.candidate||localStorage.getItem('study_candidate')||'Người dùng';
  var accountId=s.supportAccountId||null;

  var found=await db.from('support_threads').select('*').eq('device_id',id).maybeSingle();
  if(found.error)throw found.error;
  var data=found.data;

  if(!data){
    var created=await db.from('support_threads').insert({device_id:id,student_name:candidate,account_id:accountId}).select('*').single();
    if(created.error){
      /* Two sends can race before either one stores state.thread. The database
         keeps device_id unique; on that expected collision, read the winner. */
      var duplicate=/duplicate key|unique constraint|support_threads_device_id_key/i.test(String(created.error.message||created.error.details||''));
      if(!duplicate)throw created.error;
      var retry=await db.from('support_threads').select('*').eq('device_id',id).maybeSingle();
      if(retry.error||!retry.data)throw retry.error||created.error;
      data=retry.data;
    }else data=created.data;
  }

  if(accountId&&String(data.account_id||'')!==String(accountId)){
    var updated=await db.from('support_threads').update({account_id:accountId,student_name:candidate}).eq('id',data.id).select('*').single();
    if(!updated.error&&updated.data)data=updated.data;
  }
  s.thread=data;
  window.studyState=s;
  return data;
}

async function selectSupportAccount(id){var s=supportRuntimeState();if(!s)throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');s.supportAccountId=id;s.thread=null;s.messages=[];await startSupportLive();render()}

/* Keep the support conversation pinned to the newest message while the user is at the bottom. */
(function installSupportAutoScroll(){
  var list=null,observer=null,resizeObserver=null,stickToBottom=true,lastHeight=0,raf=0;
  function distanceFromBottom(el){return el.scrollHeight-el.scrollTop-el.clientHeight}
  function scrollToBottom(force){if(!list||(!force&&!stickToBottom))return;cancelAnimationFrame(raf);raf=requestAnimationFrame(function(){if(!list)return;list.scrollTop=list.scrollHeight;requestAnimationFrame(function(){if(list&&(force||stickToBottom))list.scrollTop=list.scrollHeight})})}
  function bind(){
    var next=document.querySelector('.support-message-list');if(!next)return;if(next===list){scrollToBottom(false);return}
    if(observer)observer.disconnect();if(resizeObserver)resizeObserver.disconnect();list=next;stickToBottom=true;lastHeight=list.scrollHeight;
    list.addEventListener('scroll',function(){stickToBottom=distanceFromBottom(list)<60},{passive:true});
    observer=new MutationObserver(function(){if(!list)return;var changed=list.scrollHeight!==lastHeight;lastHeight=list.scrollHeight;if(changed)scrollToBottom(false)});observer.observe(list,{childList:true,subtree:true,characterData:true});
    if(window.ResizeObserver){resizeObserver=new ResizeObserver(function(){if(!list)return;var changed=list.scrollHeight!==lastHeight;lastHeight=list.scrollHeight;if(changed)scrollToBottom(false)});resizeObserver.observe(list)}
    scrollToBottom(true)
  }
  function scheduleBind(){requestAnimationFrame(bind);setTimeout(bind,80);setTimeout(bind,300)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleBind);else scheduleBind();
  window.addEventListener('study-app-loaded',scheduleBind);
  var root=document.getElementById('app');if(root)new MutationObserver(scheduleBind).observe(root,{childList:true,subtree:true});
})();
