/* STUDY TH final admin support chat: always-visible composer, live refresh, single-send guard. */
(function(){
  if(window.__studyAdminChatFinal)return;
  window.__studyAdminChatFinal=true;
  var sending=false,timer=null,channel=null;
  function escText(v){return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
  function forceComposer(){
    var form=document.getElementById('replyForm');if(!form)return;
    form.classList.remove('hidden');form.style.setProperty('display','flex','important');form.style.setProperty('visibility','visible','important');form.style.setProperty('opacity','1','important');
    var input=document.getElementById('replyInput'),btn=form.querySelector('.send-btn');
    if(input){input.disabled=!admin.thread;input.style.setProperty('display','block','important');input.placeholder=admin.thread?'Nhập tin nhắn...':'Chọn một cuộc trò chuyện...'}
    if(btn){btn.disabled=!admin.thread||sending;btn.style.setProperty('display','inline-flex','important')}
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
    try{await loadSupabase();var r=await db.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});if(r.error)throw r.error;if(!admin.thread||String(admin.thread.id)!==String(id))return;admin.messages=r.data||[];renderFinal();}catch(e){console.warn('admin final chat refresh',e)}
  }
  async function sendFinal(){
    var input=document.getElementById('replyInput'),text=input?.value.trim();
    if(!text||!admin.thread||sending)return;
    sending=true;forceComposer();
    try{await loadSupabase();var row={thread_id:admin.thread.id,account_id:admin.thread.account_id||null,sender:'admin',sender_name:'Admin',message:text};var r=await db.from('support_messages').insert(row);if(r.error)throw r.error;if(input)input.value='';await refresh(admin.thread.id);if(typeof loadSupportThreads==='function')await loadSupportThreads();toast('Đã gửi');}
    catch(e){toast('Không gửi được: '+(e?.message||e));}
    finally{sending=false;forceComposer()}
  }
  function start(){
    if(timer)clearInterval(timer);
    if(channel&&db)db.removeChannel(channel).catch(function(){});
    loadSupportThreads();
    loadSupabase().then(function(){
      channel=db.channel('study-admin-final-chat').on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages'},function(p){if(admin.thread&&String(p.new.thread_id)===String(admin.thread.id))refresh(admin.thread.id);loadSupportThreads()}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads'},function(){loadSupportThreads()}).subscribe();
      timer=setInterval(function(){if(admin.tab==='support'){loadSupportThreads();if(admin.thread)refresh(admin.thread.id)}},1200);
    }).catch(function(e){console.warn('admin final realtime',e)});
  }
  function install(){
    var form=document.getElementById('replyForm');if(!form)return;
    form.onsubmit=function(e){e.preventDefault();e.stopImmediatePropagation();sendFinal()};
    var input=document.getElementById('replyInput');if(input&&!input.__finalBound){input.__finalBound=true;input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();sendFinal()}} ,true)}
    var oldOpen=window.openThread;
    if(!oldOpen.__studyFinalWrapped){
      var wrapped=async function(id){await oldOpen(id);forceComposer();if(admin.thread)await refresh(admin.thread.id);forceComposer()};wrapped.__studyFinalWrapped=true;window.openThread=wrapped;
    }
    forceComposer();
  }
  function boot(){install();if(admin&&admin.tab==='support')start()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
  window.addEventListener('load',function(){setTimeout(boot,0)});
  var tries=0,t=setInterval(function(){if(typeof admin!=='undefined'&&typeof loadSupabase==='function'){install();if(++tries%4===0&&admin.tab==='support')start()}if(++tries>40)clearInterval(t)},250);
})();
