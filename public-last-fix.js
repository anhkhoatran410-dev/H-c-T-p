/* STUDY TH final runtime guardrails: dedupe support bot bubbles, close pickers, and keep shared exam URLs usable. Deployment trigger: 2026-08-10 15:35 +07. */
(function(){
  function boot(){
    if(window.__studyLastFixInstalled)return;
    if(!window.__studyAppReady && typeof window.state==='undefined')return;
    window.__studyLastFixInstalled=true;

    function closePickers(){
      document.querySelectorAll('.support-picker,.admin-reply-picker').forEach(function(el){el.classList.add('hidden')});
    }

    function dedupeBotDom(){
      var list=document.querySelector('.support-message-list');
      if(!list)return;
      var seen=false;
      list.querySelectorAll('.support-bubble.bot').forEach(function(b){
        if(seen){ var row=b.closest('.support-bubble-row'); if(row)row.remove(); else b.remove(); }
        else seen=true;
      });
    }

    function afterRender(){
      closePickers();
      dedupeBotDom();
      setTimeout(dedupeBotDom,30);
      setTimeout(dedupeBotDom,150);
    }

    document.addEventListener('click',function(e){
      var pick=e.target.closest('.support-picker button,.admin-reply-picker button');
      if(pick)setTimeout(closePickers,0);
      if(!e.target.closest('.support-picker') && !e.target.closest('[data-support-picker]') && !e.target.closest('.composer-tool')){
        document.querySelectorAll('.support-picker').forEach(function(el){el.classList.add('hidden')});
      }
    },true);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closePickers()},true);

    window.sendSticker=async function(sticker){
      closePickers();
      try{
        var fn=window.sendSupportMessage;
        if(typeof fn!=='function')throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');
        await fn({sticker:String(sticker||''),message:'✨ Sticker'});
        closePickers();
      }catch(err){alert('Không gửi được sticker: '+(err&&err.message||err))}
    };

    var oldSend=window.sendSupportMessage;
    if(typeof oldSend==='function'&&!oldSend.__lastFix){
      var wrapped=async function(payload){
        closePickers();
        var result=await oldSend(payload);
        closePickers();
        afterRender();
        return result;
      };
      wrapped.__lastFix=true;
      window.sendSupportMessage=wrapped;
    }

    var oldRender=window.render;
    if(typeof oldRender==='function'&&!oldRender.__lastFix){
      var render=async function(){
        var r=oldRender.apply(this,arguments);
        if(r&&typeof r.then==='function')await r;
        afterRender();
        return r;
      };
      render.__lastFix=true;
      window.render=render;
    }

    var root=document.getElementById('app');
    if(root)new MutationObserver(function(){afterRender()}).observe(root,{childList:true,subtree:true});
    afterRender();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
})();
