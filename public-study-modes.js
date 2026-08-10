/* STUDY TH — subject-specific study modes.
   English: 4-option MCQ + smooth flip flashcards.
   All subjects: "Tạo đề Hoàn chỉnh" is represented by the AI-generated mix.
*/
(function(){
  function escSafe(v){return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  function questionsOf(exam){return Array.isArray(exam?.questions)?exam.questions:[]}
  function isFlash(q){return q&&q.type==='flashcard'}
  function isScored(q){return q&&!isFlash(q)}
  function flashCount(qs){return qs.filter(isFlash).length}
  function scoredCount(qs){return qs.filter(isScored).length}

  function flashCard(q,i){
    const front=String(q.front??q.term??q.q??'').trim();
    const back=String(q.back??q.definition??q.answer??'').trim();
    const phonetic=String(q.phonetic??q.pronunciation??'').trim();
    const example=String(q.example??'').trim();
    return `<button type="button" class="study-flashcard" data-flip-card="${i}" aria-label="Lật thẻ từ vựng">
      <span class="study-flash-inner">
        <span class="study-flash-face study-flash-front">
          <span class="study-flash-label">TỪ VỰNG</span>
          <strong>${escSafe(front)}</strong>
          ${phonetic?`<small>${escSafe(phonetic)}</small>`:''}
          <span class="study-flash-hint">Chạm để lật ↻</span>
        </span>
        <span class="study-flash-face study-flash-back">
          <span class="study-flash-label">NGHĨA</span>
          <strong>${escSafe(back)}</strong>
          ${example?`<span class="study-flash-example">${escSafe(example)}</span>`:''}
          <span class="study-flash-hint">Chạm để lật lại ↻</span>
        </span>
      </span>
    </button>`;
  }

  function mcqQuestion(q,i){
    return `<div class="q study-mcq-question"><b>Câu ${i+1}. ${escSafe(q.q||q.question||'')}</b>${(q.opts||[]).slice(0,4).map((o,j)=>`<label class="option"><input type="radio" name="q${i}" ${state.answers?.[i]===j?'checked':''} onchange="state.answers[${i}]=${j}"> ${String.fromCharCode(65+j)}. ${escSafe(o)}</label>`).join('')}</div>`;
  }
  function tfQuestion(q,i){
    return `<div class="q"><b>Câu ${i+1}. ${escSafe(q.q||'')}</b>${(q.statements||[]).map((s,j)=>`<div class="option"><span>${String.fromCharCode(97+j)}. ${escSafe(s)}</span><label><input type="radio" name="q${i}_${j}" onchange="setTF(${i},${j},true)"> Đúng</label><label><input type="radio" name="q${i}_${j}" onchange="setTF(${i},${j},false)"> Sai</label></div>`).join('')}</div>`;
  }
  function shortQuestion(q,i){
    const a=state.answers?.[i];
    return `<div class="q"><b>Câu ${i+1}. ${escSafe(q.q||'')}</b><div class="study-short-row">${[0,1,2,3].map(j=>`<input maxlength="1" inputmode="text" value="${escSafe(a?.[j]||'')}" oninput="setShort(${i},${j},this.value)">`).join('')}</div></div>`;
  }

  function featureExamPage(){
    const e=state.exam||{};const qs=questionsOf(e);const cards=qs.filter(isFlash);const normal=qs.filter(isScored);
    const english=e.subject==='Tiếng Anh';
    return `<main class="container study-mode-page">
      ${normal.length?`<div class="timer" id="timer">⏱ --:--</div>`:''}
      <div class="card study-mode-card">
        <div class="study-mode-head"><div><span class="eyebrow">${english?'ENGLISH STUDY':'STUDY MODE'}</span><h1>${escSafe(e.title||'Bài học')}</h1><p class="muted">${escSafe(state.candidate||'Người học')} · ${normal.length?normal.length+' câu trắc nghiệm':''}${cards.length?(normal.length?' · ':'')+cards.length+' flashcard':''}</p></div>${cards.length?'<span class="study-mode-badge">✨ Flashcards</span>':''}</div>
        ${cards.length?`<section class="study-flash-section"><div class="study-section-title"><div><span class="eyebrow">VOCABULARY</span><h2>Ôn từ vựng</h2><p class="muted">Bấm vào từng thẻ để lật. Mặt sau có nghĩa và ví dụ.</p></div><span class="study-flash-count">${cards.length} thẻ</span></div><div class="study-flash-grid">${cards.map((q,i)=>flashCard(q,i)).join('')}</div></section>`:''}
        ${normal.length?`<section class="study-quiz-section"><div class="study-section-title"><div><span class="eyebrow">QUIZ</span><h2>Trắc nghiệm</h2></div></div>${normal.map((q)=>{const original=qs.indexOf(q);if(q.type==='true_false')return tfQuestion(q,original);if(q.type==='short')return shortQuestion(q,original);return mcqQuestion(q,original)}).join('')}<button class="btn study-submit" onclick="submitExam(false)">NỘP BÀI</button></section>`:''}
        ${!normal.length?'<div class="study-flash-finish"><span>🎯</span><b>Học xong rồi!</b><p>Bạn có thể lật lại các thẻ bất cứ lúc nào.</p><button class="btn secondary" onclick="go(\'home\')">← Về trang chủ</button></div>':''}
      </div>
    </main>`;
  }

  function correct(q,a){
    if(isFlash(q))return true;
    if(q.type==='true_false')return Array.isArray(q.answers)&&q.answers.length===4&&q.answers.every((v,j)=>a?.[j]===v);
    if(q.type==='short')return String(Array.isArray(a)?a.join(''):a??'').trim().toLowerCase()===String(q.answer??'').trim().toLowerCase();
    return Number(a)===Number(q.a);
  }

  async function featureSubmit(auto){
    if(!state.exam)return;clearInterval(state.timer);
    const qs=questionsOf(state.exam);const scored=qs.filter(isScored);const wrong=[];let right=0;
    qs.forEach((q,i)=>{if(!isFlash(q)){if(correct(q,state.answers?.[i]))right++;else wrong.push(i)}});
    const total=scored.length;const score=total?Math.round(right/total*100):100;
    const result={examId:state.exam.id,examTitle:state.exam.title,candidate:state.candidate,score,correct:right,total,timeSec:Math.min(Math.floor((Date.now()-state.startedAt)/1000),Number(state.exam.duration||0)*60),auto,wrongIndexes:wrong,answers:JSON.parse(JSON.stringify(state.answers||{}))};
    try{await loadSupabase();
      const payload={device_id:typeof deviceId==='function'?deviceId():null,exam_id:state.exam.id,exam_title:state.exam.title,student_name:state.candidate,student_code:state.code||null,score,correct:right,total,duration_seconds:result.timeSec,auto_submitted:!!auto,answers:result.answers,wrong_indexes:wrong,reviewed_indexes:[]};
      const {data,error}=await db.from('user_attempts').insert(payload).select().single();
      if(!error&&data)result.id=data.id;
      if(typeof deviceId==='function')await db.from('participants').upsert({name:state.candidate,code:state.code||deviceId()},{onConflict:'code'});
    }catch(e){console.warn('Không lưu lịch sử:',e)}
    state.lastResult=result;
    if(typeof loadHistory==='function')await loadHistory();
    state.page='result';render();
  }

  function install(){
    if(typeof state==='undefined')return false;
    window.renderQuestion=function(q,i){if(q?.type==='flashcard')return '';if(q?.type==='true_false')return tfQuestion(q,i);if(q?.type==='short')return shortQuestion(q,i);return mcqQuestion(q,i)};
    window.examPage=featureExamPage;
    window.submitExam=featureSubmit;
    window.startExam=function(id){
      state.exam=exams.find(e=>String(e.id)===String(id));if(!state.exam)return alert('Không tìm thấy bài kiểm tra.');
      const qs=questionsOf(state.exam);if(!qs.length)return alert('Bài này chưa có dữ liệu.');
      state.answers={};state.startedAt=Date.now();state.page='exam';render();
      if(scoredCount(qs)&&typeof startTimer==='function')startTimer();
    };
    document.addEventListener('click',function(e){
      const card=e.target.closest('[data-flip-card]');if(card){e.preventDefault();card.classList.toggle('is-flipped');}
    });
    const style=document.createElement('style');style.id='study-modes-style';style.textContent=`
      .study-mode-page{padding-bottom:42px}.study-mode-card{overflow:visible}.study-mode-head,.study-section-title{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.study-mode-badge,.study-flash-count{display:inline-flex;align-items:center;padding:9px 13px;border-radius:999px;background:linear-gradient(135deg,#eef2ff,#f5f3ff);color:#4338ca;font-weight:800;white-space:nowrap}.study-flash-section{margin:26px 0 34px}.study-flash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:16px}.study-flashcard{display:block;width:100%;min-height:250px;padding:0;border:0;background:transparent;perspective:1200px;cursor:pointer;text-align:left}.study-flash-inner{position:relative;display:block;width:100%;height:250px;transform-style:preserve-3d;transition:transform .62s cubic-bezier(.2,.75,.2,1);will-change:transform}.study-flashcard.is-flipped .study-flash-inner{transform:rotateY(180deg)}.study-flash-face{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;border-radius:24px;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-sizing:border-box;box-shadow:0 18px 45px rgba(31,41,55,.13);border:1px solid rgba(99,102,241,.14);overflow:hidden}.study-flash-front{background:radial-gradient(circle at 15% 10%,rgba(129,140,248,.35),transparent 32%),linear-gradient(145deg,#ffffff,#eef2ff)}.study-flash-back{transform:rotateY(180deg);background:radial-gradient(circle at 85% 15%,rgba(45,212,191,.25),transparent 30%),linear-gradient(145deg,#ffffff,#ecfeff)}.study-flash-label{font-size:11px;letter-spacing:.16em;font-weight:900;color:#6366f1;margin-bottom:14px}.study-flash-face strong{font-size:28px;line-height:1.15;text-align:center;color:#172554;overflow-wrap:anywhere}.study-flash-face small{margin-top:9px;color:#64748b;font-size:15px}.study-flash-example{margin-top:16px;max-width:90%;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.72);color:#334155;font-size:14px;line-height:1.45;text-align:center}.study-flash-hint{position:absolute;bottom:16px;font-size:12px;color:#64748b}.study-quiz-section{margin-top:30px}.study-section-title h2{margin:3px 0}.study-submit{margin-top:14px}.study-short-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}.study-short-row input{width:48px!important;min-width:48px;height:48px!important;text-align:center;font-size:19px}.study-flash-finish{text-align:center;padding:35px 10px}.study-flash-finish span{display:block;font-size:42px;margin-bottom:8px}.study-flash-finish b{font-size:22px}.study-flash-finish p{color:#64748b}.study-mode-page .option{overflow-wrap:anywhere}
      @media(max-width:650px){.study-mode-head,.study-section-title{flex-direction:column}.study-mode-badge,.study-flash-count{align-self:flex-start}.study-flash-grid{grid-template-columns:1fr}.study-flash-inner{height:235px}.study-flash-face{min-height:235px;padding:24px}.study-flash-face strong{font-size:25px}.study-mode-card{padding:14px}.study-short-row input{width:46px!important;min-width:46px;height:46px!important}}
      @media(prefers-reduced-motion:reduce){.study-flash-inner{transition:none}}
    `;document.head.appendChild(style);
    return true;
  }
  function boot(){if(install())return;setTimeout(boot,80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
