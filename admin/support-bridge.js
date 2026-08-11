/* STUDY TH Admin Support — V5 authoritative messenger + composer. */
(function(){
  'use strict';
  if(window.__studySupportBridgeV5)return;
  window.__studySupportBridgeV5=true;

  var URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
  var KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
  var db=null,loading=null,activeId=null,activeThread=null;
  function el(id){return document.getElementById(id)}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
  function getDb(){
    if(db)return Promise.resolve(db); if(loading)return loading;
    loading=new Promise(function(resolve,reject){
      function make(){try{db=window.supabase.createClient(URL,KEY);resolve(db)}catch(e){reject(e)}}
      if(window.supabase&&window.supabase.createClient)make();
      else{var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=make;s.onerror=function(){reject(new Error('Không tải được Supabase JS'))};document.head.appendChild(s)}
    }); return loading;
  }
  function forceLayout(){
    var support=el('support'),messenger=support&&support.querySelector('.messenger'),conv=support&&support.querySelector('.conversation');
    if(!support||!messenger||!conv)return;
    support.style.setProperty('display','block','important');
    messenger.style.setProperty('display','grid','important');messenger.style.setProperty('grid-template-columns','330px minmax(0,1fr)','important');messenger.style.setProperty('height','min(680px,calc(100dvh - 190px))','important');messenger.style.setProperty('min-height','420px','important');messenger.style.setProperty('overflow','hidden','important');
    conv.style.setProperty('display','grid','important');conv.style.setProperty('grid-template-rows','auto minmax(180px,1fr) auto','important');conv.style.setProperty('min-width','0','important');conv.style.setProperty('min-height','0','important');conv.style.setProperty('overflow','hidden','important');
    var box=el('supportMessages');if(box){box.style.setProperty('display','block','important');box.style.setProperty('min-height','180px','important');box.style.setProperty('overflow-y','auto','important')}
    var form=el('replyForm');if(form){form.classList.remove('hidden');form.style.setProperty('display','flex','important');form.style.setProperty('visibility','visible','important');form.style.setProperty('opacity','1','important');form.style.setProperty('min-height','64px','important');form.style.setProperty('position','relative','important');form.style.setProperty('z-index','20','important')}
    var input=el('replyInput');if(input){input.style.setProperty('display','block','important');input.style.setProperty('visibility','visible','important');input.style.setProperty('opacity','1','important');input.style.setProperty('min-height','42px','important')}
  }
  function showComposer(){var f=el('replyForm');if(f){f.classList.remove('hidden');f.style.setProperty('display','flex','important');f.style.setProperty('visibility','visible','important');f.style.setProperty('opacity','1','important')}forceLayout()}
  function showError(title,msg){var h=el('chatHeader'),b=el('supportMessages');if(h)h.innerHTML='<div class="empty-chat"><span>⚠️</span><b>'+esc(title)+'</b><small>'+esc(msg)+'</small></div>';if(b)b.innerHTML='<div class="danger-text" style="padding:20px">'+esc(msg)+'</div>';showComposer()}
  async function loadList(){
    var host=el('supportThreads');if(!host)return;
    try{var c=await getDb();var r=await c.from('support_threads').select('*,support_accounts(name,avatar)').order('updated_at',{ascending:false});if(r.error)throw r.error;var rows=r.data||[];
      host.innerHTML=rows.length?rows.map(function(t){return '<button type="button" class="thread" data-support-v5="'+esc(t.id)+'"><span class="avatar">'+esc(t.support_accounts&&t.support_accounts.avatar||'💬')+'</span><span class="thread-main"><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(t.last_message||'Chưa có tin nhắn')+'</small></span><span class="thread-time">'+esc(t.updated_at?new Date(t.updated_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'')+'</span></button>'}).join(''):'<div class="empty-chat"><span>💬</span><b>Chưa có cuộc trò chuyện</b><small>Người học gửi tin nhắn sẽ xuất hiện ở đây.</small></div>';
      forceLayout();
    }catch(e){host.innerHTML='<div class="danger-text" style="padding:16px">Không đọc được danh sách hỗ trợ: '+esc(e.message||e)+'</div>';forceLayout()}
  }
  function render(t,rows){
    var h=el('chatHeader'),b=el('supportMessages');if(!h||!b)return;activeThread=t;var a=t&&t.support_accounts||{};
    h.innerHTML='<div class="chat-person"><span class="avatar">'+esc(a.avatar||'💬')+'</span><div><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(a.name||'Hỗ trợ chung')+'</small></div></div>';
    b.innerHTML=(rows||[]).map(function(m){var s=String(m.sender||m.sender_role||'user').toLowerCase();var n=m.sender_name||(s==='admin'?'Admin':s==='bot'?'Bot':'Người dùng');var text=m.message!=null?m.message:(m.content!=null?m.content:(m.text!=null?m.text:''));var media=m.attachment_url?'<div><a href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener">📎 '+esc(m.attachment_name||'Tệp đính kèm')+'</a></div>':'';return '<div class="bubble-row '+esc(s)+'"><div class="bubble '+esc(s)+'"><b>'+esc(n)+'</b><div>'+esc(text).replace(/\n/g,'<br>')+'</div>'+media+'<small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>'}).join('')||'<div class="empty-chat"><span>💬</span><b>Chưa có tin nhắn</b><small>Cuộc trò chuyện này chưa có tin nhắn.</small></div>';
    showComposer();requestAnimationFrame(function(){b.scrollTop=b.scrollHeight});
  }
  async function open(id){
    id=String(id||'').trim();if(!id)return;activeId=id;activeThread=null;var b=el('supportMessages');if(b)b.innerHTML='<div class="empty-chat"><span>⏳</span><b>Đang tải tin nhắn...</b><small>Đang kết nối dữ liệu.</small></div>';showComposer();
    try{var c=await getDb();var t=await c.from('support_threads').select('*,support_accounts(name,avatar)').eq('id',id).maybeSingle();if(t.error)throw t.error;if(!t.data)throw new Error('Không tìm thấy cuộc trò chuyện '+id);var m=await c.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});if(m.error)throw m.error;render(t.data,m.data||[]);await c.from('support_threads').update({unread_admin:0}).eq('id',id);loadList();}
    catch(e){console.error('[STUDY support V5]',e);showError('Không mở được cuộc trò chuyện',e.message||String(e))}
  }
  async function sendText(){
    var input=el('replyInput');var text=(input&&input.value||'').trim();if(!text)return;if(!activeId){showError('Chưa chọn người dùng','Hãy chọn một cuộc trò chuyện ở bên trái trước.');return}
    var btn=el('replyForm')&&el('replyForm').querySelector('.send-btn');if(btn){btn.disabled=true;btn.textContent='…'}
    try{
      var c=await getDb();
      var row={thread_id:activeId,account_id:activeThread&&activeThread.account_id||null,sender:'admin',sender_name:'Admin',message:text};
      var r=await c.from('support_messages').insert(row).select('*').single();if(r.error)throw r.error;
      if(input)input.value='';
      var box=el('supportMessages');if(box){var empty=box.querySelector('.empty-chat');if(empty)empty.remove();var m=r.data;var div=document.createElement('div');div.className='bubble-row admin';div.innerHTML='<div class="bubble admin"><b>Admin</b><div>'+esc(m.message).replace(/\n/g,'<br>')+'</div><small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'Vừa gửi')+'</small></div>';box.appendChild(div);box.scrollTop=box.scrollHeight}
      await c.from('support_threads').update({last_message:text,updated_at:new Date().toISOString(),unread_admin:0}).eq('id',activeId);
      loadList();
    }catch(e){console.error('[STUDY support V5 send]',e);showError('Không gửi được tin nhắn',e.message||String(e))}
    finally{if(btn){btn.disabled=false;btn.textContent='➤'}showComposer()}
  }
  function bindComposer(){
    var f=el('replyForm'),input=el('replyInput');if(!f||!input)return;
    if(f.dataset.supportV5Bound)return;f.dataset.supportV5Bound='1';
    f.addEventListener('submit',function(e){e.preventDefault();e.stopPropagation();sendText()});
    input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText()}});
  }
  window.__studyOpenSupportThreadV5=open;window.__studySendSupportTextV5=sendText;
  function bind(){
    var host=el('supportThreads');if(host&&!host.dataset.supportV5){host.dataset.supportV5='1';host.addEventListener('click',function(e){var node=e.target.closest('[data-support-v5],.thread');if(!node||!host.contains(node))return;var id=node.getAttribute('data-support-v5')||node.getAttribute('data-id');if(!id)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();open(id)},true)}
    bindComposer();forceLayout();
  }
  function hookTabs(){if(typeof window.openTab==='function'&&!window.openTab.__studyV5){var old=window.openTab;var wrapped=function(id){var r=old.apply(this,arguments);if(String(id)==='support')setTimeout(function(){forceLayout();bind();loadList()},30);return r};wrapped.__studyV5=true;window.openTab=wrapped}}
  function boot(){hookTabs();bind();if(el('support')&&el('support').classList.contains('active')){forceLayout();loadList()}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setInterval(function(){hookTabs();bind();if(el('support')&&el('support').classList.contains('active'))forceLayout()},1000);
})();