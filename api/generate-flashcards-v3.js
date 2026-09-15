/* STUDY TH — stable multimodal flashcard API. */
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const b=req.body||{};
    const instruction=String(b.userInstruction||b.instruction||'').trim();
    const text=String(b.documentText||'').trim().slice(0,180000);
    const names=Array.isArray(b.sourceFiles)?b.sourceFiles:(Array.isArray(b.fileNames)?b.fileNames:[]);
    const mimeTypes=Array.isArray(b.mimeTypes)?b.mimeTypes:[];
    const sourceUrls=(Array.isArray(b.sourceUrls)?b.sourceUrls:[]).filter(v=>/^https:\/\//i.test(String(v||''))).slice(0,8);
    const raw=Array.isArray(b.fileData)?b.fileData:(b.fileData?[b.fileData]:[]);
    const media=[];
    const clean64=v=>String(v||'').trim().replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
    for(let i=0;i<raw.length;i++){
      const data=clean64(raw[i]);
      if(data)media.push({data,mimeType:String(mimeTypes[i]||b.mimeType||'application/octet-stream').split(';')[0].trim().toLowerCase(),fileName:String(names[i]||`tài liệu ${i+1}`)});
    }
    for(let i=0;i<sourceUrls.length;i++){
      const u=sourceUrls[i];
      const fr=await fetch(u,{method:'GET',redirect:'follow'});
      if(!fr.ok)throw Object.assign(new Error(`Không đọc được ${names[i]||`tài liệu ${i+1}`} (HTTP ${fr.status}).`),{status:502});
      const ab=await fr.arrayBuffer();
      const buf=Buffer.from(ab);
      const mime=String(fr.headers.get('content-type')||mimeTypes[i]||'application/octet-stream').split(';')[0].trim().toLowerCase();
      if(buf.length>12*1024*1024)throw Object.assign(new Error(`${names[i]||`Tài liệu ${i+1}`} quá lớn cho một lượt AI.`),{status:413});
      media.push({data:buf.toString('base64'),mimeType:mime,fileName:String(names[i]||`tài liệu ${i+1}`)});
    }
    if(!text&&!media.length)return res.status(400).json({error:'Thiếu tài liệu. Hãy chọn ít nhất một PDF, ảnh hoặc file văn bản.'});
    const total=media.reduce((n,x)=>n+Math.floor(x.data.length*0.75),0);
    if(total>18*1024*1024)return res.status(413).json({error:'Tổng tài liệu vượt giới hạn một lượt. Hãy chia thành nhóm nhỏ hơn.'});
    const key=String(process.env.GEMINI_API_KEY||'').trim().replace(/^[\'"`]+|[\'"`]+$/g,'');
    if(!key)return res.status(500).json({error:'Thiếu GEMINI_API_KEY trên Vercel.'});

    const prompt=`Bạn là AI tạo Flashcard cho STUDY TH. Nhiệm vụ là đọc TOÀN BỘ tài liệu, hiểu bố cục trực quan và chỉ trích xuất những mục thực sự là từ/cụm từ vựng.

QUY TẮC:
- Nếu tài liệu là bảng, xác định đúng cột từ vựng, phiên âm, nghĩa/định nghĩa và ví dụ; các ô cùng hàng thuộc cùng một thẻ.
- Các nhãn Word, Vocabulary, Term, Expression là cột FRONT. Meaning, Definition là BACK. Transcription/Pronunciation là phonetic. Example/For example là example.
- Giữ nguyên từ/cụm từ của nguồn, kể cả phrasal verb, collocation, noun phrase và cấu trúc có nhiều từ.
- Không lấy tiêu đề Unit, tên bài, chapter, số trang, header/footer, URL, email, copyright hay hướng dẫn làm từ vựng.
- Không tự thêm từ ngoài tài liệu. Không tự bịa phiên âm.
- Ưu tiên hình ảnh và bố cục gốc khi OCR/text phụ trợ mâu thuẫn.
- Đọc tất cả nguồn, loại trùng theo front và giữ thứ tự xuất hiện gần với tài liệu.
- Với giáo trình Unit tiếng Anh có bảng 4 cột Word | Transcription | Meaning | For example, mỗi hàng hợp lệ là một flashcard.
- Nếu yêu cầu người dùng có tỷ lệ giữa Unit hoặc phạm vi cụ thể, phải tuân theo.

YÊU CẦU CỦA NGƯỜI TẠO:
${instruction||'(Không có yêu cầu thêm)'}

CHỈ TRẢ JSON THUẦN, KHÔNG MARKDOWN:
{"flashcards":[{"type":"flashcard","front":"...","back":"...","phonetic":"...","example":"...","source":"..."}]}`;

    const parts=[{text:prompt}];
    if(text)parts.push({text:`\nTEXT THAM KHẢO:\n${text}`});
    for(const m of media){
      parts.push({text:`\n=== ${m.fileName} ===`});
      const supported=new Set(['application/pdf','image/jpeg','image/png','image/webp','image/gif']);
      if(supported.has(m.mimeType))parts.push({inlineData:{mimeType:m.mimeType,data:m.data}});
      else parts.push({text:`\nNội dung nhị phân của ${m.fileName} không thể đưa trực tiếp vào Vision; hãy dựa vào TEXT nếu có.`});
    }

    const model='gemini-3.6-flash';
    const payload={contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:16000}};
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),55000);
    let r;
    try{
      r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(payload),signal:controller.signal});
    }finally{clearTimeout(timer)}
    const rawResp=await r.text();
    let parsed={};try{parsed=rawResp?JSON.parse(rawResp):{}}catch{}
    if(!r.ok){
      const apiMsg=parsed?.error?.message||'';
      const status=[400,413,429,500,503].includes(r.status)?502:r.status;
      return res.status(status).json({error:`Gemini HTTP ${r.status}${apiMsg?`: ${apiMsg}`:''}`});
    }
    const out=parsed?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
    const clean=out.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    const a=clean.indexOf('{'),z=clean.lastIndexOf('}');
    if(a<0||z<=a)return res.status(502).json({error:'Gemini không trả về JSON hợp lệ.'});
    let obj;try{obj=JSON.parse(clean.slice(a,z+1))}catch{return res.status(502).json({error:'Gemini trả về JSON lỗi định dạng.'})}
    const seen=new Set();
    const cards=(Array.isArray(obj.flashcards)?obj.flashcards:[]).map(c=>({type:'flashcard',front:String(c?.front||'').trim(),back:String(c?.back||'').trim(),phonetic:String(c?.phonetic||'').trim(),example:String(c?.example||'').trim(),explanation:'',source:String(c?.source||'').trim()})).filter(c=>{const k=c.front.toLowerCase().replace(/\s+/g,' ');if(!c.front||!c.back||seen.has(k))return false;seen.add(k);return true}).slice(0,100);
    if(!cards.length)return res.status(422).json({error:'AI đã đọc tài liệu nhưng không xác định được mục từ vựng hợp lệ.'});
    return res.status(200).json({questions:cards,flashcards:cards,provider:'gemini',model,vision:media.some(x=>x.mimeType.startsWith('image/')||x.mimeType==='application/pdf'),sourceCount:Math.max(1,media.length),validated:true});
  }catch(e){
    console.error('generate-flashcards-v3:',e);
    if(e?.name==='AbortError')return res.status(504).json({error:'Gemini xử lý quá lâu. Hãy thử ít tài liệu hơn trong một lượt.'});
    const s=Number(e?.status);
    return res.status([400,413,502,504].includes(s)?s:502).json({error:e?.message||'Lỗi máy chủ khi tạo flashcard.'});
  }
}