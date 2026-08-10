/* STUDY TH public UX + support/AI fixes. Loaded after the dynamic app. */
(function(){
  var installed=false;
  function install(){
    if(installed)return; installed=true;
    var originalHeader=window.header;
    window.header=function(){return `<header class="top upgraded-top"><button class="brand brand-home" type="button" onclick="go('home')" title="Về trang chủ">🎓 STUDY TH</button><div class="nav"><button onclick="go('home')">Trang chủ</button><button onclick="go('history')">📊 Lịch sử</button><button onclick="go('support')">💬 Hỗ trợ</button><button onclick="go('admin')">Admin</button><button onclick="togglePublicTheme()" aria-label="Đổi giao diện">◐</button></div></header>`};
    document.title='STUDY TH';

    /* One conversation per support channel instead of one conversation per device. */
    window.ensureThread=async function(){
      if(state.thread && String(state.thread.account_id||'')===String(state.supportAccountId||'')) return state.thread;
      await loadSupabase();
      var account=state.supportAccountId||state.supportAccounts?.[0]?.id||null;
      var q=db.from('support_threads').select('*').eq('device_id',deviceId());
      if(account) q=q.eq('account_id',account);
      var found=await q.order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(found.error)throw found.error;
      var data=found.data;
      if(!data){
        var r=await db.from('support_threads').insert({device_id:deviceId(),student_name:state.candidate||localStorage.getItem('study_candidate')||'Người dùng',account_id:account}).select().single();
        if(r.error)throw r.error; data=r.data;
      }
      state.thread=data; return data;
    };

    var oldSelect=window.selectSupportAccount;
    window.selectSupportAccount=async function(id){
      state.supportAccountId=id; state.thread=null; state.messages=[];
      try{await startSupportLive();}catch(e){console.warn(e)}
      render(); setTimeout(function(){installSupportAI();},0);
    };

    /* Keep the public support composer reliable after every render. */
    var oldSend=window.sendSupportMessage;
    window.sendSupportMessage=async function(payload){
      var t=await ensureThread(); await loadSupabase();
      var row={thread_id:t.id,account_id:t.account_id||state.supportAccountId||null,sender:'user',message:String(payload?.message||''),attachment_url:payload?.attachment_url||null,attachment_type:payload?.attachment_type||null,attachment_name:payload?.attachment_name||null,sticker:payload?.sticker||null};
      var r=await db.from('support_messages').insert(row); if(r.error)throw r.error;
    };

    /* Wrong-answer review can reload the original exam instead of depending on an active-list cache. */
    window.openReview=async function(id){
      var r=(state.history||[]).find(function(x){return String(x.id)===String(id)})||state.lastResult;
      if(!r)return;
      var exam=(exams||[]).find(function(e){return String(e.id)===String(r.exam_id||r.examId)});
      if(!exam && r.exam_id){
        try{await loadSupabase();var q=await db.from('exams').select('*').eq('id',r.exam_id).maybeSingle();if(!q.error)exam=q.data;}catch(e){}
      }
      if(!exam)return alert('Không tìm thấy đề gốc để ôn lại. Đề có thể đã bị xoá.');
      state.review={attempt:r,exam:exam,items:(r.wrong_indexes||r.wrongIndexes||[]).map(function(i){return {index:i,question:(exam.questions||[])[i],answer:r.answers?.[i]}}).filter(function(x){return !!x.question}),cursor:0};
      state.reviewChoice=null;state.reviewTF=[];state.page='review';render();
    };

    window.render=function(){var app=document.getElementById('app');if(app)app.innerHTML=header()+page();var box=document.getElementById('supportMessages');if(box)box.scrollTop=box.scrollHeight;setTimeout(installSupportAI,0)};

    installSupportAI();
  }

  function installSupportAI(){
    var shell=document.querySelector('.support-shell'); if(!shell)return;
    if(document.getElementById('study-ai-support'))return;
    var top=shell.querySelector('.support-top');
    if(!top)return;
    var btn=document.createElement('button');btn.className='theme-chip ai-support-open';btn.type='button';btn.textContent='🤖 AI học tập';btn.onclick=openSupportAI;
    top.appendChild(btn);
  }

  function openSupportAI(){
    var old=document.getElementById('study-ai-support'); if(old){old.classList.remove('hidden');old.querySelector('textarea')?.focus();return;}
    var el=document.createElement('div');el.id='study-ai-support';el.className='study-ai-modal';el.innerHTML=`<div class="study-ai-card"><div class="study-ai-head"><div><span class="support-kicker">AI STUDY</span><h2>🤖 Trợ lý học tập</h2><p>Hỏi bài, cách làm, giải thích khái niệm hoặc hỏi cách sử dụng website.</p></div><button type="button" class="theme-chip" data-ai-close>×</button></div><div class="study-ai-messages" id="studyAiMessages"><div class="study-ai-msg bot">Chào bạn 👋 Mình có thể giải thích bài học, gợi ý cách làm và hỗ trợ bạn dùng STUDY TH.</div></div><form id="studyAiForm" class="study-ai-form"><textarea rows="2" placeholder="Ví dụ: Giải thích vì sao đạo hàm của x² là 2x..." required></textarea><button class="composer-send" type="submit">➤</button></form></div>`;
    document.body.appendChild(el);el.querySelector('[data-ai-close]').onclick=function(){el.classList.add('hidden')};
    el.querySelector('form').onsubmit=async function(e){e.preventDefault();var ta=e.currentTarget.querySelector('textarea'),text=ta.value.trim();if(!text)return;ta.value='';var box=el.querySelector('#studyAiMessages');box.insertAdjacentHTML('beforeend',`<div class="study-ai-msg user">${esc(text)}</div><div class="study-ai-msg bot" data-thinking>Đang suy nghĩ…</div>`);box.scrollTop=box.scrollHeight;try{var r=await fetch('/api/support-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,subject:state.subject||'',history:[...box.querySelectorAll('.study-ai-msg')].slice(-8).map(function(x){return {role:x.classList.contains('user')?'user':'assistant',message:x.textContent}})})});var d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||'AI chưa phản hồi');box.querySelector('[data-thinking]')?.remove();box.insertAdjacentHTML('beforeend',`<div class="study-ai-msg bot">${esc(d.answer||'Mình chưa có câu trả lời.')}</div>`);}catch(err){var t=box.querySelector('[data-thinking]');if(t)t.textContent='⚠️ '+err.message;}}
    el.querySelector('textarea').focus();
  }

  function boot(){if(window.__studyAppReady)install();else window.addEventListener('study-app-loaded',function(){window.__studyAppReady=true;install();setTimeout(installSupportAI,0)}, {once:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
