/* STUDY TH — navigation-only recovery. Does not modify support chat rendering. */
(function(){
  'use strict';
  const TITLES={dashboard:'Tổng quan',support:'Hỗ trợ',participants:'Người tham gia',history:'Lịch sử làm bài',tests:'Bài kiểm tra',accounts:'Tài khoản hỗ trợ',bot:'Bot tự động',assistant:'Admin Copilot'};
  function activate(id){
    const tab=document.getElementById(id);
    if(!tab)return false;
    document.querySelectorAll('.workspace .tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(x=>x.classList.remove('active'));
    tab.classList.add('active');
    const nav=document.querySelector('#adminNav .nav-item[data-tab="'+id+'"]');
    nav?.classList.add('active');
    const title=document.getElementById('pageTitle');
    if(title)title.textContent=TITLES[id]||'Admin';
    try{ if(typeof window.openTab==='function' && !window.__navRepairCalling) { window.__navRepairCalling=true; window.openTab(id); window.__navRepairCalling=false; } }catch(_){ window.__navRepairCalling=false; }
    /* Re-assert visibility because older enhancement scripts may fight navigation. */
    document.querySelectorAll('.workspace .tab').forEach(x=>{x.style.display=x===tab?'block':'none'});
    tab.style.display='block';
    if(id==='tests'&&typeof window.renderTests==='function')setTimeout(()=>window.renderTests(),0);
    if(id==='participants'&&typeof window.loadParticipants==='function')setTimeout(()=>window.loadParticipants(),0);
    if(id==='history'&&typeof window.loadHistory==='function')setTimeout(()=>window.loadHistory(),0);
    if(id==='accounts'&&typeof window.loadAccounts==='function')setTimeout(()=>window.loadAccounts(),0);
    if(id==='bot'){if(typeof window.loadAccounts==='function')setTimeout(()=>window.loadAccounts(),0);if(typeof window.loadBotRules==='function')setTimeout(()=>window.loadBotRules(),0)}
    if(id==='dashboard'&&typeof window.loadDashboard==='function')setTimeout(()=>window.loadDashboard(),0);
    if(id==='support'&&typeof window.startSupportLive==='function')setTimeout(()=>window.startSupportLive(),0);
    if(id==='assistant'&&typeof window.loadAssistant==='function')setTimeout(()=>window.loadAssistant(),0);
    return true;
  }
  function bind(){
    document.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(btn=>{
      if(btn.dataset.navRepair==='1')return;
      btn.dataset.navRepair='1';
      btn.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();activate(btn.dataset.tab);},true);
    });
    document.querySelectorAll('.quick[data-go]').forEach(btn=>{
      if(btn.dataset.navRepair==='1')return;
      btn.dataset.navRepair='1';
      btn.addEventListener('click',function(e){e.preventDefault();activate(btn.dataset.go);},true);
    });
    const refresh=document.getElementById('refreshAll');
    if(refresh&&!refresh.dataset.navRepair){refresh.dataset.navRepair='1';refresh.addEventListener('click',function(e){e.preventDefault();location.reload()},true)}
    const theme=document.getElementById('themeToggle'),mobile=document.getElementById('mobileTheme');
    [theme,mobile].forEach(b=>{if(b&&!b.dataset.navRepair){b.dataset.navRepair='1';b.addEventListener('click',function(){if(typeof window.toggleTheme==='function')window.toggleTheme()},true)}});
    const initial=document.querySelector('#adminNav .nav-item.active[data-tab]')?.dataset.tab||'dashboard';
    activate(initial);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bind,50));else setTimeout(bind,50);
})();
