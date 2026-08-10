/* STUDY TH runtime finalizer: survives script races and old cached bundles. */
(function(){
  var started=false;
  function closePickers(){document.querySelectorAll('.support-picker,.admin-reply-picker').forEach(function(x){x.classList.add('hidden')})}
  function botRow(row){
    var text=String(row.textContent||'');
    return /\b(?:Hỗ trợ chung|Bot|• Bot)\b/i.test(text) && (/Mình đã nhận được tin nhắn|Admin sẽ phản hồi|Bot/i.test(text));
  }
  function adminRow(row){return /\bAdmin\b/i.test(String(row.textContent||''))&&!botRow(row)}
  function dedupeBotDom(){
    var list=document.querySelector('.support-message-list');
    if(!list)return;
    var seen=false;
    Array.from(list.children).forEach(function(row){
      if(adminRow(row)){seen=false;return;}
      if(!botRow(row))return;
      if(!seen){seen=true;return;}
      row.remove();
    });
  }
  function hardenText(){
    if(!document.getElementById('study-runtime-final-style')){
      var s=document.createElement('style');s.id='study-runtime-final-style';s.textContent='.support-bubble,.support-bubble div,.message,.attempt-question,.attempt-answer{overflow-wrap:anywhere;word-break:break-word;white-space:normal}.support-bubble{line-height:1.6}.support-picker.hidden,.admin-reply-picker.hidden{display:none!important}@media(max-width:650px){.support-bubble{max-width:92%!important}.attempt-answer{display:block!important}.attempt-answer b{display:block;margin-top:3px}}';document.head.appendChild(s)
    }
  }
  function install(){
    if(started)return;
    var ready=!!(window.__studyAppReady||window.state||window.studyState);
    if(!ready)return;
    started=true;
    hardenText();closePickers();
    window.toggleSupportPicker=function(id){var t=document.getElementById(id);if(!t)return;document.querySelectorAll('.support-picker').forEach(function(x){if(x!==t)x.classList.add('hidden')});t.classList.toggle('hidden')};
    window.sendSticker=async function(sticker){closePickers();try{if(typeof window.sendSupportMessage!=='function')throw new Error('Hỗ trợ chưa sẵn sàng.');await window.sendSupportMessage({sticker:String(sticker||''),message:'✨ Sticker'});closePickers()}catch(e){alert('Không gửi được sticker: '+(e&&e.message||e))}};
    window.insertSupportEmoji=function(value){var input=document.getElementById('supportInput');if(!input)return;input.value+=(input.value?' ':'')+String(value||'');closePickers();input.focus()};
    document.addEventListener('click',function(e){
      var b=e.target.closest('.support-picker button');
      if(b){var p=b.closest('.support-picker');if(p&&p.id==='supportStickerPicker'){e.preventDefault();e.stopImmediatePropagation();window.sendSticker(b.textContent||'');return}if(p&&p.id==='supportEmojiPicker'){e.preventDefault();e.stopImmediatePropagation();window.insertSupportEmoji(b.textContent||'');return}}
      if(!e.target.closest('.support-picker')&&!e.target.closest('.composer-icon'))closePickers();
    },true);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closePickers()},true);
    var root=document.getElementById('app');
    if(root)new MutationObserver(function(){hardenText();dedupeBotDom()}).observe(root,{childList:true,subtree:true});
    dedupeBotDom();setTimeout(dedupeBotDom,50);setTimeout(dedupeBotDom,250);setTimeout(dedupeBotDom,1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0)});else install();
  window.addEventListener('study-app-loaded',function(){setTimeout(install,0)});
  var tries=0;var timer=setInterval(function(){install();if(++tries>40)clearInterval(timer)},250);
})();
