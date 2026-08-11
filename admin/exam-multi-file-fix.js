/* STUDY TH — multi-file exam creation fix
 * Keeps the existing chat/support untouched.
 * - Reads ALL selected files instead of only files[0]
 * - Shows AI instructions when 2+ documents are selected
 * - Sends merged source material + AI instructions to /api/generate-exam
 * - Preserves the existing save flow to Supabase
 */
(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function ensureMultiFilePanel(){
    const file = $('file');
    if(!file || $('multiFileAiPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'multiFileAiPanel';
    panel.style.cssText = 'display:none;margin:14px 0;padding:14px;border:1px solid rgba(99,102,241,.22);border-radius:14px;background:rgba(99,102,241,.05)';
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">🤖 AI xử lý nhiều tài liệu</div>
      <div id="multiFileSummary" style="font-size:13px;opacity:.8;margin-bottom:10px"></div>
      <label style="display:block">Yêu cầu AI khi ghép các tài liệu
        <textarea id="multiFileAiPrompt" rows="3" placeholder="Ví dụ: Gộp các Unit đã chọn, ưu tiên kiến thức chung, không lấy câu hỏi trùng nhau và phân bố câu hỏi đều giữa các tài liệu."></textarea>
      </label>
      <div style="font-size:12px;opacity:.7;margin-top:7px">AI sẽ đọc toàn bộ tài liệu đã chọn như một nguồn chung và tạo đề theo các thông số bên trên.</div>`;
    file.closest('label')?.insertAdjacentElement('afterend', panel);

    file.addEventListener('change', updateMultiFilePanel);
    updateMultiFilePanel();
  }

  function updateMultiFilePanel(){
    const file = $('file'), panel = $('multiFileAiPanel'), summary = $('multiFileSummary');
    if(!file || !panel) return;
    const files = [...(file.files || [])];
    const multi = files.length >= 2;
    panel.style.display = multi ? 'block' : 'none';
    if(summary) summary.textContent = multi ? `Đã chọn ${files.length} tài liệu: ${files.map(f=>f.name).join(' • ')}` : '';
  }

  async function loadExternal(src){
    return new Promise((resolve,reject)=>{
      if([...document.scripts].some(s=>s.src===src)) return resolve();
      const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=()=>reject(new Error('Không tải được thư viện')); document.head.appendChild(s);
    });
  }

  async function extractOne(file){
    const n=(file.name||'').toLowerCase();
    if(n.endsWith('.txt')||n.endsWith('.md')||n.endsWith('.csv')||n.endsWith('.rtf')) return await file.text();
    if(n.endsWith('.pdf')){
      await loadExternal('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
      let out='';
      for(let i=1;i<=pdf.numPages;i++){
        const p=await pdf.getPage(i), t=await p.getTextContent();
        out+=`\n--- ${file.name} · Trang ${i} ---\n`+t.items.map(x=>x.str||'').join(' ');
      }
      return out.trim();
    }
    if(n.endsWith('.docx')){
      await loadExternal('https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js');
      return (await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value||'';
    }
    return '';
  }

  async function createExamMultiFile(){
    const fileInput=$('file'), msg=$('msg');
    const files=[...(fileInput?.files||[])];
    const title=$('title')?.value.trim();
    const subject=$('subject')?.value;
    const difficulty=$('level')?.value;
    const duration=Number($('minutes')?.value||45);
    const questionCount=Number($('questions')?.value||20);
    const types=[...document.querySelectorAll('input[name="questionType"]:checked')].map(x=>x.value);
    const aiPrompt=($('multiFileAiPrompt')?.value||'').trim();

    if(!files.length){ if(msg) msg.textContent='⚠️ Hãy chọn ít nhất một tài liệu.'; return; }
    if(!title){ if(msg) msg.textContent='⚠️ Hãy đặt tên bài.'; return; }
    if(!types.length){ if(msg) msg.textContent='⚠️ Chọn ít nhất một dạng câu.'; return; }

    try{
      if(msg) msg.textContent=`⏳ Đang đọc ${files.length} tài liệu...`;
      const parts=[];
      for(let i=0;i<files.length;i++){
        if(msg) msg.textContent=`⏳ Đang đọc tài liệu ${i+1}/${files.length}: ${files[i].name}`;
        const text=await extractOne(files[i]).catch(()=>'' );
        if(text) parts.push(`\n===== TÀI LIỆU ${i+1}: ${files[i].name} =====\n${text}`);
      }
      let documentText=parts.join('\n');
      if(!documentText) throw new Error('Không trích xuất được chữ từ các tài liệu. Hãy dùng PDF có text hoặc DOCX.');
      if(documentText.length>180000) documentText=documentText.slice(0,180000)+'\n[Đã giới hạn văn bản để giữ request nhẹ]';

      if(msg) msg.textContent='⏳ AI đang tổng hợp toàn bộ tài liệu và tạo bản nháp...';
      const r=await fetch('/api/generate-exam',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          fileName:files.map(f=>f.name).join(', '),
          fileNames:files.map(f=>f.name),
          mimeType:files.length===1?files[0].type:'application/octet-stream',
          documentText,fileData:'',subject,difficulty,questionCount,types,
          multiFile:files.length>=2,
          aiInstruction:aiPrompt,
          sourceCount:files.length
        })
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(data.error||'Không tạo được đề');
      if(!Array.isArray(data.questions)||!data.questions.length) throw new Error('AI không trả về câu hỏi hợp lệ.');

      if(!window.db && typeof window.loadSupabase==='function') await window.loadSupabase();
      const database=window.db;
      if(!database) throw new Error('Chưa kết nối Supabase.');
      const {error}=await database.from('exams').insert({title,subject,difficulty,duration,question_count:data.questions.length,questions:data.questions,status:'active'});
      if(error) throw error;

      if(msg) msg.textContent=`✅ Đã đọc ${files.length} tài liệu, tạo ${data.questions.length} câu và lưu thành công.`;
      $('title').value=''; fileInput.value='';
      if($('multiFileAiPrompt')) $('multiFileAiPrompt').value='';
      updateMultiFilePanel();
      if(typeof window.renderTests==='function') await window.renderTests();
      if(typeof window.loadDashboard==='function') window.loadDashboard();
    }catch(e){
      if(msg) msg.textContent='❌ '+(e?.message||e);
    }
  }

  function install(){
    ensureMultiFilePanel();
    const btn=$('createBtn');
    if(btn && !btn.dataset.multiFileFixBound){
      btn.dataset.multiFileFixBound='1';
      btn.onclick=createExamMultiFile;
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
  window.createExamMultiFile=createExamMultiFile;
})();
