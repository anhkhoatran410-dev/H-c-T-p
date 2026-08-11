/* STUDY TH Admin support loader v5. */
(function(){
  'use strict';
  if(window.__studyAdminSupportLoaderV5)return;
  window.__studyAdminSupportLoaderV5=true;
  function load(src){return new Promise(function(resolve){
    var s=document.createElement('script');s.src=src;s.defer=true;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s);
  })}
  function css(){
    if(document.getElementById('study-admin-support-mobile-final-v5'))return;
    var s=document.createElement('style');s.id='study-admin-support-mobile-final-v5';s.textContent=`
      #support .messenger{display:grid!important;grid-template-columns:330px minmax(0,1fr)!important;height:min(690px,calc(100dvh - 205px))!important;min-height:0!important;overflow:hidden!important}
      #support .conversation{display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important;overflow:hidden!important}
      #support #chatHeader{flex:0 0 auto!important}
      #support #supportMessages{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overscroll-behavior:contain!important}
      #support #replyForm{display:flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto!important;position:sticky!important;bottom:0!important;z-index:100!important;width:100%!important;box-sizing:border-box!important}
      #support #replyInput{display:block!important;visibility:visible!important;opacity:1!important;min-width:0!important;width:100%!important;box-sizing:border-box!important;font-size:16px!important}
      @media(max-width:650px){#support .messenger{grid-template-columns:1fr!important;grid-template-rows:112px minmax(0,1fr)!important;height:calc(var(--admin-vh,100dvh) - 245px)!important}#support .conversation-list{height:112px!important;max-height:112px!important}#support .conversation{grid-row:2!important;min-height:0!important}#support #replyForm{padding:8px!important;padding-bottom:calc(8px + env(safe-area-inset-bottom))!important}#support #replyInput{min-height:48px!important;max-height:120px!important}}
    `;document.head.appendChild(s)
  }
  function viewport(){function set(){var h=window.innerHeight;if(window.visualViewport)h=window.visualViewport.height;document.documentElement.style.setProperty('--admin-vh',h+'px')}set();window.addEventListener('resize',set);if(window.visualViewport)window.visualViewport.addEventListener('resize',set)}
  async function boot(){css();viewport();await load('/admin/support.js?v=20260811-5');css();viewport()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
