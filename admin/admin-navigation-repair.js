/* STUDY TH — navigation-only recovery. Support chat rendering is untouched. */
(function(){
  'use strict';
  const TITLES={dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',bot:'Bot tự động',assistant:'Admin Copilot'};

  function allTabs(){ return Array.from(document.querySelectorAll('.workspace > .tab')); }

  function activate(id){
    const tab=document.getElementById(id);
    if(!tab || !tab.classList.contains('tab')) return false;
    const tabs=allTabs();

    /* HARD ISOLATION: exactly one workspace tab can be visible. */
    tabs.forEach(x=>{
      const on=x===tab;
      x.classList.toggle('active',on);
      x.setAttribute('aria-hidden',on?'false':'true');
      x.style.setProperty('display',on?'block':'none','important');
      x.style.setProperty('visibility',on?'visible':'hidden','important');
      x.style.setProperty('pointer-events',on?'auto':'none','important');
    });

    document.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(x=>{
      x.classList.toggle('active',x.dataset.tab===id);
    });
    const title=document.getElementById('pageTitle');
    if(title) title.textContent=TITLES[id]||'Admin';

    /* Do NOT call another tab/router function here: older scripts can re-show support. */
    try{
      if(id==='tests'&&typeof window.renderTests==='function') setTimeout(()=>window.renderTests(),0);
      if(id==='participants'&&typeof window.loadParticipants==='function') setTimeout(()=>window.loadParticipants(),0);
      if(id==='history'&&typeof window.loadHistory==='function') setTimeout(()=>window.loadHistory(),0);
      if(id==='accounts'&&typeof window.loadAccounts==='function') setTimeout(()=>window.loadAccounts(),0);
      if(id==='bot'){
        if(typeof window.loadAccounts==='function') setTimeout(()=>window.loadAccounts(),0);
        if(typeof window.loadBotRules==='function') setTimeout(()=>window.loadBotRules(),0);
      }
      if(id==='dashboard'&&typeof window.loadDashboard==='function') setTimeout(()=>window.loadDashboard(),0);
      if(id==='support'&&typeof window.startSupportLive==='function') setTimeout(()=>window.startSupportLive(),0);
      if(id==='assistant'&&typeof window.loadAssistant==='function') setTimeout(()=>window.loadAssistant(),0);
    }catch(err){ console.warn('[navigation-repair]',err); }
    return true;
  }

  function bind(){
    document.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(btn=>{
      if(btn.dataset.navRepair==='1') return;
      btn.dataset.navRepair='1';
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        activate(btn.dataset.tab);
      },true);
    });

    document.querySelectorAll('.quick[data-go]').forEach(btn=>{
      if(btn.dataset.navRepair==='1') return;
      btn.dataset.navRepair='1';
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        activate(btn.dataset.go);
      },true);
    });

    const refresh=document.getElementById('refreshAll');
    if(refresh&&!refresh.dataset.navRepair){
      refresh.dataset.navRepair='1';
      refresh.addEventListener('click',function(e){e.preventDefault();location.reload()},true);
    }

    const theme=document.getElementById('themeToggle'),mobile=document.getElementById('mobileTheme');
    [theme,mobile].forEach(b=>{
      if(b&&!b.dataset.navRepair){
        b.dataset.navRepair='1';
        b.addEventListener('click',function(){if(typeof window.toggleTheme==='function')window.toggleTheme()},true);
      }
    });

    const initial=document.querySelector('#adminNav .nav-item.active[data-tab]')?.dataset.tab||'dashboard';
    activate(initial);

    /* Mutation guard: if any old script tries to re-display another tab, immediately hide it. */
    if(!window.__studyTabGuard){
      window.__studyTabGuard=new MutationObserver(function(){
        const active=document.querySelector('.workspace > .tab.active');
        if(!active) return;
        allTabs().forEach(x=>{
          const on=x===active;
          if(x.style.display !== (on?'block':'none')) x.style.setProperty('display',on?'block':'none','important');
          if(x.getAttribute('aria-hidden') !== (on?'false':'true')) x.setAttribute('aria-hidden',on?'false':'true');
        });
      });
      window.__studyTabGuard.observe(document.querySelector('.workspace'),{subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,50));
  else setTimeout(bind,50);
})();
