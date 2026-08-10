/* STUDY TH admin hardening + flexible AI input. */
(function(){
  function val(id,fallback){var el=document.getElementById(id);return el?el.value:fallback}
  function checkedTypes(){return Array.from(document.querySelectorAll('input[name="questionType"]:checked')).map(function(x){return x.value})}
  function normalizeQuestions(qs){
    return (Array.isArray(qs)?qs:[]).map(function(q){
      var x=q||{};
      if(x.type==='flashcard') return {type:'flashcard',q:'',opts:[],a:0,statements:[],answers:[],answer:'',front:String(x.front??x.term??'').trim(),back:String(x.back??x.definition??'').trim(),phonetic:String(x.phonetic??x.pronunciation??'').trim(),example:String(x.example??'').trim(),explanation:String(x.explanation||'').trim()};
      return {type:['mcq','true_false','short'].includes(x.type)?x.type:'mcq',q:String(x.q||'').trim(),opts:Array.isArray(x.opts)?x.opts.map(function(v){return String(v??'').trim()}):[],a:Number(x.a||0),statements:Array.isArray(x.statements)?x.statements.map(function(v){return String(v??'').trim()}):[],answers:Array.isArray(x.answers)?x.answers.map(Boolean):[],answer:String(x.answer??'').trim(),front:'',back:'',phonetic:'',example:'',explanation:String(x.explanation||'').trim()};
    });
  }
  function validate(qs,count,types){
    var isFlashOnly=types.length===1&&types[0]==='flashcard';
    if(!isFlashOnly&&qs.length!==count)throw new Error('AI tạo '+qs.length+'/'+count+' nội dung. Chưa lưu để tránh đề thiếu câu.');
    if(isFlashOnly&&!qs.length)throw new Error('AI không tạo được flashcard nào.');
    var bad=[];
    qs.forEach(function(q,i){
      if(!types.includes(q.type))bad.push('Nội dung '+(i+1)+' sai loại');
      if(q.type==='flashcard'){
        if(!q.front)bad.push('Thẻ '+(i+1)+' thiếu từ/cụm từ');
        if(!q.back)bad.push('Thẻ '+(i+1)+' thiếu nghĩa');
      }else{
        if(!q.q)bad.push('Câu '+(i+1)+' thiếu nội dung');
        if(q.type==='mcq'&&(q.opts.length!==4||![0,1,2,3].includes(q.a)))bad.push('Câu '+(i+1)+' MCQ chưa đủ 4 lựa chọn/đáp án');
        if(q.type==='true_false'&&(q.statements.length!==4||q.answers.length!==4))bad.push('Câu '+(i+1)+' Đúng/Sai chưa đủ 4 mệnh đề');
        if(q.type==='short'&&(!q.answer||Array.from(q.answer).length>4))bad.push('Câu '+(i+1)+' trả lời ngắn không hợp lệ');
      }
    });
    if(bad.length)throw new Error('Đề chưa đạt kiểm tra: '+bad.slice(0,5).join('; '));
  }
  function readAsDataUrl(file){return new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(String(r.result||''))};r.onerror=function(){reject(new Error('Không đọc được file ảnh.'))};r.readAsDataURL(file)})}
  function prepareImage(file){
    return new Promise(async function(resolve,reject){
      try{
        var raw=await readAsDataUrl(file),img=new Image();
        img.onload=function(){
          var max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
          var canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;var ctx=canvas.getContext('2d',{alpha:false});
          if(!ctx){resolve({data:raw,mime:file.type||'image/jpeg'});return}
          ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);resolve({data:canvas.toDataURL('image/jpeg',.74),mime:'image/jpeg'});
        };
        img.onerror=function(){resolve({data:raw,mime:file.type||'image/jpeg'})};img.src=raw;
      }catch(e){reject(e)}
    });
  }
  async function renderPdfPages(file){
    await loadExternal('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    var pages=[];
    for(var i=1;i<=pdf.numPages;i++){
      var page=await pdf.getPage(i),base=page.getViewport({scale:1}),max=1800,scale=Math.min(1.55,max/base.width),vp=page.getViewport({scale:scale});
      var canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);var ctx=canvas.getContext('2d',{alpha:false});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      pages.push({data:canvas.toDataURL('image/jpeg',.74),mime:'image/jpeg',page:i});
    }
    return pages;
  }
  async function getInputPayload(files,msg){
    var list=Array.from(files||[]);if(!list.length)throw new Error('Hãy chọn ít nhất một tài liệu hoặc ảnh.');
    var texts=[],images=[];
    for(var fi=0;fi<list.length;fi++){
      var file=list[fi],name=(file.name||'').toLowerCase(),isImage=/^image\//i.test(file.type)||/\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name),isPdf=/\.pdf$/i.test(name);
      if(isImage){if(msg)msg.textContent='⏳ AI Vision đang đọc ảnh '+(fi+1)+'/'+list.length+'...';images.push(await prepareImage(file));continue}
      if(isPdf){
        if(msg)msg.textContent='⏳ Đang quét PDF '+(fi+1)+'/'+list.length+' thành ảnh để AI Vision đọc bảng...';
        var pages=await renderPdfPages(file);pages.forEach(function(p){images.push(p)});continue;
      }
      if(msg)msg.textContent='⏳ Đang đọc tài liệu '+(fi+1)+'/'+list.length+'...';
      var text='';try{text=await extractDoc(file)}catch(e){text=''}
      if(text)texts.push('--- '+file.name+' ---\n'+String(text));
    }
    return {files:list,documentText:texts.join('\n\n').slice(0,220000),fileData:images.map(function(x){return x.data}),fileMimeTypes:images.map(function(x){return x.mime})};
  }
  async function createByAI(){
    var input=document.getElementById('file'),msg=document.getElementById('msg'),files=input&&input.files,title=String(val('title','')).trim(),subject=val('subject','Toán'),difficulty=val('level','Trung bình'),duration=Number(val('minutes',45)||45),count=Number(val('questions',20)||20),types=checkedTypes();
    if(!files||!files.length){msg.textContent='⚠️ Hãy chọn tài liệu hoặc ảnh.';return}
    if(!title){msg.textContent='⚠️ Hãy đặt tên bài.';return}
    if(!types.length){msg.textContent='⚠️ Chọn ít nhất một dạng nội dung.';return}
    if(!Number.isInteger(count)||count<1||count>100){msg.textContent='⚠️ Số lượng phải từ 1 đến 100.';return}
    var flashOnly=types.length===1&&types[0]==='flashcard';
    try{
      var selected=await getInputPayload(files,msg);if(!selected.documentText&&!selected.fileData.length)throw new Error('Không đọc được nội dung. Hãy dùng tài liệu có chữ hoặc ảnh rõ nét.');
      var questions=[];
      if(flashOnly){
        msg.textContent=selected.fileData.length?'⏳ AI Vision đang phân tích '+selected.fileData.length+' trang/ảnh và tách từng từ → nghĩa...':'⏳ AI đang quét tài liệu và tách từng từ/cụm từ thành flashcard...';
        var fr=await fetch('/api/generate-flashcards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:Array.from(files).map(function(f){return f.name}).join(', '),mimeType:'image/jpeg',mimeTypes:selected.fileMimeTypes,documentText:selected.documentText,fileData:selected.fileData,subject:subject})});
        var fd=await fr.json().catch(function(){return{}});if(!fr.ok)throw new Error(fd.error||'Không tạo được flashcard');questions=normalizeQuestions(fd.flashcards||fd.questions);validate(questions,count,types);
      }else{
        msg.textContent=selected.fileData.length?'⏳ AI Vision đang đọc '+selected.fileData.length+' trang/ảnh và tạo nội dung...':'⏳ Gemini đang tạo đúng '+count+' nội dung và tự kiểm tra...';
        var response=await fetch('/api/generate-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:Array.from(files).map(function(f){return f.name}).join(', '),mimeType:'image/jpeg',mimeTypes:selected.fileMimeTypes,documentText:selected.documentText,fileData:selected.fileData,subject:subject,difficulty:difficulty,questionCount:count,types:types})});
        var data=await response.json().catch(function(){return{}});if(!response.ok)throw new Error(data.error||'Không tạo được đề');questions=normalizeQuestions(data.questions);validate(questions,count,types);
      }
      await loadSupabase();
      var insert=await db.from('exams').insert({title:title,subject:subject,difficulty:difficulty,duration:flashOnly?0:duration,question_count:questions.length,questions:questions,status:'active'}).select('*').single();
      if(insert.error)throw insert.error;if(!insert.data||!Array.isArray(insert.data.questions)||insert.data.questions.length!==questions.length)throw new Error('Máy chủ lưu dữ liệu không đủ. Chưa báo thành công.');
      msg.textContent=flashOnly?'✅ Đã tạo '+questions.length+' flashcard. Mỗi từ/cụm từ là một thẻ 2 mặt.':'✅ Đã tạo '+questions.length+' nội dung và lưu thành công.';
      document.getElementById('title').value='';document.getElementById('file').value='';if(typeof renderTests==='function')await renderTests();if(typeof loadDashboard==='function')loadDashboard();
    }catch(err){console.error(err);msg.textContent='❌ '+(err&&err.message||err)}
  }
  function boot(){
    var btn=document.getElementById('createBtn');if(!btn||btn.dataset.hardened==='1')return;btn.dataset.hardened='1';
    btn.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();createByAI()},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,300)});else setTimeout(boot,300);
})();

