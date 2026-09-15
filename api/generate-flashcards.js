/* STUDY TH Flashcard AI v2026-09-15: multimodal Gemini 3.x. */
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const b=req.body||{};
    const text=String(b.documentText||'').slice(0,180000).trim();
    const instruction=String(b.userInstruction||'').trim();
    const raw=Array.isArray(b.fileData)?b.fileData:(b.fileData?[b.fileData]:[]);
    const mimes=Array.isArray(b.mimeTypes)?b.mimeTypes:[];
    const names=Array.isArray(b.sourceFiles)?b.sourceFiles:(Array.isArray(b.fileNames)?b.fileNames:[]);
    const sourceUrls=Array.isArray(b.sourceUrls)?b.sourceUrls.filter(x=>/^https:\/\//i.test(String(x||''))).slice(0,8):[];
    const media=[];
    const clean64=v=>String(v||'').trim().replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
    raw.forEach((v,i)=>{const data=clean64(v);if(data)media.push({data,mimeType:String(mimes[i]||b.mimeType||'application/octet-stream').split(';')[0].trim().toLowerCase(),fileName:String(names[i]||b.fileName||`tài liệu ${i+1}`)});});

    /* Large files are staged in Supabase Storage by the browser so the Vercel request stays small. */
    for(let i=0;i<sourceUrls.length;i++){
      const u=sourceUrls[i];
      const fr=await fetch(u,{method:'GET'});
      if(!fr.ok)throw Object.assign(new Error(`Không đọc được tài liệu đã tải lên (HTTP ${fr.status}).`),{status:502});
      const ab=await fr.arrayBuffer();
      const mime=String(fr.headers.get('content-type')||mimes[i]||'application/octet-stream').split(';')[0].trim().toLowerCase();
      const buf=Buffer.from(ab);
      media.push({data:buf.toString('base64'),mimeType:mime,fileName:String(names[i]||`tài liệu ${i+1}`)});
    }

    if(!text&&!media.length)return res.status(400).json({error:'Thiếu nội dung tài liệu hoặc ảnh/PDF.'});
    const total=media.reduce((n,x)=>n+Math.floor(x.data.length*.75),0);
    if(total>18*1024*1024)return res.status(413).json({error:'Tổng dữ liệu ảnh/PDF quá lớn. Hãy chia tài liệu thành nhóm nhỏ hơn.'});
    const key=String(process.env.GEMINI_API_KEY||'').replace(/^[\'"`]+|[\'"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();
    if(!key)return res.status(500).json({error:'GEMINI_API_KEY chưa được cấu hình trên Vercel.'});

    const prompt=`Bạn là hệ thống phân tích từ vựng chuyên xử lý giáo trình, PDF scan và ảnh chụp bảng từ vựng cho STUDY TH.

MỤC TIÊU:
Đọc TOÀN BỘ nguồn tài liệu và xác định những mục THỰC SỰ LÀ MỤC TỪ VỰNG để đưa vào Flashcard.

CÁCH NHẬN DIỆN:
1. Ưu tiên BỐ CỤC TRỰC QUAN của từng trang.
2. Nếu có bảng với các cột Word, Vocabulary, Term, Expression, Transcription, Pronunciation, Meaning, Definition, Example hoặc For example, hãy nhận diện đúng vai trò từng cột.
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

ĐẶC BIỆT CHO FILE DẠNG GIỐNG TÀI LIỆU UNIT TIẾNG ANH:
- Mỗi dòng trong bảng 4 cột Word | Transcription | Meaning | For example là 1 thẻ.
- Ví dụ nếu nhìn thấy dòng `accessible | adj /əkˈsesəbəl/ | dễ tiếp cận | These documents...` thì front phải là `accessible`, back là `dễ tiếp cận`, phonetic là phần phiên âm và example là câu ví dụ của CHÍNH dòng đó.
- Dòng `devote something to doing something` phải giữ nguyên toàn bộ cụm ở front.
- Không biến tên Unit hoặc dòng đăng ký ở đầu/cuối trang thành thẻ.

YÊU CẦU RIÊNG:
${instruction||'(Không có yêu cầu thêm)'}

CHỈ TRẢ JSON THUẦN:
{"flashcards":[{"type":"flashcard","front":"...","back":"...","phonetic":"...","example":"...","source":"..."}]}`;
    const parts=[{text:prompt}];
    if(text)parts.push({text:`\nTEXT PHỤ TRỢ (chỉ đối chiếu, không ưu tiên hơn bố cục hình ảnh):\n${text}`});
    media.forEach((x,i)=>{parts.push({text:`\n=== NGUỒN ${i+1}: ${x.fileName} ===`});parts.push({inlineData:{mimeType:x.mimeType,data:x.data}});});

    const models=['gemini-3.6-flash','gemini-3.5-flash'];
    let lastError='Gemini không phản hồi.';let data=null;let usedModel='';
    for(const model of models){
      const payload={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:16000}};
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload)});
      const rawText=await r.text();let parsed={};try{parsed=rawText?JSON.parse(rawText):{}}catch{}
      if(r.ok){data=parsed;usedModel=model;break;}
      lastError=parsed?.error?.message||`Gemini lỗi HTTP ${r.status}`;
      if(![400,404,429,500,503].includes(r.status))break;
    }
    if(!data)throw Object.assign(new Error(lastError),{status:502});
    const out=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
    const clean=out.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    const a=clean.indexOf('{'),z=clean.lastIndexOf('}');
    if(a<0||z<=a)throw new Error('Gemini không trả về JSON flashcard hợp lệ.');
    const obj=JSON.parse(clean.slice(a,z+1));
    const seen=new Set();
    const cards=(Array.isArray(obj.flashcards)?obj.flashcards:[]).map(c=>({type:'flashcard',front:String(c?.front||'').trim(),back:String(c?.back||'').trim(),phonetic:String(c?.phonetic||'').trim(),example:String(c?.example||'').trim(),explanation:'',source:String(c?.source||'').trim()})).filter(c=>{const k=c.front.toLowerCase().replace(/\s+/g,' ');if(!c.front||!c.back||seen.has(k))return false;seen.add(k);return true}).slice(0,100);
    if(!cards.length)return res.status(422).json({error:'AI đã đọc tài liệu nhưng không xác định được mục từ vựng hợp lệ. Hãy kiểm tra bố cục bảng hoặc thử ảnh/PDF rõ hơn.'});
    return res.status(200).json({questions:cards,flashcards:cards,provider:'gemini',model:usedModel,vision:media.length>0,sourceCount:Math.max(1,media.length),validated:true});
  }catch(e){console.error('generate-flashcards:',e);const s=Number(e?.status);return res.status([400,413,502].includes(s)?s:502).json({error:e?.message||'Lỗi máy chủ khi tạo flashcard.'});}
}