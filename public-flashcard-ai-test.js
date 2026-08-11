/* STUDY TH — Flashcard -> Test độ nhớ (v3)
   Flashcard is a separate learning stage.
   When the learner finishes a flashcard-only lesson, inject a "Test độ nhớ" button.
   The test is generated from the exact flashcards just learned; it is NOT an existing exam lookup.
*/
(function(){
  if(window.__studyFlashcardAiTestV3)return;
  window.__studyFlashcardAiTestV3=true;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function getState(){return window.state||null}
  function getCards(){
    var s=getState(), e=s&&s.exam;
    var qs=e&&Array.isArray(e.questions)?e.questions:[];
    return qs.filter(function(q){return q&&String(q.type||'').toLowerCase()==='flashcard'&&String(q.front||q.term||'').trim()&&String(q.back||q.definition||q.answer||'').trim()});
  }
  function sourceText(cards){
    return cards.map(function(q,i){
      return ['Từ/cụm từ '+(i+1)+': '+String(q.front||q.term||'').trim(),'Nghĩa: '+String(q.back||q.definition||q.answer||'').trim(),q.phonetic?'Phiên âm: '+q.phonetic:'',q.example?'Ví dụ: '+q.example:''].filter(Boolean).join('\n');
    }).join('\n\n');
  }
  function shuffle(a){
    a=a.slice();
    for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}
    return a;
  }
  function localQuestions(cards){
    var out=[];
    cards.forEach(function(card,i){
      var front=String(card.front||card.term||'').trim();
      var back=String(card.back||card.definition||card.answer||'').trim();
      var others=cards.filter(function(_,j){return j!==i});
      if(others.length>=3){
        var meanings=shuffle(others).slice(0,3).map(function(q){return String(q.back||q.definition||q.answer||'').trim()});
        var opts=shuffle([back].concat(meanings));
        out.push({type:'mcq',q:'Từ "'+front+'" có nghĩa gần đúng là gì?',opts:opts,a:opts.indexOf(back),explanation:'Đáp án được lấy từ chính bộ từ vựng bạn vừa học.'});
        var words=shuffle(others).slice(0,3).map(function(q){return String(q.front||q.term||'').trim()});
        var opts2=shuffle([front].concat(words));
        out.push({type:'mcq',q:'Từ nào tương ứng với nghĩa "'+back+'"?',opts:opts2,a:opts2.indexOf(front),explanation:'Câu hỏi kiểm tra nhớ từ dựa trên đúng bộ flashcard vừa học.'});
      }else{
        out.push({type:'mcq',q:'Từ "'+front+'" có nghĩa là gì?',opts:[back,'Chưa xác định','Không có trong bài','Một đáp án khác'],a:0,explanation:'Bộ flashcard quá ít để tạo đủ phương án nhiễu tự nhiên; đáp án đúng vẫn lấy trực tiếp từ thẻ.'});
      }
    });
    return shuffle(out).slice(0,15);
  }
  function addExamToMemory(exam){
    try{
      if(Array.isArray(window.exams)){
        var idx=window.exams.findIndex(function(e){return String(e.id)===String(exam.id)});
        if(idx<0)window.exams.push(exam);else window.exams[idx]=exam;
      }
    }catch(_){ }
  }
  function startGeneratedExam(exam){
    var s=getState();if(!s)return;
    addExamToMemory(exam);
    s.exam=exam;
    s.answers={};
    s.startedAt=Date.now();
    s.flashIndex=0;
    s.flashFlipped=false;
    s.studyStage='quiz';
    s.page='exam';
    if(typeof window.render==='function')window.render();
    setTimeout(function(){
      if(typeof window.startTimer==='function')window.startTimer();
    },50);
  }
  function status(text){var x=document.getElementById('studyVocabStatus');if(x)x.textContent=text}
  function button(){return document.getElementById('studyMakeVocabTest')}
  function inject(){
    var finish=document.querySelector('.study-flash-finish');
    var cards=getCards();
    if(!finish||!cards.length)return;
    if(button())return;
    var actions=finish.querySelector('.study-finish-actions')||finish;
    var b=document.createElement('button');
    b.type='button';b.className='btn study-go-quiz';b.id='studyMakeVocabTest';b.textContent='📝 Test độ nhớ bài';
    actions.insertBefore(b,actions.firstChild);
    var st=document.createElement('div');st.id='studyVocabStatus';st.className='muted';st.style.marginTop='14px';st.style.textAlign='center';finish.appendChild(st);
    b.onclick=makeTest;
  }
  function style(){
    if(document.getElementById('study-fc-ai-test-style'))return;
    var s=document.createElement('style');s.id='study-fc-ai-test-style';s.textContent='.study-fc-ai-loading{opacity:.65;pointer-events:none}.study-flash-finish #studyMakeVocabTest{min-width:180px}';document.head.appendChild(s);
  }
  async function makeTest(){
    var b=button(),cards=getCards();
    if(!b||!cards.length)return;
    b.disabled=true;b.classList.add('study-fc-ai-loading');b.textContent='⏳ Đang tạo bài test...';
    status('Đang lấy lại '+cards.length+' từ/cụm từ vừa học để tạo bài kiểm tra.');
    var qs=[];
    try{
      var count=Math.min(15,Math.max(4,cards.length));
      var prompt=sourceText(cards)+'\n\nYÊU CẦU ĐẶC BIỆT:\n- Chỉ sử dụng từ/cụm từ và nghĩa có trong danh sách nguồn.\n- Tạo đúng dạng trắc nghiệm 4 lựa chọn, mỗi câu chỉ có 1 đáp án đúng.\n- Có thể hỏi nghĩa của từ hoặc cho nghĩa rồi chọn từ.\n- Không được thêm kiến thức/từ vựng ngoài danh sách.\n- Ưu tiên phủ đều các từ vừa học.\n';
      var r=await fetch('/api/generate-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:'flashcard-vocabulary-source.txt',mimeType:'text/plain',fileData:'',subject:'Tiếng Anh',difficulty:'Trung bình',questionCount:count,types:['mcq'],documentText:prompt})});
      var d=await r.json().catch(function(){return {}});
      if(r.ok&&Array.isArray(d.questions)&&d.questions.length)qs=d.questions.filter(function(q){return q&&String(q.type||'mcq')==='mcq'&&Array.isArray(q.opts)&&q.opts.length>=4&&q.q});
      if(!qs.length){
        qs=localQuestions(cards);
        if(!qs.length)throw new Error(d.error||'Không đủ dữ liệu để tạo bài test từ bộ từ vựng này.');
        status('⚠️ AI đang hết quota/không phản hồi. Đã tạo bài test dự phòng trực tiếp từ đúng các flashcard vừa học.');
      }
      var id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('vocab-test-'+Date.now());
      var exam={id:id,title:'Test độ nhớ · '+String(getState().exam?.title||'Flashcard'),subject:'Tiếng Anh',difficulty:'Trung bình',duration:15,question_count:qs.length,questions:qs,status:'active'};
      try{
        if(typeof window.loadSupabase==='function')await window.loadSupabase();
        if(window.db&&typeof window.db.from==='function'){
          var ins=await window.db.from('exams').insert(exam).select().single();
          if(!ins.error&&ins.data){exam=ins.data;addExamToMemory(exam)}
        }
      }catch(dbErr){console.warn('Không lưu bài test AI, vẫn cho làm bài:',dbErr)}
      status('✅ Đã tạo '+qs.length+' câu từ đúng bộ từ vựng vừa học.');
      setTimeout(function(){startGeneratedExam(exam)},150);
    }catch(e){
      console.error('Flashcard test generation:',e);
      status('❌ '+(e&&e.message||e));
      b.disabled=false;b.classList.remove('study-fc-ai-loading');b.textContent='📝 Test độ nhớ bài';
    }
  }
  function watch(){
    style();inject();
    var root=document.getElementById('app');
    if(root&&!root.__studyFcTestObserver){
      var ob=new MutationObserver(function(){inject()});
      ob.observe(root,{childList:true,subtree:true});
      root.__studyFcTestObserver=ob;
    }
    setTimeout(inject,100);setTimeout(inject,500);setTimeout(inject,1500);
  }
  function boot(){watch()}
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0);setTimeout(boot,800)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
