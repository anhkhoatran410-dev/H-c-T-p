/* STUDY TH — preserve original PDF/image/DOCX bytes for Gemini math extraction. */
(function(){
  if(window.__studyMathFileInputFix)return;
  window.__studyMathFileInputFix=true;
  const MAX_BYTES=3*1024*1024;
  function dataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Không đọc được file'));r.readAsDataURL(file)})}
  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(!/\/api\/generate-exam(?:\?|$)/.test(url)||!init||typeof init.body!=='string')return originalFetch(input,init);
    try{
      const body=JSON.parse(init.body),file=document.getElementById('file')?.files?.[0];
      if(file&&!body.fileData&&file.size<=MAX_BYTES){
        body.fileData=await dataUrl(file);body.mimeType=file.type||body.mimeType||'application/octet-stream';body.__sourceFileVision=true;
        init={...init,body:JSON.stringify(body),headers:{...(init.headers||{}),'Content-Type':'application/json'}};
      }
    }catch(e){console.warn('Math file input fix:',e)}
    return originalFetch(input,init);
  };
})();
