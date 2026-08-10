/* STUDY TH — ADMIN SUPPORT HOTFIX v1
   Scope: Admin > Hỗ trợ ONLY.
   Guarantees a visible composer, selectable conversations, send-to-Supabase,
   realtime/poll refresh, and no accidental changes to the student support UI.
*/
(function () {
  'use strict';
  if (window.__studyAdminSupportHotfixV1) return;
  window.__studyAdminSupportHotfixV1 = true;

  function installStyle() {
    if (document.getElementById('study-admin-support-hotfix-style')) return;
    var s = document.createElement('style');
    s.id = 'study-admin-support-hotfix-style';
    s.textContent = [
      '#support.tab.active{display:flex!important;flex-direction:column!important;min-height:calc(100vh - 110px)!important}',
      '#support.tab.active .section-head{flex:0 0 auto!important}',
      '#support .messenger{flex:1 1 auto!important;height:auto!important;min-height:0!important;max-height:calc(100vh - 245px)!important}',
      '#support .conversation{display:flex!important;flex-direction:column!important;min-width:0!important;min-height:0!important;height:100%!important;overflow:hidden!important}',
      '#support #chatHeader{flex:0 0 auto!important}',
      '#support #supportMessages{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important}',
      '#support #replyForm{display:flex!important;flex:0 0 auto!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:100!important;min-height:70px!important;align-items:flex-end!important;gap:8px!important;padding:12px!important;background:var(--panel)!important;border-top:1px solid var(--line)!important;box-sizing:border-box!important}',
      '#support #replyForm.hidden{display:flex!important}',
      '#support #replyInput{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;min-height:44px!important;resize:none!important;box-sizing:border-box!important}',
      '#support #replyForm .send-btn{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 42px!important;align-items:center!important;justify-content:center!important}',
      '#support #replyForm .composer-tool{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto!important}',
      '#support #replyForm textarea:disabled{opacity:.7!important}',
      '@media(max-width:900px){#support.tab.active{min-height:calc(100vh - 90px)!important}#support .messenger{max-height:none!important;height:calc(100vh - 190px)!important;grid-template-columns:minmax(190px,32%) minmax(0,1fr)!important}}',
      '@media(max-width:650px){#support .messenger{grid-template-columns:1fr!important}#support .conversation-list{max-height:220px;border-right:0;border-bottom:1px solid var(--line)}#support #replyForm .composer-tool{display:none!important}}'
    ].join('');
    document.head.appendChild(s);
  }

  function els() {
    return {
      support: document.getElementById('support'),
      form: document.getElementById('replyForm'),
      input: document.getElementById('replyInput'),
      messages: document.getElementById('supportMessages')
    };
  }

  function ensureForm() {
    installStyle();
    var e = els();
    if (!e.support) return null;
    var conversation = e.support.querySelector('.conversation');
    if (!conversation) return null;

    if (!e.form) {
      var form = document.createElement('form');
      form.id = 'replyForm';
      form.className = 'composer';
      form.autocomplete = 'off';
      form.innerHTML = '<button type="button" class="icon-btn composer-tool" aria-label="Thêm">＋</button>' +
        '<button type="button" class="icon-btn composer-tool" aria-label="Emoji">😊</button>' +
        '<button type="button" class="icon-btn composer-tool" aria-label="Sticker">✨</button>' +
        '<textarea id="replyInput" rows="1" placeholder="Nhập tin nhắn cho người học..."></textarea>' +
        '<button class="send-btn" type="submit" aria-label="Gửi">➤</button>';
      conversation.appendChild(form);
      e = els();
    }

    e.form.classList.remove('hidden');
    e.form.style.setProperty('display', 'flex', 'important');
    e.form.style.setProperty('visibility', 'visible', 'important');
    e.form.style.setProperty('opacity', '1', 'important');

    var ready = !!(window.admin && admin.thread && admin.thread.id);
    if (e.input) {
      e.input.disabled = !ready;
      e.input.placeholder = ready ? 'Nhập tin nhắn cho người học...' : 'Chọn một cuộc trò chuyện bên trái...';
      e.input.style.setProperty('display', 'block', 'important');
      e.input.style.setProperty('visibility', 'visible', 'important');
      e.input.style.setProperty('opacity', '1', 'important');
    }
    var btn = e.form.querySelector('.send-btn');
    if (btn) {
      btn.disabled = !ready;
      btn.style.setProperty('display', 'inline-flex', 'important');
      btn.style.setProperty('visibility', 'visible', 'important');
      btn.style.setProperty('opacity', '1', 'important');
    }
    return e.form;
  }

  function scrollBottom() {
    var box = document.getElementById('supportMessages');
    if (box) requestAnimationFrame(function () { box.scrollTop = box.scrollHeight; });
  }

  async function reloadMessages() {
    if (!window.admin || !admin.thread || !admin.thread.id || typeof loadSupabase !== 'function') return;
    try {
      await loadSupabase();
      var r = await db.from('support_messages')
        .select('*')
        .eq('thread_id', admin.thread.id)
        .order('created_at', { ascending: true });
      if (r.error) throw r.error;
      if (!admin.thread || String(admin.thread.id) !== String(r.data?.[0]?.thread_id || admin.thread.id)) return;
      admin.messages = r.data || [];
      if (typeof renderChat === 'function') renderChat();
      ensureForm();
      scrollBottom();
    } catch (err) {
      console.error('[ADMIN SUPPORT HOTFIX] reload failed', err);
      ensureForm();
    }
  }

  async function send() {
    var e = els();
    var text = e.input ? e.input.value.trim() : '';
    if (!text || !window.admin || !admin.thread || !admin.thread.id || window.__studyAdminSupportSending) return;

    window.__studyAdminSupportSending = true;
    ensureForm();
    try {
      await loadSupabase();
      var accountId = admin.thread.account_id || null;
      var row = {
        thread_id: admin.thread.id,
        account_id: accountId,
        sender: 'admin',
        sender_name: 'Admin',
        message: text
      };
      var r = await db.from('support_messages').insert(row).select('*').single();
      if (r.error) throw r.error;
      if (e.input) e.input.value = '';
      admin.messages = Array.isArray(admin.messages) ? admin.messages : [];
      if (r.data) admin.messages.push(r.data);
      if (typeof renderChat === 'function') renderChat();
      ensureForm();
      scrollBottom();
      if (typeof loadSupportThreads === 'function') await loadSupportThreads();
      if (typeof toast === 'function') toast('Đã gửi tin nhắn cho người học');
    } catch (err) {
      console.error('[ADMIN SUPPORT HOTFIX] send failed', err);
      if (typeof toast === 'function') toast('Không gửi được: ' + (err?.message || err));
    } finally {
      window.__studyAdminSupportSending = false;
      ensureForm();
    }
  }

  function bindForm() {
    var form = ensureForm();
    if (!form || form.__supportHotfixBound) return;
    form.__supportHotfixBound = true;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      send();
    }, true);
    var input = document.getElementById('replyInput');
    if (input) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
          ev.preventDefault();
          ev.stopPropagation();
          send();
        }
      }, true);
    }
  }

  function wrapOpenThread() {
    if (typeof window.openThread !== 'function' || window.openThread.__supportHotfixWrapped) return;
    var original = window.openThread;
    var wrapped = async function (id) {
      await original.call(this, id);
      bindForm();
      ensureForm();
      scrollBottom();
    };
    wrapped.__supportHotfixWrapped = true;
    window.openThread = wrapped;
  }

  function boot() {
    installStyle();
    bindForm();
    wrapOpenThread();
    document.addEventListener('click', function (ev) {
      var thread = ev.target.closest && ev.target.closest('#support .thread');
      if (thread) setTimeout(function () { bindForm(); ensureForm(); scrollBottom(); }, 80);
      var supportNav = ev.target.closest && ev.target.closest('[data-tab="support"]');
      if (supportNav) setTimeout(function () { installStyle(); bindForm(); }, 80);
    }, true);
    var observer = new MutationObserver(function () {
      if (document.getElementById('support')) bindForm();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(function () {
      if (window.admin && admin.tab === 'support') {
        installStyle();
        bindForm();
        wrapOpenThread();
      }
    }, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
