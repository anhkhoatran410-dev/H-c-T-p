export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const b=req.body||{};
    const text=String(b.documentText||'').slice(0,220000).trim();
    const instruction=String(b.userInstruction||'').trim();
    const names=Array.isArray(b.fileNames)?b.fileNames:[];
    const raw=Array.isArray(b.fileData)?b.fileData:(b.fileData?[b.fileData]:[]);
    const mimes=Array.isArray(b.mimeTypes)?b.mimeTypes:[];
    const media=[];
    const clean64=v=>String(v||'').trim().replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'');
    raw.forEach((v,i)=>{const data=clean64(v);if(data)media.push({data,mimeType:String(mimes[i]||'application/octet-stream').split(';')[0].trim().toLowerCase(),fileName:names[i]||b.fileName||`tài liệu ${i+1}`})});
    if(!text&&!media.length)return res.status(400).json({error:'Thiếu nội dung tài liệu.'});
    const totalBytes=media.reduce((n,x)=>n+Math.floor(x.data.length*.75),0);
    if(totalBytes>6*1024*1024)return res.status(413).json({error:'Tổng dữ liệu tài liệu quá lớn. Hãy chia thành ít file hơn rồi tạo flashcard từng nhóm.'});
    const key=String(process.env.GEMINI_API_KEY||'').trim();
    if(!key)return res.status(500).json({error:'GEMINI_API_KEY chưa được cấu hình trên Vercel.'});

    const prompt=`Bạn là bộ phân tích từ vựng cho STUDY TH. Hãy đọc TOÀN BỘ tài liệu được gửi, kể cả PDF scan, ảnh chụp, bảng, DOCX hoặc văn bản.

MỤC TIÊU: xác định chính xác những mục nào thực sự là TỪ/CỤM TỪ VỰNG cần đưa vào Flashcard.

QUY TẮC NHẬN DIỆN:
1. Ưu tiên cấu trúc từ điển/bảng từ vựng. Nếu tài liệu có các cột như Word, Vocabulary, Term, Transcription, Meaning, Definition, Example thì cột Word/Vocabulary/Term là nguồn của front.
2. Với tài liệu dạng bảng giống giáo trình: mỗi HÀNG dưới cột Word là một mục từ vựng. Hãy đọc theo từng hàng, ghép đúng Word + Transcription + Meaning + Example.
3. Không lấy tiêu đề bài, tên Unit, tên phần, số trang, dòng đăng ký, watermark, tên website, chú thích bản quyền, câu ví dụ tiếng Anh hoặc tiếng Việt làm front.
4. Không tách một cụm từ thành nhiều thẻ nếu tài liệu trình bày nó như một mục từ vựng duy nhất. Ví dụ "a wide range of something", "gain in popularity", "take something seriously", "sense of identity" phải giữ nguyên cụm.
5. Tính từ, danh từ, động từ, cụm động từ, cụm danh từ và collocation đều được chấp nhận nếu chúng xuất hiện như mục từ vựng trong nguồn.
6. Không tự thêm từ ngoài tài liệu. Không sửa chính tả của front nếu hình ảnh cho thấy cách viết rõ ràng.
7. Nếu OCR/text và hình ảnh mâu thuẫn, ưu tiên thông tin nhìn thấy trong bố cục bảng gốc.
8. Nếu có nhiều file, đọc TỪNG FILE và giữ nguồn cho từng mục trước khi trộn.
9. Tuân theo tỷ lệ hoặc phạm vi trong yêu cầu người tạo; nếu không có, lấy tương đối đều từ mọi nguồn.
10. Dùng phonetic/transcription đúng như nguồn nếu có; không tự bịa IPA. Nghĩa lấy đúng ô Meaning/Definition tương ứng. Example lấy đúng câu ví dụ tương ứng nếu có.

${instruction?`YÊU CẦU CỦA NGƯỜI TẠO:\n${instruction}\n`:''}

CHỈ TRẢ JSON DẠNG:
{"flashcards":[{"type":"flashcard","front":"...","back":"...","phonetic":"...","example":"...","source":"..."}]}
Không trả markdown, không giải thích ngoài JSON.`;

    const parts=[{text:prompt}];
    if(text)parts.push({text:`\nTEXT PHỤ TRỢ:\n${text}`});
    media.forEach((x,i)=>{parts.push({text:`\n=== FILE ${i+1}: ${x.fileName} ===`});parts.push({inlineData:{mimeType:x.mimeType,data:x.data}})});

    const configured=String(process.env.GEMINI_MODEL||'').trim();
    const models=[configured,'gemini-2.5-flash','gemini-2.5-flash-lite'].filter((x,i,a)=>x&&a.indexOf(x)===i);
    let last=null,parsed=null;
    for(const model of models){
      try{
        const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:0.1,maxOutputTokens:16000}})});
        const bodyText=await r.text();
        let data={};try{data=bodyText?JSON.parse(bodyText):{}}catch(e){throw Object.assign(new Error('Gemini trả về dữ liệu không hợp lệ.'),{status:r.status})}
        if(!r.ok){throw Object.assign(new Error(data?.error?.message||`Gemini lỗi HTTP ${r.status}`),{status:r.status})}
        const out=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
        const clean=out.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
        const a=clean.indexOf('{'),z=clean.lastIndexOf('}');
        if(a<0||z<=a)throw new Error('Gemini không trả về JSON flashcard.');
        parsed=JSON.parse(clean.slice(a,z+1));
        break;
      }catch(e){last=e;const s=Number(e?.status||0);if(s===429||s>=500)continue;break}
    }
    if(!parsed)throw last||new Error('Không gọi được Gemini.');
    const seen=new Set();
    const cards=(Array.isArray(parsed.flashcards)?parsed.flashcards:[]).map(c=>({type:'flashcard',front:String(c?.front||'').trim(),back:String(c?.back||'').trim(),phonetic:String(c?.phonetic||'').trim(),example:String(c?.example||'').trim(),explanation:'',source:String(c?.source||'').trim()})).filter(c=>{const k=c.front.toLowerCase().replace(/\s+/g,' ');if(!c.front||!c.back||seen.has(k))return false;seen.add(k);return true}).slice(0,100);
    if(!cards.length)return res.status(422).json({error:'AI không xác định được mục từ vựng hợp lệ từ bố cục tài liệu.'});
    return res.status(200).json({questions:cards,flashcards:cards,provider:'gemini',vision:true,sourceCount:Math.max(1,media.length),validated:true});
  }catch(e){console.error('generate-flashcards-vision:',e);return res.status(Number(e?.status)||500).json({error:e?.message||'Lỗi tạo flashcard.'})}
}
