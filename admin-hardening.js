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
