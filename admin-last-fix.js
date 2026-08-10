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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else boot();
  window.addEventListener('load',function(){setTimeout(boot,0)});
  var tries=0,timer=setInterval(function(){boot();if(++tries>40)clearInterval(timer)},250);
})();
