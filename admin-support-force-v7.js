/* ADMIN SUPPORT V7 — ROOT ASSET
   Root asset avoids /admin/* rewrite rules. It also uses the global lexical
   `admin` and `db` bindings created by admin/app.js (not window.admin/window.db).
*/
(function(){
  'use strict';
  if (window.__ADMIN_SUPPORT_V7__) return;
  window.__ADMIN_SUPPORT_V7__ = true;
  const ROOT_ID='admin-support-v7-composer';
  let selectedId=null;
  const css=`
    #admin-support-v7-composer{display:flex!important;position:absolute!important;left:0!important;right:0!important;bottom:0!important;z-index:2147483000!important;box-sizing:border-box!important;gap:8px!important;align-items:center!important;padding:10px 12px!important;background:#fff!important;border-top:1px solid #e5eaf2!important;min-height:68px!important}
    #admin-support-v7-composer textarea{display:block!important;visibility:visible!important;opacity:1!important;flex:1 1 auto!important;min-width:0!important;width:auto!important;height:44px!important;min-height:44px!important;max-height:120px!important;box-sizing:border-box!important;border:1px solid #d9e0ee!important;border-radius:14px!important;padding:11px 14px!important;font:inherit!important;outline:none!important;background:#f7f9fd!important;resize:none!important}
    #admin-support-v7-composer textarea:focus{border-color:#5b55f5!important;box-shadow:0 0 0 3px rgba(91,85,245,.12)!important;background:#fff!important}
    #admin-support-v7-composer button{display:inline-flex!important;visibility:visible!important;opacity:1!important;align-items:center!important;justify-content:center!important;flex:0 0 44px!important;width:44px!important;height:44px!important;border:0!important;border-radius:14px!important;cursor:pointer!important;font:inherit!important}
    #admin-support-v7-composer .v7-tool{background:#eef2fb!important;color:#25304a!important}
    #admin-support-v7-composer .v7-send{background:#5b55f5!important;color:#fff!important;font-size:21px!important}
    #admin-support-v7-composer button:disabled,#admin-support-v7-composer textarea:disabled{opacity:.5!important;cursor:not-allowed!important}
    #support .conversation{position:relative!important;display:flex!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important}
    #support #supportMessages{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important}
    @media(max-width:700px){#admin-support-v7-composer .v7-tool{display:none!important}}
  `;
  function addCss(){if(document.getElementById('admin-support-v7-css'))return;const s=document.createElement('style');s.id='admin-support-v7-css';s.textContent=css;document.head.appendChild(s)}
  function state(){return typeof admin!=='undefined'?admin:null}
  function getConversation(){return document.querySelector('#support .conversation')}
  function currentId(){const a=state();return selectedId||(a&&a.thread&&a.thread.id)||null}
  function build(){
    addCss();const support=document.getElementById('support'),c=getConversation();if(!support||!c)return;
    let form=document.getElementById(ROOT_ID);
    if(!form){
      form=document.createElement('form');form.id=ROOT_ID;
      form.innerHTML='<button type="button" class="v7-tool" title="Thêm">＋</button><button type="button" class="v7-tool" title="Emoji">😊</button><button type="button" class="v7-tool" title="Sticker">✨</button><textarea id="adminSupportV7Input" rows="1" placeholder="Nhập tin nhắn cho người học..."></textarea><button type="submit" class="v7-send" title="Gửi">➤</button>';
      c.appendChild(form);form.addEventListener('submit',e=>{e.preventDefault();send()});form.querySelector('textarea').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}});
    }else if(form.parentElement!==c)c.appendChild(form);
    const ready=!!currentId(),input=form.querySelector('textarea'),button=form.querySelector('.v7-send');input.disabled=!ready;button.disabled=!ready;input.placeholder=ready?'Nhập tin nhắn cho người học...':'Chọn một cuộc trò chuyện bên trái...';
  }
  async function send(){
    const id=currentId(),input=document.getElementById('adminSupportV7Input'),text=input&&input.value.trim();if(!id||!text)return;
    const a=state();
    try{
      if(typeof loadSupabase==='function')await loadSupabase();
      if(typeof db==='undefined'||!db)throw new Error('Supabase chưa sẵn sàng');
      const thread=a&&Array.isArray(a.threads)?a.threads.find(t=>String(t.id)===String(id)):null;
      const accountId=(thread&&thread.account_id)||(a&&a.thread&&a.thread.account_id)||null;
      const r=await db.from('support_messages').insert({thread_id:id,account_id:accountId,sender:'admin',sender_name:'Admin',message:text}).select('*').single();
      if(r.error)throw r.error;input.value='';
      if(a&&String(a.thread&&a.thread.id)===String(id)&&r.data){a.messages=Array.isArray(a.messages)?a.messages:[];a.messages.push(r.data)}
      if(typeof renderChat==='function')renderChat();build();const box=document.getElementById('supportMessages');if(box)box.scrollTop=box.scrollHeight;
      if(typeof loadSupportThreads==='function')await loadSupportThreads();build();if(typeof toast==='function')toast('Đã gửi tin nhắn cho người học');
    }catch(e){console.error('[ADMIN SUPPORT V7]',e);if(typeof toast==='function')toast('Không gửi được: '+(e.message||e))}
  }
  function hook(){const original=window.openThread;if(typeof original==='function'&&!original.__v7){const wrapped=async function(id){selectedId=String(id);const r=await original.apply(this,arguments);setTimeout(build,0);setTimeout(build,100);setTimeout(build,400);return r};wrapped.__v7=true;window.openThread=wrapped}}
  function tick(){const support=document.getElementById('support');if(!support||!support.classList.contains('active'))return;const a=state();if(a&&a.thread&&a.thread.id)selectedId=String(a.thread.id);hook();build()}
  function boot(){addCss();tick();document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('#support .thread');if(t){selectedId=t.getAttribute('data-id')||null;setTimeout(tick,20);setTimeout(tick,150);setTimeout(tick,500)}if(e.target.closest&&e.target.closest('[data-tab="support"]')){setTimeout(tick,100);setTimeout(tick,600)}},true);new MutationObserver(tick).observe(document.body,{childList:true,subtree:true});setInterval(tick,500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
