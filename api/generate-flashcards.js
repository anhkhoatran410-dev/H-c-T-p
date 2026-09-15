/* STUDY TH — Flashcard AI endpoint: Gemini Files API + visual document parsing. */
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const fail=(status,error,extra={})=>res.status(status).json({error:String(error||'Lỗi máy chủ khi tạo flashcard.'),...extra});
  const timeout=async(fn,ms,label)=>{
    const ac=new AbortController();
    const t=setTimeout(()=>ac.abort(),ms);
    try{return await fn(ac.signal)}catch(e){
      if(e?.name==='AbortError')throw Object.assign(new Error(`${label} quá thời gian chờ.`),{status:504});
      throw e;
    }finally{clearTimeout(t)}
  };
  const clean64=v=>String(v||'').trim().replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  const safeMime=(mime,name)=>{
    const m=String(mime||'').split(';')[0].trim().toLowerCase();
    if(m&&m!=='application/octet-stream')return m;
    const n=String(name||'').toLowerCase();
    if(n.endsWith('.pdf'))return 'application/pdf';
    if(n.endsWith('.png'))return 'image/png';
    if(n.endsWith('.jpg')||n.endsWith('.jpeg'))return 'image/jpeg';
    if(n.endsWith('.webp'))return 'image/webp';
    if(n.endsWith('.gif'))return 'image/gif';
    if(n.endsWith('.txt'))return 'text/plain';
    if(n.endsWith('.md'))return 'text/markdown';
    if(n.endsWith('.csv'))return 'text/csv';
    if(n.endsWith('.rtf'))return 'application/rtf';
    if(n.endsWith('.docx'))return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return m||'application/octet-stream';
  };

  try{
    const b=req.body||{};
    const text=String(b.documentText||'').slice(0,90000).trim();
    const instruction=String(b.userInstruction||'').trim().slice(0,12000);
    const raw=Array.isArray(b.fileData)?b.fileData:(b.fileData?[b.fileData]:[]);
    const mimes=Array.isArray(b.mimeTypes)?b.mimeTypes:[];
    const names=Array.isArray(b.sourceFiles)?b.sourceFiles:(Array.isArray(b.fileNames)?b.fileNames:[]);
    const sourceUrls=Array.isArray(b.sourceUrls)?b.sourceUrls.filter(x=>/^https:\/\//i.test(String(x||''))).slice(0,8):[];
    const media=[];

    /* Legacy direct payload support, kept for small files/backward compatibility. */
    raw.forEach((v,i)=>{
      const data=clean64(v);
      if(data)media.push({buffer:Buffer.from(data,'base64'),mimeType:safeMime(mimes[i]||b.mimeType,names[i]||b.fileName),fileName:String(names[i]||b.fileName||`tài liệu ${i+1}`)});
    });

    /* Preferred path: browser stages files in Supabase Storage, then server downloads them. */
    for(let i=0;i<sourceUrls.length;i++){
      const u=sourceUrls[i];
      const fr=await timeout(signal=>fetch(u,{method:'GET',redirect:'follow',signal}),30000,'Tải tài liệu');
      if(!fr.ok)throw Object.assign(new Error(`Không đọc được tài liệu đã tải lên (HTTP ${fr.status}).`),{status:502});
      const ab=await timeout(signal=>fr.arrayBuffer(),30000,'Đọc tài liệu');
      const buf=Buffer.from(ab);
      if(buf.length>50*1024*1024)throw Object.assign(new Error(`${names[i]||`Tài liệu ${i+1}`} vượt giới hạn 50 MB của Gemini cho PDF.`),{status:413});
      media.push({buffer:buf,mimeType:safeMime(fr.headers.get('content-type')||mimes[i],names[i]||u),fileName:String(names[i]||`tài liệu ${i+1}`)});
    }

    if(!text&&!media.length)return fail(400,'Thiếu nội dung tài liệu hoặc ảnh/PDF.');
    const key=String(process.env.GEMINI_API_KEY||'').replace(/^[\'"`]+|[\'"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();
    if(!key)return fail(503,'GEMINI_API_KEY chưa được cấu hình trên Vercel.');

    const prompt=`Bạn là hệ thống phân tích từ vựng chuyên xử lý giáo trình, PDF scan, ảnh chụp bảng và tài liệu học tập cho STUDY TH.

MỤC TIÊU:
Đọc TOÀN BỘ nguồn tài liệu và chỉ lấy những mục THỰC SỰ LÀ MỤC TỪ VỰNG để tạo Flashcard.

NHẬN DIỆN THEO BỐ CỤC:
- Ưu tiên hình ảnh/bố cục/trình bày của tài liệu hơn OCR text phụ trợ.
- Nếu có bảng các cột Word, Vocabulary, Term, Expression, Transcription, Pronunciation, Meaning, Definition, Example hoặc For example thì xác định đúng vai trò từng cột.
- Word/Vocabulary/Term/Expression = front.
- Meaning/Definition = back.
- Transcription/Pronunciation = phonetic.
- Example/For example = example.
- Ghép toàn bộ dữ liệu theo ĐÚNG CÙNG MỘT HÀNG.
- Mỗi hàng hợp lệ là một flashcard.
- Giữ nguyên từ/cụm từ trong tài liệu, bao gồm phrasal verbs, collocations, noun phrases và mẫu `something`.
- Không tự tách một cụm thành nhiều thẻ.
- Không tự thêm từ ngoài tài liệu.
- IPA chỉ lấy khi thực sự thấy trong nguồn.
- Bỏ tiêu đề Unit, chapter, số trang, header/footer, watermark, URL, email, hướng dẫn, dòng đăng ký và nội dung trang trí.
- Đọc tất cả file; nếu có nhiều file thì gộp theo yêu cầu của người tạo.
- Loại trùng theo front.
- Nếu tài liệu chỉ có ít mục hợp lệ thì trả đúng số đó, không bịa thêm cho đủ số lượng.

ĐẶC BIỆT CHO BẢNG UNIT TIẾNG ANH:
Nếu bảng có dạng `Word | Transcription | Meaning | For example`, mỗi hàng là một thẻ.
Ví dụ `accessible | adj /əkˈsesəbəl/ | dễ tiếp cận | ...` phải tạo front=`accessible`, back=`dễ tiếp cận`, phonetic là phần IPA nhìn thấy và example là câu của đúng hàng đó.
`devote something to doing something` phải giữ nguyên toàn bộ cụm.

YÊU CẦU RIÊNG:
${instruction||'(Không có yêu cầu thêm)'}

CHỈ TRẢ JSON THUẦN:
{"flashcards":[{"type":"flashcard","front":"...","back":"...","phonetic":"...","example":"...","source":"..."}]}`;

    /* Gemini Files API: upload each staged document separately, then reference file URIs.
       This avoids large inlineData payloads and lets Gemini process PDFs/images natively. */
    const fileUris=[];
    for(const item of media){
      const start=await timeout(signal=>fetch('https://generativelanguage.googleapis.com/upload/v1beta/files',{
        method:'POST',signal,
        headers:{
          'x-goog-api-key':key,
          'X-Goog-Upload-Protocol':'resumable',
          'X-Goog-Upload-Command':'start',
          'X-Goog-Upload-Header-Content-Length':String(item.buffer.length),
          'X-Goog-Upload-Header-Content-Type':item.mimeType,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({file:{display_name:item.fileName.slice(0,120)}})
      }),20000,'Khởi tạo tải tài liệu lên Gemini');
      if(!start.ok){const tx=await start.text();let p={};try{p=JSON.parse(tx)}catch{}throw Object.assign(new Error(`Gemini Files API khởi tạo thất bại: HTTP ${start.status}${p?.error?.message?`: ${p.error.message}`:''}`),{status:502});}
      const uploadUrl=start.headers.get('x-goog-upload-url');
      if(!uploadUrl)throw Object.assign(new Error('Gemini Files API không trả về URL tải tài liệu.'),{status:502});
      const fin=await timeout(signal=>fetch(uploadUrl,{method:'POST',signal,headers:{'Content-Length':String(item.buffer.length),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','Content-Type':item.mimeType},body:item.buffer}),90000,'Tải tài liệu lên Gemini');
      const tx=await fin.text();let info={};try{info=tx?JSON.parse(tx):{}}catch{}
      if(!fin.ok)throw Object.assign(new Error(`Gemini Files API tải tài liệu thất bại: HTTP ${fin.status}${info?.error?.message?`: ${info.error.message}`:''}`),{status:502});
      const f=info?.file||info;
      if(!f?.uri)throw Object.assign(new Error('Gemini Files API không trả về file URI.'),{status:502});
      fileUris.push({uri:String(f.uri),mimeType:String(f.mimeType||item.mimeType),name:String(f.name||''),fileName:item.fileName});
    }

    /* Wait briefly for uploaded files to become ACTIVE when File API exposes a processing state. */
    for(const f of fileUris){
      if(!f.name)continue;
      for(let i=0;i<20;i++){
        const rr=await timeout(signal=>fetch(`https://generativelanguage.googleapis.com/v1beta/${f.name}`,{method:'GET',headers:{'x-goog-api-key':key},signal}),10000,'Kiểm tra trạng thái tài liệu Gemini');
        if(!rr.ok)break;
        const tx=await rr.text();let st={};try{st=tx?JSON.parse(tx):{}}catch{}
        const state=String(st?.state||st?.file?.state||'').toUpperCase();
        if(!state||state==='ACTIVE')break;
        if(state==='FAILED')throw Object.assign(new Error(`Gemini không xử lý được ${f.fileName}.`),{status:502});
        await new Promise(r=>setTimeout(r,700));
      }
    }

    const parts=[{text:prompt}];
    if(text)parts.push({text:`\nTEXT PHỤ TRỢ — chỉ dùng để đối chiếu, không thay thế bố cục tài liệu:\n${text}`});
    fileUris.forEach((f,i)=>{
      parts.push({text:`\n=== NGUỒN ${i+1}: ${f.fileName} ===`});
      parts.push({file_data:{mime_type:f.mimeType,file_uri:f.uri}});
    });
    if(!fileUris.length&&media.length===0&&text){}

    const models=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash'];
    let parsed=null,usedModel='';let lastError='Gemini không phản hồi.';
    for(const model of models){
      try{
        const payload={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:12000}};
        const r=await timeout(signal=>fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload),signal}),120000,`Gemini ${model}`);
        const tx=await r.text();let p={};try{p=tx?JSON.parse(tx):{}}catch{}
        if(r.ok){parsed=p;usedModel=model;break;}
        lastError=`Gemini ${model} HTTP ${r.status}${p?.error?.message?`: ${p.error.message}`:''}`;
        if(![400,404,429,500,503].includes(r.status))break;
      }catch(e){lastError=`Gemini ${model}: ${e?.message||String(e)}`;}
    }
    if(!parsed)return fail(502,lastError,{provider:'gemini'});

    const out=parsed?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
    const clean=out.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    const a=clean.indexOf('{'),z=clean.lastIndexOf('}');
    if(a<0||z<=a)return fail(502,'Gemini không trả về JSON flashcard hợp lệ.',{model:usedModel});
    let obj;try{obj=JSON.parse(clean.slice(a,z+1));}catch(e){return fail(502,'Gemini trả về JSON lỗi định dạng.',{model:usedModel});}

    const seen=new Set();
    const cards=(Array.isArray(obj.flashcards)?obj.flashcards:[])
      .map(c=>({type:'flashcard',front:String(c?.front||'').trim(),back:String(c?.back||'').trim(),phonetic:String(c?.phonetic||'').trim(),example:String(c?.example||'').trim(),explanation:'',source:String(c?.source||'').trim()}))
      .filter(c=>{const k=c.front.toLowerCase().replace(/\s+/g,' ');if(!c.front||!c.back||seen.has(k))return false;seen.add(k);return true})
      .slice(0,100);
    if(!cards.length)return fail(422,'AI đã đọc tài liệu nhưng không xác định được mục từ vựng hợp lệ. Hãy kiểm tra bố cục bảng hoặc thử ảnh/PDF rõ hơn.',{model:usedModel});

    return res.status(200).json({questions:cards,flashcards:cards,provider:'gemini',model:usedModel,vision:fileUris.length>0,sourceCount:Math.max(1,fileUris.length),validated:true});
  }catch(e){
    console.error('generate-flashcards:',e);
    const s=Number(e?.status);
    return fail([400,413,415,422,502,503,504].includes(s)?s:500,e?.message||'Lỗi máy chủ khi tạo flashcard.');
  }
}
