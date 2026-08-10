/* STUDY TH — hard hook for AI chat. This is intentionally tiny: it calls the single renderer directly. */
(function(){
  if(window.__studyAiChatHookV1)return;
  window.__studyAiChatHookV1=true;
  function scan(){
    var box=document.getElementById('studyAiMessages');
    if(!box||typeof window.renderStudyAiMessage!=='function')return;
    box.querySelectorAll('.study-ai-msg.bot').forEach(function(node){
      if(node.hasAttribute('data-thinking'))return;
      if(node.dataset.aiRendered==='html')return;
      window.renderStudyAiMessage(node,node.textContent||'');
    });
  }
  function boot(){scan();var box=document.getElementById('studyAiMessages');if(box&&!box.__studyAiChatHookObserver){box.__studyAiChatHookObserver=new MutationObserver(function(){scan()});box.__studyAiChatHookObserver.observe(box,{childList:true,subtree:true})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
  setInterval(scan,1000);
})();
