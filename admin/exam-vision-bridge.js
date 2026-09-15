/* STUDY TH — route Flashcard generation through the dedicated multimodal endpoint. */
(function(){
  'use strict';
  if(window.__studyExamVisionBridge)return;
  window.__studyExamVisionBridge=true;

  const originalFetch=window.fetch.bind(window);
  const toBase64=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)});

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(!/\/api\/generate-exam(?:\?|$)/.test(url) || !init?.body || String(init.method||'POST').toUpperCase()!=='POST'){
      return originalFetch(input,init);
    }
    let body;
    try{body=JSON.parse(String(init.body));}catch{return originalFetch(input,init);}
    const types=Array.isArray(body.types)?body.types:[];
    if(!types.includes('flashcard'))return originalFetch(input,init);

    try{
      const hasMedia=(Array.isArray(body.media)&&body.media.some(x=>x?.data)) ||
        (Array.isArray(body.attachments)&&body.attachments.some(x=>x?.fileData)) ||
        !!body.fileData;
      if(!hasMedia){
        const inputEl=document.getElementById('eb2File');
        const files=Array.from(inputEl?.files||[]).slice(0,8);
        if(files.length){
          const fileData=await Promise.all(files.map(toBase64));
          body.fileData=fileData;
          body.mimeTypes=files.map(f=>f.type||'application/octet-stream');
          body.fileNames=files.map(f=>f.name||'tài liệu');
        }
      }else if(!body.fileData && Array.isArray(body.media)){
        const usable=body.media.filter(x=>x?.data).slice(0,8);
        if(usable.length){
          body.fileData=usable.map(x=>x.data);
          body.mimeTypes=usable.map(x=>x.mimeType||'application/octet-stream');
        }
      }
      return originalFetch('/api/generate-flashcards',{...init,body:JSON.stringify(body)});
    }catch(e){
      console.warn('[STUDY vision bridge]',e);
      return originalFetch(input,init);
    }
  };
})();
