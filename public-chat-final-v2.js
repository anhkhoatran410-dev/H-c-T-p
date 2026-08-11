/* STUDY TH — public support send + AI dark-theme final repair */
(function(){
  if(window.__studyPublicChatFinalV2)return;
  window.__studyPublicChatFinalV2=true;
  function st(){return window.state||window.studyState||null}
  function closePickers(){document.querySelectorAll('.support-picker,.support-media-menu').forEach(function(x){x.classList.add('hidden')})}
  async function send(payload){
    var s=st(); if(!s) throw new Error('Ứng dụng chưa sẵn sàng.');
    if(typeof window.ensureThread!=='function')throw new Error('Không tạo được cuộc trò chuyện hỗ trợ.');
    if(typeof window.loadSupabase!=='function')throw new Error('Kết nối hỗ trợ chưa sẵn sàng.');
    await window.loadSupabase();
    var t=await window.ensureThread();
    var row={thread_id:t.id,account_id:t.account_id||s.supportAccountId||null,sender:'user',message:String(payload&&payload.message||''),attachment_url:payload&&payload.attachment_url||null,attachment_type:payload&&payload.attachment_type||null,attachment_name:payload&&payload.attachment_name||null,sticker:payload&&payload.sticker||null,bot_handled:false};
    var r=await db.from('support_messages').insert(row).select('*').single();
    if(r.error)throw r.error;
    s.messages=Array.isArray(s.messages)?s.messages:[];
    s.messages.push(r.data||row); window.state=s;window.studyState=s;
    closePickers();
    if(typeof window.render==='function')await window.render();
    setTimeout(function(){var box=document.querySelector('.support-message-list,#supportMessages');if(box)box.scrollTop=box.scrollHeight},20);
    return r.data||row;
  }
  window.sendSupportMessage=send;
  window.sendSupport=async function(){
    var input=document.getElementById('supportInput'), text=input&&input.value.trim();if(!text)return;
    if(window.__studyChatSending)return;window.__studyChatSending=true;
    try{await send({message:text});if(input)input.value='';}
    catch(e){if(input)input.value=text;console.error(e);alert('Không gửi được tin nhắn: '+(e&&e.message||e));}
    finally{window.__studyChatSending=false}
  };
  function dark(){return document.documentElement.classList.contains('dark')||document.body.classList.contains('dark')||document.body.classList.contains('dark-mode')||localStorage.getItem('study_theme')==='dark'||localStorage.getItem('theme')==='dark'}
  function aiStyle(){
    var old=document.getElementById('study-ai-dark-final');if(old)old.remove();
    var css=document.createElement('style');css.id='study-ai-dark-final';
    css.textContent=`
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
    `;
    document.head.appendChild(css);
  }
  function boot(){aiStyle();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,100)});
  new MutationObserver(function(){aiStyle()}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
