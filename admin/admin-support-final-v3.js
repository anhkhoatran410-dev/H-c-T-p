(function(){
'use strict';
if(window.__studyAdminSupportV5)return;
window.__studyAdminSupportV5=true;
var selectedId=null;
var sending=false;

function getAdmin(){return typeof admin!=='undefined'?admin:null}
function css(){
  if(document.getElementById('adminSupportV5Css'))return;
  var s=document.createElement('style');
  s.id='adminSupportV5Css';
  s.textContent=`
/* Admin > Hỗ trợ: keep the whole messenger, including composer, inside the viewport. */
#support .messenger{
  height:min(690px,calc(100vh - 340px))!important;
  min-height:420px!important;
  max-height:calc(100vh - 340px)!important;
  overflow:hidden!important;
}
#support .conversation{position:relative!important;display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important;overflow:hidden!important}
#support #supportMessages{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;padding-bottom:86px!important}
#support #replyForm.admin-v5{position:absolute!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:auto!important;min-height:68px!important;display:flex!important;visibility:visible!important;opacity:1!important;z-index:2147483000!important;align-items:flex-end!important;gap:8px!important;padding:10px 12px!important;background:var(--panel,#fff)!important;border-top:1px solid var(--line,#e5eaf2)!important;box-sizing:border-box!important}
#support #replyForm.admin-v5.hidden{display:flex!important}
#support #replyForm.admin-v5 textarea#replyInput{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;width:auto!important;min-width:0!important;height:44px!important;min-height:44px!important;max-height:140px!important;resize:vertical!important;box-sizing:border-box!important}
#support #replyForm.admin-v5 .send-btn{display:inline-flex!important;visibility:visible!important;opacity:1!important;width:44px!important;height:44px!important;min-width:44px!important;flex:0 0 44px!important;align-items:center!important;justify-content:center!important}
#support #replyForm.admin-v5 .composer-tool{display:inline-flex!important;visibility:visible!important;opacity:1!important}
@media(max-width:900px){#support .messenger{height:calc(100vh - 285px)!important;max-height:calc(100vh - 285px)!important;min-height:390px!important}}
@media(max-width:650px){#support .messenger{height:calc(100vh - 245px)!important;max-height:calc(100vh - 245px)!important;min-height:360px!important}#support #replyForm.admin-v5 .composer-tool{display:none!important}}
`;
  document.head.appendChild(s);
}

function ensure(){
  css();
  var support=document.getElementById('support');
  var conv=support&&support.querySelector('.conversation');
  if(!conv)return null;

  var forms=conv.querySelectorAll('#replyForm');
  var form=forms[0]||null;
  for(var n=1;n<forms.length;n++)forms[n].remove();
  if(!form){
    form=document.createElement('form');
    form.id='replyForm';
    form.className='composer admin-v5';
    form.autocomplete='off';
    form.innerHTML='<button type="button" class="icon-btn composer-tool" aria-label="Thêm">＋</button><button type="button" class="icon-btn composer-tool" aria-label="Emoji">😊</button><button type="button" class="icon-btn composer-tool" aria-label="Sticker">✨</button><textarea id="replyInput" rows="1" placeholder="Nhập tin nhắn cho người học..."></textarea><button class="send-btn" type="submit" aria-label="Gửi">➤</button>';
    conv.appendChild(form);
  }
  form.classList.add('admin-v5');
  form.classList.remove('hidden');
  form.removeAttribute('hidden');
  form.style.setProperty('display','flex','important');
  form.style.setProperty('visibility','visible','important');
  form.style.setProperty('opacity','1','important');
  form.style.setProperty('position','absolute','important');
  form.style.setProperty('left','0','important');
  form.style.setProperty('right','0','important');
  form.style.setProperty('bottom','0','important');
  var a=getAdmin();
  var ready=!!(selectedId||(a&&a.thread&&a.thread.id));
  var input=form.querySelector('#replyInput');
  var btn=form.querySelector('.send-btn');
  if(input){
    input.disabled=!ready;
    input.placeholder=ready?'Nhập tin nhắn cho người học...':'Chọn một cuộc trò chuyện bên trái...';
    input.style.setProperty('display','block','important');
    input.style.setProperty('visibility','visible','important');
    input.style.setProperty('opacity','1','important');
  }
  if(btn){
    btn.disabled=!ready||sending;
    btn.style.setProperty('display','inline-flex','important');
    btn.style.setProperty('visibility','visible','important');
    btn.style.setProperty('opacity','1','important');
  }
  return form;
}

async function open(id){
  selectedId=String(id);
  var original=window.__studyAdminOriginalOpenThread;
  try{
    if(original)await original(id);
    else if(typeof window.openThread==='function'&&!window.openThread.__studyAdminV5Wrapped)await window.openThread(id);
  }catch(e){console.error('[ADMIN SUPPORT V5] open',e)}
  ensure();
}

async function send(){
  if(sending)return;
  var a=getAdmin();
  var id=selectedId||(a&&a.thread&&a.thread.id);
  var input=document.getElementById('replyInput');
  var text=input&&input.value.trim();
  if(!id||!text)return;
  sending=true;ensure();
  try{
    await loadSupabase();
    var thread=a&&a.threads?a.threads.find(function(t){return String(t.id)===String(id)}):null;
    var row={thread_id:id,account_id:thread?.account_id||a?.thread?.account_id||null,sender:'admin',sender_name:'Admin',message:text};
    var r=await db.from('support_messages').insert(row).select('*').single();
    if(r.error)throw r.error;
    if(input)input.value='';
    if(a&&String(a.thread?.id)===String(id)&&r.data){a.messages=Array.isArray(a.messages)?a.messages:[];a.messages.push(r.data);if(typeof renderChat==='function')renderChat()}
    ensure();
    if(typeof loadSupportThreads==='function')await loadSupportThreads();
    if(typeof toast==='function')toast('Đã gửi tin nhắn cho người học');
  }catch(e){
    console.error('[ADMIN SUPPORT V5] send',e);
    if(typeof toast==='function')toast('Không gửi được: '+(e&&e.message||e));
  }finally{sending=false;ensure()}
}

function bind(){
  var f=ensure();
  if(!f)return;
  if(!f.__adminV5Bound){
    f.__adminV5Bound=true;
    f.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();send()},true);
    var i=f.querySelector('#replyInput');
    if(i)i.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();send()}},true);
  }
}

function wrapOpen(){
  var fn=window.openThread;
  if(typeof fn!=='function'||fn.__studyAdminV5Wrapped)return;
  if(!window.__studyAdminOriginalOpenThread)window.__studyAdminOriginalOpenThread=fn;
  var wrapped=async function(id){selectedId=String(id);var r=await fn.call(this,id);setTimeout(bind,0);return r};
  wrapped.__studyAdminV5Wrapped=true;
  window.openThread=wrapped;
}

function boot(){
  css();
  wrapOpen();
  bind();
  document.addEventListener('click',function(e){
    var t=e.target.closest&&e.target.closest('#support .thread');
    if(t){selectedId=t.getAttribute('data-id')||selectedId;setTimeout(function(){bind();},50)}
    if(e.target.closest&&e.target.closest('[data-tab="support"]'))setTimeout(function(){bind();wrapOpen()},100);
  },true);
  setInterval(function(){
    var a=getAdmin();
    if(a&&a.tab==='support'){wrapOpen();bind()}
  },500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
window.addEventListener('load',function(){setTimeout(boot,0)});
})();
