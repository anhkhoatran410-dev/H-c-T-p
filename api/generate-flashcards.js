/* STUDY TH — robust Flashcard AI endpoint. */
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const jsonError=(status,error,extra={})=>res.status(status).json({error:String(error||'Lỗi máy chủ khi tạo flashcard.'),...extra});
  const clean64=v=>String(v||'').trim().replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  const withTimeout=async(promise,ms,label)=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),ms);
    try{return await promise(controller.signal)}
    catch(e){if(e?.name==='AbortError')throw Object.assign(new Error(`${label} quá thời gian chờ.`),{status:504});throw e}
    finally{clearTimeout(timer)}
  };

  try{
    const b=req.body||{};
    const text=String(b.documentText||'').slice(0,140000).trim();
    const instruction=String(b.userInstruction||'').trim().slice(0,12000);
    const raw=Array.isArray(b.fileData)?b.fileData:(b.fileData?[b.fileData]:[]);
    const mimes=Array.isArray(b.mimeTypes)?b.mimeTypes:[];
    const names=Array.isArray(b.sourceFiles)?b.sourceFiles:(Array.isArray(b.fileNames)?b.fileNames:[]);
    const sourceUrls=Array.isArray(b.sourceUrls)?b.sourceUrls.filter(x=>/^https:\/\//i.test(String(x||''))).slice(0,8):[];
    const media=[];

    raw.forEach((v,i)=>{
      const data=clean64(v);
      if(data)media.push({data,mimeType:String(mimes[i]||b.mimeType||'application/octet-stream').split(';')[0].trim().toLowerCase(),fileName:String(names[i]||b.fileName||`tài liệu ${i+1}`)});
    });

    /* Download staged files server-side. This avoids Vercel's 4.5MB request-body limit. */
    for(let i=0;i<sourceUrls.length;i++){
      const u=sourceUrls[i];
      const fr=await withTimeout(signal=>fetch(u,{method:'GET',redirect:'follow',signal}),30000,'Tải tài liệu');
      if(!fr.ok)throw Object.assign(new Error(`Không đọc được tài liệu đã tải lên (HTTP ${fr.status}).`),{status:502});
      const contentLength=Number(fr.headers.get('content-length')||0);
      if(contentLength>12*1024*1024)throw Object.assign(new Error(`${names[i]||`Tài liệu ${i+1}`} quá lớn cho một lượt AI.`),{status:413});
      const ab=await withTimeout(signal=>fr.arrayBuffer(),30000,'Đọc tài liệu');
      const buf=Buffer.from(ab);
      if(buf.length>12*1024*1024)throw Object.assign(new Error(`${names[i]||`Tài liệu ${i+1}`} quá lớn cho một lượt AI.`),{status:413});
      const mime=String(fr.headers.get('content-type')||mimes[i]||'application/octet-stream').split(';')[0].trim().toLowerCase();
      const guessed=String(names[i]||u).toLowerCase();
      const finalMime=mime==='application/octet-stream'
        ?(guessed.endsWith('.pdf')?'application/pdf':guessed.match(/\.(png)$/)?'image/png':guessed.match(/\.(jpe?g)$/)?'image/jpeg':guessed.match(/\.(webp)$/)?'image/webp':mime)
        :mime;
      if(!['application/pdf','image/jpeg','image/png','image/webp','image/gif'].includes(finalMime)){
        throw Object.assign(new Error(`Loại tài liệu ${names[i]||`tài liệu ${i+1}`} không được hỗ trợ cho Vision (${finalMime}).`),{status:415});
      }
      media.push({data:buf.toString('base64'),mimeType:finalMime,fileName:String(names[i]||`tài liệu ${i+1}`)});
    }

    if(!text&&!media.length)return jsonError(400,'Thiếu nội dung tài liệu hoặc ảnh/PDF.');
    const total=media.reduce((n,x)=>n+Math.floor(x.data.length*.75),0);
    if(total>18*1024*1024)return jsonError(413,'Tổng dữ liệu ảnh/PDF quá lớn. Hãy chia tài liệu thành nhóm nhỏ hơn.');

    const key=String(process.env.GEMINI_API_KEY||'').replace(/^[\'"`]+|[\'"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();
    if(!key)return jsonError(503,'GEMINI_API_KEY chưa được cấu hình trên Vercel. Vào Project Settings → Environment Variables và thêm GEMINI_API_KEY cho Production, sau đó redeploy.');

    const prompt=`Bạn là hệ thống phân tích từ vựng chuyên xử lý giáo trình, PDF scan và ảnh chụp bảng từ vựng cho STUDY TH.

MỤC TIÊU:
Đọc TOÀN BỘ nguồn tài liệu và xác định những mục THỰC SỰ LÀ MỤC TỪ VỰNG để đưa vào Flashcard.

QUY TẮC NHẬN DIỆN:
1. Ưu tiên BỐ CỤC TRỰC QUAN của từng trang.
2. Nếu có bảng với các cột Word, Vocabulary, Term, Expression, Transcription, Pronunciation, Meaning, Definition, Example hoặc For example, nhận diện đúng vai trò từng cột.
3. Cột Word/Vocabulary/Term/Expression là FRONT.
4. Ghép Word + Transcription + Meaning/Definition + Example theo ĐÚNG CÙNG MỘT HÀNG.
5. Mỗi hàng từ vựng hợp lệ là một flashcard.
6. Giữ nguyên từ/cụm từ như nguồn; không tự tách cụm.
7. Noun/verb/adjective/phrasal verb/collocation/noun phrase đều hợp lệ nếu nằm trong cột từ vựng.
8. Không lấy Unit/chapter/title/số trang/header/footer/watermark/URL/email/copyright/hướng dẫn làm front.
9. IPA chỉ lấy từ nguồn; không tự bịa.
10. back và example phải thuộc đúng hàng.
11. Không tự thêm từ ngoài tài liệu.
12. Nếu OCR khác hình ảnh, ưu tiên hình ảnh/bố cục.
13. Đọc tất cả file.
14. Tuân theo tỷ lệ/phạm vi trong yêu cầu của người tạo.
15. Loại trùng theo front.
16. Nếu tài liệu chỉ có một số ít hàng từ vựng hợp lệ, chỉ trả những hàng thực sự nhìn thấy; tuyệt đối không bịa cho đủ số lượng.

ĐẶC BIỆT CHO FILE UNIT TIẾNG ANH:
- Mỗi dòng trong bảng 4 cột Word | Transcription | Meaning | For example là 1 thẻ.
- Dòng `devote something to doing something` phải giữ nguyên toàn bộ cụm ở front.
- Không biến tên Unit hoặc dòng đăng ký ở đầu/cuối trang thành thẻ.

YÊU CẦU RIÊNG:
${instruction||'(Không có yêu cầu thêm)'}

CHỈ TRẢ JSON THUẦN:
{"flashcards":[{"type":"flashcard","front":"...","back":"...","phonetic":"...","example":"...","source":"..."}]}`;

    const parts=[{text:prompt}];
    if(text)parts.push({text:`\nTEXT PHỤ TRỢ — dùng để đối chiếu, không thay thế bố cục hình ảnh:\n${text}`});
    media.forEach((x,i)=>{parts.push({text:`\n=== NGUỒN ${i+1}: ${x.fileName} ===`});parts.push({inlineData:{mimeType:x.mimeType,data:x.data}});});

    /* Newest stable model first, then reliable fallbacks. */
    const models=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite'];
    let lastError='Gemini không phản hồi.';let data=null;let usedModel='';
    for(const model of models){
      try{
        const payload={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:12000}};
        const r=await withTimeout(signal=>fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload),signal}),90000,`Gemini ${model}`);
        const rawText=await r.text();
        let parsed={};try{parsed=rawText?JSON.parse(rawText):{}}catch{}
        if(r.ok){data=parsed;usedModel=model;break;}
        lastError=`Gemini ${model} HTTP ${r.status}${parsed?.error?.message?`: ${parsed.error.message}`:''}`;
        if(![400,404,429,500,503].includes(r.status))break;
      }catch(e){lastError=`Gemini ${model}: ${e?.message||String(e)}`;if(Number(e?.status)===504)continue;}
    }
    if(!data)return jsonError(502,lastError,{provider:'gemini'});

    const out=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
    const clean=out.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    const a=clean.indexOf('{'),z=clean.lastIndexOf('}');
    if(a<0||z<=a)return jsonError(502,'Gemini không trả về JSON flashcard hợp lệ.',{model:usedModel});

    let obj;try{obj=JSON.parse(clean.slice(a,z+1));}catch(e){return jsonError(502,'Gemini trả về JSON lỗi định dạng.',{model:usedModel});}
    const seen=new Set();
    const cards=(Array.isArray(obj.flashcards)?obj.flashcards:[])
      .map(c=>({type:'flashcard',front:String(c?.front||'').trim(),back:String(c?.back||'').trim(),phonetic:String(c?.phonetic||'').trim(),example:String(c?.example||'').trim(),explanation:'',source:String(c?.source||'').trim()}))
      .filter(c=>{const k=c.front.toLowerCase().replace(/\s+/g,' ');if(!c.front||!c.back||seen.has(k))return false;seen.add(k);return true})
      .slice(0,100);
    if(!cards.length)return jsonError(422,'AI đã đọc tài liệu nhưng không xác định được mục từ vựng hợp lệ. Hãy kiểm tra bố cục bảng hoặc thử ảnh/PDF rõ hơn.',{model:usedModel});
    return res.status(200).json({questions:cards,flashcards:cards,provider:'gemini',model:usedModel,vision:media.length>0,sourceCount:Math.max(1,media.length),validated:true});
  }catch(e){
    console.error('generate-flashcards:',e);
    const s=Number(e?.status);
    return jsonError([400,413,415,422,502,503,504].includes(s)?s:500,e?.message||'Lỗi máy chủ khi tạo flashcard.');
  }
}
