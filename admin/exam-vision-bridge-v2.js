/* STUDY TH — flashcard transport bridge. Keeps large PDFs out of Vercel request bodies. */
(function(){
  'use strict';
  if(window.__studyExamVisionBridgeV3)return;
  window.__studyExamVisionBridgeV3=true;

  const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
  const SUPABASE_KEY='sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
  const originalFetch=window.fetch.bind(window);
  const loadSupabase=()=>new Promise((resolve,reject)=>{
    if(window.supabase?.createClient)return resolve(window.supabase);
    const src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    const old=[...document.scripts].find(s=>s.src===src);
    if(old){old.addEventListener('load',()=>resolve(window.supabase));old.addEventListener('error',reject);return;}
    const s=document.createElement('script');s.src=src;s.onload=()=>resolve(window.supabase);s.onerror=reject;document.head.appendChild(s);
  });

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input?.url||'');
    if(!/\/api\/generate-exam(?:\?|$)/.test(url)||!init?.body||String(init.method||'POST').toUpperCase()!=='POST')return originalFetch(input,init);
    let body;try{body=JSON.parse(String(init.body))}catch{return originalFetch(input,init)}
    if(!Array.isArray(body.types)||!body.types.includes('flashcard'))return originalFetch(input,init);

    try{
      const el=document.getElementById('eb2File');
      const files=Array.from(el?.files||[]).slice(0,8);
      if(files.length){
        const sb=await loadSupabase();
        const client=sb.createClient(SUPABASE_URL,SUPABASE_KEY);
        const urls=[];
        for(const file of files){
          const safe=(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');
          const path=`flashcard-temp/${Date.now()}-${Math.random().toString(36).slice(2,10)}-${safe}`;
          const up=await client.storage.from('support-media').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
          if(up.error)throw up.error;
          const pub=client.storage.from('support-media').getPublicUrl(path);
          if(!pub?.data?.publicUrl)throw new Error('Không lấy được URL tài liệu đã tải lên.');
          urls.push(pub.data.publicUrl);
        }
        /* Keep payload small: the server fetches the staged originals itself. */
        body.fileData=[];
        body.sourceUrls=urls;
        body.fileNames=files.map(f=>f.name||'tài liệu');
        body.sourceFiles=files.map(f=>f.name||'tài liệu');
      }
      return originalFetch('/api/generate-flashcards',{...init,body:JSON.stringify(body)});
    }catch(e){
      console.warn('[STUDY flashcard transport]',e);
      return originalFetch('/api/generate-flashcards',{...init,body:JSON.stringify(body)});
    }
  };
})();
