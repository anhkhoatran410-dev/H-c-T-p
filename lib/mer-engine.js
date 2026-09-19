const MODELS=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash'];
const EXPERT_TIMEOUT=18000;
const SYNTH_TIMEOUT=20000;

function imgPart(image){
  const s=String(image||'');
  if(!/^data:image\//i.test(s)) return null;
  const comma=s.indexOf(',');
  if(comma<0)return null;
  const head=s.slice(5,comma).split(';')[0];
  const data=s.slice(comma+1);
  return head&&data?{inlineData:{mimeType:head,data}}:null;
}

function textFrom(data){
  return String(data?.candidates?.[0]?.content?.parts?.filter(p=>p?.text).map(p=>p.text).join('')||'').trim();
}

async function callGemini({model,prompt,image,timeout,maxOutputTokens}){
  const parts=[{text:prompt}],img=imgPart(image);
  if(img) parts.push(img);
  const body={contents:[{role:'user',parts}],generationConfig:{maxOutputTokens,thinkingConfig:{thinkingLevel:'high'}}};
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const raw=await r.text();
  let d={}; try{d=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok){const e=new Error(String(d?.error?.message||('Gemini HTTP '+r.status)));e.status=r.status;e.providerMessage=d?.error?.message;throw e;}
  const answer=textFrom(d);
  if(!answer)throw new Error('MER expert returned empty output.');
  return answer;
}

async function callWithFallback(prompt,image,timeout,maxOutputTokens){
  let last=null;
  for(const model of MODELS){
    try{return {answer:await callGemini({model,prompt,image,timeout,maxOutputTokens}),model};}
    catch(e){last=e;}
  }
  throw last||new Error('MER provider unavailable.');
}

export async function merSolve({message,subject,history,image}){
  const context='MÔN: '+(subject||'chưa chọn')+'\\nĐỀ/YÊU CẦU:\\n'+message+'\\nLỊCH SỬ GẦN NHẤT:\\n'+(Array.isArray(history)?history.slice(-4).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\\n'):'');
  const prompts=[
    'Bạn là EXPERT A của hệ thống MER (Multi-Expert Reasoning) của STUDY TH.\\nGiải độc lập từ đề gốc. Tập trung vào mô hình hóa dữ kiện, chọn phương pháp đúng, tính toán/chứng minh từng bước và kết luận.\\nKhông tin bất kỳ lời giải có sẵn nào. Nếu đề là bài trong ảnh, đọc ảnh trước khi suy luận.\\n\\n'+context,
    'Bạn là EXPERT B của hệ thống MER (Multi-Expert Reasoning) của STUDY TH.\\nHãy tự giải bài một cách độc lập nhưng đặc biệt săn lỗi: hiểu sai đề, thiếu điều kiện, mất/thêm nghiệm, sai đơn vị, sai biến đổi hoặc bước nhảy logic.\\nSau khi tự giải, nêu cách kiểm tra chéo ngắn gọn.\\n\\n'+context
  ];
  const pair=await Promise.all([callWithFallback(prompts[0],image,EXPERT_TIMEOUT,4200),callWithFallback(prompts[1],image,EXPERT_TIMEOUT,4200)]);
  const synth='Bạn là SYNTHESIZER của MER (Multi-Expert Reasoning) — bộ tổng hợp lời giải của STUDY TH.\\nBạn nhận hai lời giải độc lập bên dưới. Hãy tự đối chiếu với đề gốc và tạo MỘT lời giải cuối cùng đáng tin cậy.\\n\\nBẮT BUỘC:\\n1. Nếu hai chuyên gia khác nhau, tự xác định điểm nào đúng bằng suy luận từ đề gốc.\\n2. Không ghép hai lời giải máy móc.\\n3. Sửa mọi lỗi phát hiện được.\\n4. Trình bày bằng tiếng Việt, rõ ràng, đủ bước.\\n5. Với toán: giữ điều kiện, kiểm tra nghiệm/đáp số khi phù hợp.\\n6. Không nhắc đến Expert A/B, MER hay quá trình nội bộ trong lời giải cuối.\\n\\n'+context+'\\n\\n--- CHUYÊN GIA A ---\\n'+pair[0].answer+'\\n\\n--- CHUYÊN GIA B ---\\n'+pair[1].answer;
  const final=await callWithFallback(synth,image,SYNTH_TIMEOUT,7000);
  return {answer:final.answer,model:final.model,experts:[pair[0].model,pair[1].model],used:true};
}