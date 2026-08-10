/* Small post-enhancement guardrails. */
(function(){
  function ready(){
    document.addEventListener('click',function(e){
      var view=e.target.closest('[data-exam-view]');
      if(view)setTimeout(function(){$('saveExamEditor')?.classList.remove('hidden');$('addQuestionBtn')?.classList.remove('hidden');$('cancelExamEditor')?.classList.remove('hidden');},80);
      var testNav=e.target.closest('[data-tab="tests"]');
      if(testNav)setTimeout(function(){$('saveExamEditor')?.classList.remove('hidden');$('addQuestionBtn')?.classList.remove('hidden');},80);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
