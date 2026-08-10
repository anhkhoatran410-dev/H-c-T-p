/* Admin final runtime guard: participants must still appear when the participants table is empty/unavailable. */
(function(){
  function boot(){
    if(window.__adminLastFixInstalled)return;
    if(typeof window.loadSupabase!=='function')return;
    window.__adminLastFixInstalled=true;

    function modal(title,html){
      var m=document.getElementById('examEditorModal');
      if(!m&&typeof window.ensureModal==='function'){window.ensureModal();m=document.getElementById('examEditorModal')}
      if(!m)return;
      document.getElementById('examEditorTitle').textContent=title;
      document.getElementById('examEditorBody').innerHTML=html;
      m.classList.remove('hidden');
      document.getElementById('saveExamEditor')?.classList.add('hidden');
      document.getElementById('addQuestionBtn')?.classList.add('hidden');
      var close=document.getElementById('cancelExamEditor');
      if(close){close.classList.remove('hidden');close.textContent='Đóng'}
    }

    window.loadParticipants=async function(){
      var box=document.getElementById('participantRows');
      if(!box)return;
      try{
        await loadSupabase();
        var attemptsRes=await db.from('user_attempts').select('*').order('created_at',{ascending:false});
        if(attemptsRes.error)throw attemptsRes.error;
        var peopleRes=await db.from('participants').select('*').order('created_at',{ascending:false});
        var people=peopleRes.error?[]:(peopleRes.data||[]);
        var map={};
        people.forEach(function(p){var key=String(p.code||p.device_id||p.id||'');if(!key)return;map[key]={name:p.name||'Không tên',code:key,attempts:[]}});
        (attemptsRes.data||[]).forEach(function(a){
          var key=String(a.student_code||a.device_id||a.student_name||'unknown');
          if(!map[key])map[key]={name:a.student_name||'Không tên',code:key,attempts:[]};
          map[key].attempts.push(a);
        });
        var rows=Object.values(map).sort(function(a,b){return String(b.attempts[0]?.created_at||'').localeCompare(String(a.attempts[0]?.created_at||''))});
        box.innerHTML=rows.map(function(p){
          var latest=p.attempts[0];
          return '<tr class="clickable-row" data-person-last="'+esc(p.code)+'"><td><b>'+esc(p.name)+'</b></td><td>'+esc(p.code)+'</td><td>'+p.attempts.length+'</td><td><span class="badge">'+(latest?Number(latest.score||0)+'%':'—')+'</span></td><td>'+(latest?esc(new Date(latest.created_at).toLocaleString('vi-VN')):'—')+'</td></tr>';
        }).join('')||'<tr><td colspan="5">Chưa có người tham gia.</td></tr>';
        box.querySelectorAll('[data-person-last]').forEach(function(row){row.onclick=function(){window.showPersonLast(row.dataset.personLast)}});
      }catch(e){box.innerHTML='<tr><td colspan="5" class="danger-text">'+esc(e&&e.message||e)+'</td></tr>'}
    };

    window.showPersonLast=async function(code){
      try{
        await loadSupabase();
        var ar=await db.from('user_attempts').select('*').order('created_at',{ascending:false});
        if(ar.error)throw ar.error;
        var rows=(ar.data||[]).filter(function(a){return String(a.student_code||a.device_id||a.student_name||'')===String(code)});
        if(!rows.length)return toast('Không tìm thấy lượt làm của người này.');
        var name=rows[0].student_name||'Người tham gia';
        modal('Theo dõi '+name,'<div class="person-summary"><h3>'+esc(name)+'</h3><p class="muted">Mã: '+esc(code)+' · '+rows.length+' lượt làm</p></div><div class="person-attempts">'+rows.map(function(r){
          return '<div class="person-attempt"><div><b>'+esc(r.exam_title||'Bài kiểm tra')+'</b><small>'+esc(r.created_at?new Date(r.created_at).toLocaleString('vi-VN'):'')+'</small></div><span class="badge">'+Number(r.score||0)+'% · '+Number(r.correct||0)+'/'+Number(r.total||0)+'</span><div class="row-actions"><button class="soft-btn" data-view-last="'+r.id+'">👁 Xem</button>'+((r.wrong_indexes||[]).length?'<button class="soft-btn" data-review-last="'+r.id+'">🧠 Ôn câu sai</button>':'')+'</div></div>';
        }).join('')+'</div>');
        var body=document.getElementById('examEditorBody');
        body.querySelectorAll('[data-view-last]').forEach(function(b){b.onclick=function(){if(typeof window.showAttempt==='function')window.showAttempt(b.dataset.viewLast,false)}});
        body.querySelectorAll('[data-review-last]').forEach(function(b){b.onclick=function(){if(typeof window.showAttempt==='function')window.showAttempt(b.dataset.reviewLast,true)}});
      }catch(e){toast('Không mở được người tham gia: '+(e&&e.message||e))}
    };

    if(typeof window.openTab==='function'){
      var old=window.openTab;
      window.openTab=function(id){var r=old.apply(this,arguments);if(id==='participants')setTimeout(window.loadParticipants,0);return r};
    }
    if(document.getElementById('participantRows'))setTimeout(window.loadParticipants,0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,50)});else setTimeout(boot,50);
})();

