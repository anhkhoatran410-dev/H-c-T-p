/* STUDY TH — Flashcard AI: one simple, reliable multimodal path. */
export const maxDuration=300;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const b=req.body||{};
    const key=String(process.env.GEMINI_API_KEY||'').trim();
    if(!key)return res.status(503).json({error:'GEMINI_API_KEY chưa được cấu hình trên Vercel.'});
    const names=Array.isArray(b.sourceFiles)?b.sourceFiles:[];
    const urls=Array.isArray(b.sourceUrls)?b.sourceUrls.filter(x=>/^https:\/\//i.test(String(x||''))).slice(0,8):[];
    const mimes=Array.isArray(b.mimeTypes)?b.mimeTypes:[];
    const text=String(b.documentText||'').slice(0,180000);
    const instruction=String(b.userInstruction||'').slice(0,12000);
    const guessed=(mime,name)=>{const m=String(mime||'').split(';')[0].toLowerCase();if(m&&m!=='application/octet-stream')return m;const n=String(name||'').toLowerCase();if(n.endsWith('.pdf'))return'application/pdf';if(/\.jpe?g$/.test(n))return'image/jpeg';if(n.endsWith('.png'))return'image/png';if(n.endsWith('.webp'))return'image/webp';if(n.endsWith('.gif'))return'image/gif';if(n.endsWith('.bmp'))return'image/bmp';return'application/octet-stream'};
    const parts=[{text:`Bạn là AI phân tích từ vựng cho STUDY TH. Đọc TOÀN BỘ tài liệu/ảnh được cung cấp và chỉ lấy mục thực sự là từ vựng.\n\nNHẬN DIỆN:\n- Có thể là ảnh chụp trang sách, PDF scan, PDF có text, bảng hoặc nhiều tài liệu.\n- Ưu tiên bố cục trực quan khi phân biệt cột và hàng.\n- Word/Vocabulary/Term/Expression = front. Meaning/Definition = back. Transcription/Pronunciation = phonetic. Example/For example = example.\n- Ghép đúng các ô TRONG CÙNG HÀNG, không ghép chéo hàng.\n- Giữ nguyên từ/cụm từ, phrasal verb, collocation, noun phrase, mẫu something.\n- Không lấy tiêu đề Unit/chapter, số trang, header/footer, URL, watermark, hướng dẫn.\n- Không bịa. Nếu tài liệu có ít mục hợp lệ thì trả ít hơn số người yêu cầu.\n- Loại trùng theo front.\n\nYÊU CẦU RIÊNG:\n${instruction||'(không có)'}\n\nTrả JSON THUẦN theo mẫu:\n{"flashcards":[{"type":"flashcard","front":"","back":"","phonetic":"","example":"","source":""}]}` }];
    if(text)parts.push({text:`\nTEXT TRÍCH XUẤT PHỤ TRỢ:\n${text}`});
    for(let i=0;i<urls.length;i++){
      const r=await fetch(urls[i],{redirect:'follow'});
      if(!r.ok)return res.status(502).json({error:`Không tải được ${names[i]||`tài liệu ${i+1}`} từ Storage (HTTP ${r.status}).`});
      const buf=Buffer.from(await r.arrayBuffer());
      if(buf.length>15*1024*1024)return res.status(413).json({error:`${names[i]||`Tài liệu ${i+1}`} quá lớn. Giới hạn 15 MB cho một nguồn.`});
      const mt=guessed(r.headers.get('content-type')||mimes[i],names[i]||urls[i]);
      if(!/^application\/pdf$|^image\/(jpeg|png|webp|gif|bmp)$/.test(mt))continue;
      parts.push({text:`\n=== NGUỒN ${i+1}: ${names[i]||`tài liệu ${i+1}`} ===`});
      parts.push({inlineData:{mimeType:mt,data:buf.toString('base64')}});
    }
    if(!text&&parts.length===1)return res.status(400).json({error:'Thiếu nội dung tài liệu hoặc ảnh/PDF.'});
    const models=['gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite'];
    let last='';
    for(const model of models){
      try{
        const rr=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:12000}})});
        const raw=await rr.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}
        if(!rr.ok){last=`${model}: HTTP ${rr.status}`;continue}
        const out=d?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim()||'';
        const a=out.indexOf('{'),z=out.lastIndexOf('}');if(a<0||z<=a){last=`${model}: JSON không hợp lệ`;continue}
        const obj=JSON.parse(out.slice(a,z+1));
        const seen=new Set();const cards=(Array.isArray(obj.flashcards)?obj.flashcards:[]).map(c=>({type:'flashcard',front:String(c?.front||'').trim(),back:String(c?.back||'').trim(),phonetic:String(c?.phonetic||'').trim(),example:String(c?.example||'').trim(),explanation:'',source:String(c?.source||'').trim()})).filter(c=>{const k=c.front.toLowerCase().replace(/\s+/g,' ');if(!c.front||!c.back||seen.has(k))return false;seen.add(k);return true}).slice(0,100);
        if(!cards.length)return res.status(422).json({error:'AI đã đọc tài liệu nhưng không tìm thấy mục từ vựng hợp lệ.',model});
        return res.status(200).json({flashcards:cards,questions:cards,provider:'gemini',model,vision:urls.length>0,sourceCount:urls.length,validated:true});
      }catch(e){last=`${model}: ${e?.message||String(e)}`}
    }
    return res.status(502).json({error:'AI generation tạm thời không khả dụng.'});
  }catch(e){console.error('generate-flashcards',e);return res.status(500).json({error:e?.message||'Lỗi máy chủ khi tạo flashcard.'})}
}