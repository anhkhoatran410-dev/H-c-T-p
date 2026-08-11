/* STUDY TH Admin Support — hard override for the support thread click path. */
(function(){
  'use strict';
  if(window.__studySupportBridgeV3)return;
  window.__studySupportBridgeV3=true;

  var SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
  var SUPABASE_KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
  var client=null, loading=null, activeId=null;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
  function getClient(){
    if(client)return Promise.resolve(client);
    if(window.supabase){client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return Promise.resolve(client)}
    if(loading)return loading;
    loading=new Promise(function(resolve,reject){
      var s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload=function(){try{client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);resolve(client)}catch(e){reject(e)}};
      s.onerror=function(){reject(new Error('Không tải được Supabase JS'))};
      document.head.appendChild(s);
    });
    return loading;
  }
  function composer(){
    var f=document.getElementById('replyForm');
    if(!f)return;
    f.classList.remove('hidden');
    f.style.setProperty('display','flex','important');
    f.style.setProperty('visibility','visible','important');
    f.style.setProperty('opacity','1','important');
  }
  function loadingView(){
    var box=document.getElementById('supportMessages');
    if(box)box.innerHTML='<div class="empty-chat"><span>⏳</span><b>Đang tải cuộc trò chuyện...</b><small>Đang lấy tin nhắn từ hệ thống.</small></div>';
    composer();
  }
  function render(t,rows){
    var head=document.getElementById('chatHeader'),box=document.getElementById('supportMessages');
    if(!head||!box)return;
    var a=t.support_accounts||{};
    head.innerHTML='<div class="chat-person"><span class="avatar">'+esc(a.avatar||'💬')+'</span><div><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(a.name||'Hỗ trợ chung')+' · '+esc(String(t.device_id||'').slice(0,12))+'</small></div></div>';
    box.innerHTML=(rows||[]).map(function(m){
      var s=String(m.sender||m.sender_role||'user').toLowerCase();
      var n=m.sender_name||(s==='admin'?'Admin':s==='bot'?'Bot':'Người dùng');
      var x=m.message!=null?m.message:(m.content!=null?m.content:(m.text!=null?m.text:''));
      var media=m.attachment_url?'<div><a href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener">📎 '+esc(m.attachment_name||'Tệp đính kèm')+'</a></div>':'';
      var sticker=m.sticker?'<div style="font-size:32px">'+esc(m.sticker)+'</div>':'';
      return '<div class="bubble-row '+esc(s)+'"><div class="bubble '+esc(s)+'"><b>'+esc(n)+'</b><div>'+esc(x)+'</div>'+media+sticker+'<small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>';
    }).join('')||'<div class="empty-chat"><span>💬</span><b>Chưa có tin nhắn</b><small>Cuộc trò chuyện này chưa có tin nhắn.</small></div>';
    box.scrollTop=box.scrollHeight;
    composer();
  }
  async function openThread(id){
    id=String(id||'').trim();
    if(!id)return;
    activeId=id;
    loadingView();
    try{
      var c=await getClient();
      var tr=await c.from('support_threads').select('*,support_accounts(name,avatar)').eq('id',id).maybeSingle();
      if(tr.error)throw tr.error;
      if(!tr.data)throw new Error('Không tìm thấy cuộc trò chuyện: '+id);
      var mr=await c.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});
      if(mr.error)throw mr.error;
      render(tr.data,mr.data||[]);
      await c.from('support_threads').update({unread_admin:0}).eq('id',id);
    }catch(e){
      var head=document.getElementById('chatHeader'),box=document.getElementById('supportMessages');
      if(head)head.innerHTML='<div class="empty-chat"><span>⚠️</span><b>Không mở được cuộc trò chuyện</b><small>Đang hiển thị lỗi thật để không còn màn hình trắng.</small></div>';
      if(box)box.innerHTML='<div class="danger-text" style="padding:20px">'+esc(e&&e.message||e)+'</div>';
      composer();
      console.error('[STUDY support V3]',e);
    }
  }
  window.__studyOpenSupportThread=openThread;

  function overrideGlobal(){
    /* app.js has its own openThread(); replace it after every runtime load. */
    try{window.openThread=openThread}catch(e){}
  }
  function bind(){
    var host=document.getElementById('supportThreads');
    if(!host)return;
    if(!host.dataset.supportBridgeV3){
      host.dataset.supportBridgeV3='1';
      host.addEventListener('click',function(e){
        var el=e.target.closest('.thread,[data-id],[data-support-thread]');
        if(!el||!host.contains(el))return;
        var id=el.getAttribute('data-id')||el.getAttribute('data-support-thread');
        if(!id)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openThread(id);
      },true);
    }
    overrideGlobal();
  }
  function watch(){
    bind();
    var host=document.getElementById('supportThreads');
    if(host&&!host.__studyBridgeObserver){
      host.__studyBridgeObserver=new MutationObserver(function(){overrideGlobal()});
      host.__studyBridgeObserver.observe(host,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch);else watch();
  setInterval(watch,500);
})();
