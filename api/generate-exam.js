export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const body=req.body||{};
    const fileName=String(body.fileName||'tài liệu');
    const mimeType=String(body.mimeType||'application/octet-stream').split(';')[0];
    const fileData=body.fileData;
    const media=Array.isArray(body.media)?body.media:[];
    const attachments=Array.isArray(body.attachments)?body.attachments:[];
    const documentText=String(body.documentText||'').slice(0,450000);
    const subject=String(body.subject||'Tự xác định từ tài liệu');
    const difficulty=String(body.difficulty||'Trung bình');
    const count=Math.max(1,Math.min(100,Number(body.questionCount||20)));
    const types=Array.isArray(body.types)?body.types:[];
    const userInstruction=String(body.userInstruction??'').trim();
    const allowed=['mcq','true_false','short','flashcard'];
    const selectedTypes=types.filter(t=>allowed.includes(t));
    if(!selectedTypes.length)return res.status(400).json({error:'Thiếu dạng nội dung.'});

    const sources=[];
    if(fileData)sources.push({data:String(fileData),mimeType,fileName});
    media.slice(0,8).forEach((x,i)=>{if(x?.data)sources.push({data:String(x.data),mimeType:String(x.mimeType||'application/octet-stream').split(';')[0],fileName:String(x.fileName||`tài liệu ${i+1}`)});});
    attachments.slice(0,8).forEach((x,i)=>{if(x?.fileData)sources.push({data:String(x.fileData),mimeType:String(x.mimeType||'application/octet-stream').split(';')[0],fileName:String(x.fileName||`tài liệu ${i+1}`)});});
    if(!documentText&&!sources.length)return res.status(400).json({error:'Thiếu nội dung tài liệu.'});

    const typeNames={mcq:'Trắc nghiệm 4 lựa chọn',true_false:'Đúng/Sai gồm 4 mệnh đề',short:'Trả lời ngắn, đáp án tối đa 4 ký tự',flashcard:'Flashcard từ/cụm từ và nghĩa tiếng Việt'};
    const prompt=`Bạn là AI tạo nội dung học tập cho STUDY TH. Đọc TOÀN BỘ tài liệu, kể cả PDF scan, ảnh, bảng và nhiều file.
Nhiệm vụ: tạo đúng ${count} nội dung, chỉ dùng: ${selectedTypes.map(t=>typeNames[t]).join('; ')}.
Bám đúng nguồn; không bịa; nếu tài liệu có bảng/ảnh thì ưu tiên bố cục trực quan; đọc tất cả nguồn; tuân thủ tỷ lệ Unit/chương trong yêu cầu.
YÊU CẦU RIÊNG CỦA NGƯỜI TẠO:
${userInstruction||'(Không có)'}
JSON bắt buộc:
{"questions":[{"type":"mcq|true_false|short|flashcard","q":"...","opts":["...","...","...","..."],"a":0,"statements":["...","...","...","..."],"answers":[true,false,true,false],"answer":"...","front":"...","back":"...","phonetic":"...","example":"...","explanation":"..."}]}
Quy tắc: mcq có đúng 4 opts và a 0..3; true_false có 4 statements + 4 answers; short answer tối đa 4 ký tự; flashcard có front/back; câu thường phải có explanation. Chỉ trả JSON thuần.`;

    const parts=[{text:prompt}];
    if(documentText)parts.push({text:`\nTEXT PHỤ TRỢ:\n${documentText}`});
    for(const s of sources){const raw=String(s.data||'').replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'');if(raw)parts.push({text:`\nNGUỒN GỐC: ${s.fileName}`},{inlineData:{mimeType:s.mimeType,data:raw}});}

    const key=String(process.env.GEMINI_API_KEY||'').replace(/^[\'"`]+|[\'"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();
    if(!key)return res.status(500).json({error:'GEMINI_API_KEY chưa được cấu hình trên Vercel.'});
    const model=String(process.env.GEMINI_MODEL||'gemini-3.6-flash').trim();
    async function callAI(p){const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:p}],generationConfig:{responseMimeType:'application/json',temperature:0.15,maxOutputTokens:20000}})});const txt=await r.text();let d={};try{d=txt?JSON.parse(txt):{}}catch{throw new Error(`Gemini trả về dữ liệu không hợp lệ (HTTP ${r.status}).`)}if(!r.ok)throw Object.assign(new Error(d?.error?.message||`Gemini lỗi HTTP ${r.status}`),{status:r.status});const out=d?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim()||'';const clean=out.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();const a=clean.indexOf('{'),z=clean.lastIndexOf('}');if(a<0||z<=a)throw new Error('Gemini không trả về JSON hợp lệ.');return JSON.parse(clean.slice(a,z+1));}

    let data;
    try{data=await callAI(parts);}catch(first){const repair=[{text:`Tạo lại từ đầu. Không được dùng biến ngoài dữ liệu được cung cấp. Trả đúng ${count} câu JSON, sửa mọi lỗi cấu trúc.\nLỗi lần trước: ${first.message}\n\n${prompt}`}];if(documentText)repair.push({text:`\nTEXT:\n${documentText}`});for(const s of sources){const raw=String(s.data||'').replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'');if(raw)repair.push({text:`\nNGUỒN: ${s.fileName}`},{inlineData:{mimeType:s.mimeType,data:raw}})}data=await callAI(repair);}

    const qs=Array.isArray(data.questions)?data.questions:[];
    if(qs.length!==count)return res.status(422).json({error:`AI tạo ${qs.length}/${count} nội dung.`});
    const normalized=qs.map((q,i)=>{q=q||{};const type=allowed.includes(q.type)?q.type:selectedTypes[i%selectedTypes.length];return{type,q:String(q.q||'').trim(),opts:Array.isArray(q.opts)?q.opts.map(String):[],a:Number(q.a),statements:Array.isArray(q.statements)?q.statements.map(String):[],answers:Array.isArray(q.answers)?q.answers.map(Boolean):[],answer:String(q.answer||'').trim(),front:String(q.front||q.term||'').trim(),back:String(q.back||q.definition||'').trim(),phonetic:String(q.phonetic||q.pronunciation||'').trim(),example:String(q.example||'').trim(),explanation:String(q.explanation||'').trim()};});
    const bad=[];normalized.forEach((q,i)=>{if(!selectedTypes.includes(q.type))bad.push(`Câu ${i+1}: loại không được chọn`);if(q.type!=='flashcard'&&!q.q)bad.push(`Câu ${i+1}: thiếu nội dung`);if(q.type==='mcq'&&(q.opts.length!==4||![0,1,2,3].includes(q.a)))bad.push(`Câu ${i+1}: MCQ không hợp lệ`);if(q.type==='true_false'&&(q.statements.length!==4||q.answers.length!==4))bad.push(`Câu ${i+1}: Đúng/Sai không hợp lệ`);if(q.type==='short'&&(!q.answer||Array.from(q.answer).length>4))bad.push(`Câu ${i+1}: trả lời ngắn không hợp lệ`);if(q.type==='flashcard'&&(!q.front||!q.back))bad.push(`Thẻ ${i+1}: thiếu front/back`);if(q.type!=='flashcard'&&!q.explanation)bad.push(`Câu ${i+1}: thiếu giải thích`);});
    if(bad.length)return res.status(422).json({error:'AI tạo nội dung nhưng chưa đạt kiểm tra cấu trúc.',problems:bad,questions:normalized});
    return res.status(200).json({questions:normalized,provider:'gemini',model,validated:true,sourceVision:sources.length>0,sourceCount:Math.max(1,sources.length)});
  }catch(e){console.error('generate-exam:',e);return res.status(Number(e?.status)||500).json({error:e?.message||'Lỗi máy chủ khi tạo bài kiểm tra.'});}
}