/* STUDY TH final admin chat: composer is forced visible and current chat refreshes every second. */
(function(){
  function boot(){
    if(typeof admin==='undefined'||typeof loadSupabase!=='function')return;
    var timer=null,channel=null,busy=false;
    function composer(){
      var form=document.getElementById('replyForm');if(!form)return null;
      form.classList.remove('hidden');form.style.display='flex';form.style.visibility='visible';form.style.opacity='1';form.style.position='relative';form.style.zIndex='30';
      var input=document.getElementById('replyInput');if(input){input.disabled=false;input.style.display='block';input.style.visibility='visible'}
      var btn=form.querySelector('.send-btn');if(btn){btn.disabled=false;btn.style.display='inline-flex'}
      return form;
    }
    async function refreshThread(id){
      if(!id||busy)return;busy=true;
      try{await loadSupabase();var r=await db.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});if(r.error)throw r.error;if(!admin.thread||String(admin.thread.id)!==String(id))return;admin.messages=r.data||[];if(typeof window.renderChat==='function')window.renderChat();composer()}catch(e){console.warn('admin chat refresh',e)}finally{busy=false}
    }
    function start(){
      loadSupportThreads();
      loadSupabase().then(function(){
        if(channel)db.removeChannel(channel).catch(function(){});
        channel=db.channel('admin-support-final-live').on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},function(p){if(admin.thread&&String(p.new.thread_id)===String(admin.thread.id))refreshThread(admin.thread.id);loadSupportThreads()}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads'},function(){loadSupportThreads()}).subscribe(function(status){var live=document.getElementById('liveState');if(live&&status==='SUBSCRIBED')live.innerHTML='<span></span> Live'});
        clearInterval(timer);timer=setInterval(function(){if(admin.tab!=='support')return;loadSupportThreads();if(admin.thread)refreshThread(admin.thread.id)},1000);
      }).catch(function(e){console.warn('admin support live',e)});
    }
    var oldOpen=window.openThread;
    window.openThread=async function(id){if(oldOpen)await oldOpen(id);composer();if(admin.thread)await refreshThread(admin.thread.id);composer()};
    var oldSend=window.sendReply;
    window.sendReply=async function(){var input=document.getElementById('replyInput');var before=input?input.value:'';if(typeof oldSend==='function')await oldSend();if(admin.thread){await refreshThread(admin.thread.id);await loadSupportThreads()}composer();if(input&&!input.value&&before&&admin.thread)input.value=before};
    var oldOpenTab=window.openTab;
    window.openTab=function(id){var r=oldOpenTab?oldOpenTab(id):null;if(id==='support')setTimeout(function(){composer();start()},50);return r};
    composer();start();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
})();

