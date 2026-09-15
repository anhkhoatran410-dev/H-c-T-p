/* STUDY TH — robust Admin navigation click repair. */
(function(){
  'use strict';
  if(window.__studyAdminNavRepair)return;
  window.__studyAdminNavRepair=true;

  const TITLES={
    dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',
    history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',
    bot:'Bot tự động',assistant:'Admin Copilot'
  };
  const IDS=Object.keys(TITLES);

  function setTab(id){
    if(!IDS.includes(id))return false;
    const app=document.getElementById('adminApp');
    const tab=document.getElementById(id);
    if(!app||!tab)return false;

    app.style.setProperty('pointer-events','auto','important');
    app.style.setProperty('position','relative','important');
    app.style.setProperty('z-index','10','important');

    const sidebar=app.querySelector('.sidebar');
    if(sidebar){
      sidebar.style.setProperty('pointer-events','auto','important');
      sidebar.style.setProperty('position','sticky','important');
      sidebar.style.setProperty('z-index','1000','important');
    }

    app.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(btn=>{
      btn.style.setProperty('pointer-events','auto','important');
      btn.style.setProperty('position','relative','important');
      btn.style.setProperty('z-index','1001','important');
      btn.classList.toggle('active',btn.dataset.tab===id);
    });

    app.querySelectorAll('.workspace > .tab').forEach(x=>{
      const on=x===tab;
      x.classList.toggle('active',on);
      x.style.setProperty('display',on?'block':'none','important');
      x.setAttribute('aria-hidden',on?'false':'true');
    });

    const title=document.getElementById('pageTitle');
    if(title)title.textContent=TITLES[id];
    window.__studyAdminTab=id;

    try{
      const loaders={
        dashboard:'loadDashboard',support:'startSupportLive',participants:'loadParticipants',
        history:'loadHistory',tests:'renderTests',accounts:'loadAccounts',assistant:'loadAssistant'
      };
      if(id==='bot'){
        if(typeof window.loadAccounts==='function')window.loadAccounts();
        if(typeof window.loadBotRules==='function')window.loadBotRules();
      }else{
        const fn=loaders[id];
        if(fn&&typeof window[fn]==='function')window[fn]();
      }
    }catch(e){console.warn('[STUDY nav repair] loader failed:',e)}
    return true;
  }

  function bind(){
    const app=document.getElementById('adminApp');
    if(!app)return;
    const sidebar=app.querySelector('.sidebar');
    const nav=document.getElementById('adminNav');
    if(sidebar){
      sidebar.style.setProperty('pointer-events','auto','important');
      sidebar.style.setProperty('position','sticky','important');
      sidebar.style.setProperty('z-index','1000','important');
    }
    if(nav){
      nav.style.setProperty('pointer-events','auto','important');
      nav.style.setProperty('position','relative','important');
      nav.style.setProperty('z-index','1001','important');
    }
    app.querySelectorAll('#adminNav .nav-item[data-tab], .quick[data-go]').forEach(btn=>{
      btn.style.setProperty('pointer-events','auto','important');
      btn.style.setProperty('position','relative','important');
      btn.style.setProperty('z-index','1002','important');
      if(btn.dataset.repairBound==='1')return;
      btn.dataset.repairBound='1';
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setTab(btn.dataset.tab||btn.dataset.go);
      },true);
    });
  }

  document.addEventListener('click',function(e){
    const el=e.target && e.target.closest && e.target.closest('#adminNav .nav-item[data-tab], .quick[data-go]');
    if(el){
      const id=el.dataset.tab||el.dataset.go;
      if(IDS.includes(id)){
        e.preventDefault();
        e.stopImmediatePropagation();
        setTab(id);
      }
    }
  },true);

  /* Some broken overlays can sit above the sidebar. Recover the button from the click coordinates. */
  document.addEventListener('pointerdown',function(e){
    if(e.button!==0)return;
    const stack=document.elementsFromPoint(e.clientX,e.clientY)||[];
    const btn=stack.find(x=>x.matches&&x.matches('#adminNav .nav-item[data-tab], .quick[data-go]'));
    if(!btn)return;
    const id=btn.dataset.tab||btn.dataset.go;
    if(IDS.includes(id)){
      e.preventDefault();
      setTab(id);
    }
  },true);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
  [100,500,1500,3000].forEach(ms=>setTimeout(bind,ms));
  window.__studyAdminGo=setTab;
})();
