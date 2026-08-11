/* STUDY TH Admin — hard fallback for support composer. */
(function(){
  'use strict';
  function q(id){return document.getElementById(id)}
  function force(){
    var support=q('support'), box=q('supportMessages'), form=q('replyForm'), conversation=support&&support.querySelector('.conversation');
    if(!support||!form)return;
    form.classList.remove('hidden');
    form.style.setProperty('display','flex','important');
    form.style.setProperty('visibility','visible','important');
    form.style.setProperty('opacity','1','important');
    /* Keep the composer inside the conversation, pinned to its bottom. */
    if(conversation) conversation.style.setProperty('position','relative','important');
    form.style.setProperty('position','absolute','important');
    form.style.setProperty('left','0','important');
    form.style.setProperty('right','0','important');
    form.style.setProperty('bottom','0','important');
    form.style.setProperty('top','auto','important');
    form.style.setProperty('z-index','9999','important');
    form.style.setProperty('flex','none','important');
    form.style.setProperty('width','100%','important');
    form.style.setProperty('box-sizing','border-box','important');
    if(box){
      box.style.setProperty('min-height','0','important');
      box.style.setProperty('height','100%','important');
      box.style.setProperty('max-height','none','important');
      box.style.setProperty('overflow-y','auto','important');
      box.style.setProperty('box-sizing','border-box','important');
      box.style.setProperty('padding-bottom','92px','important');
    }
    var input=q('replyInput');
    if(input){
      input.style.setProperty('display','block','important');
      input.style.setProperty('visibility','visible','important');
      input.style.setProperty('opacity','1','important');
      input.style.setProperty('flex','1 1 auto','important');
      input.style.setProperty('min-width','0','important');
    }
  }
  function bind(){
    var form=q('replyForm'),input=q('replyInput');
    if(!form||!input)return;
    force();
    if(form.dataset.composerFallbackBound)return;
    form.dataset.composerFallbackBound='1';
    form.addEventListener('submit',function(e){
      e.preventDefault();
      if(typeof window.__studySendSupportTextV5==='function') window.__studySendSupportTextV5();
    });
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        if(typeof window.__studySendSupportTextV5==='function') window.__studySendSupportTextV5();
      }
    });
  }
  function run(){
    bind();
    var support=q('support');
    if(support&&support.classList.contains('active'))force();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  setInterval(run,500);
})();
