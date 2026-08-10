/* STUDY TH — safe Admin participant guard.
   IMPORTANT: this file must not own the support chat runtime.
   The previous version installed a MutationObserver + interval and rebuilt the chat DOM;
   that was unnecessary main-thread work and could make Admin unresponsive.
*/
(function(){
  'use strict';
  if(window.__studyAdminParticipantGuardV2)return;
  window.__studyAdminParticipantGuardV2=true;

  function safeEsc(v){
    return typeof window.esc==='function' ? window.esc(v) : String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];
    });
  }

  function modal(title,html){
    var m=document.getElementById('examEditorModal');
    if(!m && typeof window.ensureModal==='function'){
      window.ensureModal();
      m=document.getElementById('examEditorModal');
    }
    if(!m)return;
    var titleEl=document.getElementById('examEditorTitle');
    var body=document.getElementById('examEditorBody');
    if(titleEl)titleEl.textContent=title;
    if(body)body.innerHTML=html;
    m.classList.remove('hidden');
    document.getElementById('saveExamEditor')?.classList.add('hidden');
    document.getElementById('addQuestionBtn')?.classList.add('hidden');
    var close=document.getElementById('cancelExamEditor');
    if(close){close.classList.remove('hidden');close.textContent='Đóng';}
  }

  window.loadParticipants=async function(){
    var box=document.getElementById('participantRows');
    if(!box || typeof window.loadSupabase!=='function')return;
    try{
      await window.loadSupabase();
      var results=await Promise.all([
        window.db.from('participants').select('*').order('created_at',{ascending:false}),
        window.db.from('user_attempts').select('*').order('created_at',{ascending:false})
      ]);
      var peopleRes=results[0], attemptsRes=results[1];
      if(peopleRes.error)throw peopleRes.error;
      if(attemptsRes.error)throw attemptsRes.error;

      var attempts=attemptsRes.data||[];
      var people=peopleRes.data||[];
      var byCode={};
      people.forEach(function(p){
        var code=String(p.code||p.device_id||p.id||'');
        if(!code)return;
        byCode[code]={name:p.name||'Không tên',code:code,attempts:[]};
      });
      attempts.forEach(function(a){
        var code=String(a.student_code||a.device_id||a.student_name||'unknown');
        if(!byCode[code])byCode[code]={name:a.student_name||'Không tên',code:code,attempts:[]};
        byCode[code].attempts.push(a);
      });

      var rows=Object.keys(byCode).map(function(k){return byCode[k];}).sort(function(a,b){
        return String((b.attempts[0]||{}).created_at||'').localeCompare(String((a.attempts[0]||{}).created_at||''));
      });
      box.innerHTML=rows.map(function(p){
        var latest=p.attempts[0];
        return '<tr class="clickable-row" data-person-last="'+safeEsc(p.code)+'">'+
          '<td><b>'+safeEsc(p.name)+'</b></td>'+
          '<td>'+safeEsc(p.code)+'</td>'+
          '<td>'+p.attempts.length+'</td>'+
          '<td><span class="badge">'+(latest?Number(latest.score||0)+'%':'—')+'</span></td>'+
          '<td>'+(latest?safeEsc(new Date(latest.created_at).toLocaleString('vi-VN')):'—')+'</td>'+
          '</tr>';
      }).join('') || '<tr><td colspan="5">Chưa có người tham gia.</td></tr>';

      box.querySelectorAll('[data-person-last]').forEach(function(row){
        row.onclick=function(){window.showPersonLast(row.getAttribute('data-person-last'));};
      });
    }catch(e){
      box.innerHTML='<tr><td colspan="5" class="danger-text">'+safeEsc(e&&e.message||e)+'</td></tr>';
    }
  };

  window.showPersonLast=async function(code){
    try{
      await window.loadSupabase();
      var r=await window.db.from('user_attempts').select('*').order('created_at',{ascending:false});
      if(r.error)throw r.error;
      var rows=(r.data||[]).filter(function(a){
        return String(a.student_code||a.device_id||a.student_name||'')===String(code);
      });
      if(!rows.length){
        if(typeof window.toast==='function')window.toast('Không tìm thấy lượt làm của người này.');
        return;
      }
      var name=rows[0].student_name||'Người tham gia';
      modal('Theo dõi '+name,
        '<div class="person-summary"><h3>'+safeEsc(name)+'</h3><p class="muted">Mã: '+safeEsc(code)+' · '+rows.length+' lượt làm</p></div>'+ 
        '<div class="person-attempts">'+rows.map(function(r){
          return '<div class="person-attempt"><div><b>'+safeEsc(r.exam_title||'Bài kiểm tra')+'</b><small>'+safeEsc(r.created_at?new Date(r.created_at).toLocaleString('vi-VN'):'')+'</small></div>'+ 
            '<span class="badge">'+Number(r.score||0)+'% · '+Number(r.correct||0)+'/'+Number(r.total||0)+'</span>'+ 
            '<div class="row-actions"><button class="soft-btn" data-view-last="'+safeEsc(r.id)+'">👁 Xem</button>'+ 
            ((r.wrong_indexes||[]).length?'<button class="soft-btn" data-review-last="'+safeEsc(r.id)+'">🧠 Ôn câu sai</button>':'')+'</div></div>';
        }).join('')+'</div>'
      );
      var body=document.getElementById('examEditorBody');
      if(!body)return;
      body.querySelectorAll('[data-view-last]').forEach(function(b){
        b.onclick=function(){if(typeof window.showAttempt==='function')window.showAttempt(b.dataset.viewLast,false);};
      });
      body.querySelectorAll('[data-review-last]').forEach(function(b){
        b.onclick=function(){if(typeof window.showAttempt==='function')window.showAttempt(b.dataset.reviewLast,true);};
      });
    }catch(e){
      if(typeof window.toast==='function')window.toast('Không mở được người tham gia: '+(e&&e.message||e));
    }
  };

  function installTabHook(){
    if(typeof window.openTab!=='function' || window.openTab.__studyParticipantGuardV2)return false;
    var nativeOpenTab=window.openTab;
    var wrapped=function(id){
      var result=nativeOpenTab.apply(this,arguments);
      if(id==='participants')setTimeout(function(){window.loadParticipants();},0);
      return result;
    };
    wrapped.__studyParticipantGuardV2=true;
    window.openTab=wrapped;
    return true;
  }

  function boot(){
    installTabHook();
    if(document.getElementById('participantRows'))setTimeout(function(){window.loadParticipants();},0);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
