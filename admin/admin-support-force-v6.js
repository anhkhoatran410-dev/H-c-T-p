/* STUDY TH — ADMIN SUPPORT FORCE V6
   Hard guarantee for Admin > Hỗ trợ only:
   - Always renders a composer at the bottom of the selected conversation.
   - Does not depend on the old hotfix scripts or their CSS.
   - Sends replies to support_messages and refreshes the selected thread.
*/
(function(){
  'use strict';
  if (window.__studyAdminSupportForceV6) return;
  window.__studyAdminSupportForceV6 = true;

  var selectedId = null;
  var sending = false;
  var observer = null;

  function adminState(){ return (typeof admin !== 'undefined' && admin) ? admin : null; }
  function support(){ return document.getElementById('support'); }
  function conversation(){ var s=support(); return s && s.querySelector('.conversation'); }

  function installCss(){
    if(document.getElementById('study-admin-support-force-v6-css')) return;
    var s=document.createElement('style');
    s.id='study-admin-support-force-v6-css';
    s.textContent = `
      #support.tab.active{overflow:visible!important;min-height:0!important}
      #support.tab.active .section-head{flex:0 0 auto!important}
      #support .messenger{height:clamp(430px,calc(100vh - 340px),720px)!important;min-height:430px!important;max-height:calc(100vh - 250px)!important;overflow:hidden!important}
      #support .conversation{display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;height:100%!important;min-height:0!important;overflow:hidden!important;position:relative!important}
      #support #chatHeader{grid-row:1!important;flex:0 0 auto!important;min-height:72px!important}
      #support #supportMessages{grid-row:2!important;min-height:0!important;height:auto!important;overflow-y:auto!important;overflow-x:hidden!important;padding-bottom:10px!important}
      #support #replyForm.study-force-v6{grid-row:3!important;position:relative!important;inset:auto!important;display:flex!important;visibility:visible!important;opacity:1!important;width:100%!important;min-height:70px!important;height:auto!important;z-index:99999!important;align-items:flex-end!important;gap:8px!important;padding:10px 12px!important;margin:0!important;background:var(--panel,#fff)!important;border-top:1px solid var(--line,#e5eaf2)!important;box-sizing:border-box!important}
      #support #replyForm.study-force-v6.hidden{display:flex!important}
      #support #replyForm.study-force-v6 textarea#replyInput{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;height:44px!important;min-height:44px!important;max-height:140px!important;resize:none!important;box-sizing:border-box!important}
      #support #replyForm.study-force-v6 .composer-tool{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto!important}
      #support #replyForm.study-force-v6 .send-btn{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 44px!important;width:44px!important;height:44px!important;align-items:center!important;justify-content:center!important;cursor:pointer!important}
      #support #replyForm.study-force-v6 textarea:disabled{opacity:.65!important;cursor:not-allowed!important}
      @media(max-width:900px){#support .messenger{height:calc(100vh - 285px)!important;max-height:none!important;min-height:390px!important}}
      @media(max-width:650px){#support .messenger{height:calc(100vh - 245px)!important;min-height:360px!important}#support #replyForm.study-force-v6 .composer-tool{display:none!important}}
    `;
    document.head.appendChild(s);
  }

  function ensureForm(){
    installCss();
    var c=conversation();
    if(!c) return null;
    var forms=c.querySelectorAll('#replyForm');
    var form=forms[0]||null;
    for(var i=1;i<forms.length;i++) forms[i].remove();
    if(!form){
      form=document.createElement('form');
      form.id='replyForm';
      form.className='composer study-force-v6';
      form.autocomplete='off';
      form.innerHTML='<button type="button" class="icon-btn composer-tool" aria-label="Thêm">＋</button>'+ '<button type="button" class="icon-btn composer-tool" aria-label="Emoji">😊</button>'+ '<button type="button" class="icon-btn composer-tool" aria-label="Sticker">✨</button>'+ '<textarea id="replyInput" rows="1" placeholder="Nhập tin nhắn cho người học..."></textarea>'+ '<button class="send-btn" type="submit" aria-label="Gửi">➤</button>';
      c.appendChild(form);
    }
    form.classList.add('study-force-v6');
    form.classList.remove('hidden');
    form.removeAttribute('hidden');
    var a=adminState();
    var id=selectedId || (a && a.thread && a.thread.id);
    var input=form.querySelector('#replyInput');
    var button=form.querySelector('.send-btn');
    var ready=!!id;
    if(input){
      input.disabled=!ready;
      input.placeholder=ready?'Nhập tin nhắn cho người học...':'Chọn một cuộc trò chuyện bên trái...';
    }
    if(button) button.disabled=!ready || sending;
    return form;
  }

  async function send(){
    if(sending) return;
    var a=adminState();
    var id=selectedId || (a && a.thread && a.thread.id);
    var input=document.getElementById('replyInput');
    var text=input && input.value.trim();
    if(!id || !text) return;
    sending=true;
    ensureForm();
    try{
      await loadSupabase();
      var thread=a && Array.isArray(a.threads) ? a.threads.find(function(t){return String(t.id)===String(id)}) : null;
      var accountId=(thread&&thread.account_id) || (a&&a.thread&&a.thread.account_id) || null;
      var r=await db.from('support_messages').insert({thread_id:id,account_id:accountId,sender:'admin',sender_name:'Admin',message:text}).select('*').single();
      if(r.error) throw r.error;
      if(input) input.value='';
      if(a && String(a.thread&&a.thread.id)===String(id) && r.data){
        a.messages=Array.isArray(a.messages)?a.messages:[];
        a.messages.push(r.data);
      }
      if(typeof renderChat==='function') renderChat();
      ensureForm();
      var box=document.getElementById('supportMessages');
      if(box) box.scrollTop=box.scrollHeight;
      if(typeof loadSupportThreads==='function') await loadSupportThreads();
      ensureForm();
      if(typeof toast==='function') toast('Đã gửi tin nhắn cho người học');
    }catch(err){
      console.error('[ADMIN SUPPORT FORCE V6]',err);
      if(typeof toast==='function') toast('Không gửi được: '+(err&&err.message||err));
    }finally{
      sending=false;
      ensureForm();
    }
  }

  function bind(form){
    if(!form || form.__forceV6Bound) return;
    form.__forceV6Bound=true;
    form.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();send();},true);
    var input=form.querySelector('#replyInput');
    if(input) input.addEventListener('keydown',function(e){if(e.key==='Enter' && !e.shiftKey && !e.isComposing){e.preventDefault();e.stopImmediatePropagation();send();}},true);
  }

  function refresh(){
    var s=support();
    if(!s) return;
    var a=adminState();
    if(a && a.thread && a.thread.id) selectedId=String(a.thread.id);
    var f=ensureForm();
    bind(f);
  }

  function hookOpenThread(){
    if(typeof window.openThread!=='function' || window.openThread.__forceV6Wrapped) return;
    var original=window.openThread;
    var wrapped=async function(id){selectedId=String(id);var result=await original.apply(this,arguments);setTimeout(refresh,0);setTimeout(refresh,80);return result;};
    wrapped.__forceV6Wrapped=true;
    window.openThread=wrapped;
  }

  function boot(){
    installCss();
    hookOpenThread();
    refresh();
    document.addEventListener('click',function(e){
      var thread=e.target.closest && e.target.closest('#support .thread');
      if(thread){selectedId=thread.getAttribute('data-id')||selectedId;setTimeout(refresh,50);setTimeout(refresh,250);}
      if(e.target.closest && e.target.closest('[data-tab="support"]')){setTimeout(function(){hookOpenThread();refresh();},80);setTimeout(function(){hookOpenThread();refresh();},500);}
    },true);
    if(window.MutationObserver){
      observer=new MutationObserver(function(){if(document.getElementById('support')) refresh();});
      observer.observe(document.body,{childList:true,subtree:true});
    }
    setInterval(function(){var a=adminState();if(a && a.tab==='support'){hookOpenThread();refresh();}},700);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
