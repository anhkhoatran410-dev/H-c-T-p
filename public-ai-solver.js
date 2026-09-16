/* STUDY TH — student AI solver: camera/file input + deep solver routing. */
(function(){
  if(window.__studyStudentSolverInstalled)return;window.__studyStudentSolverInstalled=true;
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function addComposerTools(){
    const modal=document.getElementById('study-ai-support');if(!modal)return;
    const form=modal.querySelector('#studyAiForm');if(!form)return;
    const ta=form.querySelector('textarea');if(!ta)return;
    if(!form.querySelector('[data-study-photo]')){
      const tools=document.createElement('div');tools.className='study-ai-tools';tools.style.cssText='display:flex;gap:8px;margin:8px 0 0;align-items:center;flex-wrap:wrap';
      tools.innerHTML='<button type="button" class="theme-chip" data-study-photo>📷 Chụp đề</button><button type="button" class="theme-chip" data-study-file>🖼️ Chọn ảnh</button><label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-study-deep checked> Suy luận sâu</label><input type="file" data-study-image-input accept="image/*" capture="environment" hidden>';
      form.insertBefore(tools,ta);
      tools.querySelector('[data-study-photo]').onclick=()=>tools.querySelector('[data-study-image-input]').click();
      tools.querySelector('[data-study-file]').onclick=()=>{const i=tools.querySelector('[data-study-image-input]');i.removeAttribute('capture');i.click()};
      tools.querySelector('[data-study-image-input]').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)preview(file,modal);});
    }
    if(!form.dataset.studyBound){
      form.dataset.studyBound='1';
      form.onsubmit=async function(e){
        e.preventDefault();e.stopImmediatePropagation();
        const text=ta.value.trim();const img=form.__studyImageData||'';if(!text&&!img)return;
        const box=modal.querySelector('#studyAiMessages');
        const userText=text||'Giải bài trong ảnh này.';
        box.insertAdjacentHTML('beforeend','<div class="study-ai-msg user">'+esc(userText)+(img?' 📷':'')+'</div><div class="study-ai-msg bot" data-study-thinking>Đang đọc đề và kiểm tra lời giải…</div>');box.scrollTop=box.scrollHeight;
        ta.value='';
        try{
          const subject=(window.state&&window.state.subject)||'';
          const deep=form.querySelector('[data-study-deep]')?.checked;
          const history=[...box.querySelectorAll('.study-ai-msg')].slice(-10).map(x=>({role:x.classList.contains('user')?'user':'assistant',message:x.textContent}));
          const r=await fetch('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:userText+(deep?'\nHãy kiểm tra độc lập ít nhất 2 lần trước khi kết luận.':''),subject,history,imageDataUrl:img})});
          const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('Solver HTTP '+r.status));
          box.querySelector('[data-study-thinking]')?.remove();
          const tag=d.tool?'<div style="font-size:11px;opacity:.65;margin-top:5px">🔎 Kiểm chứng: '+esc(d.tool)+'</div>':'';
          box.insertAdjacentHTML('beforeend','<div class="study-ai-msg bot">'+esc(d.answer||'Mình chưa có câu trả lời.')+tag+'</div>');box.scrollTop=box.scrollHeight;
          form.__studyImageData='';
          const pv=form.querySelector('[data-study-image-preview]');if(pv)pv.remove();
        }catch(err){const t=box.querySelector('[data-study-thinking]');if(t)t.textContent='⚠️ '+String(err.message||err)}
      };
    }
  }
  function preview(file,modal){
    if(!file.type.startsWith('image/'))return;
    const reader=new FileReader();reader.onload=()=>{
      const form=modal.querySelector('#studyAiForm');form.__studyImageData=String(reader.result||'');
      let pv=form.querySelector('[data-study-image-preview]');if(!pv){pv=document.createElement('div');pv.dataset.studyImagePreview='1';pv.style.cssText='margin-top:8px;display:flex;align-items:center;gap:8px';pv.innerHTML='<img style="width:64px;height:64px;object-fit:cover;border-radius:10px;border:1px solid rgba(100,100,140,.25)"><button type="button" class="theme-chip">Xoá ảnh</button>';form.insertBefore(pv,form.querySelector('textarea'));pv.querySelector('button').onclick=()=>{form.__studyImageData='';pv.remove()}}
      pv.querySelector('img').src=String(reader.result||'');
    };reader.readAsDataURL(file);
  }
  const obs=new MutationObserver(()=>setTimeout(addComposerTools,0));obs.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(addComposerTools,100));else setTimeout(addComposerTools,100);
})();
