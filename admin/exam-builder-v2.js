/* STUDY TH — Exam Builder V2
   - Multi-file selection with persistent add/remove UI
   - Separate Quiz and Flashcard modes
   - Flashcard mode never requires a quiz type
   - Multi-source AI instruction: combine units / percentage distribution
   - Flashcard lessons are saved as flashcardOnly exams; public side can add the memory test button
*/
(function(){
  'use strict';
  if(window.__studyExamBuilderV2)return;
  window.__studyExamBuilderV2=true;

  const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
  const SUPABASE_KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selectedFiles=[];
  let busy=false;

  function loadExternal(src){return new Promise((resolve,reject)=>{if([...document.scripts].some(s=>s.src===src))return resolve();const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Không tải được thư viện xử lý tài liệu.'));document.head.appendChild(s)})}
  async function extract(file){
    const n=(file.name||'').toLowerCase();
    if(n.endsWith('.txt')||n.endsWith('.md')||n.endsWith('.csv')||n.endsWith('.rtf'))return file.text();
    if(n.endsWith('.pdf')){
      await loadExternal('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let out='';
      for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),t=await p.getTextContent();out+='\n--- '+file.name+' · Trang '+i+' ---\n'+t.items.map(x=>x.str||'').join(' ')}
      return out.trim();
    }
    if(n.endsWith('.docx')){await loadExternal('https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js');return(await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value||''}
    return '';
  }
  async function base64(file){const r=new FileReader();return new Promise((resolve,reject)=>{r.onload=()=>resolve(String(r.result||'').replace(/^data:[^;]+;base64,/i,''));r.onerror=reject;r.readAsDataURL(file)})}
  async function db(){if(window.db)return window.db;if(!window.supabase)await loadExternal('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');window.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return window.db}

  function css(){
    if($('exam-builder-v2-style'))return;
    const s=document.createElement('style');s.id='exam-builder-v2-style';s.textContent=`
      #examBuilderV2{display:grid;gap:18px}.eb2-panel{border:1px solid rgba(99,102,241,.16);border-radius:24px;padding:22px;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(246,247,255,.96));box-shadow:0 16px 40px rgba(25,30,80,.07)}
      body.dark #examBuilderV2 .eb2-panel{background:linear-gradient(145deg,rgba(25,31,55,.98),rgba(18,24,44,.98));border-color:rgba(130,140,255,.2)}
      .eb2-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.eb2-title{font-size:20px;font-weight:850;margin:0}.eb2-sub{margin:6px 0 0;opacity:.68;line-height:1.5}.eb2-mode{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.eb2-mode button{border:1px solid rgba(99,102,241,.18);background:rgba(99,102,241,.04);border-radius:18px;padding:16px;text-align:left;cursor:pointer;transition:.2s}.eb2-mode button.active{border-color:#6d63ff;background:rgba(109,99,255,.13);box-shadow:0 8px 22px rgba(109,99,255,.14)}.eb2-mode b{display:block;font-size:16px}.eb2-mode small{display:block;margin-top:4px;opacity:.68}.eb2-drop{border:1.5px dashed rgba(99,102,241,.45);border-radius:20px;padding:18px;cursor:pointer;background:rgba(99,102,241,.035)}.eb2-drop.drag{background:rgba(99,102,241,.12);border-color:#6d63ff}.eb2-drop-top{display:flex;align-items:center;gap:14px}.eb2-upload-icon{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#6d63ff,#8b7cff);color:white;font-size:23px}.eb2-files{display:grid;gap:8px;margin-top:14px}.eb2-file{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.12)}.eb2-file-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.eb2-remove{border:0;background:transparent;cursor:pointer;font-size:18px;opacity:.65}.eb2-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.eb2-field{display:grid;gap:7px}.eb2-field.full{grid-column:1/-1}.eb2-field label{font-weight:750;font-size:13px}.eb2-field input,.eb2-field select,.eb2-field textarea{width:100%;box-sizing:border-box;border:1px solid rgba(99,102,241,.16);border-radius:13px;padding:12px 13px;background:rgba(255,255,255,.72);color:inherit;outline:none}.eb2-field textarea{resize:vertical;min-height:92px}.eb2-hint{font-size:12px;opacity:.62;line-height:1.45}.eb2-types{display:flex;flex-wrap:wrap;gap:9px}.eb2-types label{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(99,102,241,.15);border-radius:999px;padding:9px 12px;cursor:pointer}.eb2-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.eb2-actions button{border:0;border-radius:14px;padding:12px 16px;font-weight:800;cursor:pointer}.eb2-primary{background:linear-gradient(135deg,#5f5af6,#816cff);color:#fff;box-shadow:0 9px 24px rgba(95,90,246,.25)}.eb2-secondary{background:rgba(99,102,241,.09);color:inherit}.eb2-status{margin-top:12px;min-height:22px;font-weight:700}.eb2-count{display:inline-flex;padding:6px 10px;border-radius:999px;background:rgba(99,102,241,.1);font-size:12px;font-weight:800}.eb2-note{padding:12px 14px;border-radius:14px;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.16);font-size:12px;line-height:1.5}.eb2-hidden{display:none!important}@media(max-width:760px){.eb2-mode,.eb2-grid{grid-template-columns:1fr}.eb2-head{display:block}.eb2-field.full{grid-column:auto}}
    `;document.head.appendChild(s);
  }

  function renderShell(){
    const tab=$('tests');if(!tab||$('examBuilderV2'))return;
    const old=tab.querySelector('.two-col');if(!old)return;
    const root=document.createElement('div');root.id='examBuilderV2';
    root.innerHTML=`<div class="eb2-panel"><div class="eb2-head"><div><h3 class="eb2-title">🤖 Tạo nội dung học tập bằng AI</h3><p class="eb2-sub">Chọn <b>Flashcard</b> để tạo riêng bộ từ vựng. Chọn <b>Trắc nghiệm</b> để tạo bài kiểm tra. Hai chế độ hoàn toàn độc lập.</p></div><span id="eb2ModeBadge" class="eb2-count">Trắc nghiệm</span></div>
      <div class="eb2-mode"><button type="button" id="eb2QuizMode" class="active"><b>📝 Trắc nghiệm</b><small>MCQ · Đúng/Sai · Trả lời ngắn</small></button><button type="button" id="eb2FlashMode"><b>📚 Flashcard từ vựng</b><small>Học từ vựng trước, sau đó Test độ nhớ bài</small></button></div>
      <div id="eb2Drop" class="eb2-drop"><div class="eb2-drop-top"><span class="eb2-upload-icon">↑</span><div><b>Thêm tài liệu</b><div class="eb2-hint">Bấm để chọn hoặc kéo thả. Có thể thêm nhiều PDF/DOCX/TXT/MD/CSV/RTF/ảnh.</div></div></div><input id="eb2File" type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,.csv,.rtf,image/*" hidden><div id="eb2Files" class="eb2-files"></div></div>
      <div id="eb2Multi" class="eb2-note eb2-hidden" style="margin-top:12px">📚 Đã chọn nhiều nguồn. Bạn có thể yêu cầu AI <b>kết hợp Unit</b>, chia tỷ lệ như <b>Unit 1 70% · Unit 2 30%</b>, hoặc trộn toàn bộ từ vựng.</div>
      <div class="eb2-grid"><div class="eb2-field"><label>Tên bài</label><input id="eb2Title" placeholder="Ví dụ: Unit 1 + Unit 2 · Ôn tập từ vựng"></div><div class="eb2-field"><label>Môn</label><select id="eb2Subject"><option>Tiếng Anh</option><option>Toán</option><option>Ngữ Văn</option></select></div><div class="eb2-field"><label>Độ khó</label><select id="eb2Level"><option>Dễ</option><option selected>Trung bình</option><option>Khó</option></select></div><div class="eb2-field"><label id="eb2CountLabel">Số câu</label><input id="eb2Count" type="number" min="1" max="100" value="20"></div><div class="eb2-field" id="eb2DurationWrap"><label>Thời gian (phút)</label><input id="eb2Duration" type="number" min="1" value="45"></div><div class="eb2-field full" id="eb2TypesWrap"><label>Dạng câu hỏi</label><div class="eb2-types"><label><input type="checkbox" value="mcq" checked> Trắc nghiệm 4 lựa chọn</label><label><input type="checkbox" value="true_false"> Đúng / Sai</label><label><input type="checkbox" value="short"> Trả lời ngắn</label></div></div><div class="eb2-field full"><label id="eb2PromptLabel">💬 Yêu cầu riêng cho AI</label><textarea id="eb2Prompt" placeholder="Ví dụ: Kết hợp Unit 1 và Unit 2, lấy Unit 1 khoảng 70% và Unit 2 khoảng 30%, không lặp câu."></textarea><div class="eb2-hint">Nếu có nhiều file, đây là nơi bạn nói rõ cách kết hợp nguồn. Nếu chỉ có 1 file, có thể dùng để yêu cầu phạm vi/chủ đề.</div></div></div>
      <div id="eb2FlashNote" class="eb2-note eb2-hidden">✨ Flashcard là một giai đoạn học riêng. Sau khi người học xem hết thẻ, hệ thống sẽ hiện nút <b>📝 Test độ nhớ bài</b> để tạo bài trắc nghiệm từ đúng các từ vừa học.</div>
      <div class="eb2-actions"><button type="button" id="eb2Create" class="eb2-primary">🤖 AI đọc file & tạo</button><button type="button" id="eb2Reset" class="eb2-secondary">↺ Chọn lại</button></div><div id="eb2Status" class="eb2-status"></div></div>`;
    old.replaceWith(root);
    const list=document.createElement('div');list.className='eb2-panel';list.id='eb2Saved';list.innerHTML='<div class="eb2-head"><div><h3 class="eb2-title">📚 Đề đã lưu</h3><p class="eb2-sub">Bài test và bộ flashcard được lưu chung trong hệ thống.</p></div><button type="button" class="eb2-secondary" id="eb2Reload">↻ Làm mới</button></div><div id="eb2TestList"></div>';
    root.insertAdjacentElement('afterend',list);
    bind();
  }

  function renderFiles(){
    const box=$('eb2Files'),multi=$('eb2Multi');if(!box)return;
    box.innerHTML=selectedFiles.map((f,i)=>`<div class="eb2-file"><span>📄</span><span class="eb2-file-name" title="${esc(f.name)}">${esc(f.name)}</span><span class="eb2-hint">${(f.size/1024/1024).toFixed(2)} MB</span><button type="button" class="eb2-remove" data-i="${i}" aria-label="Xóa file">×</button></div>`).join('')||'<div class="eb2-hint" style="margin-top:12px">Chưa có tài liệu nào.</div>';
    box.querySelectorAll('[data-i]').forEach(b=>b.onclick=e=>{e.stopPropagation();selectedFiles.splice(Number(b.dataset.i),1);renderFiles()});
    multi?.classList.toggle('eb2-hidden',selectedFiles.length<2);
  }
  function addFiles(list){const seen=new Set(selectedFiles.map(f=>f.name+'|'+f.size+'|'+f.lastModified));Array.from(list||[]).forEach(f=>{const k=f.name+'|'+f.size+'|'+f.lastModified;if(!seen.has(k)){seen.add(k);selectedFiles.push(f)}});renderFiles()}
  function mode(flash){
    $('eb2QuizMode')?.classList.toggle('active',!flash);$('eb2FlashMode')?.classList.toggle('active',flash);$('eb2ModeBadge').textContent=flash?'Flashcard từ vựng':'Trắc nghiệm';
    $('eb2TypesWrap')?.classList.toggle('eb2-hidden',flash);$('eb2FlashNote')?.classList.toggle('eb2-hidden',!flash);$('eb2DurationWrap')?.classList.toggle('eb2-hidden',flash);$('eb2CountLabel').textContent=flash?'Số từ / thẻ':'Số câu';$('eb2PromptLabel').textContent=flash?'💬 Yêu cầu tạo/kết hợp từ vựng':'💬 Yêu cầu riêng cho AI';$('eb2Prompt').placeholder=flash?'Ví dụ: Lấy từ vựng Unit 1 70%, Unit 2 30%; ưu tiên từ mới, bỏ từ trùng.':'Ví dụ: Kết hợp Unit 1 và Unit 2, lấy Unit 1 khoảng 70% và Unit 2 khoảng 30%, không lặp câu.';
  }
  function reset(){selectedFiles=[];renderFiles();$('eb2File').value='';$('eb2Title').value='';$('eb2Prompt').value='';$('eb2Status').textContent='';mode(false)}

  async function create(){
    if(busy)return;const status=$('eb2Status'),flash=$('eb2FlashMode')?.classList.contains('active');
    const title=$('eb2Title').value.trim(),subject=$('eb2Subject').value,difficulty=$('eb2Level').value,count=Math.max(1,Math.min(100,Number($('eb2Count').value||20))),duration=Math.max(1,Number($('eb2Duration').value||45)),instruction=$('eb2Prompt').value.trim();
    if(!selectedFiles.length){status.textContent='⚠️ Hãy thêm ít nhất một tài liệu.';return}if(!title){status.textContent='⚠️ Hãy đặt tên nội dung.';return}
    const types=flash?['flashcard']:[...document.querySelectorAll('#eb2TypesWrap input:checked')].map(x=>x.value);if(!types.length){status.textContent='⚠️ Hãy chọn ít nhất một dạng câu hỏi.';return}
    busy=true;$('eb2Create').disabled=true;
    try{
      status.textContent=`⏳ Đang đọc ${selectedFiles.length} tài liệu...`;
      const texts=[];const media=[];
      for(let i=0;i<selectedFiles.length;i++){
        const f=selectedFiles[i];status.textContent=`⏳ Đang đọc ${i+1}/${selectedFiles.length}: ${f.name}`;
        const text=await extract(f).catch(()=> '');if(text)texts.push(`\n===== NGUỒN ${i+1}: ${f.name} =====\n${text}`);
        if(!text && /^(application\/pdf|image\/)/i.test(f.type||'')){const b64=await base64(f).catch(()=>null);if(b64)media.push({mimeType:f.type||'application/pdf',data:b64})}
      }
      let documentText=texts.join('\n');if(documentText.length>180000)documentText=documentText.slice(0,180000)+'\n[Đã giới hạn văn bản]';
      if(flash){
        status.textContent='🤖 AI đang tạo bộ flashcard từ toàn bộ nguồn...';
        const r=await fetch('/api/generate-flashcards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileData:media.map(x=>x.data),mimeTypes:media.map(x=>x.mimeType),fileName:selectedFiles.map(f=>f.name).join(', '),subject,documentText,userInstruction:instruction,sourceFiles:selectedFiles.map(f=>f.name),sourceCount:selectedFiles.length})});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Không tạo được flashcard.');const cards=Array.isArray(d.flashcards)?d.flashcards:(Array.isArray(d.questions)?d.questions:[]);if(!cards.length)throw new Error('AI không tạo được flashcard hợp lệ.');
        const client=await db();const row={title,subject,difficulty,duration:0,question_count:cards.length,questions:cards,status:'active',flashcard_only:true};const ins=await client.from('exams').insert(row).select().single();if(ins.error)throw ins.error;
        status.textContent=`✅ Đã tạo ${cards.length} flashcard từ ${selectedFiles.length} tài liệu và lưu thành công.`;
      }else{
        if(!documentText&&!media.length)throw new Error('Không đọc được nội dung tài liệu. Hãy dùng PDF/DOCX/TXT hoặc file có nội dung chữ.');
        status.textContent='🤖 AI đang kết hợp nguồn và tạo bài kiểm tra...';
        const r=await fetch('/api/generate-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:selectedFiles.map(f=>f.name).join(', '),fileNames:selectedFiles.map(f=>f.name),mimeType:selectedFiles.length===1?selectedFiles[0].type:'application/octet-stream',documentText,fileData:'',media,subject,difficulty,questionCount:count,types,userInstruction,instruction,multiFile:selectedFiles.length>1,sourceCount:selectedFiles.length})});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Không tạo được bài kiểm tra.');if(!Array.isArray(d.questions)||!d.questions.length)throw new Error('AI không trả về nội dung hợp lệ.');
        const client=await db();const row={title,subject,difficulty,duration,question_count:d.questions.length,questions:d.questions,status:'active'};const ins=await client.from('exams').insert(row);if(ins.error)throw ins.error;status.textContent=`✅ Đã tạo ${d.questions.length} câu từ ${selectedFiles.length} tài liệu và lưu thành công.`;
      }
      if(typeof window.loadDashboard==='function')window.loadDashboard();if(typeof window.renderTests==='function')window.renderTests();if($('eb2Reload'))renderSaved();
    }catch(e){status.textContent='❌ '+(e?.message||e)}finally{busy=false;$('eb2Create').disabled=false}
  }

  async function renderSaved(){const box=$('eb2TestList');if(!box)return;try{const client=await db();const {data,error}=await client.from('exams').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;box.innerHTML=(data||[]).map(t=>`<div class="eb2-file"><span>${t.flashcard_only?'📚':'📝'}</span><span class="eb2-file-name"><b>${esc(t.title||'Chưa đặt tên')}</b><br><span class="eb2-hint">${esc(t.subject||'—')} · ${Number(t.question_count||0)} ${t.flashcard_only?'thẻ':'câu'} · ${t.flashcard_only?'Flashcard':'Bài kiểm tra'}</span></span><span class="eb2-count">${esc(t.status||'active')}</span></div>`).join('')||'<div class="eb2-hint">Chưa có nội dung.</div>'}catch(e){box.innerHTML='<div class="eb2-hint">Không tải được danh sách: '+esc(e.message)+'</div>'}}

  function bind(){
    css();
    $('eb2QuizMode').onclick=()=>mode(false);$('eb2FlashMode').onclick=()=>mode(true);$('eb2Create').onclick=create;$('eb2Reset').onclick=reset;$('eb2Reload').onclick=renderSaved;
    const drop=$('eb2Drop'),input=$('eb2File');drop.onclick=e=>{if(e.target.closest('[data-i]'))return;input.click()};input.onchange=()=>{addFiles(input.files);input.value=''};
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
    renderFiles();mode(false);renderSaved();
  }
  function boot(){renderShell()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
