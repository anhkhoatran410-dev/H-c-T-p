/* STUDY TH hardening: public support gate fallback, picker cleanup and mobile-safe rendering. */
(function(){
  function boot(){
    if(typeof state==='undefined') return;

    function closePickers(){
      document.querySelectorAll('.support-picker').forEach(function(x){x.classList.add('hidden')});
    }

    function visibleSupportMessages(list){
      var out=[], botSeen=false, adminSinceBot=false;
      (Array.isArray(list)?list:[]).forEach(function(m){
        var sender=String(m&&m.sender||'user');
        if(sender==='admin'){ out.push(m); adminSinceBot=true; return; }
        if(sender==='bot'){
          if(!botSeen || adminSinceBot){ out.push(m); botSeen=true; adminSinceBot=false; }
          return;
        }
        out.push(m);
      });
      return out;
    }

    window.sendSticker=async function(sticker){
      closePickers();
      try{ await window.sendSupportMessage({sticker:String(sticker||''),message:'✨ Sticker'}); }
      catch(e){ alert('Không gửi được sticker: '+(e&&e.message||e)); }
    };

    window.insertSupportEmoji=function(x){
      var input=document.getElementById('supportInput');
      if(!input)return;
      input.value+=(input.value?' ':'')+x;
      closePickers();
      input.focus();
    };

    window.sendSupport=async function(){
      var input=document.getElementById('supportInput');
      var text=input&&input.value.trim();
      if(!text)return;
      closePickers(); input.value='';
      try{ await window.sendSupportMessage({message:text}); }
      catch(e){ input.value=text; alert('Không gửi được tin nhắn: '+(e&&e.message||e)); }
    };

    var oldSend=window.sendSupportMessage;
    if(typeof oldSend==='function'){
      window.sendSupportMessage=async function(payload){ closePickers(); return oldSend(payload); };
    }

    var oldSupportPage=window.supportPage;
    if(typeof oldSupportPage==='function'){
      window.supportPage=function(){
        var original=state.messages;
        state.messages=visibleSupportMessages(original);
        try{return oldSupportPage();}finally{state.messages=original;}
      };
    }

    // Exam navigation is owned by app.js. Do not rewrite startExam or mutate page from URL after launch.

    var oldRender=window.render;
    window.render=async function(){
      var r=oldRender&&oldRender();
      if(r&&typeof r.then==='function')await r;
      closePickers();
    };

  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
})();
