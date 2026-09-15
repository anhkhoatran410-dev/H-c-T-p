/* STUDY TH — multimodal Flashcard bridge. */
(function(){
  'use strict';
  if(window.__studyExamVisionBridgeV2)return;
  window.__studyExamVisionBridgeV2=true;
  const originalFetch=window.fetch.bind(window);
  const readAsDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=reject;r.readAsDataURL(file)});
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(!/\/api\/generate-exam(?:\?|$)/.test(url)||!init?.body||String(init.method||'POST').toUpperCase()!=='POST')return originalFetch(input,init);
    let body;try{body=JSON.parse(String(init.body))}catch{return originalFetch(input,init)}
    const types=Array.isArray(body.types)?body.types:[];
    if(!types.includes('flashcard'))return originalFetch(input,init);
    try{
      let fileData=Array.isArray(body.fileData)?body.fileData.filter(Boolean):[];
      let mimeTypes=Array.isArray(body.mimeTypes)?body.mimeTypes:[];
      let fileNames=Array.isArray(body.fileNames)?body.fileNames:[];
      if(!fileData.length&&Array.isArray(body.media)){
        const media=body.media.filter(x=>x?.data).slice(0,8);
        fileData=media.map(x=>x.data);mimeTypes=media.map(x=>x.mimeType||'application/octet-stream');fileNames=media.map(x=>x.fileName||'tài liệu');
      }
      if(!fileData.length&&Array.isArray(body.attachments)){
        const media=body.attachments.filter(x=>x?.fileData).slice(0,8);
        fileData=media.map(x=>x.fileData);mimeTypes=media.map(x=>x.mimeType||'application/octet-stream');fileNames=media.map(x=>x.fileName||'tài liệu');
      }
      if(!fileData.length){
        const el=document.getElementById('eb2File');
        const files=Array.from(el?.files||[]).slice(0,8);
        if(files.length){fileData=await Promise.all(files.map(readAsDataURL));mimeTypes=files.map(f=>f.type||'application/octet-stream');fileNames=files.map(f=>f.name||'tài liệu')}
      }
      body.fileData=fileData;body.mimeTypes=mimeTypes;body.fileNames=fileNames;
      return originalFetch('/api/generate-flashcards',{...init,body:JSON.stringify(body)});
    }catch(e){console.warn('[STUDY flashcard bridge v3]',e);return originalFetch(input,init)}
  };
})();
