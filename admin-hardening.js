/* STUDY TH admin hardening: never save an empty exam and keep mobile controls usable. */
(function(){
  function boot(){
    var btn=document.getElementById('createBtn');
    if(!btn||btn.dataset.hardened==='1')return;
    btn.dataset.hardened='1';
    function val(id,fallback){var el=document.getElementById(id);return el?el.value:fallback}
    function checkedTypes(){return Array.from(document.querySelectorAll('input[name="questionType"]:checked')).map(function(x){return x.value})}
    function normalizeQuestions(qs){return (Array.isArray(qs)?qs:[]).map(function(q){var x=q||{};return{type:['mcq','true_false','short'].includes(x.type)?x.type:'mcq',q:String(x.q||'').trim(),opts:Array.isArray(x.opts)?x.opts.map(function(v){return String(v??'').trim()}):[],a:Number(x.a||0),statements:Array.isArray(x.statements)?x.statements.map(function(v){return String(v??'').trim()}):[],answers:Array.isArray(x.answers)?x.answers.map(Boolean):[],answer:String(x.answer??'').trim(),explanation:String(x.explanation||'').trim()}})}
    function validate(qs,count,types){if(qs.length!==count)throw new Error('AI tạo '+qs.length+'/'+count+' câu. Chưa lưu để tránh đề 0 câu.');var bad=[];qs.forEach(function(q,i){if(!types.includes(q.type))bad.push('Câu '+(i+1)+' sai loại');if(!q.q)bad.push('Câu '+(i+1)+' thiếu nội dung');if(q.type==='mcq'&&(q.opts.length!==4||![0,1,2,3].includes(q.a)))bad.push('Câu '+(i+1)+' MCQ chưa đủ 4 lựa chọn/đáp án');if(q.type==='true_false'&&(q.statements.length!==4||q.answers.length!==4))bad.push('Câu '+(i+1)+' Đúng/Sai chưa đủ 4 mệnh đề');if(q.type==='short'&&(!q.answer||Array.from(q.answer).length>4))bad.push('Câu '+(i+1)+' trả lời ngắn không hợp lệ')});if(bad.length)throw new Error('Đề chưa đạt kiểm tra: '+bad.slice(0,4).join('; '))}
    document.addEventListener('click',async function(e){
      if(e.target!==btn&&!e.target.closest('#createBtn'))return;
      e.preventDefault();e.stopImmediatePropagation();
      var file=document.getElementById('file')?.files?.[0],msg=document.getElementById('msg');
      var title=String(val('title','')).trim(),subject=val('subject','Toán'),difficulty=val('level','Trung bình'),duration=Number(val('minutes',45)||45),count=Number(val('questions',20)||20),types=checkedTypes();
      if(!file){msg.textContent='⚠️ Hãy chọn tài liệu.';return} if(!title){msg.textContent='⚠️ Hãy đặt tên bài.';return} if(!types.length){msg.textContent='⚠️ Chọn ít nhất một dạng câu.';return} if(!Number.isInteger(count)||count<1||count>100){msg.textContent='⚠️ Số câu phải từ 1 đến 100.';return}
      try{
        msg.textContent='⏳ Đang đọc tài liệu...';var text=await extractDoc(file);if(text.length>180000)text=text.slice(0,180000)+'\n[Đã giới hạn văn bản]';if(!text)throw new Error('Không trích xuất được chữ từ tài liệu. Hãy dùng PDF có text hoặc DOCX.');
        msg.textContent='⏳ Gemini đang tạo đúng '+count+' câu và tự kiểm tra...';var response=await fetch('/api/generate-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,mimeType:file.type,documentText:text,fileData:'',subject,difficulty,questionCount:count,types})});var data=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(data.error||'Không tạo được đề');
        var qs=normalizeQuestions(data.questions);validate(qs,count,types);await loadSupabase();var ins=await db.from('exams').insert({title:title,subject:subject,difficulty:difficulty,duration:duration,question_count:qs.length,questions:qs,status:'active'}).select('*').single();if(ins.error)throw ins.error;if(!ins.data||!Array.isArray(ins.data.questions)||ins.data.questions.length!==qs.length)throw new Error('Máy chủ lưu đề không đủ câu. Đề chưa được báo thành công.');
        msg.textContent='✅ Đã tạo '+qs.length+' câu và lưu thành công.';document.getElementById('title').value='';document.getElementById('file').value='';await renderTests();if(typeof loadDashboard==='function')loadDashboard();
      }catch(err){msg.textContent='❌ '+(err&&err.message||err)}
    },true)
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,300)});else setTimeout(boot,300)
})();

/* Admin support messenger viewport fix. */
(function(){
  var scheduled=false;
  function fitSupportMessenger(){
    scheduled=false;
    var support=document.getElementById('support');
    var messenger=support&&support.querySelector('.messenger');
    if(!messenger)return;
    var rect=messenger.getBoundingClientRect();
    var available=Math.floor(window.innerHeight-rect.top-12);
    var min=window.innerWidth<=650?360:(window.innerWidth<=900?390:0);
    if(available<min)available=min;
    messenger.style.setProperty('height',Math.max(available,0)+'px','important');
    messenger.style.setProperty('max-height',Math.max(available,0)+'px','important');
    messenger.style.setProperty('min-height','0px','important');
    messenger.style.setProperty('overflow','hidden','important');
    var conversation=messenger.querySelector('.conversation');
    if(conversation){conversation.style.setProperty('height','100%','important');conversation.style.setProperty('min-height','0','important');conversation.style.setProperty('overflow','hidden','important')}
    var messages=document.getElementById('supportMessages');
    if(messages){messages.style.setProperty('min-height','0','important');messages.style.setProperty('overflow-y','auto','important');messages.style.setProperty('overflow-x','hidden','important')}
    var composer=document.getElementById('replyForm');
    if(composer){composer.style.setProperty('display','flex','important');composer.style.setProperty('visibility','visible','important');composer.style.setProperty('opacity','1','important');composer.style.setProperty('position','relative','important');composer.style.setProperty('bottom','auto','important');composer.style.setProperty('z-index','100000','important')}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){requestAnimationFrame(fitSupportMessenger)})}
  function boot(){
    schedule();
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    var nav=document.getElementById('adminNav');
    if(nav)nav.addEventListener('click',function(){setTimeout(schedule,30);setTimeout(schedule,250)});
    var refresh=document.getElementById('newSupportRefresh');
    if(refresh)refresh.addEventListener('click',function(){setTimeout(schedule,100)});
    var target=document.getElementById('support');
    if(target){var observer=new MutationObserver(schedule);observer.observe(target,{childList:true,subtree:true})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,100)});else setTimeout(boot,100);
})();

/* Load runtime guards from root assets. Root paths bypass /admin/* rewrite rules. */
(function(){
  function loadScript(src){var s=document.createElement('script');s.src=src+'?v=20260810-v11';s.async=false;document.body.appendChild(s)}
  function loadStyle(src){var l=document.createElement('link');l.rel='stylesheet';l.href=src+'?v=20260810-v11';document.head.appendChild(l)}
  function boot(){
    if(window.__studyFinalGuardsLoader)return;window.__studyFinalGuardsLoader=true;
    loadStyle('/admin-chat-final.css');
    loadScript('/admin/admin-chat-final.js');
    loadScript('/admin/admin-copilot-final.js');
    loadScript('/admin-support-force-v7.js');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,50)});else setTimeout(boot,50)
})();