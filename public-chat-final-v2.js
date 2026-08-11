/* STUDY TH — public support final: stable composer, resilient send, realtime without UI jitter. */
(function(){
'use strict';
if(window.__studyPublicChatFinalV4)return;window.__studyPublicChatFinalV4=true;
function st(){return window.state||window.studyState||null}
function device(){try{var k='study_device_id_v2',id=localStorage.getItem(k);if(!id){id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'dev_'+Date.now()+'_'+Math.random().toString(36).slice(2);localStorage.setItem(k,id)}return id}catch(e){return 'dev_fallback'}}
function closePickers(){document.querySelectorAll('.support-picker,.support-media-menu').forEach(function(x){x.classList.add('hidden')})}
async function dbReady(){if(typeof window.loadSupabase!=='function')throw new Error('Kết nối Supabase chưa sẵn sàng.');await window.loadSupabase();if(!window.db)throw new Error('Supabase chưa sẵn sàng.');return window.db}
async function account(d,s){
 if(s&&s.supportAccountId)return s.supportAccountId;
 try{var q=await d.from('support_accounts').select('id').eq('handle','support').eq('is_active',true).limit(1).maybeSingle();if(!q.error&&q.data?.id){s.supportAccountId=q.data.id;return q.data.id}}
 catch(_){ }
 return null;
}
async function ensureThreadFinal(){
 var s=st();if(!s)throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');
 var d=await dbReady(),id=device(),name=s.candidate||localStorage.getItem('study_candidate')||'Người dùng';
 if(s.thread&&s.thread.id){
   var check=await d.from('support_threads').select('id,device_id,account_id').eq('id',s.thread.id).maybeSingle();
   if(!check.error&&check.data){s.thread=Object.assign(s.thread,check.data);return s.thread}
   s.thread=null;
 }
 var found=await d.from('support_threads').select('*').eq('device_id',id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
 if(found.error)throw found.error;
 var data=found.data;
 if(!data){
   var aid=await account(d,s);
   var payload={device_id:id,student_name:name};if(aid)payload.account_id=aid;
   var created=await d.from('support_threads').insert(payload).select('*').single();
   if(created.error){
     var msg=String(created.error.message||created.error.details||created.error||'');
     if(!/duplicate|unique/i.test(msg))throw created.error;
     var retry=await d.from('support_threads').select('*').eq('device_id',id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
     if(retry.error||!retry.data)throw retry.error||created.error;data=retry.data;
   }else data=created.data;
 }
 s.thread=data;s.messages=Array.isArray(s.messages)?s.messages:[];window.state=s;window.studyState=s;return data;
}
window.ensureThread=ensureThreadFinal;
function sameMessages(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;for(var i=0;i<a.length;i++){if(String(a[i].id||'')!==String(b[i].id||'')||a[i].message!==b[i].message||a[i].sender!==b[i].sender)return false}return true}
async function refreshChat(force){
 var s=st();if(!s||s.page!=='support')return;
 try{var t=await ensureThreadFinal(),d=await dbReady(),r=await d.from('support_messages').select('*').eq('thread_id',t.id).order('created_at',{ascending:true});if(r.error)throw r.error;var next=r.data||[];if(!force&&sameMessages(s.messages,next))return;s.messages=next;window.state=s;window.studyState=s;if(typeof window.render==='function')await window.render();setTimeout(function(){var box=document.querySelector('.support-message-list');if(box)box.scrollTop=box.scrollHeight},30)}catch(e){console.warn('STUDY support refresh:',e)}
}
var sending=false;
async function send(payload){
 var s=st();if(!s)throw new Error('Ứng dụng chưa sẵn sàng.');if(sending)return;
 sending=true;window.__studyChatSending=true;closePickers();
 try{
  var d=await dbReady(),t=await ensureThreadFinal();
  var row={thread_id:t.id,account_id:t.account_id||s.supportAccountId||null,sender:'user',message:String(payload&&payload.message||''),attachment_url:payload&&payload.attachment_url||null,attachment_type:payload&&payload.attachment_type||null,attachment_name:payload&&payload.attachment_name||null,sticker:payload&&payload.sticker||null,bot_handled:false};
  if(!row.message&&!row.attachment_url&&!row.sticker)throw new Error('Tin nhắn đang trống.');
  var r=await d.from('support_messages').insert(row).select('*').single();
  if(r.error)throw r.error;
  var inserted=r.data||row;s.messages=Array.isArray(s.messages)?s.messages:[];
  if(inserted.id&&!s.messages.some(function(m){return String(m.id)===String(inserted.id)}))s.messages.push(inserted);
  window.state=s;window.studyState=s;if(typeof window.render==='function')await window.render();
  setTimeout(function(){var box=document.querySelector('.support-message-list');if(box)box.scrollTop=box.scrollHeight},30);
  return inserted;
 }finally{sending=false;window.__studyChatSending=false}
}
window.sendSupportMessage=send;
window.sendSupport=async function(){var input=document.getElementById('supportInput'),text=input&&input.value.trim();if(!text||sending)return;try{await send({message:text});if(input)input.value=''}catch(e){if(input)input.value=text;console.error(e);alert('Không gửi được tin nhắn: '+(e?.message||e))}};
window.sendSticker=async function(x){try{await send({sticker:String(x||''),message:'✨ Sticker'})}catch(e){alert('Không gửi được sticker: '+(e?.message||e))}};
window.insertSupportEmoji=function(x){var i=document.getElementById('supportInput');if(!i)return;i.value+=(i.value?' ':'')+String(x||'');closePickers();i.focus()};
window.toggleSupportPicker=function(id){var x=document.getElementById(id);if(!x)return;document.querySelectorAll('.support-picker').forEach(function(p){if(p!==x)p.classList.add('hidden')});x.classList.toggle('hidden')};
var liveChannel=null,liveTimer=null,starting=false;
async function startLive(){
 var s=st();if(!s||s.page!=='support'||starting)return;if(liveChannel)return;starting=true;
 try{var d=await dbReady(),t=await ensureThreadFinal();liveChannel=d.channel('study-public-support-stable-v4').on('postgres_changes',{event:'INSERT',schema:'public',table:'support_messages',filter:'thread_id=eq.'+t.id},function(){refreshChat(false)}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'support_threads',filter:'id=eq.'+t.id},function(){refreshChat(false)}).subscribe(function(x){console.log('STUDY support realtime:',x)});clearInterval(liveTimer);liveTimer=setInterval(function(){refreshChat(false)},10000);await refreshChat(true)}catch(e){console.warn('STUDY support realtime:',e);liveChannel=null}finally{starting=false}
}
window.startSupportLive=startLive;
window.selectSupportAccount=async function(id){var s=st();if(!s)return;s.supportAccountId=id;s.thread=null;s.messages=[];window.state=s;window.studyState=s;if(liveChannel){try{var d=await dbReady();await d.removeChannel(liveChannel)}catch(_){}liveChannel=null}await startLive();if(typeof window.render==='function')await window.render()};
function css(){if(document.getElementById('study-public-chat-v4-style'))return;var x=document.createElement('style');x.id='study-public-chat-v4-style';x.textContent='.support-shell{min-width:0}.support-message-list{min-width:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}.support-bubble{max-width:min(82%,760px);overflow-wrap:anywhere;word-break:break-word}.support-composer{position:sticky;bottom:0;z-index:30;display:flex;align-items:flex-end;gap:8px;max-width:100%;box-sizing:border-box;padding-bottom:calc(8px + env(safe-area-inset-bottom))}#supportInput{min-width:0;width:100%;box-sizing:border-box;font-size:16px}.support-picker{max-width:min(92vw,360px);max-height:45vh;overflow:auto;z-index:1000}@media(max-width:650px){.support-shell{width:100%;max-width:100%;overflow:hidden}.support-composer{width:100%;gap:6px;padding:8px 8px calc(8px + env(safe-area-inset-bottom))}#supportInput{min-height:48px;max-height:120px}.support-picker{position:fixed!important;left:8px!important;right:8px!important;bottom:calc(72px + env(safe-area-inset-bottom))!important;width:auto!important;max-height:42vh!important}}';document.head.appendChild(x)}
function bind(){css();var f=document.getElementById('supportForm')||document.querySelector('.support-composer form');if(f&&!f.dataset.v4){f.dataset.v4='1';f.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();window.sendSupport()},true)}if(!document.body.dataset.v4){document.body.dataset.v4='1';document.addEventListener('keydown',function(e){if(e.key==='Escape')closePickers();if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target?.id==='supportInput'){e.preventDefault();e.stopImmediatePropagation();window.sendSupport()}},true);document.addEventListener('click',function(e){if(!e.target.closest('.support-picker')&&!e.target.closest('.composer-icon'))closePickers()},true)}}
function boot(){bind();if(st()?.page==='support')setTimeout(startLive,100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();window.addEventListener('study-app-loaded',function(){setTimeout(boot,100)});setInterval(function(){bind();if(st()?.page==='support'&&!liveChannel&&!starting)startLive()},3000);
})();
