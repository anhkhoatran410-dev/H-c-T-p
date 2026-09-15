/* STUDY TH — isolated login/bootstrap. Navigation is owned by app.js and the inline failsafe. */
(function(){
  'use strict';
  if(window.__studyLoginBootstrap)return;
  window.__studyLoginBootstrap=true;

  const TOKEN_KEY='study_admin_session_v2';
  const CRITICAL_SCRIPT='auth.js?v=20260810-1';
  const APP_SCRIPT='app.js?v=20260810-4';
  const OPTIONAL_SCRIPTS=[
    'media-fix.js?v=20260810-3','fix.js?v=20260810-1','enhancements.js?v=20260810-1',
    'final-fix.js?v=20260810-1','exam-save-fix.js?v=20260810-1',
    '/admin-media-fix.js?v=20260810-1','/admin-final-fix.js?v=20260810-1',
    'exam-builder-v2.js?v=20260812-2','exam-builder-v4-repair.js?v=20260915-1',
    'exam-multi-source-flashcard-repair.js?v=20260812-1'
  ];
  const $=id=>document.getElementById(id);

  function repairLogin(){
    const screen=$('adminLogin'),card=screen?.querySelector('.login-card'),form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');
    if(!screen||!form||!input||!btn)return;
    screen.classList.remove('loading','is-loading');
    screen.style.pointerEvents='auto';screen.style.position='fixed';screen.style.inset='0';screen.style.zIndex='2147483000';
    if(card){card.style.pointerEvents='auto';card.style.position='relative';card.style.zIndex='2147483001'}
    form.style.pointerEvents='auto';input.readOnly=false;input.style.pointerEvents='auto';
    if(!input.disabled)btn.style.pointerEvents='auto';
  }

  function setMessage(text){const el=$('loginMsg');if(el)el.textContent=text||''}

  function setAuthenticatedView(){
    const screen=$('adminLogin'),app=$('adminApp');
    if(screen){
      screen.classList.add('hidden');
      screen.style.setProperty('display','none','important');
      screen.style.setProperty('visibility','hidden','important');
      screen.style.setProperty('pointer-events','none','important');
      screen.setAttribute('aria-hidden','true');
    }
    if(app){
      app.classList.remove('hidden');
      app.style.setProperty('display','flex','important');
      app.style.setProperty('visibility','visible','important');
      app.style.setProperty('pointer-events','auto','important');
      app.removeAttribute('aria-hidden');
    }
  }

  function loadScript(src,timeoutMs=12000){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');let done=false;
      const timer=setTimeout(()=>{if(done)return;done=true;s.remove();reject(new Error('Module timeout: '+src))},timeoutMs);
      s.src=src;s.async=false;
      s.onload=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};
      s.onerror=()=>{if(done)return;done=true;clearTimeout(timer);reject(new Error('Không tải được Admin module: '+src))};
      document.body.appendChild(s);
    });
  }

  async function startAdmin(){
    if(window.__studyAdminStarted)return;
    window.__studyAdminStarted=true;
    try{
      await loadScript(CRITICAL_SCRIPT);
      await loadScript(APP_SCRIPT);
      setAuthenticatedView();
      if(typeof window.bootAdmin==='function'){
        try{await Promise.resolve(window.bootAdmin())}catch(err){console.error('[STUDY Admin] boot error:',err)}
      }
      const results=await Promise.allSettled(OPTIONAL_SCRIPTS.map(src=>loadScript(src)));
      const failed=results.map((r,i)=>r.status==='rejected'?OPTIONAL_SCRIPTS[i]:null).filter(Boolean);
      if(failed.length)console.warn('[STUDY Admin] optional modules skipped:',failed);
      setAuthenticatedView();
    }catch(err){
      window.__studyAdminStarted=false;
      console.error('[STUDY Admin] core bootstrap error:',err);
      setAuthenticatedView();
      const toast=$('toast');
      if(toast){toast.textContent='⚠️ Admin đã đăng nhập nhưng một phần giao diện chưa tải. Hãy tải lại trang.';toast.classList.add('show')}
    }
  }

  async function authenticate(event){
    if(event){event.preventDefault();event.stopImmediatePropagation()}
    const form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');
    if(!form||!input||!btn||form.__loginBusy)return;
    form.__loginBusy=true;repairLogin();
    const password=String(input.value||'');
    if(!password){setMessage('⚠️ Vui lòng nhập mật khẩu Admin.');form.__loginBusy=false;input.focus();return}
    btn.disabled=true;input.disabled=true;btn.textContent='⏳ Đang đăng nhập...';setMessage('');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin',signal:controller.signal});
      const text=await r.text();let data={};try{data=JSON.parse(text||'{}')}catch(_){ }
      if(!r.ok)throw new Error(data.error||('Đăng nhập thất bại (HTTP '+r.status+')'));
      if(!data.token)throw new Error('Máy chủ không trả về session token.');
      sessionStorage.setItem(TOKEN_KEY,data.token);
      await startAdmin();
    }catch(err){
      console.error('[STUDY Admin] login error:',err);
      setMessage(err?.name==='AbortError'?'❌ Máy chủ đăng nhập không phản hồi sau 10 giây.':('❌ '+(err?.message||'Đăng nhập thất bại.')))
    }finally{
      clearTimeout(timer);form.__loginBusy=false;btn.disabled=false;input.disabled=false;btn.textContent='🔐 Đăng nhập';repairLogin();
      if(!$('adminLogin')?.classList.contains('hidden'))setTimeout(()=>input.focus({preventScroll:true}),0)
    }
  }

  function bind(){
    const form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');
    if(!form||!input||!btn||form.__zeroLagBound)return;
    form.__zeroLagBound=true;repairLogin();
    form.addEventListener('submit',authenticate,true);
    btn.addEventListener('click',authenticate,true);
    input.addEventListener('keydown',e=>{if(e.key==='Enter')authenticate(e)},true);
    [0,100,500,1500,3000].forEach(ms=>setTimeout(repairLogin,ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();