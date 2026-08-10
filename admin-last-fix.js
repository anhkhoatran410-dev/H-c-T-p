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
