/* STUDY TH Admin Support bridge — authoritative, standalone thread click/render path. */
(function(){
  'use strict';
  if(window.__studySupportBridgeV2)return;
  window.__studySupportBridgeV2=true;
  var SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
  var SUPABASE_KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
  var client=null, loading=null;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
  function getClient(){
    if(client)return Promise.resolve(client);
    if(window.supabase){client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return Promise.resolve(client)}
    if(loading)return loading;
    loading=new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=function(){try{client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);resolve(client)}catch(e){reject(e)}};s.onerror=function(){reject(new Error('Không tải được Supabase JS'))};document.head.appendChild(s)});
    return loading;
  }
  function composer(){var f=document.getElementById('replyForm');if(!f)return;f.classList.remove('hidden');f.style.setProperty('display','flex','important');f.style.setProperty('visibility','visible','important');f.style.setProperty('opacity','1','important')}
  function render(t,rows){
    var head=document.getElementById('chatHeader'),box=document.getElementById('supportMessages');if(!head||!box)return;
    var a=t.support_accounts||{};
    head.innerHTML='<div class="chat-person"><span class="avatar">'+esc(a.avatar||'💬')+'</span><div><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(a.name||'Hỗ trợ chung')+' · '+esc(String(t.device_id||'').slice(0,12))+'</small></div></div>';
    box.innerHTML=(rows||[]).map(function(m){var s=m.sender||m.sender_role||'user',n=m.sender_name||(s==='admin'?'Admin':s==='bot'?'Bot':'Người dùng'),x=m.message!=null?m.message:(m.content!=null?m.content:(m.text!=null?m.text:'')),media=m.attachment_url?'<div><a href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener">📎 '+esc(m.attachment_name||'Tệp đính kèm')+'</a></div>':'',st=m.sticker?'<div style="font-size:32px">'+esc(m.sticker)+'</div>':'';return '<div class="bubble-row '+esc(s)+'"><div class="bubble '+esc(s)+'"><b>'+esc(n)+'</b><div>'+esc(x)+'</div>'+media+st+'<small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>'}).join('')||'<div class="empty-chat"><span>💬</span><small>Chưa có tin nhắn.</small></div>';
    box.scrollTop=box.scrollHeight;composer();
  }
  async function openThread(id){
    if(!id)return;var box=document.getElementById('supportMessages'),head=document.getElementById('chatHeader');
    if(box)box.innerHTML='<div class="empty-chat"><span>⏳</span><b>Đang tải...</b><small>Đang mở cuộc trò chuyện.</small></div>';composer();
    try{var c=await getClient();var tr=await c.from('support_threads').select('*,support_accounts(name,avatar)').eq('id',id).maybeSingle();if(tr.error)throw tr.error;if(!tr.data)throw new Error('Không tìm thấy cuộc trò chuyện này.');var mr=await c.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});if(mr.error)throw mr.error;render(tr.data,mr.data||[]);await c.from('support_threads').update({unread_admin:0}).eq('id',id);if(typeof window.renderThreads==='function')window.renderThreads();}
    catch(e){if(head)head.innerHTML='<div class="empty-chat"><span>⚠️</span><b>Không mở được cuộc trò chuyện</b></div>';if(box)box.innerHTML='<div class="danger-text">'+esc(e&&e.message||e)+'</div>';console.error('STUDY support bridge v2:',e)}
  }
  function bind(){var host=document.getElementById('supportThreads');if(!host||host.dataset.supportBridgeBoundV2)return;host.dataset.supportBridgeBoundV2='1';host.addEventListener('click',function(e){var b=e.target.closest('button[data-id], [data-id]');if(!b||!host.contains(b))return;var id=b.getAttribute('data-id');if(!id)return;e.preventDefault();e.stopImmediatePropagation();openThread(id)},true)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
  setInterval(bind,1000);
})();
