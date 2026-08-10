/* STUDY TH final public runtime fix: state-safe support controls, picker behavior, bot DOM dedupe. */
(function(){
  function boot(){
    if(window.__studyLastFixInstalled)return;
    if(!window.__studyAppReady&&!window.state&&!window.studyState)return;
    window.__studyLastFixInstalled=true;

    function getState(){return window.state||window.studyState||null}
    function closePickers(){document.querySelectorAll('.support-picker,.admin-reply-picker').forEach(function(el){el.classList.add('hidden')})}
    function togglePicker(id){
      var target=document.getElementById(id);if(!target)return;
      document.querySelectorAll('.support-picker').forEach(function(el){if(el!==target)el.classList.add('hidden')});
      target.classList.toggle('hidden');
    }

    /* The old inline toggleSupportPicker could resolve the dynamically-evaluated
       app's lexical state and throw `state is not defined` on some mobile loads.
       This replacement is completely DOM-only. */
    window.toggleSupportPicker=function(id){togglePicker(id)};

    /* Sticker/emoji actions are also DOM-safe and never depend on lexical app state. */
    window.sendSticker=async function(sticker){
      var value=String(sticker||'');
      closePickers();
      try{
        var fn=window.sendSupportMessage;
        if(typeof fn!=='function')throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');
        await fn({sticker:value,message:'✨ Sticker'});
        closePickers();
      }catch(err){alert('Không gửi được sticker: '+(err&&err.message||err))}
    };

    window.insertSupportEmoji=function(value){
      var input=document.getElementById('supportInput');if(!input)return;
      input.value+=(input.value?' ':'')+String(value||'');closePickers();input.focus();
    };

    window.sendSupport=async function(){
      var input=document.getElementById('supportInput'),text=input&&input.value.trim();if(!text)return;
      closePickers();
      try{await window.sendSupportMessage({message:text});if(input)input.value='';closePickers()}
      catch(err){if(input)input.value=text;alert('Không gửi được tin nhắn: '+(err&&err.message||err))}
    };

    /* Make the final send path race-safe even if an older wrapper is still present. */
    var oldSend=window.sendSupportMessage;
    if(typeof oldSend==='function'&&!oldSend.__stateSafeFinalFix){
      var wrapped=async function(payload){closePickers();var result=await oldSend(payload);closePickers();return result};
      wrapped.__stateSafeFinalFix=true;window.sendSupportMessage=wrapped;
    }

    /* Inline handlers remain for compatibility, but capture clicks so picker items
       cannot accidentally trigger a stale handler before the final function is used. */
    document.addEventListener('click',function(e){
      var pickerButton=e.target.closest('.support-picker button');
      if(pickerButton){
        var picker=pickerButton.closest('.support-picker');
        if(picker&&picker.id==='supportStickerPicker'){
          e.preventDefault();e.stopImmediatePropagation();
          var text=pickerButton.textContent||'';
          window.sendSticker(text);
          return;
        }
        if(picker&&picker.id==='supportEmojiPicker'){
          e.preventDefault();e.stopImmediatePropagation();
          window.insertSupportEmoji(pickerButton.textContent||'');
          return;
        }
      }
      if(!e.target.closest('.support-picker')&&!e.target.closest('[data-support-picker]')&&!e.target.closest('.composer-icon')){
        document.querySelectorAll('.support-picker').forEach(function(el){el.classList.add('hidden')});
      }
    },true);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closePickers()},true);

    function dedupeBotDom(){
      var list=document.querySelector('.support-message-list');if(!list)return;
      var seen=false;
      list.querySelectorAll('.support-bubble.bot').forEach(function(b){
        if(seen){var row=b.closest('.support-bubble-row');if(row)row.remove();else b.remove()}
        else seen=true;
      });
    }
    function afterRender(){closePickers();dedupeBotDom();setTimeout(dedupeBotDom,30);setTimeout(dedupeBotDom,150)}

    var oldRender=window.render;
    if(typeof oldRender==='function'&&!oldRender.__stateSafeFinalFix){
      var render=async function(){var r=oldRender.apply(this,arguments);if(r&&typeof r.then==='function')await r;afterRender();return r};
      render.__stateSafeFinalFix=true;window.render=render;
    }

    /* Shared exam links: keep the existing feature, but read globals safely. */
    window.studyOpenExamFromUrl=function(){
      try{
        var s=getState(),list=window.exams||[];var id=new URLSearchParams(location.search).get('exam');if(!s||!id||!Array.isArray(list))return;
        var e=list.find(function(x){return String(x.id)===String(id)});if(!e)return;
        s.subject=e.subject||'';s.page='subject';if(typeof window.render==='function')window.render();
      }catch(_){ }
    };

    afterRender();setTimeout(window.studyOpenExamFromUrl,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
})();
