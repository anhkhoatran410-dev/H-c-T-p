/* STUDY TH — final ADMIN support chat. The reply box belongs to Admin > Hỗ trợ. */
(function(){
  if(window.__studyAdminChatFinalV4)return;
  window.__studyAdminChatFinalV4=true;
  var sending=false,timer=null,channel=null;

  function escText(v){return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}

  function installStyle(){
    if(document.getElementById('study-admin-chat-final-v4-style'))return;
    var s=document.createElement('style');s.id='study-admin-chat-final-v4-style';
    s.textContent='.conversation{display:flex!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important}.chat-header{flex:0 0 auto!important}#supportMessages{flex:1 1 auto!important;min-height:0!important;overflow:auto!important}#replyForm{display:flex!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:999!important;flex:0 0 auto!important;align-items:center;gap:10px;min-height:68px;padding:12px 14px!important;box-sizing:border-box;background:rgba(255,255,255,.98);border-top:1px solid rgba(100,110,150,.16)}#replyForm.hidden{display:flex!important}#replyInput{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;min-width:0!important;min-height:44px!important}#replyForm .send-btn{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto!important}body.dark #replyForm{background:rgba(20,27,45,.98)}';
    document.head.appendChild(s);
  }

  function forceComposer(){
    installStyle();
    var conversation=document.querySelector('#support .conversation,.conversation');
    var form=document.getElementById('replyForm');
    if(!form&&conversation){
      form=document.createElement('form');form.id='replyForm';form.className='composer';form.autocomplete='off';
      form.innerHTML='<textarea id="replyInput" rows="1" placeholder="Nhập tin nhắn..."></textarea><button class="send-btn" type="submit" aria-label="Gửi">➤</button>';
      conversation.appendChild(form);
    }
    if(!form)return null;
    form.classList.remove('hidden');
    form.style.setProperty('display','flex','important');
    form.style.setProperty('visibility','visible','important');
    form.style.setProperty('opacity','1','important');
    form.style.setProperty('position','relative','important');
    form.style.setProperty('z-index','999','important');
    form.style.setProperty('flex','0 0 auto','important');
    var input=document.getElementById('replyInput'),btn=form.querySelector('.send-btn');
    var ready=!!(typeof admin!=='undefined'&&admin.thread);
    if(input){input.disabled=!ready;input.style.setProperty('display','block','important');input.style.setProperty('visibility','visible','important');input.style.setProperty('opacity','1','important');input.placeholder=ready?'Nhập tin nhắn...':'Chọn một cuộc trò chuyện...'}
    if(btn){btn.disabled=!ready||sending;btn.style.setProperty('display','inline-flex','important');btn.style.setProperty('visibility','visible','important');btn.style.setProperty('opacity','1','important')}
    return form;
  }

  function media(m){if(m.attachment_url&&String(m.attachment_type||'').startsWith('image/'))return '<a href="'+escText(m.attachment_url)+'" target="_blank" rel="noopener"><img class="admin-attachment" src="'+escText(m.attachment_url)+'" alt="'+escText(m.attachment_name||'Hình ảnh')+'" loading="lazy"></a>';if(m.sticker)return '<div class="admin-sticker">'+escText(m.sticker)+'</div>';return ''}

  function renderFinal(){
    var t=admin.thread,head=document.getElementById('chatHeader'),box=document.getElementById('supportMessages');
    if(!t){if(head)head.innerHTML='<div class="empty-chat"><span>💬</span><b>Chọn một cuộc trò chuyện</b><small>Tin nhắn sẽ xuất hiện ở đây.</small></div>';if(box)box.innerHTML='<div class="empty-chat"><span>✨</span><b>Chưa chọn cuộc trò chuyện</b><small>Chọn người ở bên trái để bắt đầu.</small></div>';forceComposer();return}
    if(head)head.innerHTML='<div class="chat-person"><span class="avatar">'+escText(t.support_accounts?.avatar||'💬')+'</span><div><b>'+escText(t.student_name||'Người dùng')+'</b><small>'+escText(t.support_accounts?.name||'Hỗ trợ chung')+' · '+escText(String(t.device_id||'').slice(0,12))+'</small></div></div>';
    if(box){var seen=new Set();box.innerHTML=(admin.messages||[]).filter(function(m){var id=String(m.id||m.created_at+'|'+m.sender+'|'+m.message);if(seen.has(id))return false;seen.add(id);return true}).map(function(m){return '<div class="bubble-row '+escText(m.sender||'user')+'"><div class="bubble '+escText(m.sender||'user')+'"><b>'+escText(m.sender_name||(m.sender==='admin'?'Admin':m.sender==='bot'?'Bot':'Người dùng'))+'</b>'+media(m)+(m.message&&m.message!=='📷 Hình ảnh'&&m.message!=='🎞️ GIF'&&m.message!=='✨ Sticker'?'<div>'+escText(m.message)+'</div>':'')+'<small>'+escText(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>'}).join('')||'<div class="empty-chat"><span>💬</span><small>Chưa có tin nhắn.</small></div>';box.scrollTop=box.scrollHeight}
    forceComposer();
  }

  async function refresh(id){
    if(!id)return;
    try{await loadSupabase();var r=await db.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});if(r.error)throw r.error;if(!admin.thread||String(admin.thread.id)!==String(id))return;admin.messages=r.data||[];renderFinal();}
    catch(e){console.warn('admin final chat refresh',e);forceComposer()}
  }

  async function sendFinal(){
    var input=document.getElementById('replyInput'),text=input?.value.trim();
    if(!text||!admin.thread||sending)return;
    sending=true;forceComposer();
    try{
      await loadSupabase();
      var row={thread_id:admin.thread.id,account_id:admin.thread.account_id||null,sender:'admin',sender_name:'Admin',message:text};
      var r=await db.from('support_messages').insert(row);
      if(r.error)throw r.error;
      if(input)input.value='';
      await refresh(admin.thread.id);
      if(typeof loadSupportThreads==='function')await loadSupportThreads();
      if(typeof toast==='function')toast('Đã gửi');
    }catch(e){if(typeof toast==='function')toast('Không gửi được: '+(e?.message||e));console.error('ADMIN SUPPORT SEND ERROR',e)}
    finally{sending=false;forceComposer()}
  }

  function start(){
    if(timer)clearInterval(timer);
    if(channel&&db)db.removeChannel(channel).catch(function(){});
    if(typeof loadSupportThreads==='function')loadSupportThreads();
    loadSupabase().then(function(){
      channel=db.channel('study-admin-final-chat-v4').on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},function(p){if(admin.thread&&String(p.new.thread_id)===String(admin.thread.id))refresh(admin.thread.id);if(typeof loadSupportThreads==='function')loadSupportThreads()}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads'},function(){if(typeof loadSupportThreads==='function')loadSupportThreads()}).subscribe();
      timer=setInterval(function(){if(admin.tab==='support'){if(typeof loadSupportThreads==='function')loadSupportThreads();if(admin.thread)refresh(admin.thread.id)}},1200);
    }).catch(function(e){console.warn('admin final realtime',e);forceComposer()});
  }

  function install(){
    installStyle();
    var form=forceComposer();
    if(!form)return;
    if(!form.__finalBound){
      form.__finalBound=true;
      form.onsubmit=function(e){e.preventDefault();e.stopImmediatePropagation();sendFinal()};
    }
    var input=document.getElementById('replyInput');
    if(input&&!input.__finalBound){
      input.__finalBound=true;
      input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();sendFinal()}},true);
    }
    var oldOpen=window.openThread;
    if(typeof oldOpen==='function'&&!oldOpen.__studyFinalWrappedV4){
      var wrapped=async function(id){await oldOpen.call(this,id);forceComposer();if(admin.thread)await refresh(admin.thread.id);forceComposer()};
      wrapped.__studyFinalWrappedV4=true;window.openThread=wrapped;
    }
  }

  function boot(){
    install();
    if(typeof admin!=='undefined'&&typeof loadSupabase==='function'&&admin.tab==='support')start();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
  window.addEventListener('load',function(){setTimeout(boot,0)});
  var tries=0,t=setInterval(function(){if(typeof admin!=='undefined'&&typeof loadSupabase==='function'){install();if(++tries%4===0&&admin.tab==='support')start()}if(++tries>60)clearInterval(t)},250);
  document.addEventListener('click',function(e){if(e.target.closest('.thread'))setTimeout(function(){install();forceComposer()},100)},true);
})();
