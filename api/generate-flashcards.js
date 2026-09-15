/* STUDY TH — Flashcard AI endpoint. PDF/images use Gemini Files API first, then direct multimodal fallback. */
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const fail=(status,error,extra={})=>res.status(status).json({error:String(error||'Lỗi máy chủ khi tạo flashcard.'),...extra});
  const withTimeout=async(fn,ms,label)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fn(c.signal)}catch(e){if(e?.name==='AbortError')throw Object.assign(new Error(`${label} quá thời gian chờ.`),{status:504});throw e}finally{clearTimeout(t)}};
  const mimeOf=(mime,name)=>{const m=String(mime||'').split(';')[0].trim().toLowerCase();if(m&&m!=='application/octet-stream')return m;const n=String(name||'').toLowerCase();if(n.endsWith('.pdf'))return'application/pdf';if(n.endsWith('.png'))return'image/png';if(n.endsWith('.jpg')||n.endsWith('.jpeg'))return'image/jpeg';if(n.endsWith('.webp'))return'image/webp';if(n.endsWith('.gif'))return'image/gif';return m||'application/octet-stream'};
  const clean64=v=>String(v||'').trim().replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  try{
    const b=req.body||{};
    const text=String(b.documentText||'').slice(0,90000).trim();
    const instruction=String(b.userInstruction||'').trim().slice(0,12000);
    const raw=Array.isArray(b.fileData)?b.fileData:(b.fileData?[b.fileData]:[]);
    const mimes=Array.isArray(b.mimeTypes)?b.mimeTypes:[];
    const names=Array.isArray(b.sourceFiles)?b.sourceFiles:(Array.isArray(b.fileNames)?b.fileNames:[]);
    const sourceUrls=Array.isArray(b.sourceUrls)?b.sourceUrls.filter(x=>/^https:\/\//i.test(String(x||''))).slice(0,8):[];
    const media=[];
    raw.forEach((v,i)=>{const d=clean64(v);if(d)media.push({buffer:Buffer.from(d,'base64'),mimeType:mimeOf(mimes[i]||b.mimeType,names[i]||b.fileName),fileName:String(names[i]||b.fileName||`tài liệu ${i+1}`)})});
    for(let i=0;i<sourceUrls.length;i++){
      const fr=await withTimeout(s=>fetch(sourceUrls[i],{redirect:'follow',signal:s}),30000,'Tải tài liệu');
      if(!fr.ok)throw Object.assign(new Error(`Không đọc được tài liệu đã tải lên (HTTP ${fr.status}).`),{status:502});
      const buf=Buffer.from(await withTimeout(s=>fr.arrayBuffer(),30000,'Đọc tài liệu'));
      if(buf.length>50*1024*1024)throw Object.assign(new Error(`${names[i]||`Tài liệu ${i+1}`} vượt giới hạn 50 MB của Gemini.`),{status:413});
      media.push({buffer:buf,mimeType:mimeOf(fr.headers.get('content-type')||mimes[i],names[i]||sourceUrls[i]),fileName:String(names[i]||`tài liệu ${i+1}`)});
    }
    if(!text&&!media.length)return fail(400,'Thiếu nội dung tài liệu hoặc ảnh/PDF.');
    const key=String(process.env.GEMINI_API_KEY||'').replace(/^[\'"`]+|[\'"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();
    if(!key)return fail(503,'GEMINI_API_KEY chưa được cấu hình trên Vercel.');

    const prompt=`Bạn là hệ thống phân tích từ vựng chuyên xử lý giáo trình, PDF scan, ảnh chụp bảng và tài liệu học tập cho STUDY TH.

MỤC TIÊU: Đọc TOÀN BỘ nguồn tài liệu và CHỈ lấy những mục THỰC SỰ LÀ MỤC TỪ VỰNG để tạo Flashcard.

NHẬN DIỆN THEO BỐ CỤC:
- Ưu tiên hình ảnh/bố cục/trình bày hơn OCR text phụ trợ.
- Nếu có bảng Word, Vocabulary, Term, Expression, Transcription, Pronunciation, Meaning, Definition, Example hoặc For example thì xác định đúng từng cột.
- Word/Vocabulary/Term/Expression = front; Meaning/Definition = back; Transcription/Pronunciation = phonetic; Example/For example = example.
- Ghép dữ liệu theo ĐÚNG CÙNG MỘT HÀNG.
- Giữ nguyên từ/cụm từ, kể cả phrasal verb, collocation, noun phrase và mẫu something; không tự tách cụm.
- Không tự thêm từ ngoài tài liệu. IPA chỉ lấy khi nhìn thấy trong nguồn.
- Bỏ Unit/chapter/title/số trang/header/footer/watermark/URL/email/copyright/hướng dẫn.
- Đọc tất cả file, gộp theo yêu cầu và loại trùng theo front.
- Nếu chỉ có ít mục hợp lệ thì trả đúng số đó, không bịa cho đủ.

ĐẶC BIỆT CHO BẢNG UNIT TIẾNG ANH:
Nếu có dạng Word | Transcription | Meaning | For example, mỗi hàng hợp lệ là một thẻ. Giữ nguyên các cụm như `devote something to doing something`.

YÊU CẦU RIÊNG:
${instruction||'(Không có yêu cầu thêm)'}

CHỈ TRẢ JSON THUẦN:
{"flashcards":[{"type":"flashcard","front":"...","back":"...","phonetic":"...","example":"...","source":"..."}]}`;

    const models=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash'];
    const callGemini=async(parts)=>{
      let last='Gemini không phản hồi.';
      for(const model of models){
        try{
          const payload={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:12000}};
          const rr=await withTimeout(s=>fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload),signal:s}),120000,`Gemini ${model}`);
          const tx=await rr.text();let p={};try{p=tx?JSON.parse(tx):{}}catch{}
          if(rr.ok)return{data:p,model};
          last=`${model} HTTP ${rr.status}${p?.error?.message?`: ${p.error.message}`:''}`;
          if(![400,404,429,500,503].includes(rr.status))break;
        }catch(e){last=`${model}: ${e?.message||String(e)}`;}
      }
      throw Object.assign(new Error(last),{status:502});
    };

    /* First try Gemini Files API. This is the reliable path for PDFs/scans and avoids huge JSON bodies. */
    const fileRefs=[];
    let filesError='';
    for(const item of media){
      try{
        const start=await withTimeout(s=>fetch('https://generativelanguage.googleapis.com/upload/v1beta/files',{method:'POST',signal:s,headers:{'x-goog-api-key':key,'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(item.buffer.length),'X-Goog-Upload-Header-Content-Type':item.mimeType,'Content-Type':'application/json'},body:JSON.stringify({file:{display_name:item.fileName.slice(0,120)}})}),20000,'Khởi tạo Gemini Files API');
        const st=await start.text();let sp={};try{sp=st?JSON.parse(st):{}}catch{}
        if(!start.ok)throw new Error(`HTTP ${start.status}${sp?.error?.message?`: ${sp.error.message}`:''}`);
        const uploadUrl=start.headers.get('x-goog-upload-url');if(!uploadUrl)throw new Error('Không nhận được upload URL.');
        const fin=await withTimeout(s=>fetch(uploadUrl,{method:'POST',signal:s,headers:{'Content-Length':String(item.buffer.length),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','Content-Type':item.mimeType},body:item.buffer}),90000,'Tải file lên Gemini');
        const ft=await fin.text();let fp={};try{fp=ft?JSON.parse(ft):{}}catch{}
        if(!fin.ok)throw new Error(`HTTP ${fin.status}${fp?.error?.message?`: ${fp.error.message}`:''}`);
        const f=fp?.file||fp;if(!f?.uri)throw new Error('Gemini không trả file URI.');
        fileRefs.push({uri:String(f.uri),mimeType:String(f.mimeType||item.mimeType),name:String(f.name||''),fileName:item.fileName});
      }catch(e){filesError=`${item.fileName}: ${e?.message||String(e)}`;break}
    }

    let result=null;
    if(fileRefs.length===media.length){
      const parts=[{text:prompt}];
      if(text)parts.push({text:`\nTEXT PHỤ TRỢ — chỉ đối chiếu, không thay thế tài liệu gốc:\n${text}`});
      fileRefs.forEach((f,i)=>{parts.push({text:`\n=== NGUỒN ${i+1}: ${f.fileName} ===`});parts.push({file_data:{mime_type:f.mimeType,file_uri:f.uri}})});
      try{result=await callGemini(parts)}catch(e){filesError=`Files API generation: ${e?.message||String(e)}`;result=null}
    }

    /* Fallback: direct inlineData. For the user's ~3 MB PDF this stays safely below Gemini's PDF input limit and proves the model path independently. */
    if(!result){
      const total=media.reduce((n,x)=>n+x.buffer.length,0);
      if(total>40*1024*1024)throw Object.assign(new Error(`Tài liệu quá lớn cho chế độ dự phòng. ${filesError}`),{status:413});
      const parts=[{text:prompt}];
      if(text)parts.push({text:`\nTEXT PHỤ TRỢ:\n${text}`});
      media.forEach((x,i)=>{parts.push({text:`\n=== NGUỒN ${i+1}: ${x.fileName} ===`});parts.push({inlineData:{mimeType:x.mimeType,data:x.buffer.toString('base64')}})});
      try{result=await callGemini(parts)}catch(e){throw Object.assign(new Error(`Gemini không tạo được nội dung. Files API: ${filesError||'không rõ'}; Fallback: ${e?.message||String(e)}`),{status:502})}
    }

    const out=result?.data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
    const clean=out.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    const a=clean.indexOf('{'),z=clean.lastIndexOf('}');
    if(a<0||z<=a)return fail(502,'Gemini không trả về JSON flashcard hợp lệ.',{model:result.model});
    let obj;try{obj=JSON.parse(clean.slice(a,z+1))}catch(e){return fail(502,'Gemini trả về JSON lỗi định dạng.',{model:result.model})}
    const seen=new Set();
    const cards=(Array.isArray(obj.flashcards)?obj.flashcards:[]).map(c=>({type:'flashcard',front:String(c?.front||'').trim(),back:String(c?.back||'').trim(),phonetic:String(c?.phonetic||'').trim(),example:String(c?.example||'').trim(),explanation:'',source:String(c?.source||'').trim()})).filter(c=>{const k=c.front.toLowerCase().replace(/\s+/g,' ');if(!c.front||!c.back||seen.has(k))return false;seen.add(k);return true}).slice(0,100);
    if(!cards.length)return fail(422,'AI đã đọc tài liệu nhưng không xác định được mục từ vựng hợp lệ.',{model:result.model});
    return res.status(200).json({questions:cards,flashcards:cards,provider:'gemini',model:result.model,vision:media.length>0,sourceCount:Math.max(1,media.length),validated:true});
  }catch(e){
    console.error('generate-flashcards:',e);
    const s=Number(e?.status);return fail([400,413,415,422,502,503,504].includes(s)?s:500,e?.message||'Lỗi máy chủ khi tạo flashcard.');
  }
}
