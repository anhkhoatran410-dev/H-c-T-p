/* STUDY TH — student AI solver: camera/file input + deep solver routing. */
(function(){
  if(window.__studyStudentSolverInstalled)return;window.__studyStudentSolverInstalled=true;

  const MAX_IMAGE_BYTES=12*1024*1024;
  const MAX_IMAGE_EDGE=1600;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function addComposerTools(){
    const modal=document.getElementById('study-ai-support');if(!modal)return;
    const form=modal.querySelector('#studyAiForm');if(!form)return;
    const ta=form.querySelector('textarea');if(!ta)return;

    if(!form.querySelector('[data-study-photo]')){
      const tools=document.createElement('div');
      tools.className='study-ai-tools';
      tools.style.cssText='display:flex;gap:8px;margin:8px 0 0;align-items:center;flex-wrap:wrap';
      tools.innerHTML='<button type="button" class="theme-chip" data-study-photo>📷 Chụp đề</button><button type="button" class="theme-chip" data-study-file>🖼️ Chọn ảnh</button><label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-study-deep checked> Suy luận sâu</label><input type="file" data-study-image-input accept="image/*" capture="environment" hidden>';
      form.insertBefore(tools,ta);
      tools.querySelector('[data-study-photo]').onclick=()=>tools.querySelector('[data-study-image-input]').click();
      tools.querySelector('[data-study-file]').onclick=()=>{const i=tools.querySelector('[data-study-image-input]');i.removeAttribute('capture');i.click()};
      tools.querySelector('[data-study-image-input]').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)preview(file,modal);e.target.value='';});
    }

    if(!form.dataset.studyBound){
      form.dataset.studyBound='1';
      form.onsubmit=async function(e){
        e.preventDefault();e.stopImmediatePropagation();
        if(form.dataset.studyBusy==='1')return;

        const text=ta.value.trim();
        const img=form.__studyImageData||'';
        if(!text&&!img)return;

        const box=modal.querySelector('#studyAiMessages');
        if(!box)return;

        const userText=text||'Giải bài trong ảnh này.';
        const deep=form.querySelector('[data-study-deep]')?.checked;

        const history=[...box.querySelectorAll('.study-ai-msg:not([data-study-thinking])')]
          .map(x=>({role:x.classList.contains('user')?'user':'assistant',message:x.textContent.trim()}))
          .filter(x=>x.message)
          .slice(-8);

        box.insertAdjacentHTML('beforeend','<div class="study-ai-msg user">'+esc(userText)+(img?' 📷':'')+'</div><div class="study-ai-msg bot" data-study-thinking>Đang đọc đề và kiểm tra lời giải…</div>');
        box.scrollTop=box.scrollHeight;
        ta.value='';
        form.dataset.studyBusy='1';

        const submit=form.querySelector('[type="submit"]');
        const oldSubmitText=submit?.textContent||'';
        if(submit){submit.disabled=true;submit.textContent='Đang giải…'}

        try{
          const subject=(window.state&&window.state.subject)||'';
          const message=userText+(deep?'\nHãy kiểm tra độc lập ít nhất 2 lần trước khi kết luận.':'');
          const r=await fetch('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,subject,history,imageDataUrl:img})});
          const d=await r.json().catch(()=>({}));
          if(!r.ok)throw new Error(d.error||('Solver HTTP '+r.status));

          box.querySelector('[data-study-thinking]')?.remove();
          const answer=String(d.answer||'Mình chưa có câu trả lời.');
          const msg=document.createElement('div');
          msg.className='study-ai-msg bot';
          msg.style.whiteSpace='pre-wrap';
          msg.textContent=answer;
          box.appendChild(msg);

          if(d.tool){
            const tag=document.createElement('div');
            tag.style.cssText='font-size:11px;opacity:.65;margin-top:5px';
            tag.textContent='🔎 Kiểm chứng: '+String(d.tool);
            msg.appendChild(tag);
          }

          if(window.MathJax?.typesetPromise){
            try{await window.MathJax.typesetPromise([msg]);}catch(_e){}
          }

          box.scrollTop=box.scrollHeight;
          form.__studyImageData='';
          const pv=form.querySelector('[data-study-image-preview]');if(pv)pv.remove();
        }catch(err){
          const t=box.querySelector('[data-study-thinking]');
          if(t)t.textContent='⚠️ '+String(err.message||err);
        }finally{
          form.dataset.studyBusy='0';
          if(submit){submit.disabled=false;submit.textContent=oldSubmitText}
        }
      };
    }
  }

  async function compressImage(file){
    if(file.size>MAX_IMAGE_BYTES)throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 12 MB.');

    try{
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Không thể xử lý ảnh.');
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      bitmap.close?.();
      return canvas.toDataURL('image/jpeg',0.82);
    }catch(_e){
      return await readAsDataURL(file);
    }
  }

  function readAsDataURL(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(new Error('Không đọc được ảnh.'));
      reader.readAsDataURL(file);
    });
  }

  function preview(file,modal){
    if(!file.type.startsWith('image/'))return;
    const form=modal.querySelector('#studyAiForm');

    compressImage(file).then(dataUrl=>{
      form.__studyImageData=dataUrl;
      let pv=form.querySelector('[data-study-image-preview]');
      if(!pv){
        pv=document.createElement('div');
        pv.dataset.studyImagePreview='1';
        pv.style.cssText='margin-top:8px;display:flex;align-items:center;gap:8px';
        pv.innerHTML='<img alt="Ảnh đề bài" style="width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid rgba(100,100,140,.25)"><button type="button" class="theme-chip">Xoá ảnh</button>';
        form.insertBefore(pv,form.querySelector('textarea'));
        pv.querySelector('button').onclick=()=>{form.__studyImageData='';pv.remove()};
      }
      pv.querySelector('img').src=dataUrl;
    }).catch(err=>{
      form.__studyImageData='';
      let pv=form.querySelector('[data-study-image-preview]');if(pv)pv.remove();
      const box=modal.querySelector('#studyAiMessages');
      if(box){const msg=document.createElement('div');msg.className='study-ai-msg bot';msg.textContent='⚠️ '+String(err.message||err);box.appendChild(msg);box.scrollTop=box.scrollHeight;}
    });
  }

  const obs=new MutationObserver(()=>setTimeout(addComposerTools,0));
  obs.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(addComposerTools,100));
  else setTimeout(addComposerTools,100);
})();
