/* STUDY TH Admin Support bridge — authoritative thread click/render path. */
(function(){
  'use strict';
  if(window.__studySupportBridgeV1)return;
  window.__studySupportBridgeV1=true;

  function escText(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]});
  }
  function openComposer(show){
    var form=document.getElementById('replyForm');
    if(!form)return;
    if(show){
      form.classList.remove('hidden');
      form.style.setProperty('display','flex','important');
      form.style.setProperty('visibility','visible','important');
      form.style.setProperty('opacity','1','important');
    }else{
      form.classList.add('hidden');
    }
  }
  function render(t,rows){
    var head=document.getElementById('chatHeader');
    var box=document.getElementById('supportMessages');
    if(!head||!box)return;
    head.innerHTML='<div class="chat-person"><span class="avatar">'+escText(t.support_accounts&&t.support_accounts.avatar||'💬')+'</span><div><b>'+escText(t.student_name||'Người dùng')+'</b><small>'+escText(t.support_accounts&&t.support_accounts.name||'Hỗ trợ chung')+' · '+escText(String(t.device_id||'').slice(0,12))+'</small></div></div>';
    box.innerHTML=(rows||[]).map(function(m){
      var sender=m.sender||'user';
      var name=m.sender_name||(sender==='admin'?'Admin':sender==='bot'?'Bot':'Người dùng');
      var text=m.message==null?'':m.message;
      var media=m.attachment_url?'<div><a href="'+escText(m.attachment_url)+'" target="_blank" rel="noopener">📎 '+escText(m.attachment_name||'Tệp đính kèm')+'</a></div>':'';
      var sticker=m.sticker?'<div style="font-size:32px">'+escText(m.sticker)+'</div>':'';
      return '<div class="bubble-row '+escText(sender)+'"><div class="bubble '+escText(sender)+'"><b>'+escText(name)+'</b><div>'+escText(text)+'</div>'+media+sticker+'<small>'+escText(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>';
    }).join('')||'<div class="empty-chat"><span>💬</span><small>Chưa có tin nhắn.</small></div>';
    box.scrollTop=box.scrollHeight;
    openComposer(true);
  }
  async function openThread(id){
    if(!id||typeof window.loadSupabase!=='function')return;
    var t=(window.admin&&admin.threads||[]).find(function(x){return String(x.id)===String(id)});
    if(!t)return;
    admin.thread=t;
    openComposer(true);
    var box=document.getElementById('supportMessages');
    if(box)box.innerHTML='<div class="empty-chat"><span>⏳</span><small>Đang tải tin nhắn...</small></div>';
    try{
      await loadSupabase();
      var r=await db.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});
      if(r.error)throw r.error;
      admin.messages=r.data||[];
      render(t,admin.messages);
      await db.from('support_threads').update({unread_admin:0}).eq('id',id);
      if(typeof window.renderThreads==='function')window.renderThreads();
    }catch(e){
      if(box)box.innerHTML='<div class="danger-text">Không mở được cuộc trò chuyện: '+escText(e&&e.message||e)+'</div>';
      openComposer(true);
      console.error('STUDY support bridge:',e);
    }
  }
  function bind(){
    var host=document.getElementById('supportThreads');
    if(!host||host.dataset.supportBridgeBound)return;
    host.dataset.supportBridgeBound='1';
    host.addEventListener('click',function(e){
      var b=e.target.closest('[data-id]');
      if(!b||!host.contains(b))return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openThread(b.getAttribute('data-id'));
    },true);
  }
  function boot(){bind();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setInterval(bind,1000);
})();
