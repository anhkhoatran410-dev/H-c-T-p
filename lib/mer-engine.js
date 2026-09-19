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
function cleanForAgreement(s){
  return String(s||'')
    .toLowerCase()
    .replace(/\\boxed?\{([^}]*)\}/g,' $1 ')
    .replace(/\\(?:frac|dfrac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,' $1/$2 ')
    .replace(/\\(?:leq|le|geq|ge|neq|approx|equiv|cdot|times|implies|iff)\b/g,' ')
    .replace(/[^a-z0-9à-ỹπ∞=<>+\-*/().,%\s]/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function conclusionSignature(s){
  const raw=String(s||'');
  const boxed=[...raw.matchAll(/\\boxed\{([^{}]+)\}/g)].map(m=>m[1]);
  if(boxed.length)return cleanForAgreement(boxed[boxed.length-1]);
  const lines=raw.split(/\n+/).filter(Boolean);
  const tail=lines.slice(-4).join(' ');
  const m=tail.match(/(?:kết luận|đáp án|suy ra|do đó|vậy|therefore|hence)[\s:：-]*(.{0,500})$/i);
  return cleanForAgreement(m?m[1]:tail);
}
function agreementScore(a,b){
  const ca=conclusionSignature(a),cb=conclusionSignature(b);
  if(ca&&cb&&ca===cb)return 1;
  const wa=new Set(cleanForAgreement(a).split(/\s+/).filter(Boolean));
  const wb=new Set(cleanForAgreement(b).split(/\s+/).filter(Boolean));
  if(!wa.size||!wb.size)return 0;
  let inter=0;for(const w of wa)if(wb.has(w))inter++;
  return inter/(wa.size+wb.size-inter);
}
async function runExperts(prompt,image,timeout,tokens){
  const started=Date.now();
  await stage('experts_started',{models:MODELS});
  const results=await Promise.allSettled(MODELS.map(model=>ask(model,prompt,image,timeout,tokens)));
  const experts=results.filter(x=>x.status==='fulfilled'&&x.value?.answer).map(x=>x.value);
  const errors=results.filter(x=>x.status==='rejected').map(x=>x.reason);
  if(!experts.length)throw errors[0]||new Error('MER unavailable.');
  return {experts,errors,latencyMs:Date.now()-started};
}


export async function merSolve({message,subject,history,image,olympiad=false,onStage=null}){
  const stage=async(name,data={})=>{try{if(typeof onStage==='function')await onStage(name,data)}catch{}};
  const started=Date.now();
  const context='MÔN: '+(subject||'chưa chọn')+'\nĐỀ/YÊU CẦU:\n'+String(message||'')+'\n'+(Array.isArray(history)?'LỊCH SỬ:\n'+history.slice(-3).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):'');
  const primary='Bạn là chuyên gia giải bài của STUDY TH. Giải độc lập từ đề gốc. Ưu tiên tìm lời giải đúng và gọn; không kéo dài suy nghĩ hoặc lặp lại phép biến đổi. '+
    'Với toán, hãy nêu dữ kiện, mục tiêu, phương pháp, các bước suy luận và kết luận. '+(olympiad?'Với bài VMO/Olympic, phải chứng minh chặt chẽ từng mệnh đề, nêu bổ đề cần thiết, xử lý trường hợp biên và trường hợp đẳng thức, tuyệt đối không dùng kiểm tra số nhỏ làm bằng chứng duy nhất. ':'')+
    'Không bịa dữ kiện. Mọi biểu thức toán phải nằm trong \\( ... \\) hoặc \\[ ... \\], và dùng toán tử ASCII <=, >=, <, > bên trong biểu thức. '+
    'Tuyệt đối không tạo chuỗi [object Object]. '+context;

  let expertRun;
  try{
    expertRun=await runExperts(primary,image,EXPERT_TIMEOUT,3600);
  }catch(e){
    throw e;
  }

  const experts=expertRun.experts;
  await stage('experts_done',{count:experts.length,latencyMs:expertRun.latencyMs});
  const scores=[];
  for(let i=0;i<experts.length;i++)for(let j=i+1;j<experts.length;j++)scores.push(agreementScore(experts[i].answer,experts[j].answer));
  const bestAgreement=scores.length?Math.max(...scores):0;
  const expertBest=experts[0];
  const expertNames=experts.map(x=>x.model);

  // Early exit: if two independent experts agree on the conclusion or are highly similar,
  // skip the expensive review LLM entirely.
  if(experts.length>=2 && bestAgreement>=0.82 && !repairable(expertBest.answer)){
    await stage('review_skipped',{agreementScore:Number(bestAgreement.toFixed(3))});
    return {
      answer:expertBest.answer,
      model:expertBest.model,
      experts:expertNames,
      used:true,
      reviewSkipped:true,
      agreementScore:Number(bestAgreement.toFixed(3)),
      latencyMs:Date.now()-started,
      expertLatencyMs:expertRun.latencyMs,
      reviewLatencyMs:0
    };
  }

  const review='Bạn là chuyên gia kiểm định và hoàn thiện lời giải STUDY TH. Kiểm tra nhanh các điểm then chốt, chỉ sửa những chỗ cần thiết và xuất lời giải cuối gọn, chắc. '+
    'Đọc đề gốc và các lời giải nháp dưới đây. Tự kiểm tra từng bước, sửa sai nếu có và xuất ra MỘT lời giải cuối cùng hoàn chỉnh. '+(olympiad?'Đây là chế độ VMO/Olympic: hãy đóng vai giám khảo khó tính, đặc biệt kiểm tra tính tất yếu của từng suy luận, trường hợp dấu bằng và mọi điều kiện ẩn. ':'')+
    'Không nhắc tới chuyên gia hay quá trình kiểm định. Mọi biểu thức toán phải nằm trong \\( ... \\) hoặc \\[ ... \\]. Dùng ASCII <=, >=, <, > trong biểu thức. Không được xuất [object Object]. '+
    '\\n\\nĐỀ GỐC:\\n'+context+
    '\\n\\nLỜI GIẢI NHÁP 1:\\n'+experts[0].answer+
    (experts[1]?('\\n\\nLỜI GIẢI NHÁP 2:\\n'+experts[1].answer):'');

  let out=expertBest,reviewLatencyMs=0;
  await stage('review_started',{reason:experts.length<2?'single_expert':'experts_disagree'});
  try{
    const rs=await runExperts(review,image,REVIEW_TIMEOUT,4800);
    out=rs.experts[0];
    reviewLatencyMs=rs.latencyMs;
    await stage('review_done',{latencyMs:reviewLatencyMs});
  }catch(_e){
    // Best-effort fallback: return the best expert result instead of killing the request.
    out=expertBest;
    await stage('review_fallback',{reason:'review_timeout_or_failure'});
  }

  if(repairable(out.answer)){
    try{
      const repairPrompt='Chỉ sửa lỗi định dạng trong câu trả lời sau. Giữ nguyên nội dung và logic. Thay mọi [object Object] bằng toán tử phù hợp, dùng <= hoặc >= hoặc < hoặc > rõ ràng. Không thêm giải thích mới.\\n\\n'+out.answer;
      const rr=await runExperts(repairPrompt,image,7000,4200);
      if(rr.experts[0]?.answer)out=rr.experts[0];
    }catch(_e){}
  }

  return {
    answer:out.answer,
    model:out.model,
    experts:expertNames,
    used:true,
    reviewSkipped:false,
    agreementScore:Number(bestAgreement.toFixed(3)),
    latencyMs:Date.now()-started,
    expertLatencyMs:expertRun.latencyMs,
    reviewLatencyMs
  };
}
