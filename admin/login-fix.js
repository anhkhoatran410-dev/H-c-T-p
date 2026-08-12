/* STUDY TH — legacy login shim. The hardened handler is authoritative. */
(function(){
  'use strict';
  if (window.__studyLoginHardeningInstalled) return;

  function boot(){
    if (window.__studyLoginHardeningInstalled) return;
    const form=document.getElementById('loginForm');
    if(!form||form.dataset.studyLoginFinal==='1')return;
    form.dataset.studyLoginFinal='1';
    form.onsubmit=async function(e){
      e.preventDefault();e.stopImmediatePropagation();
      const input=document.getElementById('adminPassword'),msg=document.getElementById('loginMsg'),btn=form.querySelector('button[type="submit"]');
      const password=String(input?.value||'');
      if(!password){if(msg)msg.textContent='Vui lòng nhập mật khẩu Admin.';input?.focus();return false}
      if(btn){btn.disabled=true;btn.textContent='⏳ Đang đăng nhập...'}
      try{
        const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin'});
        const text=await r.text();let data={};try{data=JSON.parse(text||'{}')}catch(_){ }
        if(!r.ok)throw new Error(data.error||`Đăng nhập thất bại (HTTP ${r.status})`);
        if(!data.token)throw new Error('Máy chủ không trả về session token.');
        sessionStorage.setItem('study_admin_session_v2',data.token);
        document.getElementById('adminLogin')?.classList.add('hidden');
        document.getElementById('adminApp')?.classList.remove('hidden');
        if(typeof window.bootAdmin==='function')Promise.resolve(window.bootAdmin()).catch(console.error);
        else if(typeof window.showApp==='function')window.showApp();
      }catch(err){if(msg)msg.textContent=err?.message||'Đăng nhập thất bại.'}
      finally{if(btn){btn.disabled=false;btn.textContent='🔐 Đăng nhập'}input?.focus({preventScroll:true})}
      return false;
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();