/* STUDY TH ultimate Admin composer/AI keyboard and double-send guard. */
(function(){
  function boot(){
    if(window.__adminUltimateFix)return;
    if(typeof admin==='undefined')return;
    window.__adminUltimateFix=true;
    var oldAssistant=window.sendAssistant;
    if(typeof oldAssistant==='function'&&!oldAssistant.__ultimateAssistant){
      var assistantBusy=false;
      var wrappedAssistant=async function(){if(assistantBusy)return;assistantBusy=true;var input=document.getElementById('assistantInput');var btn=document.querySelector('#assistantForm .send-btn');if(btn)btn.disabled=true;try{return await oldAssistant.apply(this,arguments)}finally{assistantBusy=false;if(btn)btn.disabled=false}};
      wrappedAssistant.__ultimateAssistant=true;window.sendAssistant=wrappedAssistant;
    }
    var oldReply=window.sendReply;
    if(typeof oldReply==='function'&&!oldReply.__ultimateReply){
      var replyBusy=false;
      var wrappedReply=async function(){if(replyBusy)return;replyBusy=true;var btn=document.querySelector('#replyForm .send-btn');if(btn)btn.disabled=true;try{return await oldReply.apply(this,arguments)}finally{replyBusy=false;if(btn)btn.disabled=false}};
      wrappedReply.__ultimateReply=true;window.sendReply=wrappedReply;
    }
    document.addEventListener('keydown',function(e){
      var target=e.target;if(!(target instanceof HTMLTextAreaElement)||e.key!=='Enter'||e.shiftKey||e.isComposing)return;
      if(target.id==='assistantInput'||target.id==='replyInput'){
        e.preventDefault();e.stopPropagation();var form=target.closest('form');if(form)form.requestSubmit();
      }
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
  window.addEventListener('load',function(){setTimeout(boot,0)});
  var tries=0,timer=setInterval(function(){boot();if(++tries>40)clearInterval(timer)},250);
})();

/* ADMIN SUPPORT UI REBUILD V8 — authoritative in-place composer and full-width chat. */
(function(){
  'use strict';
  if(window.__ADMIN_SUPPORT_UI_V8__)return;
  window.__ADMIN_SUPPORT_UI_V8__=true;
  var selected=null,sending=false;

  function ready(){return typeof window.loadSupabase==='function'&&typeof window.db!=='undefined'&&window.db;}
  function getAdmin(){return typeof window.admin!=='undefined'?window.admin:null;}
  function threadId(){var a=getAdmin();return selected||(a&&a.thread&&a.thread.id)||null;}

  function css(){
    if(document.getElementById('admin-support-ui-v8-css'))return;
    var s=document.createElement('style');s.id='admin-support-ui-v8-css';
    s.textContent=`
      #support .messenger{display:grid!important;grid-template-columns:330px minmax(0,1fr)!important;width:100%!important;min-width:0!important;overflow:hidden!important}
      #support .conversation{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:70px minmax(0,1fr) 70px!important;width:100%!important;min-width:0!important;height:100%!important;min-height:0!important;overflow:hidden!important;position:relative!important}
      #support .conversation>*{grid-column:1!important;min-width:0!important;max-width:none!important}
      #support #chatHeader{grid-row:1!important;width:100%!important;min-width:0!important}
      #support #supportMessages{grid-row:2!important;width:100%!important;max-width:none!important;min-width:0!important;min-height:0!important;height:auto!important;overflow:auto!important;display:block!important;padding-bottom:16px!important}
      #support #admin-support-ui-v8-composer{grid-row:3!important;display:flex!important;visibility:visible!important;opacity:1!important;width:100%!important;max-width:none!important;min-width:0!important;height:70px!important;min-height:70px!important;box-sizing:border-box!important;position:relative!important;z-index:2147483647!important;align-items:center!important;gap:8px!important;padding:10px 12px!important;margin:0!important;background:var(--panel,#fff)!important;border-top:1px solid var(--line,#e5eaf2)!important}
      #support #admin-support-ui-v8-composer textarea{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;height:46px!important;min-height:46px!important;max-height:46px!important;box-sizing:border-box!important;resize:none!important;border:1px solid var(--line,#dce3ef)!important;border-radius:15px!important;padding:11px 14px!important;font:inherit!important;color:var(--text,#152033)!important;background:var(--soft,#edf3ff)!important;outline:none!important}
      #support #admin-support-ui-v8-composer textarea:focus{background:#fff!important;border-color:#5d63ff!important;box-shadow:0 0 0 3px rgba(93,99,255,.12)!important}
      #support #admin-support-ui-v8-composer button{display:inline-flex!important;visibility:visible!important;opacity:1!important;align-items:center!important;justify-content:center!important;flex:0 0 44px!important;width:44px!important;height:44px!important;border:0!important;border-radius:14px!important;cursor:pointer!important;font:inherit!important}
      #support #admin-support-ui-v8-composer .v8-tool{background:#eef2fb!important;color:#26304b!important}
      #support #admin-support-ui-v8-composer .v8-send{background:linear-gradient(135deg,#5d7cff,#805cff)!important;color:#fff!important;font-size:21px!important}
      #support #admin-support-ui-v8-composer button:disabled,#support #admin-support-ui-v8-composer textarea:disabled{opacity:.55!important;cursor:not-allowed!important}
      @media(max-width:700px){#support .messenger{grid-template-columns:1fr!important}#support .conversation-list{max-height:220px;border-right:0;border-bottom:1px solid var(--line)}#support .conversation{grid-template-rows:70px minmax(0,1fr) 70px!important}#support #admin-support-ui-v8-composer .v8-tool{display:none!important}}
    `;
    document.head.appendChild(s);
  }

  function build(){
    css();
    var support=document.getElementById('support'),conv=support&&support.querySelector('.conversation');
    if(!support||!conv)return null;
    var old=document.getElementById('replyForm');
    if(old)old.remove();
    var form=document.getElementById('admin-support-ui-v8-composer');
    if(!form){
      form=document.createElement('form');form.id='admin-support-ui-v8-composer';form.autocomplete='off';
      form.innerHTML='<button type="button" class="v8-tool" title="Thêm">＋</button><button type="button" class="v8-tool" title="Emoji">😊</button><button type="button" class="v8-tool" title="Sticker">✨</button><textarea id="admin-support-ui-v8-input" rows="1" placeholder="Nhập tin nhắn..."></textarea><button type="submit" class="v8-send" title="Gửi">➤</button>';
      conv.appendChild(form);
    }else if(form.parentElement!==conv)conv.appendChild(form);
    var id=threadId(),input=form.querySelector('textarea'),btn=form.querySelector('.v8-send');
    if(input){input.disabled=!id;input.placeholder=id?'Nhập tin nhắn...':'Chọn một cuộc trò chuyện bên trái...';}
    if(btn)btn.disabled=!id||sending;
    return form;
  }

  async function loadMessages(id){
    if(!id||!ready())return;
    try{
      await window.loadSupabase();
      var r=await window.db.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});
      if(r.error)throw r.error;
      var a=getAdmin();if(a&&a.thread&&String(a.thread.id)===String(id)){a.messages=r.data||[];if(typeof window.renderChat==='function')window.renderChat();}
    }catch(e){console.warn('[ADMIN SUPPORT V8] load',e)}
  }

  async function send(){
    if(sending)return;
    var id=threadId(),input=document.getElementById('admin-support-ui-v8-input'),text=input&&input.value.trim();
    if(!id||!text)return;
    sending=true;build();
    try{
      await window.loadSupabase();
      var a=getAdmin(),t=a&&Array.isArray(a.threads)?a.threads.find(function(x){return String(x.id)===String(id)}):null;
      var accountId=(t&&t.account_id)||(a&&a.thread&&a.thread.account_id)||null;
      var r=await window.db.from('support_messages').insert({thread_id:id,account_id:accountId,sender:'admin',sender_name:'Admin',message:text}).select('*').single();
      if(r.error)throw r.error;
      if(input)input.value='';
      await loadMessages(id);
      var box=document.getElementById('supportMessages');if(box)box.scrollTop=box.scrollHeight;
      if(typeof window.loadSupportThreads==='function')await window.loadSupportThreads();
    }catch(e){console.error('[ADMIN SUPPORT V8] send',e);if(typeof window.toast==='function')window.toast('Không gửi được: '+(e&&e.message||e));}
    finally{sending=false;build();}
  }

  function bind(){
    var form=build();if(!form||form.__v8Bound)return;
    form.__v8Bound=true;
    form.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();send();},true);
    var input=form.querySelector('textarea');
    input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();send();}},true);
  }

  function hook(){
    if(typeof window.openThread==='function'&&!window.openThread.__v8Wrapped){
      var original=window.openThread;
      var wrapped=async function(id){selected=String(id);var r=await original.apply(this,arguments);setTimeout(function(){bind();loadMessages(selected)},0);setTimeout(bind,250);return r};
      wrapped.__v8Wrapped=true;window.openThread=wrapped;
    }
  }

  function tick(){
    var support=document.getElementById('support');if(!support||!support.classList.contains('active'))return;
    var a=getAdmin();if(a&&a.thread&&a.thread.id)selected=String(a.thread.id);
    hook();bind();
  }

  function boot(){
    css();tick();
    document.addEventListener('click',function(e){
      var th=e.target.closest&&e.target.closest('#support .thread');
      if(th){selected=th.getAttribute('data-id')||selected;setTimeout(function(){tick();if(selected)loadMessages(selected)},30);setTimeout(tick,250);setTimeout(tick,700);}
      if(e.target.closest&&e.target.closest('[data-tab="support"]')){setTimeout(tick,100);setTimeout(tick,600);}
    },true);
    new MutationObserver(function(){tick()}).observe(document.body,{childList:true,subtree:true});
    setInterval(tick,500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
