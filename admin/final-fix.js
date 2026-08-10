/* Small post-enhancement guardrails. */
(function(){
  function reveal(){ $('saveExamEditor')?.classList.remove('hidden'); $('addQuestionBtn')?.classList.remove('hidden'); $('cancelExamEditor')?.classList.remove('hidden'); }
  function ready(){
    document.addEventListener('click',function(e){
      var view=e.target.closest('[data-exam-view]');
      var create=e.target.closest('#createBtn');
      var testNav=e.target.closest('[data-tab="tests"]');
      if(view||create||testNav)setTimeout(reveal,120);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
