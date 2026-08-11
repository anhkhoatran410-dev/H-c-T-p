/* STUDY TH — support messenger FINAL owner. Composer is an absolute bottom layer. */
(function(){
'use strict';
if(window.__studyAdminSupportFINAL2)return;
window.__studyAdminSupportFINAL2=true;

var SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
var SUPABASE_KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
var client=null;
var state={threadId:null,threads:[],busy:false};
var q=function(s,r){return (r||document).querySelector(s)};
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})};

async function db(){
  if(client)return client;
  if(window.supabase&&window.supabase.createClient){client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return client}
  await new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=resolve;s.onerror=function(){reject(new Error('Không tải được Supabase'))};document.head.appendChild(s)});
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return client;
}

function style(){
 if(q('#study-support-force-style'))return;
 var s=document.createElement('style');s.id='study-support-force-style';
 s.textContent=''
 +'#support.active .messenger{display:grid!important;grid-template-columns:330px minmax(0,1fr)!important;height:min(690px,calc(100dvh - 205px))!important;min-height:420px!important;overflow:hidden!important}'
 +'#support.active .conversation{display:flex!important;flex-direction:column!important;position:relative!important;height:100%!important;min-height:0!important;min-width:0!important;overflow:hidden!important}'
 +'#support.active #chatHeader{display:block!important;flex:0 0 auto!important;min-height:64px!important}'
 +'#support.active #supportMessages{display:block!important;flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding-bottom:86px!important;box-sizing:border-box!important}'
 +'#support.active #replyForm{display:flex!important;visibility:visible!important;opacity:1!important;position:absolute!important;left:0!important;right:0!important;bottom:0!important;z-index:2147483000!important;width:100%!important;height:auto!important;min-height:70px!important;box-sizing:border-box!important;align-items:flex-end!important;gap:8px!important;padding:10px!important;margin:0!important;background:var(--panel,#fff)!important;border-top:1px solid var(--line,#ddd)!important}'
 +'#support.active #replyForm.hidden{display:flex!important}'
 +'#support.active #replyInput{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;height:44px!important;min-height:44px!important;max-height:140px!important;box-sizing:border-box!important;resize:none!important}'
 +'#support.active #replyForm .send-btn{display:grid!important;visibility:visible!important;opacity:1!important;place-items:center!important;flex:0 0 44px!important;width:44px!important;height:44px!important}'
 +'#support.active #replyForm .composer-tool{display:grid!important;visibility:visible!important;opacity:1!important;flex:0 0 38px!important;width:38px!important;height:38px!important}'
 +'@media(max-width:650px){#support.active .messenger{grid-template-columns:1fr!important;height:calc(100dvh - 245px)!important;min-height:380px!important}#support.active .conversation-list{display:block!important;height:112px!important;max-height:112px!important}#support.active #replyForm .composer-tool{display:none!important}}';
 document.head.appendChild(s);
}

function ensureComposer(){
 style();
 var c=q('#support .conversation');if(!c)return null;
 var f=q('#replyForm',c);
 if(!f){
   f=document.createElement('form');f.id='replyForm';f.className='composer';f.autocomplete='off';
   f.innerHTML='<textarea id="replyInput" rows="1" placeholder="Nhập tin nhắn..."></textarea><button type="submit" class="send-btn">➤</button>';
   c.appendChild(f);
 }
 f.classList.remove('hidden');f.removeAttribute('hidden');f.style.display='flex';f.style.visibility='visible';f.style.opacity='1';
 var input=q('#replyInput',f);
 if(!input){input=document.createElement('textarea');input.id='replyInput';input.rows=1;input.placeholder='Nhập tin nhắn...';f.insertBefore(input,f.querySelector('.send-btn'))}
 if(!f.dataset.final2){
   f.dataset.final2='1';
   f.addEventListener('submit',function(e){e.preventDefault();e.stopPropagation();send()},true);
   input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}},true);
 }
 return f;
}

function renderMessages(rows){
 var box=q('#supportMessages');if(!box)return;
 box.innerHTML=(rows||[]).map(function(m){
   var mine=String(m.sender||m.sender_role||'')==='admin';
   var text=m.message!=null?m.message:(m.content!=null?m.content:(m.text||''));
   return '<div class="bubble-row '+(mine?'admin':'user')+'"><div class="bubble '+(mine?'admin':'user')+'"><b>'+esc(m.sender_name||(mine?'Bạn':m.sender==='bot'?'Bot':'Người dùng'))+'</b><div>'+esc(text).replace(/\n/g,'<br>')+'</div><small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>';
 }).join('')||'<div class="empty-chat"><span>💬</span><b>Chưa có tin nhắn</b><small>Hãy gửi lời nhắn cho người học.</small></div>';
 ensureComposer();
 box.scrollTop=box.scrollHeight;
}

