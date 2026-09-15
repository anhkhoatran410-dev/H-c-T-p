/* STUDY TH — navigation-only recovery. Keeps existing UI and tab ids unchanged. */
(function(){
  'use strict';
  const TITLES={dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',bot:'Bot tự động',assistant:'Admin Copilot'};
  const TAB_IDS=Object.keys(TITLES);

  function allTabs(){return Array.from(document.querySelectorAll('#adminApp .workspace > .tab'));}
  function setVisibleTab(id){
    if(!TAB_IDS.includes(id))return false;
    const tab=document.getElementById(id);
    if(!tab)return false;
    allTabs().forEach(x=>{
      const on=x===tab;
      x.classList.toggle('active',on);
      x.setAttribute('aria-hidden',on?'false':'true');
      x.style.setProperty('display',on?'block':'none','important');
      x.style.setProperty('visibility',on?'visible':'hidden','important');
      x.style.setProperty('pointer-events',on?'auto':'none','important');
    });
    document.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
    const title=document.getElementById('pageTitle');
    if(title)title.textContent=TITLES[id];
    window.__studyAdminTab=id;
    return true;
  }
  function loadForTab(id){
    const calls={dashboard:'loadDashboard',support:'startSupportLive',participants:'loadParticipants',history:'loadHistory',tests:'renderTests',accounts:'loadAccounts',assistant:'loadAssistant'};
    try{
      if(id==='bot'){
        if(typeof window.loadAccounts==='function')window.loadAccounts();
        if(typeof window.loadBotRules==='function')window.loadBotRules();
        return;
      }
      const fn=calls[id];
      if(fn&&typeof window[fn]==='function')window[fn]();
    }catch(err){console.warn('[STUDY navigation] tab loader failed:',err);}
  }
  function activate(id){if(setVisibleTab(id)){setTimeout(()=>loadForTab(id),0);return true}return false;}

  function delegatedClick(e){
    const btn=e.target&&e.target.closest?e.target.closest('#adminNav .nav-item[data-tab], .quick[data-go]'):null;
    if(!btn)return;
    const id=btn.dataset.tab||btn.dataset.go;
    if(!TAB_IDS.includes(id))return;
    e.preventDefault();
    e.stopImmediatePropagation();
    activate(id);
  }

  function bind(){
    if(window.__studyAdminNavigationDelegated)return;
    window.__studyAdminNavigationDelegated=true;
    document.addEventListener('click',delegatedClick,true);
    const root=document.getElementById('adminApp');
    if(root&&window.MutationObserver&&!window.__studyTabGuard){
      window.__studyTabGuard=new MutationObserver(function(){
        const active=document.querySelector('#adminApp .workspace > .tab.active');
        if(!active)return;
        allTabs().forEach(x=>{
          const on=x===active;
          if(x.style.display!==(on?'block':'none'))x.style.setProperty('display',on?'block':'none','important');
          if(x.getAttribute('aria-hidden')!==(on?'false':'true'))x.setAttribute('aria-hidden',on?'false':'true');
        });
      });
      const workspace=root.querySelector('.workspace');
      if(workspace)window.__studyTabGuard.observe(workspace,{subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
    }
    const initial=document.querySelector('#adminNav .nav-item.active[data-tab]')?.dataset.tab||'dashboard';
    setVisibleTab(initial);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,50),{once:true});
  else setTimeout(bind,50);
})();
