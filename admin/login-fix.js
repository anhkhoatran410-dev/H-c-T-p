/* STUDY TH — lightweight Admin bootstrap. Keep the core responsive; load feature modules only when needed. */
(function(){
  'use strict';
  if(window.__studyLoginBootstrapV3)return;
  window.__studyLoginBootstrapV3=true;

  const TOKEN_KEY='study_admin_session_v2';
  const CRITICAL_SCRIPT='auth.js?v=20260915-2';
  const APP_SCRIPT='app.js?v=20260915-2';
  const TITLES={dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',bot:'Bot tự động',assistant:'Admin Copilot'};
  const LOADERS={dashboard:'loadDashboard',support:'startSupportLive',participants:'loadParticipants',history:'loadHistory',tests:'renderTests',accounts:'loadAccounts',bot:'loadBotRules',assistant:'loadAssistant'};
  const $=id=>document.getElementById(id);
  const loaded=new Map();
  const moduleMap={
    tests:['exam-save-fix.js?v=20260915-2','exam-builder-v2.js?v=20260915-2','exam-builder-v4-repair.js?v=20260915-2','exam-multi-source-flashcard-repair.js?v=20260915-2'],
    support:[],participants:[],history:[],accounts:[],bot:[],assistant:[]
  };

  function repairLogin(){
    const screen=$('adminLogin'),form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');
    if(!screen||!form||!input||!btn)return;
    screen.style.pointerEvents='auto';form.style.pointerEvents='auto';input.style.pointerEvents='auto';btn.style.pointerEvents='auto';
  }

  function setAuthenticatedView(){
    const screen=$('adminLogin'),app=$('adminApp');
    if(screen){screen.classList.add('hidden');screen.style.setProperty('display','none','important');screen.style.setProperty('visibility','hidden','important');screen.style.setProperty('pointer-events','none','important');}
    if(app){app.classList.remove('hidden');app.style.setProperty('display','flex','important');app.style.setProperty('visibility','visible','important');app.style.setProperty('pointer-events','auto','important');}
  }

  function openTab(id){
    if(!TITLES[id])return;
    const app=$('adminApp'),tab=$(id);if(!app||!tab)return;
    admin.tab=id;
    app.querySelectorAll('.workspace > .tab').forEach(x=>x.classList.toggle('active',x===tab));
    app.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
    const title=$('pageTitle');if(title)title.textContent=TITLES[id];
    requestAnimationFrame(()=>{
      const loader=LOADERS[id];
      try{if(loader&&typeof window[loader]==='function')window[loader]();}catch(e){console.warn('[STUDY tab loader]',id,e)}
      loadTabModules(id);
    });
  }
  window.openTab=openTab;

  function bindNavigation(){
    const nav=$('adminNav');
    if(nav&&!nav.__studyBound){nav.__studyBound=true;nav.addEventListener('click',function(e){
      const b=e.target.closest('button[data-tab]');if(!b||!nav.contains(b))return;
      e.preventDefault();e.stopPropagation();openTab(b.dataset.tab);
    });}
    document.querySelectorAll('.quick[data-go]').forEach(b=>{if(!b.__studyBound){b.__studyBound=true;b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openTab(b.dataset.go);});}});
  }

  function loadScript(src){
    if(loaded.has(src))return loaded.get(src);
    const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error('Không tải được '+src));document.body.appendChild(s)});
    loaded.set(src,p);return p;
  }
  async function loadTabModules(id){
    const list=moduleMap[id]||[];if(!list.length)return;
    for(const src of list){try{await loadScript(src)}catch(e){console.warn('[STUDY module]',e.message)}}
  }

  function loadScriptOnce(src){return loadScript(src).catch(e=>console.warn('[STUDY optional]',e.message))}

  async function startAdmin(){
    if(window.__studyAdminStarted)return;
    window.__studyAdminStarted=true;
    try{
      await loadScript(CRITICAL_SCRIPT);
      await loadScript(APP_SCRIPT);
      setAuthenticatedView();
      bindNavigation();
      if(typeof window.bootAdmin==='function'){try{await window.bootAdmin()}catch(e){console.warn('[STUDY boot]',e)}}
      /* No bulk optional loading here. It used to start many observers/listeners at once and freeze the UI. */
    }catch(e){
      window.__studyAdminStarted=false;console.error('[STUDY bootstrap]',e);setAuthenticatedView();bindNavigation();
      const t=$('toast');if(t){t.textContent='⚠️ Admin mở nhưng một số mô-đun phụ chưa tải.';t.classList.add('show')}
    }
  }

  async function authenticate(event){
    event?.preventDefault();event?.stopImmediatePropagation();
    const form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');
    if(!form||!input||!btn||form.__loginBusy)return;
    form.__loginBusy=true;repairLogin();
    const password=String(input.value||'');
    if(!password){const m=$('loginMsg');if(m)m.textContent='⚠️ Vui lòng nhập mật khẩu Admin.';form.__loginBusy=false;input.focus();return}
    btn.disabled=true;input.disabled=true;btn.textContent='⏳ Đang đăng nhập...';
    try{
      const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin'});
      const text=await r.text();let data={};try{data=JSON.parse(text||'{}')}catch{}
      if(!r.ok)throw new Error(data.error||('Đăng nhập thất bại (HTTP '+r.status+')'));
      if(!data.token)throw new Error('Máy chủ không trả về session token.');
      sessionStorage.setItem(TOKEN_KEY,data.token);await startAdmin();
    }catch(e){const m=$('loginMsg');if(m)m.textContent='❌ '+e.message}
    finally{form.__loginBusy=false;btn.disabled=false;input.disabled=false;btn.textContent='🔐 Đăng nhập';repairLogin()}
  }

  function bindLogin(){const form=$('loginForm');if(form&&!form.__studyLoginBound){form.__studyLoginBound=true;form.addEventListener('submit',authenticate,true)}repairLogin()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindLogin,{once:true});else bindLogin();
  if(sessionStorage.getItem(TOKEN_KEY))startAdmin();
})();