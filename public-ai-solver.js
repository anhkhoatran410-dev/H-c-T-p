/* STUDY TH — student AI solver: camera/file input + deep solver routing. */
(function(){
  if(window.__studyStudentSolverInstalled)return;window.__studyStudentSolverInstalled=true;

  const MAX_IMAGE_BYTES=12*1024*1024;
  const MAX_IMAGE_EDGE=1400;
  const CAMERA_RESTORE_KEY='study_ai_restore_after_camera';

  function openImageViewer(src,alt='Ảnh đề bài'){
    if(!src)return;
    let viewer=document.querySelector('[data-study-image-viewer]');
    if(!viewer){
      viewer=document.createElement('div');
      viewer.dataset.studyImageViewer='1';
      viewer.innerHTML='<button type="button" aria-label="Đóng ảnh" data-close>×</button><div data-image-wrap><img alt=""></div>';
      viewer.style.cssText='position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;cursor:zoom-out';
      const wrap=viewer.querySelector('[data-image-wrap]');wrap.style.cssText='max-width:100%;max-height:100%;display:flex;align-items:center;justify-content:center;cursor:default';
      const img=viewer.querySelector('img');img.style.cssText='max-width:100%;max-height:calc(100dvh - 56px);object-fit:contain;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.5)';
      viewer.querySelector('[data-close]').style.cssText='position:absolute;top:max(12px,env(safe-area-inset-top));right:14px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;cursor:pointer;z-index:2';
      viewer.addEventListener('click',e=>{if(e.target===viewer||e.target.closest('[data-close]'))viewer.remove()});document.body.appendChild(viewer);
    }
    const img=viewer.querySelector('img');img.src=src;img.alt=alt;viewer.style.display='flex';
  }

  function addSentImage(messageBubble,img){
    if(!img||!messageBubble)return;
    const textNodes=[...messageBubble.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    textNodes.forEach(n=>{const span=document.createElement('span');span.className='study-ai-user-text';span.textContent=n.textContent.trim();n.replaceWith(span)});
    messageBubble.style.background='transparent';messageBubble.style.padding='0';messageBubble.style.boxShadow='none';messageBubble.style.alignItems='flex-end';
    const wrap=document.createElement('div');wrap.className='study-ai-image-in-message';
    const thumb=document.createElement('img');thumb.src=img;thumb.alt='Ảnh đề bài đã gửi';thumb.loading='lazy';
    const hint=document.createElement('span');hint.textContent='Nhấn để xem ảnh';
    thumb.addEventListener('click',()=>openImageViewer(img,thumb.alt));wrap.appendChild(thumb);wrap.appendChild(hint);messageBubble.appendChild(wrap);
  }

  function addComposerTools(){
    const modal=document.getElementById('study-ai-support');if(!modal)return;
    const form=modal.querySelector('#studyAiForm');if(!form)return;
    const ta=form.querySelector('textarea');if(!ta)return;
    if(!form.querySelector('[data-study-photo]')){
      const tools=document.createElement('div');tools.className='study-ai-tools';tools.style.cssText='display:flex;gap:8px;margin:8px 0 0;align-items:center;flex-wrap:wrap';
      tools.innerHTML='<button type="button" class="theme-chip" data-study-photo>📷 Chụp đề</button><button type="button" class="theme-chip" data-study-file>🖼️ Chọn ảnh</button><label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-study-deep checked> Suy luận sâu</label><input type="file" data-study-image-input accept="image/*" capture="environment" hidden>';
      form.insertBefore(tools,ta);
      tools.querySelector('[data-study-photo]').onclick=()=>{try{sessionStorage.setItem(CAMERA_RESTORE_KEY,'1')}catch(_e){};const i=tools.querySelector('[data-study-image-input]');i.setAttribute('capture','environment');i.click()};
      tools.querySelector('[data-study-file]').onclick=e=>{e.preventDefault();e.stopPropagation();const i=tools.querySelector('[data-study-image-input]');i.removeAttribute('capture');i.click()};
      tools.querySelector('[data-study-image-input]').addEventListener('click',e=>e.stopPropagation());
      tools.querySelector('[data-study-image-input]').addEventListener('change',e=>{e.preventDefault();e.stopPropagation();const file=e.target.files?.[0];if(file)preview(file,modal);e.target.value='';try{sessionStorage.removeItem(CAMERA_RESTORE_KEY)}catch(_e){};requestAnimationFrame(()=>modal.classList.remove('hidden'))});
    }
    if(!form.dataset.studyBound){
      form.dataset.studyBound='1';
      form.onsubmit=async function(e){
        e.preventDefault();e.stopImmediatePropagation();if(form.dataset.studyBusy==='1')return;
        const text=ta.value.trim(),img=form.__studyImageData||'';if(!text&&!img)return;
        const box=modal.querySelector('#studyAiMessages');if(!box)return;
        const userText=text||'Giải bài trong ảnh này.',deep=form.querySelector('[data-study-deep]')?.checked;
        const history=[...box.querySelectorAll('.study-ai-msg:not([data-study-thinking])')].map(x=>({role:x.classList.contains('user')?'user':'assistant',message:x.textContent.trim()})).filter(x=>x.message).slice(-8);
        const userMsg=document.createElement('div');userMsg.className='study-ai-msg user';userMsg.textContent=userText+(img?' 📷':'');if(img)addSentImage(userMsg,img);box.appendChild(userMsg);
        const thinking=document.createElement('div');thinking.className='study-ai-msg bot study-ai-thinking';thinking.dataset.studyThinking='1';thinking.setAttribute('aria-label','Đang xử lý');thinking.innerHTML='<span></span><span></span><span></span>';box.appendChild(thinking);box.scrollTop=box.scrollHeight;ta.value='';form.dataset.studyBusy='1';
        const submit=form.querySelector('[type="submit"]');if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');submit.setAttribute('aria-label','Gửi');submit.textContent='➤'}
        try{
          const subject=(window.state&&window.state.subject)||'',message=userText+(deep?'\nHãy tự kiểm tra kỹ các bước và kết quả, tìm cách giải từ bản chất, và trình bày đầy đủ đến kết luận; không bỏ qua phần chứng minh quan trọng.':'\nHãy giải đầy đủ từ dữ kiện đến kết luận, nêu ý tưởng cốt lõi và kiểm tra kết quả.');
          const r=await fetch('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,subject,history,imageDataUrl:img})});
          const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('Solver HTTP '+r.status));
          thinking.remove();const answer=String(d.answer||'Mình chưa có câu trả lời.');const msg=document.createElement('div');msg.className='study-ai-msg bot';msg.style.whiteSpace='pre-wrap';msg.textContent=answer;box.appendChild(msg);
          if(d.tool){const tag=document.createElement('div');tag.className='study-ai-tool-tag';tag.textContent='🔎 Kiểm chứng: '+String(d.tool);msg.appendChild(tag)}
          if(window.MathJax?.typesetPromise){try{await window.MathJax.typesetPromise([msg])}catch(_e){}}
          box.scrollTop=box.scrollHeight;form.__studyImageData='';const pv=form.querySelector('[data-study-image-preview]');if(pv)pv.remove();
        }catch(err){thinking.textContent='⚠️ '+String(err.message||err);thinking.classList.remove('study-ai-thinking')}
        finally{form.dataset.studyBusy='0';if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');submit.setAttribute('aria-label','Gửi');submit.textContent='➤'}}
      };
    }
  }

  async function compressImage(file){
    if(file.size>MAX_IMAGE_BYTES)throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 12 MB.');
    try{const bitmap=await createImageBitmap(file),scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Không thể xử lý ảnh.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return canvas.toDataURL('image/jpeg',0.78)}catch(_e){return await readAsDataURL(file)}
  }
  function readAsDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Không đọc được ảnh.'));reader.readAsDataURL(file)})}
  function preview(file,modal){
    if(!file.type.startsWith('image/'))return;const form=modal.querySelector('#studyAiForm');
    compressImage(file).then(dataUrl=>{form.__studyImageData=dataUrl;let pv=form.querySelector('[data-study-image-preview]');if(!pv){pv=document.createElement('div');pv.dataset.studyImagePreview='1';pv.style.cssText='margin-top:8px;display:flex;align-items:center;gap:8px';pv.innerHTML='<img alt="Ảnh đề bài" style="width:72px;height:54px;object-fit:cover;border-radius:10px;border:1px solid rgba(100,100,140,.25);cursor:zoom-in"><button type="button" class="theme-chip">Xoá ảnh</button>';form.insertBefore(pv,form.querySelector('textarea'));pv.querySelector('button').onclick=e=>{e.preventDefault();e.stopPropagation();form.__studyImageData='';pv.remove()};pv.querySelector('img').onclick=()=>openImageViewer(pv.querySelector('img').src,'Ảnh đề bài')}pv.querySelector('img').src=dataUrl;modal.classList.remove('hidden')}).catch(err=>{form.__studyImageData='';const pv=form.querySelector('[data-study-image-preview]');if(pv)pv.remove();modal.classList.remove('hidden');const box=modal.querySelector('#studyAiMessages');if(box){const msg=document.createElement('div');msg.className='study-ai-msg bot';msg.textContent='⚠️ '+String(err.message||err);box.appendChild(msg);box.scrollTop=box.scrollHeight}})
  }
  function restoreSolverAfterCamera(){try{if(sessionStorage.getItem(CAMERA_RESTORE_KEY)!=='1')return;sessionStorage.removeItem(CAMERA_RESTORE_KEY)}catch(_e){}setTimeout(()=>{const modal=document.getElementById('study-ai-support');if(modal)modal.classList.remove('hidden');addComposerTools()},0)}
  const obs=new MutationObserver(()=>setTimeout(addComposerTools,0));obs.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('pageshow',restoreSolverAfterCamera);window.addEventListener('focus',restoreSolverAfterCamera);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{addComposerTools();restoreSolverAfterCamera()},100));else setTimeout(()=>{addComposerTools();restoreSolverAfterCamera()},100);
})();
