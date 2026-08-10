/* STUDY TH — final Admin reliability bridge. Loaded last. */
(function(){
  if(window.__studyAdminUltimateFixV2)return;window.__studyAdminUltimateFixV2=true;
  function loadCss(path){if(document.querySelector('link[data-admin-v2="'+path+'"]'))return;var l=document.createElement('link');l.rel='stylesheet';l.href='/admin/'+path+'?v=20260810-2';l.dataset.adminV2=path;document.head.appendChild(l)}
  function loadJs(path){return new Promise(function(resolve){if(document.querySelector('script[data-admin-v2="'+path+'"]'))return resolve();var s=document.createElement('script');s.src='/admin/'+path+'?v=20260810-2';s.dataset.adminV2=path;s.onload=resolve;s.onerror=function(){console.error('Admin final asset failed:',path);resolve()};document.body.appendChild(s)})}
  function ensureComposer(){var f=document.getElementById('replyForm');if(!f)return;f.classList.remove('hidden');f.style.setProperty('display','flex','important');f.style.setProperty('visibility','visible','important');f.style.setProperty('opacity','1','important');var i=document.getElementById('replyInput');if(i){i.style.setProperty('display','block','important');i.style.setProperty('visibility','visible','important');i.style.setProperty('opacity','1','important');i.disabled=false}var b=f.querySelector('.send-btn');if(b)b.style.setProperty('display','inline-flex','important')}
  function boot(){
    loadCss('admin-chat-final.css');
    loadJs('admin-chat-final.js').then(function(){return loadJs('admin-copilot-final.js')}).then(function(){ensureComposer()});
    ensureComposer();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,50)});else setTimeout(boot,50);
  window.addEventListener('load',function(){setTimeout(boot,100)});
  setInterval(function(){if(document.getElementById('replyForm'))ensureComposer()},700);
})();