async function loadThreads(){
 try{
  var d=await db();var r=await d.from('support_threads').select('*,support_accounts(name,avatar)').order('updated_at',{ascending:false});
  if(r.error)throw r.error;state.threads=r.data||[];
  var box=q('#supportThreads');if(!box)return;
  var search=(q('#threadSearch')?.value||'').toLowerCase();
  var rows=state.threads.filter(function(t){return !search||String(t.student_name||'').toLowerCase().includes(search)||String(t.device_id||'').toLowerCase().includes(search)});
  box.innerHTML=rows.map(function(t){return '<button type="button" class="thread '+(String(t.id)===String(state.threadId)?'active':'')+'" data-force-thread="'+esc(t.id)+'"><span class="avatar">'+esc(t.support_accounts?.avatar||'💬')+'</span><span class="thread-main"><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(t.last_message||'Chưa có tin nhắn')+'</small></span></button>'}).join('')||'<div class="empty-chat"><span>💬</span><small>Chưa có cuộc trò chuyện.</small></div>';
  Array.prototype.forEach.call(box.querySelectorAll('[data-force-thread]'),function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();openThread(b.dataset.forceThread)}});
  ensureComposer();
 }catch(e){console.error('[support-force] loadThreads',e);ensureComposer()}
}

async function openThread(id){
 state.threadId=String(id);ensureComposer();
 var box=q('#supportMessages');if(box)box.innerHTML='<div class="empty-chat"><span>⏳</span><b>Đang tải tin nhắn...</b></div>';
 try{
  var d=await db();var r=await d.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});
  if(r.error)throw r.error;renderMessages(r.data||[]);
  await d.from('support_threads').update({unread_admin:0}).eq('id',id);
  var t=state.threads.find(function(x){return String(x.id)===String(id)});var h=q('#chatHeader');
  if(h&&t)h.innerHTML='<div class="chat-person"><span class="avatar">'+esc(t.support_accounts?.avatar||'💬')+'</span><div><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(t.support_accounts?.name||'Hỗ trợ chung')+'</small></div></div>';
  ensureComposer();var i=q('#replyInput');if(i)i.focus();
 }catch(e){console.error('[support-force] openThread',e);if(box)box.innerHTML='<div class="danger-text">Không tải được tin nhắn: '+esc(e.message||e)+'</div>';ensureComposer()}
}

async function send(){
 if(state.busy||!state.threadId)return;
 var i=q('#replyInput');if(!i){ensureComposer();i=q('#replyInput')}
 var text=(i?.value||'').trim();if(!text)return;
 state.busy=true;i.disabled=true;
 try{
  var d=await db();var r=await d.from('support_messages').insert({thread_id:state.threadId,sender:'admin',message:text,bot_handled:false}).select('*').single();
  if(r.error)throw r.error;i.value='';await openThread(state.threadId);
 }catch(e){console.error('[support-force] send',e);alert('Không gửi được: '+(e.message||e))}
 finally{state.busy=false;ensureComposer();var x=q('#replyInput');if(x){x.disabled=false;x.focus()}}
}

window.__studyOpenSupportThreadFINAL2=openThread;
window.__studySendSupportTextFINAL2=send;

function boot(){
 style();ensureComposer();
 var nav=q('[data-tab="support"]');
 if(nav&&!nav.dataset.force2){nav.dataset.force2='1';nav.addEventListener('click',function(){setTimeout(function(){style();ensureComposer();loadThreads()},120);setTimeout(function(){style();ensureComposer()},700)})}
 var refresh=q('#newSupportRefresh');if(refresh&&!refresh.dataset.force2){refresh.dataset.force2='1';refresh.addEventListener('click',function(){loadThreads();if(state.threadId)openThread(state.threadId)})}
 var search=q('#threadSearch');if(search&&!search.dataset.force2){search.dataset.force2='1';search.addEventListener('input',loadThreads)}
 setInterval(function(){if(q('#support.active')){style();ensureComposer()}},500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();