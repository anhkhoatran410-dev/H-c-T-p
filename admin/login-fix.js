/* STUDY TH — isolated, zero-lag Admin login bootstrap. */
(function(){
  'use strict';
  if(window.__studyLoginBootstrap)return;
  window.__studyLoginBootstrap=true;

  const TOKEN_KEY='study_admin_session_v2';
  const CRITICAL_SCRIPT='auth.js?v=20260810-1';
  const APP_SCRIPT='app.js?v=20260810-4';
  const OPTIONAL_SCRIPTS=[
    'media-fix.js?v=20260810-3','fix.js?v=20260810-1',
    'enhancements.js?v=20260810-1','final-fix.js?v=20260810-1','exam-save-fix.js?v=20260810-1',
    '/admin-media-fix.js?v=20260810-1','/admin-final-fix.js?v=20260810-1','admin-navigation-repair.js?v=20260811-1',
    'exam-builder-v2.js?v=20260812-2','exam-builder-v4-repair.js?v=20260915-1',
    'exam-multi-source-flashcard-repair.js?v=20260812-1'
  ];
  const $=id=>document.getElementById(id);
  function repairLogin(){const screen=$('adminLogin'),card=screen?.querySelector('.login-card'),form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');if(!screen||!form||!input||!btn)return;screen.classList.remove('loading','is-loading');screen.style.pointerEvents='auto';screen.style.position='fixed';screen.style.inset='0';screen.style.zIndex='2147483000';if(card){card.style.pointerEvents='auto';card.style.position='relative';card.style.zIndex='2147483001'}form.style.pointerEvents='auto';input.readOnly=false;input.style.pointerEvents='auto';if(!input.disabled)btn.style.pointerEvents='auto'}
  function setMessage(text){const el=$('loginMsg');if(el)el.textContent=text||''}
  function setAuthenticatedView(){$('adminLogin')?.classList.add('hidden');$('adminApp')?.classList.remove('hidden')}
  function loadScript(src,timeoutMs=12000){return new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;const timer=setTimeout(()=>{if(done)return;done=true;s.remove();reject(new Error('Module timeout: '+src))},timeoutMs);s.src=src;s.async=false;s.onload=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};s.onerror=()=>{if(done)return;done=true;clearTimeout(timer);reject(new Error('Không tải được Admin module: '+src))};document.body.appendChild(s)})}

  function bindNavigationCore(){
    if(window.__studyAdminNavigationCore)return;
    window.__studyAdminNavigationCore=true;
    const TITLES={dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',bot:'Bot tự động',assistant:'Admin Copilot'};
    const VALID=Object.keys(TITLES);
    function activate(id){
      if(!VALID.includes(id))return false;
      const root=$('adminApp'),tab=$(id);
      if(!root||!tab)return false;
      root.querySelectorAll('.workspace > .tab').forEach(x=>{
        const on=x===tab;
        x.classList.toggle('active',on);
        x.style.display=on?'block':'none';
        x.setAttribute('aria-hidden',on?'false':'true');
        x.style.pointerEvents=on?'auto':'none';
      });
      root.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      const title=$('pageTitle');if(title)title.textContent=TITLES[id];
      window.__studyAdminTab=id;
      const loaders={dashboard:'loadDashboard',support:'startSupportLive',participants:'loadParticipants',history:'loadHistory',tests:'renderTests',accounts:'loadAccounts',assistant:'loadAssistant'};
      setTimeout(()=>{try{if(id==='bot'){if(typeof window.loadAccounts==='function')window.loadAccounts();if(typeof window.loadBotRules==='function')window.loadBotRules();return}const fn=loaders[id];if(fn&&typeof window[fn]==='function')window[fn]()}catch(e){console.warn('[STUDY navigation core] loader failed:',e)}},0);
      return true;
    }
    window.__studyAdminGo=activate;
    document.addEventListener('click',function(e){
      const btn=e.target?.closest?.('#adminNav .nav-item[data-tab], .quick[data-go]');
      if(!btn)return;
      const id=btn.dataset.tab||btn.dataset.go;
      if(!VALID.includes(id))return;
      e.preventDefault();
      e.stopImmediatePropagation();
      activate(id);
    },true);
    const bindDirect=()=>{
      document.querySelectorAll('#adminNav .nav-item[data-tab], .quick[data-go]').forEach(btn=>{
        if(btn.dataset.coreBound==='1')return;
        btn.dataset.coreBound='1';
        btn.onclick=()=>activate(btn.dataset.tab||btn.dataset.go);
      });
    };
    bindDirect();
    setTimeout(bindDirect,100);setTimeout(bindDirect,500);setTimeout(bindDirect,1500);
    const initial=$('#adminNav .nav-item.active[data-tab]')?.dataset.tab||'dashboard';
    activate(initial);
  }

  async function startAdmin(){
    if(window.__studyAdminStarted)return;
    window.__studyAdminStarted=true;
    try{
      await loadScript(CRITICAL_SCRIPT);
      await loadScript(APP_SCRIPT);
      setAuthenticatedView();
      bindNavigationCore();
      const results=await Promise.allSettled(OPTIONAL_SCRIPTS.map(src=>loadScript(src)));
      const failed=results.map((r,i)=>r.status==='rejected'?OPTIONAL_SCRIPTS[i]:null).filter(Boolean);
      if(failed.length)console.warn('[STUDY Admin] optional modules skipped:',failed);
      if(typeof window.bootAdmin==='function'){try{await Promise.resolve(window.bootAdmin())}catch(err){console.error('[STUDY Admin] boot error (session preserved):',err)}}
      else if(typeof window.showApp==='function'){try{window.showApp()}catch(err){console.error('[STUDY Admin] showApp error:',err)}}
      bindNavigationCore();
    }catch(err){
      window.__studyAdminStarted=false;
      console.error('[STUDY Admin] core bootstrap error (session preserved):',err);
      setAuthenticatedView();
      bindNavigationCore();
      const toast=$('toast');if(toast){toast.textContent='⚠️ Admin đã đăng nhập nhưng một phần giao diện chưa tải. Hãy tải lại trang.';toast.classList.add('show')}
    }
  }
  async function authenticate(event){
    if(event){event.preventDefault();event.stopImmediatePropagation()}
    const form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');if(!form||!input||form.__loginBusy)return;
    form.__loginBusy=true;repairLogin();const password=String(input.value||'');if(!password){setMessage('⚠️ Vui lòng nhập mật khẩu Admin.');form.__loginBusy=false;input.focus();return}
    btn.disabled=true;input.disabled=true;btn.textContent='⏳ Đang đăng nhập...';setMessage('');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    try{const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin',signal:controller.signal});const text=await r.text();let data={};try{data=JSON.parse(text||'{}')}catch(_){}if(!r.ok)throw new Error(data.error||('Đăng nhập thất bại (HTTP '+r.status+')'));if(!data.token)throw new Error('Máy chủ không trả về session token.');sessionStorage.setItem(TOKEN_KEY,data.token);await startAdmin()}
    catch(err){console.error('[STUDY Admin] login error:',err);setMessage(err?.name==='AbortError'?'❌ Máy chủ đăng nhập không phản hồi sau 10 giây.':('❌ '+(err?.message||'Đăng nhập thất bại.')))}
    finally{clearTimeout(timer);form.__loginBusy=false;btn.disabled=false;input.disabled=false;btn.textContent='🔐 Đăng nhập';repairLogin();if(!$('adminLogin')?.classList.contains('hidden'))setTimeout(()=>input.focus({preventScroll:true}),0)}
  }
  function bind(){const form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');if(!form||!input||!btn||form.__zeroLagBound)return;form.__zeroLagBound=true;repairLogin();form.addEventListener('submit',authenticate,true);btn.addEventListener('click',authenticate,true);input.addEventListener('keydown',e=>{if(e.key==='Enter')authenticate(e)},true);[0,100,500,1500,3000].forEach(ms=>setTimeout(repairLogin,ms))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();