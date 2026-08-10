/* STUDY Admin — real support messenger runtime.
   This file owns ONLY the Admin -> Hỗ trợ composer/chat.
   Public STUDY TH support is intentionally untouched. */
(function () {
  'use strict';
  if (window.__studyAdminSupportV8) return;
  window.__studyAdminSupportV8 = true;

  var state = {thread:null,threads:[],messages:[],channel:null,poll:null,sending:false};
  window.studyAdminSupport = state;

  /* The old admin/app.js support runtime was still starting its own
     realtime channel and polling the same DOM. That second renderer could
     repaint the chat from an older snapshot immediately after a successful
     insert, making a just-sent message appear and then disappear. From this
     point on this runtime is the single owner of the Admin support chat. */
  function retireLegacySupportRuntime(){
    try{
      if(window.admin){
        if(window.admin.channel && window.db){
          try{window.db.removeChannel(window.admin.channel)}catch(_){}
        }
        if(window.admin.poll)clearInterval(window.admin.poll);
        window.admin.channel=null;
        window.admin.poll=null;
      }
    }catch(_){}
    window.startSupportLive=function(){};
    window.loadSupportThreads=function(){};
    window.renderChat=function(){};
    window.renderThreads=function(){};
    window.sendReply=function(){};
    var search=el('threadSearch');
    if(search)search.oninput=function(){};
    var refreshBtn=el('newSupportRefresh');
    if(refreshBtn)refreshBtn.onclick=function(){};
  }

  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'})[c]})}
  function el(id){return document.getElementById(id)}
  function isSupportOpen(){return !!el('support')&&el('support').classList.contains('active')}

  function fitMessenger(){
    var box=el('support');
    var messenger=box&&box.querySelector('.messenger');
    if(!messenger)return;
    var top=messenger.getBoundingClientRect().top;
    var available=Math.floor(window.innerHeight-top-12);
    var min=360;
    var max=690;
    if(window.innerWidth<=650)min=330;
    var h=Math.max(min,Math.min(max,available));
    messenger.style.setProperty('height',h+'px','important');
    messenger.style.setProperty('max-height',h+'px','important');
    messenger.style.setProperty('overflow','hidden','important');
  }

  function css(){
    if(el('study-admin-support-v8-style'))return;
    var s=document.createElement('style');
    s.id='study-admin-support-v8-style';
    s.textContent='#support .messenger{display:grid!important;grid-template-columns:330px minmax(0,1fr)!important;min-width:0!important;min-height:330px!important;overflow:hidden!important}#support .conversation-list{width:330px!important;min-width:0!important;max-width:330px!important;overflow:hidden!important;box-sizing:border-box!important}#support .chat-search{min-width:0!important;box-sizing:border-box!important}#support .chat-search input{flex:1 1 auto!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}#support .thread-list{width:100%!important;min-width:0!important;max-width:100%!important;overflow-x:hidden!important;overflow-y:auto!important;box-sizing:border-box!important;padding:7px!important}#support .thread{display:flex!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;align-items:center!important;gap:10px!important;text-align:left!important;border:0!important;background:transparent!important;cursor:pointer!important}#support .thread .thread-main{min-width:0!important;flex:1 1 auto!important;overflow:hidden!important}#support .thread .thread-main small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#support .thread>span:last-child{flex:0 0 auto!important;min-width:0!important;display:flex!important;align-items:center!important;gap:5px!important}#support .thread .thread-time{white-space:nowrap!important}#support .conversation{display:grid!important;grid-template-rows:auto minmax(0,1fr) auto!important;height:100%!important;min-width:0!important;min-height:0!important;overflow:hidden!important;position:relative!important}#support #chatHeader{grid-row:1!important;min-width:0!important;min-height:70px!important;overflow:hidden!important}#support #supportMessages{grid-row:2!important;min-width:0!important;min-height:0!important;height:auto!important;overflow-y:auto!important;overflow-x:hidden!important}#support #replyForm{grid-row:3!important;display:flex!important;visibility:visible!important;opacity:1!important;position:relative!important;inset:auto!important;width:100%!important;min-width:0!important;min-height:70px!important;height:auto!important;z-index:100000!important;align-items:center!important;gap:8px!important;padding:10px 12px!important;margin:0!important;background:var(--panel,#fff)!important;border-top:1px solid var(--line,#e5eaf2)!important;box-sizing:border-box!important}#support #replyForm.hidden{display:flex!important}#support #replyForm #replyInput{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;height:44px!important;min-height:44px!important;max-height:140px!important;box-sizing:border-box!important;resize:none!important}#support #replyForm .send-btn{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 44px!important;width:44px!important;height:44px!important;align-items:center!important;justify-content:center!important}#support #replyForm .composer-tool{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto!important}#support .admin-v8-empty{padding:28px;text-align:center;color:#7b8496}#support .admin-v8-row{display:flex;margin:8px 0}#support .admin-v8-row.user{justify-content:flex-start}#support .admin-v8-row.admin,#support .admin-v8-row.bot{justify-content:flex-end}#support .admin-v8-bubble{max-width:min(760px,82%);padding:10px 13px;border-radius:16px;box-shadow:0 4px 14px rgba(20,30,60,.06);line-height:1.45;word-break:break-word}#support .admin-v8-row.user .admin-v8-bubble{background:#fff;border:1px solid #e5eaf2}#support .admin-v8-row.admin .admin-v8-bubble{background:#e9e6ff;color:#252060}#support .admin-v8-row.bot .admin-v8-bubble{background:#f1efff;color:#342d72}#support .admin-v8-bubble small{display:block;margin-top:4px;opacity:.62;font-size:11px}@media(max-width:650px){#support .messenger{grid-template-columns:minmax(0,1fr)!important}#support .conversation-list{width:100%!important;max-width:none!important}#support .conversation{min-width:0!important}#support #replyForm .composer-tool{display:none!important}}';
    document.head.appendChild(s);
  }

  async function dbReady(){
    if(typeof window.loadSupabase==='function')return window.loadSupabase();
    if(window.db)return window.db;
    if(!window.supabase){await new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)})}
    window.db=window.supabase.createClient('https://mlqaeginqsgqacdqdzbm.supabase.co','sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi');
    return window.db;
  }

  function renderThreads(){
    var box=el('supportThreads');if(!box)return;
    var q=(el('threadSearch')&&el('threadSearch').value||'').trim().toLowerCase();
    var rows=state.threads.filter(function(t){return !q||String(t.student_name||'').toLowerCase().includes(q)||String(t.device_id||'').toLowerCase().includes(q)});
    box.innerHTML=rows.map(function(t){
      var active=state.thread&&String(state.thread.id)===String(t.id);
      return '<button type="button" class="thread '+(active?'active':'')+'" data-admin-thread="'+esc(t.id)+'"><span class="avatar">'+esc(t.support_accounts&&t.support_accounts.avatar||'💬')+'</span><span class="thread-main"><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(t.last_message||'Chưa có tin nhắn')+'</small></span><span>'+(Number(t.unread_admin||0)>0?'<span class="unread-dot"></span>':'')+'<small class="thread-time">'+(t.updated_at?esc(new Date(t.updated_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})):'')+'</small></span></button>'
    }).join('')||'<div class="admin-v8-empty">💬<br>Chưa có cuộc trò chuyện.</div>';
    box.querySelectorAll('[data-admin-thread]').forEach(function(b){b.onclick=function(){openThread(b.getAttribute('data-admin-thread'))}});
  }

  function renderMessages(){
    var head=el('chatHeader'),box=el('supportMessages'),form=el('replyForm'),input=el('replyInput');
    if(!head||!box)return;
    if(!state.thread){
      head.innerHTML='<div class="empty-chat"><span>💬</span><b>Chọn một cuộc trò chuyện</b><small>Tin nhắn sẽ xuất hiện ở đây.</small></div>';
      box.innerHTML='<div class="admin-v8-empty">✨<br>Chọn người ở bên trái để bắt đầu.</div>';
      if(input){input.disabled=true;input.placeholder='Chọn một cuộc trò chuyện...'}
      if(form)form.classList.remove('hidden');
      fitMessenger();
      return;
    }
    head.innerHTML='<div class="chat-person"><span class="avatar">'+esc(state.thread.support_accounts&&state.thread.support_accounts.avatar||'💬')+'</span><div><b>'+esc(state.thread.student_name||'Người dùng')+'</b><small>'+esc(state.thread.support_accounts&&state.thread.support_accounts.name||'Hỗ trợ chung')+' · '+esc(String(state.thread.device_id||'').slice(0,12))+'</small></div></div>';
    var seen={};
    var html=state.messages.filter(function(m){var k=String(m.id||(m.created_at+'|'+m.sender+'|'+m.message));if(seen[k])return false;seen[k]=true;return true}).map(function(m){
      var sender=m.sender||'user';
      var name=m.sender_name||(sender==='admin'?'Admin':sender==='bot'?'Bot':'Người dùng');
      var media='';
      if(m.sticker)media+='<div style="font-size:48px;line-height:1.05">'+esc(m.sticker)+'</div>';
      if(m.attachment_url&&String(m.attachment_type||'').startsWith('image/'))media+='<a href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener"><img src="'+esc(m.attachment_url)+'" alt="Ảnh" style="max-width:320px;max-height:300px;border-radius:12px;display:block;margin-top:6px"></a>';
      return '<div class="admin-v8-row '+esc(sender)+'"><div class="admin-v8-bubble"><b>'+esc(name)+'</b>'+media+(m.message?'<div>'+esc(m.message)+'</div>':'')+'<small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>';
    }).join('')||'<div class="admin-v8-empty">💬<br>Chưa có tin nhắn.</div>';
    box.innerHTML=html;
    box.scrollTop=box.scrollHeight;
    if(form)form.classList.remove('hidden');
    if(input){input.disabled=false;input.placeholder='Nhập tin nhắn...'}
    fitMessenger();
  }

  async function loadThreads(){
    var d=await dbReady();
    var r=await d.from('support_threads').select('*,support_accounts(name,avatar)').order('updated_at',{ascending:false});
    if(r.error)throw r.error;
    state.threads=r.data||[];
    renderThreads();
  }

  async function openThread(id){
    var t=state.threads.find(function(x){return String(x.id)===String(id)});if(!t)return;
    state.thread=t;state.messages=[];renderThreads();renderMessages();
    try{
      var d=await dbReady();
      await d.from('support_threads').update({unread_admin:0}).eq('id',id);
      var r=await d.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});
      if(r.error)throw r.error;
      state.messages=r.data||[];
      var latest=state.threads.find(function(x){return String(x.id)===String(id)});if(latest)latest.unread_admin=0;
      renderThreads();renderMessages();
    }catch(e){console.warn('Admin support openThread',e);var box=el('supportMessages');if(box)box.innerHTML='<div class="danger-text">Không mở được cuộc trò chuyện: '+esc(e.message)+'</div>';fitMessenger()}
  }
  window.openAdminSupportThread=openThread;

  async function send(){
    var input=el('replyInput'),text=input&&input.value.trim();
    if(!text||!state.thread||state.sending)return;
    state.sending=true;if(input)input.disabled=true;
    try{
      var d=await dbReady();
      var row={thread_id:state.thread.id,account_id:state.thread.account_id||null,sender:'admin',sender_name:'Admin',message:text};
      var r=await d.from('support_messages').insert(row);if(r.error)throw r.error;
      if(input)input.value='';
      await openThread(state.thread.id);await loadThreads();
    }catch(e){if(input)input.value=text;if(typeof window.toast==='function')window.toast('Không gửi được: '+e.message);else alert('Không gửi được: '+e.message)}
    finally{state.sending=false;if(input)input.disabled=!state.thread}
  }
  window.sendAdminSupportMessage=send;

  function installComposer(){
    var form=el('replyForm'),input=el('replyInput');if(!form||!input)return;
    form.classList.remove('hidden');
    form.style.setProperty('display','flex','important');form.style.setProperty('visibility','visible','important');form.style.setProperty('opacity','1','important');
    if(!form.dataset.adminV8Bound){
      form.dataset.adminV8Bound='1';
      form.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();send()},true);
      input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();send()}},true);
    }
  }

  async function refresh(){
    if(!isSupportOpen())return;
    try{
      await loadThreads();
      if(state.thread){
        var exists=state.threads.find(function(x){return String(x.id)===String(state.thread.id)});
        if(exists){
          state.thread=exists;
          var d=await dbReady();
          var r=await d.from('support_messages').select('*').eq('thread_id',state.thread.id).order('created_at',{ascending:true});
          if(!r.error)state.messages=r.data||[];
        }else{state.thread=null;state.messages=[];}
      }
      renderThreads();renderMessages();installComposer();fitMessenger();
    }catch(e){console.warn('Admin support refresh',e)}
  }

  function startLive(){
    dbReady().then(function(d){
      if(state.channel){try{d.removeChannel(state.channel)}catch(_){} }
      state.channel=d.channel('study-admin-support-v8')
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},function(p){
          if(state.thread&&String(p.new.thread_id)===String(state.thread.id)){state.messages.push(p.new);renderMessages()}
          refresh();
        })
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads'},function(){refresh()})
        .subscribe();
      clearInterval(state.poll);
      state.poll=setInterval(refresh,2000);
    }).catch(function(e){console.warn('Admin support realtime',e)});
  }

  function hookNavigation(){
    document.querySelectorAll('[data-tab="support"]').forEach(function(b){
      if(b.dataset.adminV8Nav)return;
      b.dataset.adminV8Nav='1';
      b.addEventListener('click',function(){setTimeout(function(){css();installComposer();fitMessenger();refresh()},30)},true);
    });
    var search=el('threadSearch');
    if(search&&!search.dataset.adminV8Search){search.dataset.adminV8Search='1';search.addEventListener('input',renderThreads)}
    var refreshBtn=el('newSupportRefresh');
    if(refreshBtn&&!refreshBtn.dataset.adminV8Refresh){refreshBtn.dataset.adminV8Refresh='1';refreshBtn.addEventListener('click',function(){refresh()})}
  }

  function boot(){
    css();hookNavigation();installComposer();
    retireLegacySupportRuntime();
    window.addEventListener('resize',fitMessenger);
    window.addEventListener('orientationchange',function(){setTimeout(fitMessenger,50)});
    if(window.visualViewport)window.visualViewport.addEventListener('resize',fitMessenger);
    setTimeout(function(){fitMessenger();refresh();startLive()},120);
    setInterval(function(){css();installComposer();hookNavigation();if(isSupportOpen())fitMessenger()},1000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,120)});else setTimeout(boot,120);
})();
