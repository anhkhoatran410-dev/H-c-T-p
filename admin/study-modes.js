/* STUDY Admin — question-mode upgrade.
   All subjects get a Complete Exam preset.
   English gets 4-option MCQ + vocabulary flashcards.
*/
(function(){
  const COMPLETE={'Toán':['mcq','true_false','short'],'Ngữ Văn':['mcq','true_false','short'],'Tiếng Anh':['mcq','flashcard']};
  const LABELS={mcq:'Trắc nghiệm 4 đáp án',true_false:'Đúng / Sai',short:'Trả lời ngắn',flashcard:'Flashcard từ vựng'};

  function injectStyle(){
    if(document.getElementById('study-admin-modes-style'))return;
    const s=document.createElement('style');s.id='study-admin-modes-style';s.textContent=`
      .study-mode-tools{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.study-mode-preset{border:1px solid rgba(99,102,241,.22);background:linear-gradient(135deg,#eef2ff,#f5f3ff);color:#3730a3;border-radius:12px;padding:9px 13px;font-weight:800;cursor:pointer}.study-mode-preset:hover{transform:translateY(-1px)}
      .study-type-hint{display:block;margin-top:7px;color:#64748b;font-size:12px;line-height:1.4}.study-type-chip{display:inline-flex!important;align-items:center;gap:5px}.study-english-hidden{display:none!important}
      .study-created-badge{background:#ecfeff!important;color:#0f766e!important}.study-complete-badge{background:#f5f3ff!important;color:#6d28d9!important}
    `;document.head.appendChild(s);
  }

  function setTypes(types){
    const subject=document.getElementById('subject')?.value||'';
    let wanted=[...(types||[])];
    if(subject==='Tiếng Anh')wanted=wanted.filter(x=>x==='mcq'||x==='flashcard');
    else wanted=wanted.filter(x=>x!=='flashcard');
    if(subject==='Tiếng Anh'&&!wanted.length)wanted=['mcq'];
    if(subject!=='Tiếng Anh'&&!wanted.length)wanted=['mcq','true_false','short'];
    document.querySelectorAll('input[name="questionType"]').forEach(x=>x.checked=wanted.includes(x.value));
    if(subject==='Tiếng Anh'&&!document.querySelector('input[name="questionType"][value="flashcard"]')){
      const anchor=document.querySelector('.type-picks');
      if(anchor){const label=document.createElement('label');label.className='study-type-chip';label.innerHTML='<input type="checkbox" name="questionType" value="flashcard"> Flashcard từ vựng';anchor.appendChild(label)}
    }
    document.querySelectorAll('input[name="questionType"][value="true_false"],input[name="questionType"][value="short"]').forEach(x=>x.closest('label')?.classList.toggle('study-english-hidden',subject==='Tiếng Anh'));
    document.querySelectorAll('input[name="questionType"]').forEach(x=>x.checked=wanted.includes(x.value));
    updateHint();
  }
  function currentTypes(){return [...document.querySelectorAll('input[name="questionType"]:checked')].map(x=>x.value)}
  function updateHint(){
    const subject=document.getElementById('subject')?.value||'';const box=document.querySelector('.type-picks');if(!box)return;
    let hint=box.querySelector('.study-type-hint');if(!hint){hint=document.createElement('small');hint.className='study-type-hint';box.appendChild(hint)}
    hint.textContent=subject==='Tiếng Anh'?'Tiếng Anh: Trắc nghiệm 4 đáp án + Flashcard. “Tạo đề Hoàn chỉnh” sẽ phối hợp cả hai.':'Chọn từng dạng hoặc dùng “Tạo đề Hoàn chỉnh” để AI tự phân bố các dạng phù hợp với môn.';
  }
  function ensureControls(){
    injectStyle();const picks=document.querySelector('.type-picks');if(!picks)return;
    if(!document.getElementById('studyCompleteBtn')){
      const tools=document.createElement('div');tools.className='study-mode-tools';tools.innerHTML='<button type="button" class="study-mode-preset" id="studyCompleteBtn">✨ Tạo đề Hoàn chỉnh</button><button type="button" class="study-mode-preset" id="studyClearTypes">↺ Chọn lại dạng</button>';
      picks.parentNode.insertBefore(tools,picks.nextSibling);
      document.getElementById('studyCompleteBtn').onclick=function(){const subject=document.getElementById('subject')?.value||'Toán';setTypes(COMPLETE[subject]||COMPLETE['Toán']);this.textContent='✓ Đề hoàn chỉnh đã chọn';setTimeout(()=>this.textContent='✨ Tạo đề Hoàn chỉnh',1300)};
      document.getElementById('studyClearTypes').onclick=function(){const subject=document.getElementById('subject')?.value||'Toán';setTypes(subject==='Tiếng Anh'?['mcq']:['mcq','true_false','short'])};
    }
    const subject=document.getElementById('subject');if(subject&&!subject.dataset.studyModeBound){subject.dataset.studyModeBound='1';subject.addEventListener('change',function(){setTypes(COMPLETE[this.value]||COMPLETE['Toán'])})}
    setTypes(currentTypes().length?currentTypes():COMPLETE[subject?.value||'Toán']);
  }

  function normalizeGenerated(qs){
    return (Array.isArray(qs)?qs:[]).map(q=>q.type==='flashcard'?{type:'flashcard',front:String(q.front??q.term??q.q??'').trim(),back:String(q.back??q.definition??q.answer??'').trim(),phonetic:String(q.phonetic??q.pronunciation??'').trim(),example:String(q.example??'').trim(),explanation:String(q.explanation??'').trim()}:q);
  }

  async function enhancedCreateExam(){
    const file=document.getElementById('file')?.files?.[0],msg=document.getElementById('msg');
    const title=document.getElementById('title')?.value.trim(),subject=document.getElementById('subject')?.value||'',difficulty=document.getElementById('level')?.value||'Trung bình',duration=Number(document.getElementById('minutes')?.value||45),questionCount=Number(document.getElementById('questions')?.value||20);
    let types=currentTypes();
    if(subject==='Tiếng Anh')types=types.filter(x=>x==='mcq'||x==='flashcard');else types=types.filter(x=>x!=='flashcard');
    if(!file){if(msg)msg.textContent='⚠️ Hãy chọn tài liệu.';return}
    if(!title){if(msg)msg.textContent='⚠️ Hãy đặt tên bài.';return}
    if(!types.length){if(msg)msg.textContent='⚠️ Chọn ít nhất một dạng nội dung.';return}
    try{
      if(msg)msg.textContent='⏳ AI đang đọc tài liệu và tạo '+questionCount+' nội dung...';
      let documentText=await extractDoc(file).catch(()=>"");
      if(documentText.length>180000)documentText=documentText.slice(0,180000)+'\n[Đã giới hạn văn bản để giữ request nhẹ]';
      if(!documentText)throw new Error('Không trích xuất được chữ từ tài liệu. Hãy dùng PDF có text hoặc DOCX.');
      const r=await fetch('/api/generate-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type,documentText,fileData:'',subject,difficulty,questionCount,types})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Không tạo được đề');
      const questions=normalizeGenerated(data.questions);if(!questions.length)throw new Error('AI không trả về nội dung.');
      await loadSupabase();
      const {error}=await db.from('exams').insert({title,subject,difficulty,duration:types.length===1&&types[0]==='flashcard'?0:duration,question_count:questions.length,questions,status:'active'});if(error)throw error;
      if(msg)msg.textContent=`✅ Đã tạo ${questions.length} nội dung (${types.map(x=>LABELS[x]||x).join(' + ')}) và lưu thành công.`;
      document.getElementById('title').value='';document.getElementById('file').value='';
      if(typeof renderTests==='function')await renderTests();if(typeof loadDashboard==='function')loadDashboard();
    }catch(e){console.error(e);if(msg)msg.textContent='❌ '+(e.message||e)}
  }

  function decorateTestList(){
    const box=document.getElementById('testList');if(!box)return;
    box.querySelectorAll('.account-row,.test').forEach(row=>{if(row.querySelector('[data-study-badge]'))return;const text=(row.textContent||'').toLowerCase();if(text.includes('tiếng anh')){const badge=document.createElement('span');badge.dataset.studyBadge='1';badge.className='badge study-created-badge';badge.textContent='🇬🇧 English';row.appendChild(badge)}});
  }

  function boot(){
    if(!document.getElementById('createBtn')){setTimeout(boot,100);return}
    ensureControls();
    const btn=document.getElementById('createBtn');if(btn&&!btn.dataset.studyCreateBound){btn.dataset.studyCreateBound='1';btn.onclick=enhancedCreateExam}
    const box=document.getElementById('testList');if(box){const observer=new MutationObserver(()=>{ensureControls();decorateTestList()});observer.observe(box,{childList:true,subtree:true})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
