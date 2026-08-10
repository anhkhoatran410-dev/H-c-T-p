/* STUDY TH final public runtime fix: state-safe support controls, race-safe sends, picker behavior, bot DOM dedupe. */
(function(){
  function boot(){
    if(window.__studyLastFixInstalled)return;
    if(!window.__studyAppReady&&!window.state&&!window.studyState)return;
    window.__studyLastFixInstalled=true;

    function getState(){return window.state||window.studyState||null}
    function closePickers(){document.querySelectorAll('.support-picker,.admin-reply-picker').forEach(function(el){el.classList.add('hidden')})}
    function togglePicker(id){var target=document.getElementById(id);if(!target)return;document.querySelectorAll('.support-picker').forEach(function(el){if(el!==target)el.classList.add('hidden')});target.classList.toggle('hidden')}
    function getDeviceId(){try{if(typeof window.deviceId==='function')return window.deviceId();var key='study_device_id_v2',id=localStorage.getItem(key);if(!id){id=(crypto&&crypto.randomUUID)?crypto.randomUUID():'dev_'+Date.now()+'_'+Math.random().toString(36).slice(2);localStorage.setItem(key,id)}return id}catch(e){return 'dev_fallback'}}

    window.toggleSupportPicker=function(id){togglePicker(id)};

    window.sendSupportMessage=async function(payload){
      closePickers();
      var s=getState();if(!s)throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');
      var load=window.loadSupabase;if(typeof load!=='function')throw new Error('Supabase chưa sẵn sàng.');
      var t=await window.ensureThread();
      await load();
      var waiting=false;
      try{var gate=await db.from('support_threads').select('bot_waiting_admin').eq('id',t.id).maybeSingle();if(!gate.error)waiting=!!gate.data?.bot_waiting_admin}catch(_){ }
      var row={thread_id:t.id,account_id:t.account_id||s.supportAccountId||null,sender:'user',message:String(payload?.message||''),attachment_url:payload?.attachment_url||null,attachment_type:payload?.attachment_type||null,attachment_name:payload?.attachment_name||null,sticker:payload?.sticker||null,bot_handled:waiting};
      var r=await db.from('support_messages').insert(row).select('*').single();if(r.error)throw r.error;
      s.messages=Array.isArray(s.messages)?s.messages:[];s.messages.push(r.data||row);window.studyState=s;window.state=s;
      if(typeof window.render==='function')await window.render();
      closePickers();
    };

    window.sendSticker=async function(sticker){var value=String(sticker||'');closePickers();try{await window.sendSupportMessage({sticker:value,message:'✨ Sticker'});closePickers()}catch(err){alert('Không gửi được sticker: '+(err&&err.message||err))}};
    window.insertSupportEmoji=function(value){var input=document.getElementById('supportInput');if(!input)return;input.value+=(input.value?' ':'')+String(value||'');closePickers();input.focus()};
    window.sendSupport=async function(){var input=document.getElementById('supportInput'),text=input&&input.value.trim();if(!text)return;closePickers();try{await window.sendSupportMessage({message:text});if(input)input.value='';closePickers()}catch(err){if(input)input.value=text;alert('Không gửi được tin nhắn: '+(err&&err.message||err))}};

    document.addEventListener('click',function(e){
      var pickerButton=e.target.closest('.support-picker button');
      if(pickerButton){
        var picker=pickerButton.closest('.support-picker');
        if(picker&&picker.id==='supportStickerPicker'){e.preventDefault();e.stopImmediatePropagation();window.sendSticker(pickerButton.textContent||'');return}
        if(picker&&picker.id==='supportEmojiPicker'){e.preventDefault();e.stopImmediatePropagation();window.insertSupportEmoji(pickerButton.textContent||'');return}
      }
      if(!e.target.closest('.support-picker')&&!e.target.closest('[data-support-picker]')&&!e.target.closest('.composer-icon'))document.querySelectorAll('.support-picker').forEach(function(el){el.classList.add('hidden')});
    },true);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closePickers()},true);

    function dedupeBotDom(){var list=document.querySelector('.support-message-list');if(!list)return;var seen=false;list.querySelectorAll('.support-bubble.bot').forEach(function(b){if(seen){var row=b.closest('.support-bubble-row');if(row)row.remove();else b.remove()}else seen=true})}
    function afterRender(){closePickers();dedupeBotDom();setTimeout(dedupeBotDom,30);setTimeout(dedupeBotDom,150)}

    var oldRender=window.render;if(typeof oldRender==='function'&&!oldRender.__stateSafeFinalFix){var render=async function(){var r=oldRender.apply(this,arguments);if(r&&typeof r.then==='function')await r;afterRender();return r};render.__stateSafeFinalFix=true;window.render=render}

    window.studyOpenExamFromUrl=function(){try{var s=getState(),list=window.exams||[],id=new URLSearchParams(location.search).get('exam');if(!s||!id||!Array.isArray(list))return;var e=list.find(function(x){return String(x.id)===String(id)});if(!e)return;s.subject=e.subject||'';s.page='subject';if(typeof window.render==='function')window.render()}catch(_){ }};
    afterRender();setTimeout(window.studyOpenExamFromUrl,250);

    /* Final chat reliability: optimistic render plus realtime/poll fallback. */
    var chatTimer=null,chatChannel=null,chatBusy=false;
    async function refreshPublicChat(){
      var s=getState();if(!s||s.page!=='support'||typeof window.ensureThread!=='function')return;if(chatBusy)return;chatBusy=true;
      try{var t=await window.ensureThread();await load();var r=await db.from('support_messages').select('*').eq('thread_id',t.id).order('created_at',{ascending:true});if(r.error)throw r.error;s.messages=r.data||[];window.studyState=s;window.state=s;if(typeof window.render==='function')await window.render();setTimeout(function(){var box=document.querySelector('.support-message-list');if(box)box.scrollTop=box.scrollHeight},0)}catch(e){console.warn('public chat refresh',e)}finally{chatBusy=false}
    }
    function startPublicChatLive(){
      if(typeof window.ensureThread!=='function'||typeof window.loadSupabase!=='function')return;
      window.loadSupabase().then(async function(){try{var t=await window.ensureThread();if(chatChannel)db.removeChannel(chatChannel).catch(function(){});chatChannel=db.channel('public-support-final-live').on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},function(p){if(String(p.new.thread_id)===String(t.id))refreshPublicChat()}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads'},function(p){if(String(p.new.id)===String(t.id))refreshPublicChat()}).subscribe();clearInterval(chatTimer);chatTimer=setInterval(refreshPublicChat,1000);refreshPublicChat()}catch(e){console.warn('public support live',e)}}).catch(function(e){console.warn('public support setup',e)})
    }
    var oldStart=window.startSupportLive;
    window.startSupportLive=function(){try{if(oldStart)oldStart()}catch(e){console.warn('legacy support live',e)}startPublicChatLive()};
    if(getState()?.page==='support')startPublicChatLive();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
})();
