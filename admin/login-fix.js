/* STUDY TH — zero-lag Admin login bootstrap. */
(function(){
  'use strict';
  if(window.__studyLoginBootstrap)return;
  window.__studyLoginBootstrap=true;

  const AFTER_LOGIN_SCRIPTS=[
    'auth.js?v=20260810-1','app.js?v=20260810-4','media-fix.js?v=20260810-3','fix.js?v=20260810-1',
    'enhancements.js?v=20260810-1','final-fix.js?v=20260810-1','exam-save-fix.js?v=20260810-1',
    '/admin-media-fix.js?v=20260810-1','/admin-final-fix.js?v=20260810-1','admin-navigation-repair.js?v=20260811-1',
    'exam-builder-v2.js?v=20260812-2','exam-builder-v4-repair.js?v=20260812-4',
    'exam-multi-source-flashcard-repair.js?v=20260812-1'
  ];

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.async=false;
      s.onload=resolve;
      s.onerror=()=>reject(new Error('Không tải được Admin module: '+src));
      document.body.appendChild(s);
    });
  }

  async function startAdmin(){
    if(window.__studyAdminStarted)return;
    window.__studyAdminStarted=true;
    for(const src of AFTER_LOGIN_SCRIPTS) await loadScript(src);
    document.body.classList.add('admin-authenticated');
    const login=document.getElementById('adminLogin'),app=document.getElementById('adminApp');
    if(login)login.classList.add('hidden');
    if(app)app.classList.remove('hidden');
    if(typeof window.bootAdmin==='function') await window.bootAdmin();
    else if(typeof window.showApp==='function') window.showApp();
  }

  function bind(){
    const form=document.getElementById('loginForm');
    const input=document.getElementById('adminPassword');
    const msg=document.getElementById('loginMsg');
    const btn=form?.querySelector('button[type="submit"]');
    if(!form||!input||form.__zeroLagBound)return;
    form.__zeroLagBound=true;
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      const password=String(input.value||'');
      if(!password){if(msg)msg.textContent='Vui lòng nhập mật khẩu Admin.';input.focus();return;}
      if(btn){btn.disabled=true;btn.textContent='⏳ Đang đăng nhập...';}
      if(msg)msg.textContent='';
      try{
        const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin'});
        const text=await r.text();
        let data={};try{data=JSON.parse(text||'{}')}catch(_){ }
        if(!r.ok)throw new Error(data.error||('Đăng nhập thất bại (HTTP '+r.status+')'));
        if(!data.token)throw new Error('Máy chủ không trả về session token.');
        sessionStorage.setItem('study_admin_session_v2',data.token);
        await startAdmin();
      }catch(err){
        window.__studyAdminStarted=false;
        if(msg)msg.textContent=err?.message||'Đăng nhập thất bại.';
      }finally{
        if(btn){btn.disabled=false;btn.textContent='🔐 Đăng nhập';}
      }
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
