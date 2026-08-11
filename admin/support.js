/* STUDY TH — Admin support messenger: authoritative runtime. */
(function(){
  'use strict';
  if(window.__studyAdminSupportV7)return;
  window.__studyAdminSupportV7=true;

  var currentThread=null, busy=false, channel=null, poll=null;
  var $=function(s){return document.querySelector(s)};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})};
  function active(){var x=$('#support');return !!(x&&x.classList.contains('active'));}
  async function db(){
    if(typeof window.loadSupabase!=='function') throw new Error('Supabase chưa sẵn sàng');
    var d=await window.loadSupabase();
    if(!d||typeof d.from!=='function') throw new Error('Không kết nối được Supabase');
    return d;
  }

  function forceLayout(){
    var c=$('#support .conversation'); if(!c)return;
    c.style.setProperty('display','flex','important');
    c.style.setProperty('flex-direction','column','important');
    c.style.setProperty('height','100%','important');
    c.style.setProperty('min-height','0','important');
    c.style.setProperty('overflow','hidden','important');
    var box=$('#supportMessages'); if(box){box.style.setProperty('display','block','important');box.style.setProperty('flex','1 1 auto','important');box.style.setProperty('min-height','0','important');box.style.setProperty('overflow-y','auto','important');}
    var f=ensureComposer(); if(f){
      f.style.setProperty('display','flex','important');f.style.setProperty('visibility','visible','important');f.style.setProperty('opacity','1','important');f.style.setProperty('position','relative','important');f.style.setProperty('z-index','99999','important');f.style.setProperty('flex','0 0 auto','important');f.style.setProperty('width','100%','important');f.style.setProperty('min-height','64px','important');f.style.setProperty('height','auto','important');f.style.setProperty('box-sizing','border-box','important');
      var i=f.querySelector('#replyInput');if(i){i.style.setProperty('display','block','important');i.style.setProperty('visibility','visible','important');i.style.setProperty('opacity','1','important');i.style.setProperty('flex','1 1 auto','important');i.style.setProperty('min-width','0','important');i.style.setProperty('height','42px','important');}
    }
  }

  function ensureComposer(){
    var c=$('#support .conversation');if(!c)return null;
    var f=$('#replyForm');
    if(!f || !c.contains(f)){
      if(f)f.remove();
      f=document.createElement('form');f.id='replyForm';f.className='composer';f.autocomplete='off';
      f.innerHTML='<textarea id="replyInput" rows="1" placeholder="Nhập tin nhắn..."></textarea><button type="submit" class="send-btn">➤</button>';
      c.appendChild(f);
    }
    f.classList.remove('hidden');f.removeAttribute('hidden');f.setAttribute('aria-hidden','false');
    if(!f.dataset.studyV7){
      f.dataset.studyV7='1';
      f.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();send();},true);
      var i=f.querySelector('#replyInput');
      if(i)i.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopPropagation();send();}},true);
    }
    return f;
  }

  function render(rows){
    var box=$('#supportMessages');if(!box)return;
    box.innerHTML=(rows||[]).map(function(m){
      var mine=String(m.sender||'')==='admin';
      return '<div class="message '+(mine?'mine':'theirs')+'"><div class="support-bubble"><b>'+(mine?'Admin':m.sender==='bot'?'Bot':'Người dùng')+'</b><div>'+esc(m.message||m.content||m.text||'')+'</div>'+(m.attachment_url?'<div><a href="'+esc(m.attachment_url)+'" target="_blank" rel="noopener">📎 '+esc(m.attachment_name||'Tệp đính kèm')+'</a></div>':'')+'<small>'+esc(m.created_at?new Date(m.created_at).toLocaleString('vi-VN'):'')+'</small></div></div>';
    }).join('')||'<div class="empty-chat"><span>💬</span><b>Chưa có tin nhắn</b></div>';
    requestAnimationFrame(function(){box.scrollTop=box.scrollHeight;forceLayout();});
  }

  async function loadThreads(){
    var box=$('#supportThreads');if(!box)return;
    try{
      var d=await db(),r=await d.from('support_threads').select('*,support_accounts(name,avatar)').order('updated_at',{ascending:false});
      if(r.error)throw r.error;
      var rows=r.data||[];
      box.innerHTML=rows.length?rows.map(function(t){return '<button type="button" class="thread" data-support-thread="'+esc(t.id)+'"><div class="thread-main"><b>'+esc(t.student_name||'Người dùng')+'</b><small>'+esc(t.last_message||'Cuộc trò chuyện')+'</small></div><span class="badge">'+esc(t.status||'open')+'</span></button>';}).join(''):'<div class="empty-chat"><span>💬</span><b>Chưa có cuộc trò chuyện</b></div>';
      box.querySelectorAll('[data-support-thread]').forEach(function(b){b.onclick=function(e){e.preventDefault();open(b.getAttribute('data-support-thread'));};});
    }catch(e){console.error('Admin support threads',e);box.innerHTML='<div class="danger-text">Không đọc được hỗ trợ: '+esc(e.message||e)+'</div>';}
    forceLayout();
  }

  async function loadMessages(id){
    if(!id)return;currentThread=String(id);forceLayout();
    var box=$('#supportMessages');if(box)box.innerHTML='<div class="empty-chat"><span>⏳</span><b>Đang tải tin nhắn...</b></div>';
    try{
      var d=await db(),r=await d.from('support_messages').select('*').eq('thread_id',id).order('created_at',{ascending:true});
      if(r.error)throw r.error;
      render(r.data||[]);
      await d.from('support_threads').update({unread_admin:0}).eq('id',id);
      var head=$('#chatHeader');var b=document.querySelector('#supportThreads [data-support-thread="'+CSS.escape(String(id))+'"] b');
      if(head)head.innerHTML='<div class="chat-person"><span class="avatar">💬</span><div><b>'+esc(b?b.textContent:'Người dùng')+'</b><small>Đang trò chuyện với người học</small></div></div>';
    }catch(e){console.error('Admin support messages',e);if(box)box.innerHTML='<div class="danger-text">Không tải được tin nhắn: '+esc(e.message||e)+'</div>';}
    finally{forceLayout();}
  }

  async function open(id){currentThread=String(id);forceLayout();await loadMessages(id);forceLayout();}

  async function send(){
    if(busy||!currentThread)return;
    var i=$('#replyInput'),text=i&&i.value.trim();if(!text)return;
    busy=true;forceLayout();if(i)i.disabled=true;
    try{
      var d=await db(),r=await d.from('support_messages').insert({thread_id:currentThread,sender:'admin',message:text,bot_handled:false}).select('*').single();
      if(r.error)throw r.error;
      if(i)i.value='';await loadMessages(currentThread);await loadThreads();
    }catch(e){console.error('Admin support send',e);alert('Không gửi được trả lời: '+(e.message||e));}
    finally{busy=false;forceLayout();var x=$('#replyInput');if(x)x.disabled=false;}
  }
  window.sendAdminReply=send;
  window.__studySendSupportTextV7=send;

  async function realtime(){
    try{
      var d=await db();if(channel)return;
      channel=d.channel('admin-support-v7').on('postgres_changes',{event:'*',schema:'public',table:'support_messages'},function(p){if(!active())return;loadThreads();if(currentThread&&p.new&&String(p.new.thread_id)===String(currentThread))loadMessages(currentThread);}).on('postgres_changes',{event:'*',schema:'public',table:'support_threads'},function(){if(active())loadThreads();}).subscribe();
      clearInterval(poll);poll=setInterval(function(){if(active()){loadThreads();if(currentThread)loadMessages(currentThread);forceLayout();}},10000);
    }catch(e){console.warn('Admin support realtime unavailable',e);}
  }

  function boot(){
    forceLayout();
    if(active()){loadThreads();realtime();}
    var nav=document.querySelectorAll('[data-tab="support"]');nav.forEach(function(n){n.addEventListener('click',function(){setTimeout(function(){forceLayout();loadThreads();realtime();},80);});});
    var mo=new MutationObserver(function(){if(active())forceLayout();});
    var root=$('#support');if(root)mo.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
    setInterval(function(){if(active())forceLayout();},1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
