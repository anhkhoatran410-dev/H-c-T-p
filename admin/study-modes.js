/* STUDY Admin — question-mode upgrade.
   All subjects get a Complete Exam preset.
   English gets 4-option MCQ + vocabulary flashcards.
*/
(function(){
  const COMPLETE={
    'Toán':['mcq','true_false','short'],
    'Ngữ Văn':['mcq','true_false','short'],
    'Tiếng Anh':['mcq','flashcard']
  };
  const LABELS={mcq:'Trắc nghiệm 4 đáp án',true_false:'Đúng / Sai',short:'Trả lời ngắn',flashcard:'Flashcard từ vựng'};

  function injectStyle(){
    if(document.getElementById('study-admin-modes-style'))return;
    const s=document.createElement('style');s.id='study-admin-modes-style';s.textContent=`
      .study-mode-tools{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.study-mode-preset{border:1px solid rgba(99,102,241,.22);background:linear-gradient(135deg,#eef2ff,#f5f3ff);color:#3730a3;border-radius:12px;padding:9px 13px;font-weight:800;cursor:pointer}.study-mode-preset:hover{transform:translateY(-1px)}
      .study-type-hint{display:block;margin-top:7px;color:#64748b;font-size:12px;line-height:1.4}.study-type-chip{display:inline-flex!important;align-items:center;gap:5px}
      .study-flash-preview{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:12px}.study-flash-mini{padding:14px;border-radius:16px;background:linear-gradient(145deg,#eef2ff,#ecfeff);border:1px solid #e0e7ff}.study-flash-mini b{display:block;color:#312e81}.study-flash-mini small{color:#475569}
      .study-created-badge{background:#ecfeff!important;color:#0f766e!important}.study-complete-badge{background:#f5f3ff!important;color:#6d28d9!important}
    `;document.head.appendChild(s);
  }

  function setTypes(types){
    document.querySelectorAll('input[name="questionType"]').forEach(x=>x.checked=types.includes(x.value));
    const subject=document.getElementById('subject')?.value||'';
    document.querySelectorAll('[data-study-type-extra]').forEach(x=>x.remove());
    if(subject==='Tiếng Anh'&&!document.querySelector('input[name="questionType"][value="flashcard"]')){
      const anchor=document.querySelector('.type-picks');
      if(anchor){const label=document.createElement('label');label.className='study-type-chip';label.innerHTML='<input type="checkbox" name="questionType" value="flashcard"> Flashcard từ vựng';anchor.appendChild(label)}
    }
    document.querySelectorAll('input[name="questionType"]').forEach(x=>x.checked=types.includes(x.value));
    updateHint();
  }
  function currentTypes(){return [...document.querySelectorAll('input[name="questionType"]:checked')].map(x=>x.value)}
  function updateHint(){
    const subject=document.getElementById('subject')?.value||'';const box=document.querySelector('.type-picks');if(!box)return;
    let hint=box.querySelector('.study-type-hint');if(!hint){hint=document.createElement('small');hint.className='study-type-hint';box.appendChild(hint)}
    hint.textContent=subject==='Tiếng Anh'?'Tiếng Anh: chọn Trắc nghiệm 4 đáp án hoặc Flashcard. “Tạo đề Hoàn chỉnh” sẽ phối hợp cả hai.':'Có thể chọn từng dạng hoặc dùng “Tạo đề Hoàn chỉnh” để AI tự phân bố các dạng theo môn.';
  }
  function ensureControls(){
    injectStyle();const picks=document.querySelector('.type-picks');if(!picks)return;
    if(!document.getElementById('studyCompleteBtn')){
      const tools=document.createElement('div');tools.className='study-mode-tools';tools.innerHTML='<button type="button" class="study-mode-preset" id="studyCompleteBtn">✨ Tạo đề Hoàn chỉnh</button><button type="button" class="study-mode-preset" id="studyClearTypes">↺ Chọn lại dạng</button>';
      picks.parentNode.insertBefore(tools,picks.nextSibling);
      document.getElementById('studyCompleteBtn').onclick=function(){const subject=document.getElementById('subject')?.value||'Toán';setTypes(COMPLETE[subject]||COMPLETE['Toán']);this.textContent='✓ Đề hoàn chỉnh đã chọn';setTimeout(()=>this.textContent='✨ Tạo đề Hoàn chỉnh',1300)};
      document.getElementById('studyClearTypes').onclick=function(){const subject=document.getElementById('subject')?.value||'Toán';setTypes(subject==='Tiếng Anh'?['mcq']:['mcq','true_false','short'])};
    }
    const subject=document.getElementById('subject');if(subject&&!subject.dataset.studyModeBound){subject.dataset.studyModeBound='1';subject.addEventListener('change',function(){const old=currentTypes();const english=this.value==='Tiếng Anh';
      document.querySelectorAll('input[name="questionType"][value="true_false"],input[name="questionType"][value="short"]').forEach(x=>{x.closest('label')?.classList.toggle('study-english-hidden',english)});
      setTypes(english?(old.includes('flashcard')?['mcq','flashcard']:['mcq']):['mcq','true_false','short']);
    })}
    setTypes(currentTypes().length?currentTypes():['mcq','true_false','short']);
  }

  function normalizeGenerated(qs,subject){
    return (Array.isArray(qs)?qs:[]).map(q=>{
      if(q.type==='flashcard')return {type:'flashcard',front:String(q.front??q.term??q.q??'').trim(),back:String(q.back??q.definition??q.answer??'').trim(),phonetic:String(q.phonetic??q.pronunciation??'').trim(),example:String(q.example??'').trim(),explanation:String(q.explanation??'').trim()};
      return q;
    });
  }

  async function enhancedCreateExam(){
    const file=document.getElementById('file')?.files?.[0],msg=document.getElementById('msg');
    const title=document.getElementById('title')?.value.trim(),subject=document.getElementById('subject')?.value||'',difficulty=document.getElementById('level')?.value||'Trung bình',duration=Number(document.getElementById('minutes')?.value||45),questionCount=Number(document.getElementById('questions')?.value||20);
    let types=currentTypes();
    if(!file){if(msg)msg.textContent='⚠️ Hãy chọn tài liệu.';return}
    if(!title){if(msg)msg.textContent='⚠️ Hãy đặt tên bài.';return}
    if(!types.length){if(msg)msg.textContent='⚠️ Chọn ít nhất một dạng câu.';return}
    try{
      if(msg)msg.textContent='⏳ AI đang đọc tài liệu và tạo '+questionCount+' nội dung...';
      let documentText=await extractDoc(file).catch(()=>"");
      if(documentText.length>180000)documentText=documentText.slice(0,180000)+'\n[Đã giới hạn văn bản để giữ request nhẹ]';
      if(!documentText)throw new Error('Không trích xuất được chữ từ tài liệu. Hãy dùng PDF có text hoặc DOCX.');
      const r=await fetch('/api/generate-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type,documentText,fileData:'',subject,difficulty,questionCount,types})});
      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Không tạo được đề');
      const questions=normalizeGenerated(data.questions,subject);if(!questions.length)throw new Error('AI không trả về nội dung.');
      await loadSupabase();
      const {error}=await db.from('exams').insert({title,subject,difficulty,duration:types.length===1&&types[0]==='flashcard'?0:duration,question_count:questions.length,questions,status:'active'});if(error)throw error;
      if(msg)msg.textContent=`✅ Đã tạo ${questions.length} nội dung (${types.map(x=>LABELS[x]||x).join(' + ')}) và lưu thành công.`;
      document.getElementById('title').value='';document.getElementById('file').value='';
      if(typeof renderTests==='function')await renderTests();if(typeof loadDashboard==='function')loadDashboard();
    }catch(e){console.error(e);if(msg)msg.textContent='❌ '+(e.message||e)}
  }

  function decorateTestList(){
    const box=document.getElementById('testList');if(!box)return;
    box.querySelectorAll('.account-row,.test').forEach(row=>{
      if(row.querySelector('[data-study-badge]'))return;
      const text=(row.textContent||'').toLowerCase();const badge=document.createElement('span');badge.dataset.studyBadge='1';badge.className='badge study-created-badge';
      if(text.includes('tiếng anh')){badge.textContent='🇬🇧 English';row.appendChild(badge)}
    });
  }

  function boot(){
    if(!document.getElementById('createBtn')){setTimeout(boot,100);return}
    ensureControls();
    const btn=document.getElementById('createBtn');if(btn&&!btn.dataset.studyCreateBound){btn.dataset.studyCreateBound='1';btn.onclick=enhancedCreateExam}
    const observer=new MutationObserver(()=>{ensureControls();decorateTestList()});const box=document.getElementById('testList');if(box)observer.observe(box,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
