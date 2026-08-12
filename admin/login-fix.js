/* STUDY TH — stable Admin login. One handler only; Admin boot starts after auth. */
(function(){
  'use strict';
  if(window.__studyStableLoginInstalled)return;
  window.__studyStableLoginInstalled=true;
  function boot(){
    var form=document.getElementById('loginForm');
    if(!form||form.__stableBound)return;
    form.__stableBound=true;
    var input=document.getElementById('adminPassword');
    var msg=document.getElementById('loginMsg');
    var btn=form.querySelector('button[type="submit"]');
    form.onsubmit=async function(e){
      e.preventDefault();e.stopImmediatePropagation();
      var password=String(input&&input.value||'');
      if(!password){if(msg)msg.textContent='Vui lòng nhập mật khẩu Admin.';if(input)input.focus();return false}
      if(btn){btn.disabled=true;btn.textContent='⏳ Đang đăng nhập...'}
      if(msg)msg.textContent='';
      try{
        var r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password:password}),cache:'no-store',credentials:'same-origin'});
        var text=await r.text(),data={};try{data=JSON.parse(text||'{}')}catch(_){ }
        if(!r.ok)throw new Error(data.error||('Đăng nhập thất bại (HTTP '+r.status+')'));
        if(!data.token)throw new Error('Máy chủ không trả về session token.');
        sessionStorage.setItem('study_admin_session_v2',data.token);
        document.body.classList.add('admin-authenticated');
        var login=document.getElementById('adminLogin'),app=document.getElementById('adminApp');
        if(login)login.classList.add('hidden');if(app)app.classList.remove('hidden');
        if(typeof window.bootAdmin==='function')await window.bootAdmin();
        else if(typeof window.showApp==='function')window.showApp();
      }catch(err){if(msg)msg.textContent=err&&err.message?err.message:'Đăng nhập thất bại.'}
      finally{if(btn){btn.disabled=false;btn.textContent='🔐 Đăng nhập'}if(input)input.focus({preventScroll:true})}
      return false;
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
