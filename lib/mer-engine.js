import { getAiKeyPool } from '../api/_ai-resilience.js';

const MODELS=['gemini-3.8-flash','gemini-3.7-flash'];
const EXPERT_TIMEOUT=10000;
const REVIEW_TIMEOUT=10000;

function imagePart(image){
  const s=String(image||'');
  if(!/^data:image\//i.test(s))return null;
  const comma=s.indexOf(','); if(comma<0)return null;
  const mime=s.slice(5,comma).split(';')[0],data=s.slice(comma+1);
  return mime&&data?{inlineData:{mimeType:mime,data}}:null;
}
function key(){return getAiKeyPool('GEMINI')[0]?.key||String(process.env.GEMINI_API_KEY||'').trim()||null}
function extract(d){return String(d?.candidates?.[0]?.content?.parts?.filter(p=>p?.text).map(p=>p.text).join('')||'').trim()}
function repairable(s){return /\[object\s*Object\]|\[objectObject\]/i.test(String(s||''))}

async function ask(model,prompt,image,timeout,maxOutputTokens){
  const api=key(); if(!api){const e=new Error('GEMINI_API_KEY chưa được cấu hình.');e.code='AI_CONFIG_MISSING';throw e;}
  const parts=[{text:prompt}],img=imagePart(image); if(img)parts.push(img);
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':api},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens,thinkingConfig:{thinkingLevel:'high'}}}),signal:AbortSignal.timeout(timeout)});
  const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}
  if(!r.ok){const e=new Error(String(d?.error?.message||('Gemini HTTP '+r.status)));e.status=r.status;e.providerMessage=d?.error?.message;throw e;}
  const answer=extract(d);if(!answer)throw new Error('Gemini returned empty output.');
  return {answer,model};
}
async function fallback(prompt,image,timeout,tokens){
  const results=await Promise.allSettled(MODELS.map(model=>ask(model,prompt,image,timeout,tokens)));
  for(const item of results){
    if(item.status==='fulfilled'&&item.value?.answer)return item.value;
  }
  const last=results.slice().reverse().find(x=>x.status==='rejected')?.reason;
  throw last||new Error('MER unavailable.');
}

export async function merSolve({message,subject,history,image,olympiad=false}){
  const context='MÔN: '+(subject||'chưa chọn')+'\nĐỀ/YÊU CẦU:\n'+String(message||'')+'\n'+(Array.isArray(history)?'LỊCH SỬ:\n'+history.slice(-3).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):'');
  const primary='Bạn là chuyên gia giải bài của STUDY TH. Giải độc lập từ đề gốc. Ưu tiên tìm lời giải đúng và gọn; không kéo dài suy nghĩ hoặc lặp lại phép biến đổi. '+
    'Với toán, hãy nêu dữ kiện, mục tiêu, phương pháp, các bước suy luận và kết luận. '+(olympiad?'Với bài VMO/Olympic, phải chứng minh chặt chẽ từng mệnh đề, nêu bổ đề cần thiết, xử lý trường hợp biên và trường hợp đẳng thức, tuyệt đối không dùng kiểm tra số nhỏ làm bằng chứng duy nhất. ':'')+
    'Không bịa dữ kiện. Mọi biểu thức toán phải nằm trong \\( ... \\) hoặc \\[ ... \\], và dùng toán tử ASCII <=, >=, <, > bên trong biểu thức. '+
    'Tuyệt đối không tạo chuỗi [object Object]. '+context;
  const p=await fallback(primary,image,EXPERT_TIMEOUT,3600);
  const review='Bạn là chuyên gia kiểm định và hoàn thiện lời giải STUDY TH. Kiểm tra nhanh các điểm then chốt, chỉ sửa những chỗ cần thiết và xuất lời giải cuối gọn, chắc. '+
    'Đọc đề gốc và lời giải nháp dưới đây. Tự kiểm tra từng bước, sửa sai nếu có và xuất ra MỘT lời giải cuối cùng hoàn chỉnh. '+(olympiad?'Đây là chế độ VMO/Olympic: hãy đóng vai giám khảo khó tính, đặc biệt kiểm tra tính tất yếu của từng suy luận, trường hợp dấu bằng và mọi điều kiện ẩn. ':'')+
    'Không nhắc tới chuyên gia hay quá trình kiểm định. Mọi biểu thức toán phải nằm trong \\( ... \\) hoặc \\[ ... \\]. Dùng ASCII <=, >=, <, > trong biểu thức. Không được xuất [object Object]. '+
    '\\n\\nĐỀ GỐC:\\n'+context+'\\n\\nLỜI GIẢI NHÁP:\\n'+p.answer;
  let out=await fallback(review,image,REVIEW_TIMEOUT,4800);
  if(repairable(out.answer)){
    out=await fallback('Chỉ sửa lỗi định dạng trong câu trả lời sau. Giữ nguyên nội dung và logic. Thay mọi [object Object] bằng toán tử phù hợp, dùng <= hoặc >= hoặc < hoặc > rõ ràng. Không thêm giải thích mới.\\n\\n'+out.answer,image,8000,4200);
  }
  return {answer:out.answer,model:out.model,experts:[p.model,out.model],used:true};
}