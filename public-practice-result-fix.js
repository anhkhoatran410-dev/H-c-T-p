/* STUDY TH — result page: expose linked/assigned practice after finishing an exam. */
(function(){
  if(window.__studyPracticeResultFixV1)return;
  window.__studyPracticeResultFixV1=true;

  function S(){return window.state||window.studyState||null}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

  function isPractice(e){
    if(!e)return false;
    if(e.is_practice===true||e.isPractice===true||e.practice===true)return true;
    var vals=[e.type,e.mode,e.kind,e.category,e.exam_type,e.examType,e.content_type,e.contentType];
    return vals.some(function(v){return /practice|exercise|assignment|bai\s*tap|bài\s*tập/i.test(String(v||''))});
  }

  function linkedId(e){
    if(!e)return null;
    var keys=['practice_exam_id','practiceExamId','exercise_exam_id','exerciseExamId','assignment_exam_id','assignmentExamId','bai_tap_id','baiTapId','practice_id','practiceId','exercise_id','exerciseId'];
    for(var i=0;i<keys.length;i++)if(e[keys[i]])return e[keys[i]];
    var p=e.practice||e.exercise||e.assignment||e.bai_tap;
    if(p&&typeof p==='object')return p.exam_id||p.examId||p.id||null;
    return null;
  }

  async function findPractice(exam){
    var list=Array.isArray(window.exams)?window.exams:[];
    var id=linkedId(exam);
    if(id){
      var found=list.find(function(e){return String(e.id)===String(id)});
      if(found)return found;
      try{await window.loadSupabase();var r=await window.db.from('exams').select('*').eq('id',id).maybeSingle();if(!r.error&&r.data)return r.data}catch(e){}
    }
    var explicit=list.find(function(e){return String(e.id)!==String(exam&&exam.id)&&isPractice(e)&&(!exam||!exam.subject||e.subject===exam.subject)});
    if(explicit)return explicit;
    var titleMatch=list.find(function(e){return String(e.id)!==String(exam&&exam.id)&&(!exam||!exam.subject||e.subject===exam.subject)&&/bài\s*tập|bai\s*tap|luyện\s*tập|luyen\s*tap|exercise|practice/i.test(String(e.title||''))});
    if(titleMatch)return titleMatch;
    try{
      await window.loadSupabase();
      var q=window.db.from('exams').select('*').eq('status','active');
      if(exam&&exam.subject)q=q.eq('subject',exam.subject);
      var r=await q.order('created_at',{ascending:false}).limit(100);
      if(!r.error){
        var remote=(r.data||[]).find(function(e){return String(e.id)!==String(exam&&exam.id)&&isPractice(e)});
        if(remote)return remote;
        remote=(r.data||[]).find(function(e){return String(e.id)!==String(exam&&exam.id)&&/bài\s*tập|bai\s*tap|luyện\s*tập|luyen\s*tap|exercise|practice/i.test(String(e.title||''))});
        if(remote)return remote;
      }
    }catch(e){console.warn('practice lookup',e)}
    return null;
  }

  function startPractice(exam){
    var s=S();if(!s||!exam||!Array.isArray(exam.questions)||!exam.questions.length)return;
    s.exam=exam;s.answers={};s.startedAt=Date.now();s.page='exam';
    if(typeof window.render==='function')window.render();
    if(typeof window.startTimer==='function')window.startTimer();
  }

  async function enhance(){
    var s=S();if(!s||s.page!=='result')return;
    var card=document.querySelector('.container .card');if(!card||card.dataset.practiceResult==='1')return;
    card.dataset.practiceResult='loading';
    var result=s.lastResult||{};
    var exam=(Array.isArray(window.exams)?window.exams:[]).find(function(e){return String(e.id)===String(result.exam_id||result.examId)});
    if(!exam&&result.exam_id){try{await window.loadSupabase();var r=await window.db.from('exams').select('*').eq('id',result.exam_id).maybeSingle();if(!r.error)exam=r.data}catch(e){}}
    var practice=await findPractice(exam);
    if(!practice||!Array.isArray(practice.questions)||!practice.questions.length){card.dataset.practiceResult='done';return}
    var actions=card.querySelector('div[style*="text-align:center"]');
    if(!actions){actions=document.createElement('div');actions.style.textAlign='center';card.appendChild(actions)}
    if(actions.querySelector('[data-practice-result-btn]')){card.dataset.practiceResult='done';return}
    var btn=document.createElement('button');btn.type='button';btn.className='btn';btn.setAttribute('data-practice-result-btn','1');btn.textContent='📝 Làm bài tập';
    btn.style.margin='6px';btn.onclick=function(){startPractice(practice)};
    actions.insertBefore(btn,actions.firstChild);
    card.dataset.practiceResult='done';
  }

  function boot(){setTimeout(enhance,120);setTimeout(enhance,600)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',boot);
  var root=document.getElementById('app');if(root)new MutationObserver(function(){var s=S();if(s&&s.page==='result')enhance()}).observe(root,{childList:true,subtree:true});
})();
