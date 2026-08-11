/* STUDY TH Admin support loader: one authoritative messenger runtime + keyboard-safe mobile layout. */
(function(){
  'use strict';
  if(window.__studyAdminSupportLoader)return;
  window.__studyAdminSupportLoader=true;

  function load(src){return new Promise(function(resolve){
    if(document.querySelector('script[data-study-support-src="'+src+'"]'))return resolve();
    var s=document.createElement('script');s.src=src;s.defer=true;s.dataset.studySupportSrc=src;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s);
  })}

  function css(){
    if(document.getElementById('study-admin-support-mobile-final'))return;
    var s=document.createElement('style');s.id='study-admin-support-mobile-final';s.textContent=`
      #support .messenger{display:grid!important;grid-template-columns:330px minmax(0,1fr)!important;height:min(690px,calc(100dvh - 205px))!important;min-height:0!important;overflow:hidden!important}
      #support .conversation{display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important;overflow:hidden!important}
      #support #chatHeader{flex:0 0 auto!important}
      #support #supportMessages{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overscroll-behavior:contain!important}
      #support #replyForm{flex:0 0 auto!important;position:sticky!important;bottom:0!important;z-index:100!important;width:100%!important;box-sizing:border-box!important}
      #support #replyInput{min-width:0!important;width:100%!important;box-sizing:border-box!important;font-size:16px!important}
      @media(max-width:650px){
        #support .messenger{grid-template-columns:1fr!important;grid-template-rows:112px minmax(0,1fr)!important;height:calc(var(--admin-vh,100dvh) - 245px)!important;min-height:0!important}
        #support .conversation-list{height:112px!important;max-height:112px!important}
        #support .conversation{grid-row:2!important;min-height:0!important}
        #support #replyForm{padding:8px!important;padding-bottom:calc(8px + env(safe-area-inset-bottom))!important}
        #support #replyInput{min-height:48px!important;max-height:120px!important}
      }
    `;document.head.appendChild(s);
  }
  function viewport(){
    function set(){var h=window.innerHeight;if(window.visualViewport)h=window.visualViewport.height;document.documentElement.style.setProperty('--admin-vh',h+'px')}
    set();if(window.visualViewport)window.visualViewport.addEventListener('resize',set);window.addEventListener('resize',set);
  }
  async function boot(){
    css();viewport();
    await load('/admin/support.js?v=20260811-3');
    css();viewport();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
