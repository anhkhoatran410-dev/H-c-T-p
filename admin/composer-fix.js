/* STUDY TH Admin — hard fallback for support composer. */
(function(){
  'use strict';
  function q(id){return document.getElementById(id)}
  function ensure(){
    var support=q('support');
    if(!support)return null;
    var conversation=support.querySelector('.conversation');
    if(!conversation)return null;
    var form=q('replyForm');
    if(!form || !conversation.contains(form)){
      if(form)form.remove();
      form=document.createElement('form');
      form.id='replyForm';
      form.className='composer';
      form.autocomplete='off';
      form.innerHTML='<textarea id="replyInput" rows="1" placeholder="Nhập tin nhắn..."></textarea><button class="send-btn" type="submit">➤</button>';
      conversation.appendChild(form);
    }
    var input=q('replyInput');
    if(!input){
      input=document.createElement('textarea');
      input.id='replyInput';
      input.rows=1;
      input.placeholder='Nhập tin nhắn...';
      form.insertBefore(input,form.querySelector('.send-btn'));
    }
    return {form:form,input:input,conversation:conversation};
  }
  function force(){
    var support=q('support');
    if(!support)return;
    var parts=ensure();
    if(!parts)return;
    var form=parts.form,input=parts.input,box=q('supportMessages');
    form.classList.remove('hidden');
    form.removeAttribute('hidden');
    form.setAttribute('aria-hidden','false');
    form.style.setProperty('display','flex','important');
    form.style.setProperty('visibility','visible','important');
    form.style.setProperty('opacity','1','important');
    form.style.setProperty('position','relative','important');
    form.style.setProperty('left','auto','important');
    form.style.setProperty('right','auto','important');
    form.style.setProperty('bottom','auto','important');
    form.style.setProperty('top','auto','important');
    form.style.setProperty('z-index','99999','important');
    form.style.setProperty('flex','0 0 auto','important');
    form.style.setProperty('width','100%','important');
    form.style.setProperty('min-height','64px','important');
    form.style.setProperty('box-sizing','border-box','important');
    if(parts.conversation){
      parts.conversation.style.setProperty('display','flex','important');
      parts.conversation.style.setProperty('flex-direction','column','important');
      parts.conversation.style.setProperty('min-height','0','important');
      parts.conversation.style.setProperty('overflow','hidden','important');
    }
    if(box){
      box.style.setProperty('flex','1 1 auto','important');
      box.style.setProperty('min-height','0','important');
      box.style.setProperty('height','auto','important');
      box.style.setProperty('max-height','none','important');
      box.style.setProperty('overflow-y','auto','important');
      box.style.setProperty('box-sizing','border-box','important');
      box.style.setProperty('padding-bottom','12px','important');
    }
    input.style.setProperty('display','block','important');
    input.style.setProperty('visibility','visible','important');
    input.style.setProperty('opacity','1','important');
    input.style.setProperty('flex','1 1 auto','important');
    input.style.setProperty('min-width','0','important');
    input.style.setProperty('width','auto','important');
    input.style.setProperty('min-height','42px','important');
    input.style.setProperty('height','42px','important');
    input.style.setProperty('resize','none','important');
    input.style.setProperty('box-sizing','border-box','important');
    var send=form.querySelector('.send-btn');
    if(send){send.style.setProperty('display','grid','important');send.style.setProperty('visibility','visible','important');send.style.setProperty('opacity','1','important');send.style.setProperty('flex','0 0 42px','important')}
  }
  function bind(){
    var parts=ensure();
    if(!parts)return;
    var form=parts.form,input=parts.input;
    force();
    if(form.dataset.composerFallbackBound)return;
    form.dataset.composerFallbackBound='1';
    form.addEventListener('submit',function(e){
      e.preventDefault();e.stopPropagation();
      if(typeof window.__studySendSupportTextV7==='function')window.__studySendSupportTextV7();
      else if(typeof window.__studySendSupportTextV5==='function')window.__studySendSupportTextV5();
      else if(typeof window.sendAdminReply==='function')window.sendAdminReply();
    },true);
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
        e.preventDefault();e.stopPropagation();
        if(typeof window.__studySendSupportTextV7==='function')window.__studySendSupportTextV7();
        else if(typeof window.__studySendSupportTextV5==='function')window.__studySendSupportTextV5();
        else if(typeof window.sendAdminReply==='function')window.sendAdminReply();
      }
    },true);
  }
  function run(){
    var support=q('support');
    if(!support)return;
    bind();
    if(support.classList.contains('active'))force();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
  setInterval(run,500);
})();
