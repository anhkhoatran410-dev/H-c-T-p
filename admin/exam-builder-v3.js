/* STUDY TH — Exam Builder V3
   Universal document/image intake. Keeps existing Admin UI/flows while making
   quiz + flashcard generation work with common PDFs, office files, text files and images.
*/
(function(){
  'use strict';
  if(window.__studyExamBuilderV3)return;
  window.__studyExamBuilderV3=true;

  const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
  const SUPABASE_KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let selectedFiles=[];let busy=false;

  function loadExternal(src){return new Promise((resolve,reject)=>{if([...document.scripts].some(s=>s.src===src))return resolve();const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Không tải được thư viện xử lý tài liệu.'));document.head.appendChild(s)})}
  function ext(name){return (name.split('.').pop()||'').toLowerCase()}
  const VISION_MIMES=new Set(['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/bmp','image/svg+xml']);

  async function extract(file){
    const n=(file.name||'').toLowerCase(),e=ext(n);
    if(['txt','md','csv','rtf'].includes(e))return file.text();
    if(e==='pdf'){
      await loadExternal('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let out='';
      for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),t=await p.getTextContent();out+='\n--- '+file.name+' · Trang '+i+' ---\n'+t.items.map(x=>x.str||'').join(' ')}
      return out.trim();
    }
    if(e==='docx'){
      await loadExternal('https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js');
      return (await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value||'';
    }
    if(['xls','xlsx'].includes(e)){
      await loadExternal('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      const wb=window.XLSX.read(await file.arrayBuffer(),{type:'array'});let out='';
      for(const name of wb.SheetNames){out+='\n--- '+file.name+' · Sheet '+name+' ---\n'+window.XLSX.utils.sheet_to_csv(wb.Sheets[name])}
      return out.trim();
    }
    if(['ppt','pptx'].includes(e)){
      if(e==='pptx'){
        await loadExternal('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        const zip=await window.JSZip.loadAsync(await file.arrayBuffer());let out='';
        const slideNames=Object.keys(zip.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/i.test(k)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
        for(const name of slideNames){const xml=await zip.files[name].async('text');const text=xml.replace(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi,' $1 ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();if(text)out+='\n--- '+name+' ---\n'+text}
        return out.trim();
      }
      return '';
    }
    return '';
  }

  async function db(){if(window.db)return window.db;if(!window.supabase)await loadExternal('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');window.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);return window.db}
  function fileMime(f){return String(f.type||'application/octet-stream').split(';')[0].trim().toLowerCase()}
  function isVisionFile(f){const m=fileMime(f),e=ext(f.name||'');return VISION_MIMES.has(m)||(e==='pdf'||['jpg','jpeg','png','webp','gif','bmp','svg'].includes(e))}
  async function stageFilesForAi(files){
    const client=await db(),urls=[],mimeTypes=[];
    for(const file of files){
      const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`flashcard-temp/${Date.now()}-${Math.random().toString(36).slice(2,10)}-${safe}`;
      const up=await client.storage.from('support-media').upload(path,file,{contentType:fileMime(file),upsert:false});
      if(up.error)throw new Error(`Upload ${file.name||'tài liệu'} thất bại: ${up.error.message||up.error}`);
      const url=client.storage.from('support-media').getPublicUrl(path)?.data?.publicUrl;if(!url)throw new Error('Không lấy được URL tài liệu.');
      urls.push(url);mimeTypes.push(fileMime(file));
    }
    return {urls,mimeTypes};
  }

  function css(){if($('exam-builder-v3-style'))return;const s=document.createElement('style');s.id='exam-builder-v3-style';s.textContent=`
    #examBuilderV2{width:100%;max-width:100%;overflow:visible}.eb2-panel{overflow:hidden}.eb2-file-name{min-width:0}.eb2-file{min-width:0}.eb2-actions{align-items:center}.eb2-primary,.eb2-secondary{min-height:44px}.eb2-drop{touch-action:manipulation}.eb2-file button{touch-action:manipulation}
    @media(max-width:800px){html,body{overflow-x:hidden}.workspace{width:auto!important;min-width:0!important;margin-left:64px!important;padding:16px 10px 36px!important}.sidebar{position:fixed!important;left:0;top:0;width:64px!important;height:100dvh!important;padding:10px 8px!important;z-index:100}.sidebar-top{padding:4px 0 10px!important;display:grid!important;place-items:center;gap:8px}.brand-row>div,.admin-profile>div,#adminNav .nav-item span,.sidebar-bottom .nav-item span{display:none!important}.brand-row{gap:0!important}.brand-orb{width:42px!important;height:42px!important}.admin-profile{justify-content:center;margin:5px 0 12px!important;padding:11px 0!important}.admin-profile .online-dot{width:8px;height:8px}.icon-btn{width:38px;height:38px}.sidebar #adminNav{gap:4px}.sidebar .nav-item{justify-content:center;padding:11px 0!important;min-height:42px;gap:0}.sidebar .nav-item i{display:none!important}.sidebar-bottom{gap:4px}.topbar{gap:10px}.topbar h1{font-size:22px}.two-col,.form-grid,.stats-grid{grid-template-columns:1fr!important}.quick-grid{grid-template-columns:1fr 1fr!important}.section-head{align-items:flex-start}.section-head p{line-height:1.45}.messenger{height:calc(100dvh - 180px);min-height:480px;grid-template-columns:1fr!important}.conversation-list{display:none}.composer{padding:8px}.eb2-panel{padding:14px!important;border-radius:18px!important}.eb2-mode{grid-template-columns:1fr!important;gap:8px}.eb2-mode button{padding:13px!important}.eb2-grid{grid-template-columns:1fr!important;gap:11px}.eb2-field.full{grid-column:auto!important}.eb2-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:8px}.eb2-primary,.eb2-secondary{width:100%!important}.eb2-hint{font-size:11px}.eb2-file{padding:9px!important}.eb2-file-name{font-size:12px}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.table-wrap table{min-width:620px}.hero{min-height:auto!important;padding:20px!important}.hero h2{font-size:23px}.hero-orb{display:none}.stat-card{padding:15px}.assistant-messages{height:calc(100dvh - 310px)!important}.copilot .composer textarea{font-size:16px!important}}
    @media(max-width:420px){.workspace{margin-left:58px!important;padding:12px 6px 30px!important}.sidebar{width:58px!important}.quick-grid{grid-template-columns:1fr!important}.eb2-actions{grid-template-columns:1fr!important}.top-actions .live-pill{display:none}}
  `;document.head.appendChild(s)}

  function renderShell(){const tab=$('tests');if(!tab||$('examBuilderV2'))return;const old=tab.querySelector('.two-col');if(!old)return;const root=document.createElement('div');root.id='examBuilderV2';root.innerHTML=`<div class="eb2-panel"><div class="eb2-head"><div><h3 class="eb2-title">🤖 Tạo nội dung học tập bằng AI</h3><p class="eb2-sub">Chọn <b>Flashcard</b> để tạo riêng bộ từ vựng. Chọn <b>Trắc nghiệm</b> để tạo bài kiểm tra. Hỗ trợ PDF, ảnh, Word, Excel, PowerPoint và tệp văn bản phổ biến.</p></div><span id="eb2ModeBadge" class="eb2-count">Trắc nghiệm</span></div>
    <div class="eb2-mode"><button type="button" id="eb2QuizMode" class="active"><b>📝 Trắc nghiệm</b><small>MCQ · Đúng/Sai · Trả lời ngắn</small></button><button type="button" id="eb2FlashMode"><b>📚 Flashcard từ vựng</b><small>AI đọc toàn bộ tài liệu, kể cả bảng và ảnh</small></button></div>
    <div id="eb2Drop" class="eb2-drop"><div class="eb2-drop-top"><span class="eb2-upload-icon">↑</span><div><b>Thêm tài liệu</b><div class="eb2-hint">Bấm để chọn hoặc kéo thả nhiều PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX/TXT/CSV/RTF/MD và ảnh JPG/PNG/WEBP/GIF/BMP/SVG.</div></div></div><input id="eb2File" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.rtf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,image/*" hidden><div id="eb2Files" class="eb2-files"></div></div>
    <div id="eb2Multi" class="eb2-note eb2-hidden" style="margin-top:12px">📚 Đã chọn nhiều nguồn. Bạn có thể yêu cầu AI <b>kết hợp Unit</b>, chia tỷ lệ hoặc trộn toàn bộ dữ liệu.</div>
    <div class="eb2-grid"><div class="eb2-field"><label>Tên bài</label><input id="eb2Title" placeholder="Ví dụ: Unit 1 + Unit 2 · Ôn tập"></div><div class="eb2-field"><label>Môn</label><select id="eb2Subject"><option>Tiếng Anh</option><option>Toán</option><option>Ngữ Văn</option></select></div><div class="eb2-field"><label>Độ khó</label><select id="eb2Level"><option>Dễ</option><option selected>Trung bình</option><option>Khó</option></select></div><div class="eb2-field"><label id="eb2CountLabel">Số câu</label><input id="eb2Count" type="number" min="1" max="100" value="20"></div><div class="eb2-field" id="eb2DurationWrap"><label>Thời gian (phút)</label><input id="eb2Duration" type="number" min="1" value="45"></div><div class="eb2-field full" id="eb2TypesWrap"><label>Dạng câu hỏi</label><div class="eb2-types"><label><input type="checkbox" value="mcq" checked> Trắc nghiệm 4 lựa chọn</label><label><input type="checkbox" value="true_false"> Đúng / Sai</label><label><input type="checkbox" value="short"> Trả lời ngắn</label></div></div><div class="eb2-field full"><label id="eb2PromptLabel">💬 Yêu cầu riêng cho AI</label><textarea id="eb2Prompt" placeholder="Ví dụ: kết hợp Unit 1 70%, Unit 2 30%, không trùng."></textarea><div class="eb2-hint">Đây là yêu cầu dành cho AI khi có nhiều tài liệu hoặc cần lọc chủ đề.</div></div></div>
    <div id="eb2FlashNote" class="eb2-note eb2-hidden">✨ Flashcard là một giai đoạn học riêng. Sau khi học xong, hệ thống sẽ tạo Test độ nhớ bài từ đúng các từ đã học.</div>
    <div class="eb2-actions"><button type="button" id="eb2Create" class="eb2-primary">🤖 AI đọc file & tạo</button><button type="button" id="eb2Reset" class="eb2-secondary">↺ Chọn lại</button></div><div id="eb2Status" class="eb2-status" aria-live="polite"></div></div>`;old.replaceWith(root);const list=document.createElement('div');list.className='eb2-panel';list.id='eb2Saved';list.innerHTML='<div class="eb2-head"><div><h3 class="eb2-title">📚 Đề đã lưu</h3><p class="eb2-sub">Bài test và bộ flashcard được lưu chung trong hệ thống.</p></div><button type="button" class="eb2-secondary" id="eb2Reload">↻ Làm mới</button></div><div id="eb2TestList"></div>';root.insertAdjacentElement('afterend',list);bind()}

  function renderFiles(){const box=$('eb2Files'),multi=$('eb2Multi');if(!box)return;box.innerHTML=selectedFiles.map((f,i)=>`<div class="eb2-file"><span>📄</span><span class="eb2-file-name" title="${esc(f.name)}">${esc(f.name)}</span><span class="eb2-hint">${(f.size/1024/1024).toFixed(2)} MB</span><button type="button" class="eb2-remove" data-i="${i}" aria-label="Xóa file">×</button></div>`).join('')||'<div class="eb2-hint" style="margin-top:12px">Chưa có tài liệu nào.</div>';box.querySelectorAll('[data-i]').forEach(b=>b.onclick=e=>{e.stopPropagation();selectedFiles.splice(Number(b.dataset.i),1);renderFiles()});multi?.classList.toggle('eb2-hidden',selectedFiles.length<2)}
  function addFiles(list){const seen=new Set(selectedFiles.map(f=>f.name+'|'+f.size+'|'+f.lastModified));Array.from(list||[]).forEach(f=>{const k=f.name+'|'+f.size+'|'+f.lastModified;if(!seen.has(k)){seen.add(k);selectedFiles.push(f)}});renderFiles()}
  function mode(flash){$('eb2QuizMode')?.classList.toggle('active',!flash);$('eb2FlashMode')?.classList.toggle('active',flash);if($('eb2ModeBadge'))$('eb2ModeBadge').textContent=flash?'Flashcard từ vựng':'Trắc nghiệm';$('eb2TypesWrap')?.classList.toggle('eb2-hidden',flash);$('eb2FlashNote')?.classList.toggle('eb2-hidden',!flash);$('eb2DurationWrap')?.classList.toggle('eb2-hidden',flash);if($('eb2CountLabel'))$('eb2CountLabel').textContent=flash?'Số từ / thẻ':'Số câu';if($('eb2PromptLabel'))$('eb2PromptLabel').textContent=flash?'💬 Yêu cầu tạo/kết hợp từ vựng':'💬 Yêu cầu riêng cho AI'}
  function reset(){selectedFiles=[];renderFiles();$('eb2File').value='';$('eb2Title').value='';$('eb2Prompt').value='';$('eb2Status').textContent='';mode(false)}

  async function create(){
    if(busy)return;const status=$('eb2Status'),flash=$('eb2FlashMode')?.classList.contains('active');const title=$('eb2Title').value.trim(),subject=$('eb2Subject').value,difficulty=$('eb2Level').value,count=Math.max(1,Math.min(100,Number($('eb2Count').value||20))),duration=Math.max(1,Number($('eb2Duration').value||45)),instruction=$('eb2Prompt').value.trim();
    if(!selectedFiles.length){status.textContent='⚠️ Hãy thêm ít nhất một tài liệu.';return}if(!title){status.textContent='⚠️ Hãy đặt tên nội dung.';return}
    const types=flash?['flashcard']:[...document.querySelectorAll('#eb2TypesWrap input:checked')].map(x=>x.value);if(!types.length){status.textContent='⚠️ Hãy chọn ít nhất một dạng câu hỏi.';return}
    busy=true;$('eb2Create').disabled=true;
    try{
      let documentText='';const textParts=[];
      for(let i=0;i<selectedFiles.length;i++){const f=selectedFiles[i];status.textContent=`⏳ Đang phân tích ${i+1}/${selectedFiles.length}: ${f.name}`;const t=await extract(f).catch(()=> '');if(t)textParts.push(`\n===== NGUỒN ${i+1}: ${f.name} =====\n${t}`)}
      documentText=textParts.join('\n').slice(0,300000);
      const visionFiles=selectedFiles.filter(isVisionFile);
      if(flash){
        status.textContent='☁️ Đang chuẩn bị tài liệu cho AI Vision...';
        const staged=await stageFilesForAi(visionFiles.length?visionFiles:selectedFiles);
        const sourceUrls=staged.urls;
        const mimeTypes=selectedFiles.map(fileMime);
        status.textContent='🤖 AI đang đọc toàn bộ tài liệu, ảnh và bố cục bảng...';
        const r=await fetch('/api/generate-flashcards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileData:[],mimeTypes,fileNames:selectedFiles.map(f=>f.name),fileName:selectedFiles.map(f=>f.name).join(', '),subject,userInstruction:instruction,sourceFiles:selectedFiles.map(f=>f.name),sourceCount:selectedFiles.length,sourceUrls,documentText})});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`AI endpoint trả HTTP ${r.status}.`);const cards=Array.isArray(d.flashcards)?d.flashcards:(Array.isArray(d.questions)?d.questions:[]);if(!cards.length)throw new Error('AI không tạo được flashcard hợp lệ.');
        const client=await db();const row={title,subject,difficulty,duration:0,question_count:cards.length,questions:cards,status:'active',flashcard_only:true};const ins=await client.from('exams').insert(row).select().single();if(ins.error)throw ins.error;status.textContent=`✅ Đã tạo ${cards.length} flashcard từ ${selectedFiles.length} tài liệu.`;
      }else{
        status.textContent='🤖 AI đang đọc nguồn và tạo bài kiểm tra...';
        let sourceUrls=[];if(visionFiles.length){const staged=await stageFilesForAi(visionFiles);sourceUrls=staged.urls}
        if(!documentText&&!sourceUrls.length)throw new Error('Không đọc được nội dung tài liệu. Với ảnh/PDF scan, hãy thử Flashcard hoặc dùng file rõ hơn.');
        const r=await fetch('/api/generate-exam',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:selectedFiles.map(f=>f.name).join(', '),fileNames:selectedFiles.map(f=>f.name),mimeType:selectedFiles.length===1?fileMime(selectedFiles[0]):'application/octet-stream',documentText,fileData:'',media:[],attachments:[],sourceUrls,sourceFiles:selectedFiles.map(f=>f.name),subject,difficulty,questionCount:count,types,userInstruction:instruction,multiFile:selectedFiles.length>1,sourceCount:selectedFiles.length})});
        const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`AI endpoint trả HTTP ${r.status}.`);if(!Array.isArray(d.questions)||!d.questions.length)throw new Error('AI không trả về nội dung hợp lệ.');
        const client=await db();const row={title,subject,difficulty,duration,question_count:d.questions.length,questions:d.questions,status:'active'};const ins=await client.from('exams').insert(row);if(ins.error)throw ins.error;status.textContent=`✅ Đã tạo ${d.questions.length} câu từ ${selectedFiles.length} tài liệu.`;
      }
      if(typeof window.loadDashboard==='function')window.loadDashboard();if(typeof window.renderTests==='function')window.renderTests();renderSaved();
    }catch(e){status.textContent='❌ '+(e?.message||e)}finally{busy=false;$('eb2Create').disabled=false}
  }
  async function renderSaved(){const box=$('eb2TestList');if(!box)return;try{const client=await db();const {data,error}=await client.from('exams').select('*').order('created_at',{ascending:false}).limit(100);if(error)throw error;box.innerHTML=(data||[]).map(t=>`<div class="eb2-file"><span>${t.flashcard_only?'📚':'📝'}</span><span class="eb2-file-name"><b>${esc(t.title||'Chưa đặt tên')}</b><br><span class="eb2-hint">${esc(t.subject||'—')} · ${Number(t.question_count||0)} ${t.flashcard_only?'thẻ':'câu'} · ${t.flashcard_only?'Flashcard':'Bài kiểm tra'}</span></span><span class="eb2-count">${esc(t.status||'active')}</span></div>`).join('')||'<div class="eb2-hint">Chưa có nội dung.</div>'}catch(e){box.innerHTML='<div class="eb2-hint">Không tải được danh sách: '+esc(e.message)+'</div>'}}
  function bind(){css();$('eb2QuizMode').onclick=()=>mode(false);$('eb2FlashMode').onclick=()=>mode(true);$('eb2Create').onclick=create;$('eb2Reset').onclick=reset;$('eb2Reload').onclick=renderSaved;const drop=$('eb2Drop'),input=$('eb2File');drop.onclick=e=>{if(e.target.closest('[data-i]'))return;input.click()};input.onchange=()=>{addFiles(input.files);input.value=''};['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));renderFiles();mode(false);renderSaved()}
  function boot(){renderShell()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
