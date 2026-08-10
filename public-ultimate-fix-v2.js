/* STUDY TH: final public reliability patch. Math rendering is owned by public-ai-format-final.js + math-render-final.js. */
(function(){
  if(window.__studyUltimatePublicFixV3)return;
  window.__studyUltimatePublicFixV3=true;

  function dedupe(){
    var list=document.querySelector('.support-message-list');
    if(!list)return;
    var seen=new Set();
    Array.from(list.children).forEach(function(row){
      var b=row.querySelector('.support-bubble')||row.querySelector('.bubble');
      if(!b)return;
      var txt=(b.querySelector('div')?.textContent||b.textContent||'').replace(/\s+/g,' ').trim();
      var tm=(b.querySelector('small')?.textContent||'').trim();
      var key=String(b.className)+'|'+txt+'|'+tm;
      if(txt&&seen.has(key))row.remove();else if(txt)seen.add(key);
    });
  }

  function support(){
    var input=document.getElementById('supportInput');
    if(!input)return;
    if(!input.dataset.v3Key){
      input.dataset.v3Key='1';
      input.addEventListener('keydown',function(e){
        if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
          e.preventDefault();e.stopImmediatePropagation();
          if(typeof window.sendSupport==='function')window.sendSupport();
        }
      },true);
    }
    dedupe();
  }

  function boot(){
    support();
    dedupe();
    var root=document.getElementById('app');
    if(root&&!root.__studyV3Obs){
      root.__studyV3Obs=new MutationObserver(function(){support();dedupe()});
      root.__studyV3Obs.observe(root,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
  window.addEventListener('load',function(){setTimeout(boot,100)});
  setInterval(boot,1000);
})();
