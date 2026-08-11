/* STUDY TH — final public support runtime: thread bootstrap, safe send, realtime fallback, mobile composer. */
(function(){
  'use strict';
  if(window.__studyPublicChatFinalV3)return;
  window.__studyPublicChatFinalV3=true;

  function st(){return window.state||window.studyState||null}
  function device(){try{if(typeof window.deviceId==='function')return window.deviceId();var k='study_device_id_v2',id=localStorage.getItem(k);if(!id){id=(crypto&&crypto.randomUUID)?crypto.randomUUID():'dev_'+Date.now()+'_'+Math.random().toString(36).slice(2);localStorage.setItem(k,id)}return id}catch(e){return 'dev_fallback'}}
  function closePickers(){document.querySelectorAll('.support-picker,.support-media-menu').forEach(function(x){x.classList.add('hidden')})}

  async function dbReady(){
    if(typeof window.loadSupabase!=='function')throw new Error('Kết nối Supabase chưa sẵn sàng.');
    await window.loadSupabase();
    if(!window.db)throw new Error('Supabase chưa sẵn sàng.');
    return window.db;
  }

  async function defaultAccount(d,s){
    var current=s&&s.supportAccountId;
    if(current)return current;
    var q=await d.from('support_accounts').select('id').eq('handle','support').eq('is_active',true).limit(1).maybeSingle();
    if(!q.error&&q.data?.id){s.supportAccountId=q.data.id;return q.data.id}
    var any=await d.from('support_accounts').select('id').eq('is_active',true).order('created_at',{ascending:true}).limit(1).maybeSingle();
    if(!any.error&&any.data?.id){s.supportAccountId=any.data.id;return any.data.id}
    var created=await d.from('support_accounts').insert({name:'Hỗ trợ chung',handle:'support',avatar:'💬',description:'Kênh hỗ trợ chính của STUDY TH',bot_enabled:true,is_active:true}).select('id').single();
    if(!created.error&&created.data?.id){s.supportAccountId=created.data.id;return created.data.id}
    var retry=await d.from('support_accounts').select('id').eq('handle','support').limit(1).maybeSingle();
    if(!retry.error&&retry.data?.id){s.supportAccountId=retry.data.id;return retry.data.id}
    return null;
  }

  async function ensureThreadFinal(){
    var s=st();if(!s)throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');
    if(s.thread)return s.thread;
    var d=await dbReady();
    var id=device();
    var candidate=s.candidate||localStorage.getItem('study_candidate')||'Người dùng';
    var accountId=await defaultAccount(d,s);
    var found=await d.from('support_threads').select('*').eq('device_id',id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(found.error)throw found.error;
    var data=found.data;
    if(!data){
      var created=await d.from('support_threads').insert({device_id:id,student_name:candidate,account_id:accountId}).select('*').single();
      if(created.error){
        var duplicate=/duplicate key|unique constraint/i.test(String(created.error.message||created.error.details||''));
        if(!duplicate)throw created.error;
        var retry=await d.from('support_threads').select('*').eq('device_id',id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
        if(retry.error||!retry.data)throw retry.error||created.error;
        data=retry.data;
      }else data=created.data;
    }
    if(accountId&&String(data.account_id||'')!==String(accountId)){
      var upd=await d.from('support_threads').update({account_id:accountId,student_name:candidate}).eq('id',data.id).select('*').single();
      if(!upd.error&&upd.data)data=upd.data;
    }
    s.thread=data;s.messages=Array.isArray(s.messages)?s.messages:[];window.state=s;window.studyState=s;
    return data;
  }
  window.ensureThread=ensureThreadFinal;

  async function refreshChat(){
    var s=st();if(!s||s.page!=='support')return;
    try{
      var t=await ensureThreadFinal(),d=await dbReady();
      var r=await d.from('support_messages').select('*').eq('thread_id',t.id).order('created_at',{ascending:true});
      if(r.error)throw r.error;
      s.messages=r.data||[];window.state=s;window.studyState=s;
      if(typeof window.render==='function')await window.render();
      setTimeout(function(){var box=document.querySelector('.support-message-list');if(box)box.scrollTop=box.scrollHeight},0);
    }catch(e){console.warn('STUDY public support refresh:',e)}
  }

  var sending=false;
  async function send(payload){
    var s=st();if(!s)throw new Error('Ứng dụng chưa sẵn sàng.');
    if(sending||window.__studyChatSending)return;
    sending=true;window.__studyChatSending=true;closePickers();
    try{
      var d=await dbReady(),t=await ensureThreadFinal();
      var waiting=false;
      try{var gate=await d.from('support_threads').select('bot_waiting_admin').eq('id',t.id).maybeSingle();if(!gate.error)waiting=!!gate.data?.bot_waiting_admin}catch(_){ }
      var row={thread_id:t.id,account_id:t.account_id||s.supportAccountId||null,sender:'user',message:String(payload&&payload.message||''),attachment_url:payload&&payload.attachment_url||null,attachment_type:payload&&payload.attachment_type||null,attachment_name:payload&&payload.attachment_name||null,sticker:payload&&payload.sticker||null,bot_handled:waiting};
      if(!row.message&&!row.attachment_url&&!row.sticker)throw new Error('Tin nhắn đang trống.');
      var r=await d.from('support_messages').insert(row).select('*').single();
      if(r.error)throw r.error;
      s.messages=Array.isArray(s.messages)?s.messages:[];
      var inserted=r.data||row;
      if(inserted.id&&!s.messages.some(function(m){return String(m.id)===String(inserted.id)}))s.messages.push(inserted);
      window.state=s;window.studyState=s;
      if(typeof window.render==='function')await window.render();
      setTimeout(function(){var box=document.querySelector('.support-message-list');if(box)box.scrollTop=box.scrollHeight},20);
      return inserted;
    }finally{sending=false;window.__studyChatSending=false}
  }
  window.sendSupportMessage=send;
  window.sendSupport=async function(){
    var input=document.getElementById('supportInput'),text=input&&input.value.trim();if(!text)return;
    try{await send({message:text});if(input)input.value='';}
    catch(e){if(input)input.value=text;console.error(e);alert('Không gửi được tin nhắn: '+(e&&e.message||e))}
  };
  window.sendSticker=async function(sticker){try{await send({sticker:String(sticker||''),message:'✨ Sticker'})}catch(e){alert('Không gửi được sticker: '+(e&&e.message||e))}};
  window.insertSupportEmoji=function(value){var input=document.getElementById('supportInput');if(!input)return;input.value+=(input.value?' ':'')+String(value||'');closePickers();input.focus()};
  window.toggleSupportPicker=function(id){var target=document.getElementById(id);if(!target)return;document.querySelectorAll('.support-picker').forEach(function(x){if(x!==target)x.classList.add('hidden')});target.classList.toggle('hidden')};

  function installComposerCss(){
    if(document.getElementById('study-public-chat-v3-style'))return;
    var css=document.createElement('style');css.id='study-public-chat-v3-style';css.textContent=`
      .support-shell{min-width:0;}
      .support-message-list{min-width:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;}
      .support-bubble{max-width:min(82%,760px);overflow-wrap:anywhere;word-break:break-word;white-space:normal;}
      #supportInput{min-width:0;width:100%;box-sizing:border-box;font-size:16px;}
      .support-composer{position:sticky;bottom:0;z-index:30;display:flex;align-items:flex-end;gap:8px;max-width:100%;box-sizing:border-box;padding-bottom:calc(8px + env(safe-area-inset-bottom));}
      .support-composer textarea{min-width:0;max-width:100%;max-height:140px;resize:none;box-sizing:border-box;}
      .support-picker{max-width:min(92vw,360px);max-height:45vh;overflow:auto;z-index:1000;}
      @media(max-width:650px){
        .support-shell{width:100%;max-width:100%;overflow:hidden;}
        .support-message-list{padding-bottom:8px;}
        .support-composer{width:100%;gap:6px;padding:8px 8px calc(8px + env(safe-area-inset-bottom));}
        #supportInput{min-height:48px;max-height:120px;line-height:1.35;}
        .support-picker{position:fixed!important;left:8px!important;right:8px!important;bottom:calc(72px + env(safe-area-inset-bottom))!important;width:auto!important;max-width:none!important;max-height:42vh!important;}
      }
    `;document.head.appendChild(css);
  }

  var liveChannel=null,liveTimer=null,liveBusy=false;
  async function startLive(){
    try{
      var s=st();if(!s||s.page!=='support')return;
      var d=await dbReady(),t=await ensureThreadFinal();
      if(liveChannel){try{await d.removeChannel(liveChannel)}catch(_){}liveChannel=null}
      liveChannel=d.channel('study-public-support-final-v3')
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},function(p){if(String(p.new.thread_id)===String(t.id))refreshChat()})
        .on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads'},function(p){if(String(p.new.id)===String(t.id))refreshChat()})
        .subscribe(function(status){console.log('STUDY public support realtime:',status)});
      clearInterval(liveTimer);
      liveTimer=setInterval(function(){if(!liveBusy)refreshChat()},1500);
      refreshChat();
    }catch(e){console.warn('STUDY public support live:',e)}
  }
  window.startSupportLive=startLive;

  async function selectAccount(id){
    var s=st();if(!s)return;
    s.supportAccountId=id;s.thread=null;s.messages=[];window.state=s;window.studyState=s;
    await startLive();
    if(typeof window.render==='function')await window.render();
  }
  window.selectSupportAccount=selectAccount;

  function bind(){
    installComposerCss();
    var form=document.getElementById('supportForm')||document.querySelector('.support-composer form');
    if(form&&!form.dataset.publicChatV3){form.dataset.publicChatV3='1';form.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();window.sendSupport()},true)}
    if(!document.body.dataset.publicChatV3Click){
      document.body.dataset.publicChatV3Click='1';
      document.addEventListener('click',function(e){
        var b=e.target.closest('.support-picker button');
        if(b){var p=b.closest('.support-picker');if(p&&p.id==='supportStickerPicker'){e.preventDefault();e.stopImmediatePropagation();window.sendSticker(b.textContent||'');return}if(p&&p.id==='supportEmojiPicker'){e.preventDefault();e.stopImmediatePropagation();window.insertSupportEmoji(b.textContent||'');return}}
        if(!e.target.closest('.support-picker')&&!e.target.closest('.composer-icon'))closePickers();
      },true);
      document.addEventListener('keydown',function(e){if(e.key==='Escape')closePickers();if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target&&e.target.id==='supportInput'){e.preventDefault();e.stopImmediatePropagation();window.sendSupport()}} ,true);
    }
  }

  function aiStyle(){
    var old=document.getElementById('study-ai-dark-final');if(old)old.remove();
    var css=document.createElement('style');css.id='study-ai-dark-final';css.textContent=`
      #study-ai-support .study-ai-card{color:var(--text,#172033);background:var(--card,#fff)}
      #study-ai-support .study-ai-head h2,#study-ai-support .study-ai-head p,#study-ai-support .study-ai-msg{color:inherit}
      #study-ai-support .study-ai-messages{color:var(--text,#172033)}
      #study-ai-support .study-ai-msg.bot{color:var(--text,#172033)!important;background:rgba(100,116,139,.10)!important}
      #study-ai-support .study-ai-msg.user{color:#fff!important}
      #study-ai-support textarea{color:var(--text,#172033);background:var(--input,#fff)}
      html.dark #study-ai-support .study-ai-card,body.dark #study-ai-support .study-ai-card,body.dark-mode #study-ai-support .study-ai-card{background:#111827!important;color:#f3f4f6!important}
      html.dark #study-ai-support .study-ai-head h2,html.dark #study-ai-support .study-ai-head p,html.dark #study-ai-support .study-ai-msg,body.dark #study-ai-support .study-ai-head h2,body.dark #study-ai-support .study-ai-head p,body.dark #study-ai-support .study-ai-msg,body.dark-mode #study-ai-support .study-ai-head h2,body.dark-mode #study-ai-support .study-ai-head p,body.dark-mode #study-ai-support .study-ai-msg{color:#f3f4f6!important}
      html.dark #study-ai-support .study-ai-msg.bot,body.dark #study-ai-support .study-ai-msg.bot,body.dark-mode #study-ai-support .study-ai-msg.bot{background:#1f2937!important;color:#f9fafb!important}
      html.dark #study-ai-support textarea,body.dark #study-ai-support textarea,body.dark-mode #study-ai-support textarea{background:#0f172a!important;color:#f9fafb!important;border-color:#374151!important}
    `;document.head.appendChild(css);
  }

  function boot(){bind();aiStyle();if(st()?.page==='support')setTimeout(startLive,100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,100)});
  var tries=0,timer=setInterval(function(){bind();if(st()?.page==='support'&&!liveChannel)startLive();if(++tries>30)clearInterval(timer)},500);
  new MutationObserver(function(){installComposerCss()}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
