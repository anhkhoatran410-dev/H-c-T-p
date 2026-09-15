/* STUDY Admin — single navigation owner. */
(function(){
  'use strict';
  if (window.__studySingleNavLoaded) return;
  window.__studySingleNavLoaded = true;

  const TITLES = {
    dashboard:'Tổng quan', support:'Hỗ trợ', participants:'Người tham gia',
    history:'Lịch sử làm bài', tests:'Bài kiểm tra', accounts:'Tài khoản hỗ trợ',
    bot:'Bot tự động', assistant:'Admin Copilot'
  };
  const VALID = new Set(Object.keys(TITLES));
  let busy = false;

  function activate(id){
    if (!VALID.has(id)) return false;
    const app = document.getElementById('adminApp');
    if (!app) return false;
    const target = document.getElementById(id);
    if (!target) return false;

    app.querySelectorAll('.workspace > .tab').forEach(tab => {
      tab.classList.toggle('active', tab === target);
      tab.setAttribute('aria-hidden', tab === target ? 'false' : 'true');
    });
    app.querySelectorAll('#adminNav .nav-item[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === id);
    });

    const title = document.getElementById('pageTitle');
    if (title) title.textContent = TITLES[id];
    if (window.admin) window.admin.tab = id;
    window.__studyAdminTab = id;

    /* Load data only after the visual tab switch, and never block the click. */
    const loaders = {
      dashboard:'loadDashboard', support:'startSupportLive', participants:'loadParticipants',
      history:'loadHistory', tests:'renderTests', accounts:'loadAccounts', assistant:'loadAssistant'
    };
    try {
      if (id === 'bot') {
        if (typeof window.loadAccounts === 'function') Promise.resolve(window.loadAccounts()).catch(console.warn);
        if (typeof window.loadBotRules === 'function') Promise.resolve(window.loadBotRules()).catch(console.warn);
      } else {
        const fn = loaders[id];
        if (fn && typeof window[fn] === 'function') Promise.resolve(window[fn]()).catch(console.warn);
      }
    } catch (e) { console.warn('[STUDY navigation]', e); }
    return true;
  }

  function handleClick(e){
    if (busy) return;
    const btn = e.target && e.target.closest && e.target.closest('#adminNav .nav-item[data-tab], .quick[data-go]');
    if (!btn) return;
    const id = btn.dataset.tab || btn.dataset.go;
    if (!VALID.has(id)) return;
    e.preventDefault();
    e.stopPropagation();
    busy = true;
    try { activate(id); } finally { setTimeout(() => { busy = false; }, 0); }
  }

  document.addEventListener('click', handleClick, true);
  window.__studyAdminGo = activate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ activate('dashboard'); }, {once:true});
  }
})();