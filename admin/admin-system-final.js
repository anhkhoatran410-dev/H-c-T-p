/* STUDY TH — single final Admin runtime.
   Fixes: support composer, realtime chat, attempt detail, wrong-answer review.
*/
(function(){
  if(window.__studyAdminSystemFinal)return;
  window.__studyAdminSystemFinal=true;

  function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
  function css(){
    if(document.getElementById('study-admin-system-final-style'))return;
    var s=document.createElement('style');s.id='study-admin-system-final-style';s.textContent=
      '.messenger{display:grid!important;grid-template-columns:340px minmax(0,1fr)!important;min-height:560px!important;height:min(70vh,680px)!important;overflow:hidden!important}.messenger .conversation{display:flex!important;flex-direction:column!important;min-width:0!important;min-height:0!important;overflow:hidden!important}.messenger .chat-header{flex:0 0 auto!important}.messenger .message-list{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important}.messenger #replyForm{flex:0 0 auto!important;display:flex!important;visibility:visible!important;opacity:1!important;min-height:70px!important;position:relative!important;z-index:100!important;background:var(--card,#fff)!important;border-top:1px solid rgba(90,100,150,.16)!important}.messenger #replyForm.hidden{display:flex!important}.messenger #replyInput{flex:1 1 auto!important;display:block!important;min-width:0!important;min-height:44px!important}.messenger #replyForm .send-btn{display:inline-flex!important;flex:0 0 auto!important}.admin-attempt-list{display:grid;gap:12px}.admin-attempt-card{border:1px solid rgba(90,100,150,.16);border-radius:14px;padding:14px;background:rgba(90,100,150,.035)}.admin-attempt-card .meta{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.admin-attempt-q{margin-top:10px;padding:12px;border-radius:12px;border:1px solid rgba(90,100,150,.14);background:#fff}.admin-attempt-q.wrong{border-color:#fecaca;background:#fff7f7}.admin-attempt-q.correct{border-color:#bbf7d0;background:#f0fdf4}.admin-attempt-q h4{margin:0 0 9px}.admin-attempt-q .answer-line{margin:5px 0}.admin-attempt-q .answer-line b{font-weight:800}.admin-attempt-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.admin-attempt-modal{max-height:72vh;overflow:auto}.admin-attempt-modal .katex{font-size:1.05em}@media(max-width:900px){.messenger{grid-template-columns:280px minmax(0,1fr)!important}}@media(max-width:700px){.messenger{grid-template-columns:1fr!important;height:72vh!important}.messenger .conversation-list{display:none}.messenger .conversation{min-width:0}.messenger #replyForm .composer-tool{display:none!important}}';document.head.appendChild(s);
  }

  function answerText(q,a){
    if(!q)return '—';
    var type=q.type||'mcq';
    if(type==='mcq'){
      var n=Number(a),opts=q.opts||q.options||q.choices||[];
      return Number.isInteger(n)&&opts[n]!=null?String.fromCharCode(65+n)+'. '+String(opts[n]):'Chưa trả lời';
    }
    if(type==='short')return Array.isArray(a)?a.join(''):String(a??'')||'Chưa trả lời';
    if(type==='true_false')return Array.isArray(a)?a.map(function(v,i){return String.fromCharCode(97+i)+': '+(v?'Đúng':'Sai')}).join(' · '):'Chưa trả lời';
    return String(a??'')||'Chưa trả lời';
  }
  function correctText(q){
    if(!q)return '—';var type=q.type||'mcq';
    if(type==='mcq'){var n=Number(q.a??q.answer),opts=q.opts||q.options||q.choices||[];return Number.isInteger(n)&&opts[n]!=null?String.fromCharCode(65+n)+'. '+String(opts[n]):'—'}
    if(type==='short')return String(q.answer??q.correct_answer??'—');
    if(type==='true_false')return (q.answers||q.correct_answers||[]).map(function(v,i){return String.fromCharCode(97+i)+': '+(v?'Đúng':'Sai')}).join(' · ')||'—';
    return String(q.a??q.answer??'—');
  }
  function isCorrect(q,a){
    try{
      if((q.type||'mcq')==='mcq')return Number(a)===Number(q.a??q.answer);
      if(q.type==='short')return String(Array.isArray(a)?a.join(''):a??'').trim()===String(q.answer??'').trim();
      if(q.type==='true_false')return Array.isArray(a)&&(q.answers||[]).every(function(v,i){return Boolean(a[i])===Boolean(v)});
    }catch(_){return false}return false;
  }

  function ensureModal(){
    var m=document.getElementById('examEditorModal');if(m)return m;
    m=document.createElement('div');m.id='examEditorModal';m.className='modal hidden';
    m.innerHTML='<div class="modal-backdrop"></div><div class="modal-card"><div class="modal-head"><div><span class="eyebrow">KẾT QUẢ LƯỢT LÀM</span><h2 id="examEditorTitle">Kết quả</h2></div><button class="icon-btn" id="cancelExamEditor" type="button">×</button></div><div id="examEditorBody" class="modal-body"></div><div class="modal-foot"><button class="soft-btn" id="addQuestionBtn" type="button">＋</button><button class="primary hidden" id="saveExamEditor" type="button">Lưu</button><button class="soft-btn" id="cancelExamEditorBottom" type="button">Đóng</button></div></div>';
    document.body.appendChild(m);
    ['cancelExamEditor','cancelExamEditorBottom'].forEach(function(id){document.getElementById(id)?.addEventListener('click',function(){m.classList.add('hidden')})});
    m.querySelector('.modal-backdrop')?.addEventListener('click',function(){m.classList.add('hidden')});
    return m;
  }

  async function showAttempt(id,wrongOnly){
    try{
      await loadSupabase();
      var ar=await db.from('user_attempts').select('*').eq('id',id).maybeSingle();if(ar.error)throw ar.error;if(!ar.data)throw new Error('Không tìm thấy lượt làm.');
      var attempt=ar.data,exam=null;
      if(attempt.exam_id){var er=await db.from('exams').select('*').eq('id',attempt.exam_id).maybeSingle();if(!er.error)exam=er.data}
      if(!exam)throw new Error('Không tìm thấy đề gốc của lượt làm.');
      var wrong=Array.isArray(attempt.wrong_indexes)?attempt.wrong_indexes:[];
      var answers=attempt.answers||{};
      var indexes=wrongOnly?wrong:Array.from({length:(exam.questions||[]).length},function(_,i){return i});
      var m=ensureModal();
      document.getElementById('examEditorTitle').textContent=wrongOnly?'Ôn câu sai — '+(attempt.exam_title||exam.title||'Bài kiểm tra'):'Chi tiết bài làm — '+(attempt.exam_title||exam.title||'Bài kiểm tra');
      document.getElementById('saveExamEditor')?.classList.add('hidden');document.getElementById('addQuestionBtn')?.classList.add('hidden');
      var html='<div class="admin-attempt-modal"><div class="person-summary"><h3>'+esc(attempt.student_name||'Người tham gia')+'</h3><p class="muted">'+esc(attempt.exam_title||exam.title||'Bài kiểm tra')+' · '+Number(attempt.score||0)+'% · '+Number(attempt.correct||0)+'/'+Number(attempt.total||exam.questions.length)+' câu đúng · <b>'+wrong.length+' câu sai</b></p></div>';
      if(!indexes.length)html+='<div class="success" style="margin-top:16px">🎉 Không có câu sai.</div>';
      html+='<div class="admin-attempt-list">';
      indexes.forEach(function(i){var q=(exam.questions||[])[i];if(!q)return;var a=answers[i],ok=isCorrect(q,a);html+='<article class="admin-attempt-q '+(ok?'correct':'wrong')+'"><h4>Câu '+(i+1)+' '+(ok?'✓ Đúng':'✕ Sai')+'</h4><div>'+esc(q.q||q.question||'')+'</div><div class="answer-line">Bạn trả lời: <b>'+esc(answerText(q,a))+'</b></div><div class="answer-line">Đáp án đúng: <b>'+esc(correctText(q))+'</b></div>'+(q.explanation?'<div class="muted" style="margin-top:8px">💡 '+esc(q.explanation)+'</div>':'')+'</article>'});
      html+='</div><div class="admin-attempt-actions"><button class="soft-btn" data-admin-attempt-mode="all" data-admin-attempt-id="'+esc(id)+'">👁 Xem toàn bộ</button>'+((wrong.length)?'<button class="soft-btn" data-admin-attempt-mode="wrong" data-admin-attempt-id="'+esc(id)+'">🧠 Chỉ câu sai ('+wrong.length+')</button>':'')+'</div></div>';
      document.getElementById('examEditorBody').innerHTML=html;m.classList.remove('hidden');
    }catch(e){toast('Không mở được bài làm: '+(e?.message||e))}
  }
  window.showAttempt=showAttempt;

  function renderChatFinal(){
    var t=admin.thread,head=document.getElementById('chatHeader'),box=document.getElementById('supportMessages');if(!t)return;
    if(head)head.innerHTML='<div class="chat-person"><span class="avatar">'+esc(t.support_accounts?.avatar||'💬')+'</span><div><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(t.support_accounts?.name||'Hỗ trợ chung')+' · '+esc(String(t.device_id||'').slice(0,12))+'</small></div></div>';
    if(box){var seen=new Set();box.innerHTML=(admin.messages||[]).filter(function(m){var k=String(m.id||m.created_at+'|'+m.sender+'|'+m.message);if(seen.has(k))return false;seen.add(k);return true}).map(function(m){return '<div class="bubble-row '+esc(m.sender||'user')+'"><div class="bubble '+esc(m.sender||'user')+'"><b>'+esc(m.sender_name||(m.sender==='admin'?'Admin':m.sender==='bot'?'Bot':'Người dùng'))+'</b><div>'+esc(m.message||'')+'</div><small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>'}).join('')||'<div class="empty-chat"><span>💬</span><small>Chưa có tin nhắn.</small></div>';box.scrollTop=box.scrollHeight}
    forceComposer();
  }
  function forceComposer(){var f=document.getElementById('replyForm');if(!f)return;f.classList.remove('hidden');f.style.setProperty('display','flex','important');f.style.setProperty('visibility','visible','important');f.style.setProperty('opacity','1','important');var i=document.getElementById('replyInput');if(i){i.disabled=!admin.thread;i.style.setProperty('display','block','important');i.style.setProperty('visibility','visible','important');i.placeholder=admin.thread?'Nhập tin nhắn...':'Chọn một cuộc trò chuyện...'}var b=f.querySelector('.send-btn');if(b){b.disabled=!admin.thread||!!window.__adminFinalSending;b.style.setProperty('display','inline-flex','important')}}

  async function openThreadFinal(id){
    var t=(admin.threads||[]).find(function(x){return String(x.id)===String(id)});if(!t)return;
    admin.thread=t;forceComposer();
    try{await loadSupabase();await db.from('support_threads').update({unread_admin:0}).eq('id',id);var r=await db.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});if(r.error)throw r.error;admin.messages=r.data||[];renderChatFinal();if(typeof renderThreads==='function')renderThreads()}catch(e){toast('Không mở được chat: '+(e?.message||e))}
  }
  window.openThread=openThreadFinal;

  async function sendFinal(){
    var input=document.getElementById('replyInput'),text=input?.value.trim();if(!text||!admin.thread||window.__adminFinalSending)return;
    window.__adminFinalSending=true;forceComposer();
    try{await loadSupabase();var r=await db.from('support_messages').insert({thread_id:admin.thread.id,account_id:admin.thread.account_id||null,sender:'admin',sender_name:'Admin',message:text});if(r.error)throw r.error;if(input)input.value='';var q=await db.from('support_messages').select('*').eq('thread_id',admin.thread.id).order('created_at',{ascending:true});if(!q.error)admin.messages=q.data||[];renderChatFinal();if(typeof loadSupportThreads==='function')await loadSupportThreads();toast('Đã gửi trả lời');}catch(e){toast('Không gửi được: '+(e?.message||e))}finally{window.__adminFinalSending=false;forceComposer()}
  }

  function installChat(){
    var form=document.getElementById('replyForm');if(!form)return;
    form.onsubmit=function(e){e.preventDefault();e.stopImmediatePropagation();sendFinal()};
    var input=document.getElementById('replyInput');if(input&&!input.dataset.adminFinalKey){input.dataset.adminFinalKey='1';input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();sendFinal()}},true)}
    forceComposer();
  }

  function installAttemptClicks(){
    if(document.body.dataset.adminAttemptFinal==='1')return;document.body.dataset.adminAttemptFinal='1';
    document.addEventListener('click',function(e){
      var b=e.target.closest('[data-view-last]');if(b){e.preventDefault();e.stopImmediatePropagation();showAttempt(b.dataset.viewLast,false);return}
      b=e.target.closest('[data-review-last]');if(b){e.preventDefault();e.stopImmediatePropagation();showAttempt(b.dataset.reviewLast,true);return}
      b=e.target.closest('[data-admin-attempt-mode]');if(b){e.preventDefault();e.stopImmediatePropagation();showAttempt(b.dataset.adminAttemptId,b.dataset.adminAttemptMode==='wrong');return}
    },true);
  }

  function startLive(){
    if(window.__adminFinalLiveStarted)return;window.__adminFinalLiveStarted=true;
    loadSupabase().then(function(){
      var ch=db.channel('study-admin-system-final').on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},function(p){if(admin.thread&&String(p.new.thread_id)===String(admin.thread.id)){admin.messages=(admin.messages||[]).filter(function(x){return String(x.id)!==String(p.new.id)});admin.messages.push(p.new);renderChatFinal()}if(typeof loadSupportThreads==='function')loadSupportThreads()}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads'},function(){if(typeof loadSupportThreads==='function')loadSupportThreads()}).subscribe();
      window.__adminFinalChannel=ch;
      setInterval(function(){if(admin.tab!=='support')return;if(typeof loadSupportThreads==='function')loadSupportThreads();if(admin.thread)refreshCurrent(admin.thread.id)},1200);
    }).catch(function(e){console.warn('Admin final live',e)});
  }
  async function refreshCurrent(id){try{await loadSupabase();var r=await db.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});if(!r.error&&admin.thread&&String(admin.thread.id)===String(id)){admin.messages=r.data||[];renderChatFinal()}}catch(_){} }

  function boot(){css();installChat();installAttemptClicks();startLive();forceComposer()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,80)});else setTimeout(boot,80);
  window.addEventListener('load',function(){setTimeout(boot,120)});
  setInterval(function(){installChat();forceComposer()},700);
})();
