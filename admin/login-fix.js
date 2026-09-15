/* STUDY TH — isolated login/bootstrap. Navigation has one owner after the app core loads. */
(function(){
  'use strict';
  if(window.__studyLoginBootstrapV2)return;
  window.__studyLoginBootstrapV2=true;

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
  const TITLES={dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',bot:'Bot tự động',assistant:'Admin Copilot'};
  const LOADERS={dashboard:'loadDashboard',support:'startSupportLive',participants:'loadParticipants',history:'loadHistory',tests:'renderTests',accounts:'loadAccounts',assistant:'loadAssistant'};
  const $=id=>document.getElementById(id);

  function repairLogin(){
    const screen=$('adminLogin'),form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');
    if(!screen||!form||!input||!btn)return;
    screen.style.setProperty('pointer-events','auto','important');
    form.style.setProperty('pointer-events','auto','important');
    input.style.setProperty('pointer-events','auto','important');
    btn.style.setProperty('pointer-events','auto','important');
  }

  function setAuthenticatedView(){
    const screen=$('adminLogin'),app=$('adminApp');
    if(screen){screen.classList.add('hidden');screen.style.setProperty('display','none','important');screen.style.setProperty('visibility','hidden','important');screen.style.setProperty('pointer-events','none','important');screen.setAttribute('aria-hidden','true')}
    if(app){app.classList.remove('hidden');app.style.setProperty('display','flex','important');app.style.setProperty('visibility','visible','important');app.style.setProperty('pointer-events','auto','important');app.removeAttribute('aria-hidden')}
  }

  function robustOpenTab(id){
    if(!TITLES[id])return;
    const app=$('adminApp'),tab=$(id);
    if(!app||!tab)return;
    admin.tab=id;
    app.querySelectorAll('.workspace > .tab').forEach(x=>x.classList.toggle('active',x===tab));
    app.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
    const title=$('pageTitle');if(title)title.textContent=TITLES[id];
    app.style.setProperty('pointer-events','auto','important');
    const nav=$('adminNav');if(nav)nav.style.setProperty('pointer-events','auto','important');
    app.querySelectorAll('#adminNav .nav-item[data-tab],.quick[data-go]').forEach(x=>x.style.setProperty('pointer-events','auto','important'));
    const loader=LOADERS[id];
    if(loader){
      window.setTimeout(function(){try{if(typeof window[loader]==='function')window[loader]()}catch(err){console.warn('[STUDY navigation] loader failed:',err)}},0);
    }
  }

  function installNavigation(){
    window.openTab=robustOpenTab;
    document.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(btn=>{
      btn.onclick=function(e){e.preventDefault();e.stopPropagation();robustOpenTab(btn.dataset.tab)};
    });
    document.querySelectorAll('.quick[data-go]').forEach(btn=>{
      btn.onclick=function(e){e.preventDefault();e.stopPropagation();robustOpenTab(btn.dataset.go)};
    });
  }

  function loadScript(src,timeoutMs){
    return new Promise(function(resolve,reject){
      const s=document.createElement('script');let done=false;const timer=setTimeout(function(){if(done)return;done=true;s.remove();reject(new Error('Module timeout: '+src))},timeoutMs||12000);
      s.src=src;s.async=false;s.onload=function(){if(done)return;done=true;clearTimeout(timer);resolve()};s.onerror=function(){if(done)return;done=true;clearTimeout(timer);reject(new Error('Không tải được Admin module: '+src))};document.body.appendChild(s);
    });
  }

  async function startAdmin(){
    if(window.__studyAdminStarted)return;
    window.__studyAdminStarted=true;
    try{
      await loadScript(CRITICAL_SCRIPT);
      await loadScript(APP_SCRIPT);
      setAuthenticatedView();
      installNavigation();
      if(typeof window.bootAdmin==='function'){try{await Promise.resolve(window.bootAdmin())}catch(err){console.warn('[STUDY Admin] boot error:',err)}}
      /* Optional feature modules must never block the core UI/navigation. */
      Promise.allSettled(OPTIONAL_SCRIPTS.map(src=>loadScript(src))).then(function(){installNavigation()}).catch(function(){});
      [250,1000,2500].forEach(function(ms){setTimeout(installNavigation,ms)});
    }catch(err){
      window.__studyAdminStarted=false;
      console.error('[STUDY Admin] bootstrap error:',err);
      setAuthenticatedView();
      installNavigation();
      const toast=$('toast');if(toast){toast.textContent='⚠️ Admin đã mở nhưng một số mô-đun phụ chưa tải.';toast.classList.add('show')}
    }
  }

  async function authenticate(event){
    if(event){event.preventDefault();event.stopImmediatePropagation()}
    const form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');
    if(!form||!input||!btn||form.__loginBusy)return;
    form.__loginBusy=true;repairLogin();
    const password=String(input.value||'');
    if(!password){const m=$('loginMsg');if(m)m.textContent='⚠️ Vui lòng nhập mật khẩu Admin.';form.__loginBusy=false;input.focus();return}
    btn.disabled=true;input.disabled=true;btn.textContent='⏳ Đang đăng nhập...';
    try{
      const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin'});
      const text=await r.text();let data={};try{data=JSON.parse(text||'{}')}catch(_){ }
      if(!r.ok)throw new Error(data.error||('Đăng nhập thất bại (HTTP '+r.status+')'));
      if(!data.token)throw new Error('Máy chủ không trả về session token.');
      sessionStorage.setItem(TOKEN_KEY,data.token);
      await startAdmin();
    }catch(err){const m=$('loginMsg');if(m)m.textContent='❌ '+(err?.message||'Đăng nhập thất bại.')}finally{form.__loginBusy=false;btn.disabled=false;input.disabled=false;btn.textContent='🔐 Đăng nhập';repairLogin()}
  }

  function bind(){
    const form=$('loginForm');
    if(form&&!form.__studyLoginBound){form.__studyLoginBound=true;form.addEventListener('submit',authenticate,true)}
    repairLogin();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  if(sessionStorage.getItem(TOKEN_KEY))startAdmin();
})();