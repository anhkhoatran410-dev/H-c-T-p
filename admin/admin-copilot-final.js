/* STUDY TH final Admin Copilot client: one request at a time + live project context. */
(function(){
  if(window.__studyAdminCopilotFinal)return;
  window.__studyAdminCopilotFinal=true;
  var busy=false;
  function escText(v){return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
  function render(){
    var box=document.getElementById('assistantMessages');if(!box)return;
    box.innerHTML=(admin.assistant||[]).map(function(m){return '<div class="assistant-bubble '+(m.role==='user'?'user':'assistant')+'">'+escText(m.message)+'</div>'}).join('')||'<div class="empty-chat"><span>✨</span><b>Admin Copilot sẵn sàng</b><small>Hỏi về lỗi, UX, realtime, database, bảo trì...</small></div>';
    box.scrollTop=box.scrollHeight;
  }
  async function send(){
    var input=document.getElementById('assistantInput'),message=input?.value.trim();if(!message||busy)return;
    busy=true;var btn=document.querySelector('#assistantForm .send-btn');if(btn)btn.disabled=true;if(input)input.value='';
    admin.assistant=admin.assistant||[];admin.assistant.push({role:'user',message});var placeholder={role:'assistant',message:'Đang đọc dữ liệu website và phân tích...'};admin.assistant.push(placeholder);render();
    try{
      var context={tab:admin.tab,threadId:admin.thread?.id||null,threadStudent:admin.thread?.student_name||null,threadAccount:admin.thread?.support_accounts?.name||null,threadCount:(admin.threads||[]).length,assistantClient:'admin-copilot-final'};
      var r=await fetch('/api/admin-assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({message,history:admin.assistant.slice(-12),context})});
      var d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||'Copilot chưa phản hồi');
      placeholder.message=d.answer||'Copilot trả về rỗng.';
    }catch(e){placeholder.message='❌ '+(e?.message||e)}
    finally{busy=false;if(btn)btn.disabled=false;render()}
  }
  function boot(){
    if(typeof admin==='undefined')return;
    var form=document.getElementById('assistantForm'),input=document.getElementById('assistantInput');if(!form||!input)return;
    form.onsubmit=function(e){e.preventDefault();e.stopImmediatePropagation();send()};
    if(!input.__copilotFinalBound){input.__copilotFinalBound=true;input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();send()}},true)}
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
  window.addEventListener('load',function(){setTimeout(boot,0)});
  var tries=0,t=setInterval(function(){boot();if(++tries>40)clearInterval(t)},250);
})();
