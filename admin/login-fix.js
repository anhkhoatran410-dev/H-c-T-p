/* STUDY TH — lightweight Admin bootstrap. */
(function(){
  'use strict';
  if(window.__studyLoginBootstrapV8)return;
  window.__studyLoginBootstrapV8=true;
  const TOKEN_KEY='study_admin_session_v2';
  const CRITICAL_SCRIPT='auth.js?v=20260915-3';
  const APP_SCRIPT='app.js?v=20260915-3';
  const TITLES={dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',bot:'Bot tự động',assistant:'Admin Copilot'};
  const LOADERS={dashboard:'loadDashboard',support:'startSupportLive',participants:'loadParticipants',history:'loadHistory',tests:'renderTests',accounts:'loadAccounts',bot:'loadBotRules',assistant:'loadAssistant'};
  const $=id=>document.getElementById(id);
  const loaded=new Map();
  const moduleMap={tests:['exam-builder-v2.js?v=20260916-2'],support:[],participants:[],history:[],accounts:[],bot:[],assistant:[]};

  function injectMobileUX(){
    if($('study-mobile-ux'))return;
    const s=document.createElement('style');
    s.id='study-mobile-ux';
    s.textContent=`
      @media(max-width:760px){
        html,body{width:100%;max-width:100%;overflow-x:hidden}
        .admin-shell{min-width:0;width:100%}
        .sidebar{position:fixed;z-index:70;left:0;top:0;bottom:0;width:72px;height:100dvh;padding:10px 7px;overflow:hidden}
        .sidebar-top{padding:2px 0 12px;display:grid;gap:8px;justify-items:center}
        .brand-row{justify-content:center}.brand-row>div{display:none}.brand-orb{width:46px;height:46px;border-radius:15px}
        .sidebar-top .icon-btn{width:42px;height:42px}
        .admin-profile{justify-content:center;margin:2px 0 10px;padding:10px 4px}.admin-profile>div{display:none}.online-dot{width:8px;height:8px}
        #adminNav{gap:5px}.nav-item{width:58px;min-height:48px;padding:10px 4px;justify-content:center;gap:0;text-align:center;font-size:20px;border-radius:14px;transform:none!important}
        .nav-item span{display:none}.nav-item i{position:absolute;right:1px;top:2px;min-width:17px;height:17px;padding:0 4px;font-size:9px}
        .sidebar-bottom{gap:5px}.sidebar-bottom .nav-item{font-size:20px}
        .workspace{width:calc(100% - 72px);margin-left:72px;padding:16px 12px 36px;min-width:0}
        .topbar{margin-bottom:14px;align-items:flex-start}.topbar h1{font-size:23px}.eyebrow{font-size:10px}.live-pill{padding:7px 9px}
        .hero{min-height:auto;padding:20px;border-radius:20px}.hero h2{font-size:23px;line-height:1.2}.hero p{font-size:13px;line-height:1.5}.hero-orb{width:62px;height:62px;border-radius:20px;font-size:27px;flex:0 0 auto}
        .stats-grid{grid-template-columns:1fr 1fr;gap:9px}.stat-card{padding:14px;border-radius:16px}.stat-card b{font-size:25px;margin-top:7px}.stat-card small{font-size:11px}
        .two-col,.form-grid{grid-template-columns:1fr}.panel{padding:14px;border-radius:17px}.section-head{align-items:flex-start}.section-head h2{font-size:22px}.section-head p{font-size:13px;line-height:1.45}
        .quick-grid{grid-template-columns:1fr 1fr;gap:8px}.quick{padding:12px}.quick b{font-size:12px}.quick small{font-size:10px}
        .messenger{height:calc(100dvh - 150px);min-height:0;grid-template-columns:1fr;border-radius:18px}
        .conversation-list{display:none}.conversation{min-height:0}.chat-header{padding:12px}.message-list{padding:14px}.bubble{max-width:88%}
        .table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:14px}
        table{min-width:640px}
        #history .table-wrap,#participants .table-wrap{overflow:visible}
        #history table,#participants table{min-width:0;width:100%}
        #history thead,#participants thead{display:none}
        #history tbody,#participants tbody{display:grid;gap:9px}
        #history tr,#participants tr{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--panel2);box-shadow:0 5px 16px rgba(28,45,80,.05)}
        #history td,#participants td{padding:3px 0;border:0;font-size:12px;min-width:0;word-break:break-word}
        #history td:nth-child(1),#participants td:nth-child(1){grid-column:1/-1;font-weight:800;font-size:13px}
        #history td:before,#participants td:before{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:2px}
        #history td:nth-child(1):before{content:'Thời gian'}#history td:nth-child(2):before{content:'Người học'}#history td:nth-child(3):before{content:'Bài kiểm tra'}#history td:nth-child(4):before{content:'Kết quả'}#history td:nth-child(5):before{content:'Câu sai'}
        #participants td:nth-child(1):before{content:'Người tham gia'}#participants td:nth-child(2):before{content:'Mã'}#participants td:nth-child(3):before{content:'Lượt làm'}#participants td:nth-child(4):before{content:'Điểm gần nhất'}#participants td:nth-child(5):before{content:'Hoạt động'}
        #tests .eb2-grid{grid-template-columns:1fr}.eb2-mode{grid-template-columns:1fr!important}.eb2-panel{padding:15px!important;border-radius:18px!important}.eb2-head{display:block!important}.eb2-head .eb2-count{display:inline-flex;margin-top:8px}
        .eb2-drop{padding:14px!important}.eb2-grid{gap:11px!important}.eb2-field input,.eb2-field select,.eb2-field textarea{font-size:16px!important}
        .eb2-actions{position:sticky;bottom:8px;z-index:20;padding-top:6px;background:linear-gradient(to top,rgba(244,247,251,.97),rgba(244,247,251,0));margin-left:-2px;margin-right:-2px}
        body.dark .eb2-actions{background:linear-gradient(to top,rgba(11,16,32,.97),rgba(11,16,32,0))}
        .eb2-actions button{flex:1;min-height:46px}.eb2-file{min-width:0}.eb2-hint{font-size:11px}
        .composer{gap:5px;padding:9px}.composer textarea{font-size:16px}.send-btn{flex:0 0 40px}
      }
    `;
    document.head.appendChild(s);
  }
  function repairLogin(){const screen=$('adminLogin'),form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');if(!screen||!form||!input||!btn)return;screen.style.pointerEvents='auto';form.style.pointerEvents='auto';input.style.pointerEvents='auto';btn.style.pointerEvents='auto'}
  function setAuthenticatedView(){const screen=$('adminLogin'),app=$('adminApp');if(screen){screen.classList.add('hidden');screen.style.setProperty('display','none','important');screen.style.setProperty('visibility','hidden','important');screen.style.setProperty('pointer-events','none','important')}if(app){app.classList.remove('hidden');app.style.setProperty('display','flex','important');app.style.setProperty('visibility','visible','important');app.style.setProperty('pointer-events','auto','important')}}
  function openTab(id){if(!TITLES[id])return;const app=$('adminApp'),tab=$(id);if(!app||!tab)return;window.admin=window.admin||{};admin.tab=id;app.querySelectorAll('.workspace > .tab').forEach(x=>x.classList.toggle('active',x===tab));app.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));const title=$('pageTitle');if(title)title.textContent=TITLES[id];requestAnimationFrame(()=>{const loader=LOADERS[id];try{if(loader&&typeof window[loader]==='function')window[loader]()}catch(e){console.warn('[STUDY tab loader]',id,e)}loadTabModules(id)})}
  window.openTab=openTab;
  function bindNavigation(){const nav=$('adminNav');if(nav&&!nav.__studyBound){nav.__studyBound=true;nav.addEventListener('click',function(e){const b=e.target.closest('button[data-tab]');if(!b||!nav.contains(b))return;e.preventDefault();e.stopPropagation();openTab(b.dataset.tab)})}document.querySelectorAll('.quick[data-go]').forEach(b=>{if(!b.__studyBound){b.__studyBound=true;b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openTab(b.dataset.go)})}})}
  function loadScript(src){if(loaded.has(src))return loaded.get(src);const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error('Không tải được '+src));document.body.appendChild(s)});loaded.set(src,p);return p}
  async function loadTabModules(id){const list=moduleMap[id]||[];if(!list.length)return;for(const src of list){try{await loadScript(src)}catch(e){console.warn('[STUDY module]',e.message)}}}
  async function startAdmin(){if(window.__studyAdminStarted)return;window.__studyAdminStarted=true;try{await loadScript(CRITICAL_SCRIPT);await loadScript(APP_SCRIPT);setAuthenticatedView();injectMobileUX();bindNavigation();if(typeof window.bootAdmin==='function'){try{await window.bootAdmin()}catch(e){console.warn('[STUDY boot]',e)}}}catch(e){window.__studyAdminStarted=false;console.error('[STUDY bootstrap]',e);setAuthenticatedView();injectMobileUX();bindNavigation();const t=$('toast');if(t){t.textContent='⚠️ Admin mở nhưng một số mô-đun phụ chưa tải.';t.classList.add('show')}}}
  async function authenticate(event){event?.preventDefault();event?.stopImmediatePropagation();const form=$('loginForm'),input=$('adminPassword'),btn=form?.querySelector('button[type="submit"]');if(!form||!input||!btn||form.__loginBusy)return;form.__loginBusy=true;repairLogin();const password=String(input.value||'');if(!password){const m=$('loginMsg');if(m)m.textContent='⚠️ Vui lòng nhập mật khẩu Admin.';form.__loginBusy=false;input.focus();return}btn.disabled=true;input.disabled=true;btn.textContent='⏳ Đang đăng nhập...';try{const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'same-origin'});const text=await r.text();let data={};try{data=JSON.parse(text||'{}')}catch{}if(!r.ok)throw new Error(data.error||('Đăng nhập thất bại (HTTP '+r.status+')'));if(!data.token)throw new Error('Máy chủ không trả về session token.');sessionStorage.setItem(TOKEN_KEY,data.token);await startAdmin()}catch(e){const m=$('loginMsg');if(m)m.textContent='❌ '+e.message}finally{form.__loginBusy=false;btn.disabled=false;input.disabled=false;btn.textContent='🔐 Đăng nhập';repairLogin()}}
  function bindLogin(){const form=$('loginForm');if(form&&!form.__studyLoginBound){form.__studyLoginBound=true;form.addEventListener('submit',authenticate,true)}repairLogin()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindLogin,{once:true});else bindLogin();
  if(sessionStorage.getItem(TOKEN_KEY))startAdmin();
})();