/* STUDY TH — stable flashcard transport. Large files are staged in Supabase Storage first. */
(function(){
  'use strict';
  if(window.__studyExamVisionBridgeV5)return;
  window.__studyExamVisionBridgeV5=true;

  const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
  const SUPABASE_KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
  const FLASHCARD_ENDPOINT='/api/generate-flashcards';
  const originalFetch=window.fetch.bind(window);

  function loadSupabase(){
    if(window.supabase?.createClient)return Promise.resolve(window.supabase);
    if(window.__studySupabaseLoader)return window.__studySupabaseLoader;
    window.__studySupabaseLoader=new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>s.src.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2'));
      if(existing){
        existing.addEventListener('load',()=>resolve(window.supabase),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Không tải được Supabase JS.')),{once:true});
        return;
      }
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload=()=>resolve(window.supabase);
      s.onerror=()=>reject(new Error('Không tải được Supabase JS.'));
      document.head.appendChild(s);
    });
    return window.__studySupabaseLoader;
  }

  async function stageFiles(files){
    const sb=await loadSupabase();
    const client=sb.createClient(SUPABASE_URL,SUPABASE_KEY);
    const urls=[];const names=[];const mimeTypes=[];
    for(const file of files){
      const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');
      const random=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
      const path=`flashcard-temp/${Date.now()}-${random}-${safe}`;
      const up=await client.storage.from('support-media').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
      if(up.error)throw new Error(`Upload ${file.name||'tài liệu'} thất bại: ${up.error.message||up.error}`);
      const url=client.storage.from('support-media').getPublicUrl(path)?.data?.publicUrl;
      if(!url)throw new Error(`Không tạo được URL cho ${file.name||'tài liệu'}.`);
      urls.push(url);names.push(file.name||'tài liệu');mimeTypes.push(file.type||'application/octet-stream');
    }
    return {urls,names,mimeTypes};
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(!/\/api\/generate-exam(?:\?|$)/.test(url)||!init?.body||String(init.method||'POST').toUpperCase()!=='POST')return originalFetch(input,init);
    let body;try{body=JSON.parse(String(init.body));}catch{return originalFetch(input,init);}
    const types=Array.isArray(body.types)?body.types:[];
    if(!types.includes('flashcard'))return originalFetch(input,init);
    try{
      const inputEl=document.getElementById('eb2File');
      const files=Array.from(inputEl?.files||[]).slice(0,8);
      if(files.length){
        const staged=await stageFiles(files);
        body.fileData=[];
        body.sourceUrls=staged.urls;
        body.sourceFiles=staged.names;
        body.fileNames=staged.names;
        body.mimeTypes=staged.mimeTypes;
      }
      delete body.media;delete body.attachments;
      return originalFetch(FLASHCARD_ENDPOINT,{...init,headers:{'Content-Type':'application/json','Accept':'application/json',...(init.headers||{})},body:JSON.stringify(body)});
    }catch(e){
      console.error('[STUDY flashcard transport]',e);
      return new Response(JSON.stringify({error:'Không thể chuẩn bị tài liệu cho Flashcard. Vui lòng thử lại.'}),{status:502,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    }
  };
})();