/* Admin support messenger viewport fix. */
(function(){
  var scheduled=false;
  function fitSupportMessenger(){
    scheduled=false;var support=document.getElementById('support'),messenger=support&&support.querySelector('.messenger');if(!messenger)return;
    var rect=messenger.getBoundingClientRect(),available=Math.floor(window.innerHeight-rect.top-12),min=window.innerWidth<=650?360:(window.innerWidth<=900?390:0);if(available<min)available=min;
    messenger.style.setProperty('height',Math.max(available,0)+'px','important');messenger.style.setProperty('max-height',Math.max(available,0)+'px','important');messenger.style.setProperty('min-height','0px','important');messenger.style.setProperty('overflow','hidden','important');
    var conversation=messenger.querySelector('.conversation');if(conversation){conversation.style.setProperty('height','100%','important');conversation.style.setProperty('min-height','0','important');conversation.style.setProperty('overflow','hidden','important')}
    var messages=document.getElementById('supportMessages');if(messages){messages.style.setProperty('min-height','0','important');messages.style.setProperty('overflow-y','auto','important');messages.style.setProperty('overflow-x','hidden','important')}
    var composer=document.getElementById('replyForm');if(composer){composer.style.setProperty('display','flex','important');composer.style.setProperty('visibility','visible','important');composer.style.setProperty('opacity','1','important');composer.style.setProperty('position','relative','important');composer.style.setProperty('bottom','auto','important');composer.style.setProperty('z-index','100000','important')}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){requestAnimationFrame(fitSupportMessenger)})}
  function boot(){schedule();window.addEventListener('resize',schedule,{passive:true});window.addEventListener('orientationchange',schedule,{passive:true});var nav=document.getElementById('adminNav');if(nav)nav.addEventListener('click',function(){setTimeout(schedule,30);setTimeout(schedule,250)});var refresh=document.getElementById('newSupportRefresh');if(refresh)refresh.addEventListener('click',function(){setTimeout(schedule,100)});var target=document.getElementById('support');if(target){var observer=new MutationObserver(schedule);observer.observe(target,{childList:true,subtree:true})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,100)});else setTimeout(boot,100)
})();

/* Load runtime guards from root assets. */
(function(){
  function loadScript(src){var s=document.createElement('script');s.src=src+'?v=20260811-flexvision';s.async=false;document.body.appendChild(s)}
  function loadStyle(src){var l=document.createElement('link');l.rel='stylesheet';l.href=src+'?v=20260811-flexvision';document.head.appendChild(l)}
  function boot(){if(window.__studyFinalGuardsLoader)return;window.__studyFinalGuardsLoader=true;loadStyle('/admin-chat-final.css');loadScript('/admin/admin-chat-final.js');loadScript('/admin/admin-copilot-final.js');loadScript('/admin-support-force-v7.js')}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,50)});else setTimeout(boot,50)
})();