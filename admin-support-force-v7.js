/* STUDY Admin — final support composer guard. */
(function(){
'use strict';
if(window.__studyAdminSupportV9)return;window.__studyAdminSupportV9=true;
var state=window.studyAdminSupport||{thread:null,sending:false};window.studyAdminSupport=state;
function el(id){return document.getElementById(id)}
function isOpen(){var x=el('support');return !!x&&x.classList.contains('active')}
async function dbReady(){if(typeof window.loadSupabase==='function'){var d=await window.loadSupabase();if(d)return d}if(window.db)return window.db;throw new Error('Supabase chưa sẵn sàng.')}
async function send(){
 var input=el('replyInput'),text=input&&input.value.trim(),thread=state.thread;
 if(!thread||!text||state.sending)return false;
 state.sending=true;if(input)input.disabled=true;
 document.querySelectorAll('#replyForm .send-btn,#replyForm button[type="submit"]').forEach(function(b){b.disabled=true});
 try{
  var d=await dbReady();
  var r=await d.from('support_messages').insert({thread_id:thread.id,account_id:thread.account_id||null,sender:'admin',sender_name:'Admin',message:text}).select('*').single();
  if(r.error)throw r.error;
  if(input)input.value='';
  if(typeof window.openAdminSupportThread==='function')await window.openAdminSupportThread(thread.id);
  if(typeof window.loadSupportThreads==='function')await window.loadSupportThreads();
  return true;
 }catch(e){
  if(input)input.value=text;
  console.error('STUDY Admin support send:',e);
  if(typeof window.toast==='function')window.toast('Không gửi được: '+(e.message||e));else alert('Không gửi được: '+(e.message||e));
  return false;
 }finally{state.sending=false;if(input)input.disabled=!thread;document.querySelectorAll('#replyForm .send-btn,#replyForm button[type="submit"]').forEach(function(b){b.disabled=false})}
}
window.sendAdminSupportMessage=send;
function bind(){
 if(!isOpen())return;
 var form=el('replyForm'),input=el('replyInput');if(!form||!input)return;
 form.classList.remove('hidden');form.style.setProperty('display','flex','important');
 if(!form.dataset.v9submit){form.dataset.v9submit='1';form.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();send()},true)}
 if(!input.dataset.v9enter){input.dataset.v9enter='1';input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();send()}},true)}
 if(!form.dataset.v9click){form.dataset.v9click='1';form.addEventListener('click',function(e){var b=e.target.closest('.send-btn,button[type="submit"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();send()},true)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
window.addEventListener('study-app-loaded',function(){setTimeout(bind,100)});
setInterval(bind,500);
})();
