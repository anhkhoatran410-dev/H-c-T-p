import { acquireAiKey, getAiKeyPool, reportAiFailure, reportAiSuccess } from './api/_ai-resilience.js';

const MODELS=['gemini-3.8-flash','gemini-3.7-flash'];

function num(v,d){const n=Number(v);return Number.isFinite(n)&&n>0?n:d}

// "web" = request inside a Vercel function (short budget).
// "worker" = background job outside Vercel (long budget). Deep/VMO problems need minutes, not 10 seconds.
const PROFILES={
  web:{expertTimeout:10000,reviewTimeout:10000,repairTimeout:7000,expertTokens:3600,reviewTokens:4800},
  worker:{
    expertTimeout:num(process.env.AI_EXPERT_TIMEOUT_MS,120000),
    reviewTimeout:num(process.env.AI_REVIEW_TIMEOUT_MS,90000),
    repairTimeout:num(process.env.AI_REPAIR_TIMEOUT_MS,30000),
    expertTokens:num(process.env.AI_EXPERT_MAX_TOKENS,16000),
    reviewTokens:num(process.env.AI_REVIEW_MAX_TOKENS,16000)
  }
};

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
  const pool=getAiKeyPool('GEMINI');
  if(!pool.length){const e=new Error('GEMINI_API_KEY chưa được cấu hình.');e.code='AI_CONFIG_MISSING';throw e;}
  const apiEntry=await acquireAiKey('GEMINI');
  if(!apiEntry){const e=new Error('Không còn Gemini key khả dụng trong circuit-breaker.');e.code='AI_KEYPOOL_EXHAUSTED';throw e;}
  const api=apiEntry.key;
  const parts=[{text:prompt}],img=imagePart(image); if(img)parts.push(img);
  try{
    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':api},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens,thinkingConfig:{thinkingLevel:'high'}}}),signal:AbortSignal.timeout(timeout)});
    const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}
    if(!r.ok){const e=new Error(String(d?.error?.message||('Gemini HTTP '+r.status)));e.status=r.status;e.providerMessage=d?.error?.message;await reportAiFailure('GEMINI',apiEntry.id,e);throw e;}
    const finishReason=String(d?.candidates?.[0]?.finishReason||'');
    const truncated=finishReason==='MAX_TOKENS';
    const answer=extract(d);
    if(!answer){const e=new Error(truncated?'Gemini hết token trước khi viết lời giải (MAX_TOKENS).':'Gemini returned empty output.');e.code=truncated?'AI_TRUNCATED_EMPTY':'AI_EMPTY';await reportAiFailure('GEMINI',apiEntry.id,e);throw e;}
    await reportAiSuccess('GEMINI',apiEntry.id);
    return {answer,model,truncated,finishReason,keyId:apiEntry.id};
  }catch(e){
    if(e?.status==null && e?.code) await reportAiFailure('GEMINI',apiEntry.id,e);
    throw e;
  }
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
  const na=ca.replace(/\s+/g,''),nb=cb.replace(/\s+/g,'');
  return na&&nb&&na===nb?1:0;
}
function escapeRe(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function casSupports(cas,answers){
  const nums=String(cas||'').match(/-?\d+(?:[.,]\d+)?(?:\/\d+)?/g);
  if(!nums||!nums.length||!answers.length)return false;
  const need=[...new Set(nums.map(n=>n.replace(/,/g,'.')))];
  return answers.every(a=>{
    const sig=' '+conclusionSignature(a).replace(/(\d),(\d)/g,'$1.$2')+' ';
    return need.every(n=>new RegExp('(^|[^0-9.])'+escapeRe(n)+'($|[^0-9])').test(sig));
  });
}
function proofLike(subject,message,olympiad){
  return olympiad || /\b(?:chứng minh|prove|bất đẳng thức|inequality|hình học|geometry|tổ hợp|combinatorics|number theory|số học)\b/i.test(String(subject||'')+' '+String(message||''));
}
async function runExperts(prompt,image,timeout,tokens,onStage=null){
  const started=Date.now();
  try{if(typeof onStage==='function')await onStage('experts_started',{models:MODELS,timeoutMs:timeout})}catch{}
  const results=await Promise.allSettled(MODELS.map(model=>ask(model,prompt,image,timeout,tokens)));
  const experts=results.filter(x=>x.status==='fulfilled'&&x.value?.answer).map(x=>x.value);
  const errors=results.filter(x=>x.status==='rejected').map(x=>x.reason);
  if(!experts.length)throw errors[0]||new Error('MER unavailable.');
  return {experts,errors,latencyMs:Date.now()-started};
}
async function runReview(prompt,image,timeout,tokens){
  const started=Date.now();let last=null;
  for(const model of MODELS){
    const remaining=timeout-(Date.now()-started);
    if(last&&remaining<5000)break;
    try{
      const r=await ask(model,prompt,image,Math.max(5000,remaining),tokens);
      return {...r,latencyMs:Date.now()-started};
    }catch(e){last=e}
  }
  throw last||new Error('Review unavailable.');
}

export async function merSolve({message,subject,history,image,olympiad=false,onStage=null,cas='',profile='web'}){
  const P=PROFILES[profile]||PROFILES.web;
  const stage=async(name,data={})=>{try{if(typeof onStage==='function')await onStage(name,data)}catch{}};
  const started=Date.now();
  const context='MÔN: '+(subject||'chưa chọn')+'\nĐỀ/YÊU CẦU:\n'+String(message||'')+'\n'+(Array.isArray(history)?'LỊCH SỬ:\n'+history.slice(-3).map(x=>(x.role||'user')+': '+String(x.message||'')).join('\n'):'');
  const primary='Bạn là chuyên gia giải bài của STUDY TH. Giải độc lập từ đề gốc. Ưu tiên tìm lời giải đúng và gọn; không kéo dài suy nghĩ hoặc lặp lại phép biến đổi. '+
    'Với toán, hãy nêu dữ kiện, mục tiêu, phương pháp, các bước suy luận và kết luận. '+(olympiad?'Với bài VMO/Olympic, phải chứng minh chặt chẽ từng mệnh đề, nêu bổ đề cần thiết, xử lý trường hợp biên và trường hợp đẳng thức, tuyệt đối không dùng kiểm tra số nhỏ làm bằng chứng duy nhất. ':'')+
    'Không bịa dữ kiện. Mọi biểu thức toán phải nằm trong \\( ... \\) hoặc \\[ ... \\], và dùng toán tử ASCII <=, >=, <, > bên trong biểu thức. '+
    'Tuyệt đối không tạo chuỗi [object Object]. '+context;

  const expertRun=await runExperts(primary,image,P.expertTimeout,P.expertTokens,onStage);
  const experts=expertRun.experts;
  await stage('experts_done',{count:experts.length,latencyMs:expertRun.latencyMs,truncated:experts.filter(x=>x.truncated).length});

  const usable=experts.filter(x=>!x.truncated&&!repairable(x.answer));
  const expertBest=usable[0]||experts[0];
  const scores=[];
  for(let i=0;i<usable.length;i++)for(let j=i+1;j<usable.length;j++)scores.push(agreementScore(usable[i].answer,usable[j].answer));
  const bestAgreement=scores.length?Math.max(...scores):0;
  const expertNames=experts.map(x=>x.model);

  const allowEarlyExit=Boolean(cas)&&!proofLike(subject,message,olympiad)&&usable.length>=2&&bestAgreement===1&&casSupports(cas,usable.slice(0,2).map(x=>x.answer));
  if(allowEarlyExit){
    await stage('review_skipped',{agreementScore:1,verifiedBy:'wolfram'});
    return {
      answer:expertBest.answer,model:expertBest.model,experts:expertNames,used:true,
      reviewSkipped:true,finalized:true,degraded:false,timeoutFallback:false,truncated:false,
      agreementScore:1,latencyMs:Date.now()-started,expertLatencyMs:expertRun.latencyMs,reviewLatencyMs:0
    };
  }

  const review='Bạn là chuyên gia kiểm định và hoàn thiện lời giải STUDY TH. Kiểm tra nhanh các điểm then chốt, chỉ sửa những chỗ cần thiết và xuất lời giải cuối gọn, chắc. '+
    'Đọc đề gốc và các lời giải nháp dưới đây. Tự kiểm tra từng bước, sửa sai nếu có và xuất ra MỘT lời giải cuối cùng hoàn chỉnh. '+(olympiad?'Đây là chế độ VMO/Olympic: hãy đóng vai giám khảo khó tính, đặc biệt kiểm tra tính tất yếu của từng suy luận, trường hợp dấu bằng và mọi điều kiện ẩn. ':'')+
    'Không nhắc tới chuyên gia hay quá trình kiểm định. Mọi biểu thức toán phải nằm trong \\( ... \\) hoặc \\[ ... \\]. Dùng ASCII <=, >=, <, > trong biểu thức. Không được xuất [object Object]. '+
    '\n\nĐỀ GỐC:\n'+context+
    '\n\nLỜI GIẢI NHÁP 1:\n'+experts[0].answer+
    (experts[1]?('\n\nLỜI GIẢI NHÁP 2:\n'+experts[1].answer):'');

  let out=expertBest,reviewLatencyMs=0,reviewFailed=false;
  await stage('review_started',{reason:experts.length<2?'single_expert':(bestAgreement===1?'not_verified_by_tool':'experts_disagree'),timeoutMs:P.reviewTimeout});
  try{
    const rs=await runReview(review,image,P.reviewTimeout,P.reviewTokens);
    reviewLatencyMs=rs.latencyMs;
    if(rs.truncated&&!expertBest.truncated){
      reviewFailed=true;
      await stage('review_fallback',{reason:'review_truncated'});
    }else{
      out=rs;
      await stage('review_done',{latencyMs:reviewLatencyMs});
    }
  }catch(_e){
    reviewFailed=true;
    await stage('review_fallback',{reason:'review_timeout_or_failure'});
  }

  if(repairable(out.answer)){
    try{
      const repairPrompt='Chỉ sửa lỗi định dạng trong câu trả lời sau. Giữ nguyên nội dung và logic. Thay mọi [object Object] bằng toán tử phù hợp, dùng <= hoặc >= hoặc < hoặc > rõ ràng. Không thêm giải thích mới.\n\n'+out.answer;
      const rr=await runReview(repairPrompt,image,P.repairTimeout,P.reviewTokens);
      if(rr.answer&&!rr.truncated)out={...out,answer:rr.answer};
    }catch(_e){}
  }

  const truncated=Boolean(out.truncated);
  const degraded=reviewFailed||truncated;
  return {
    answer:out.answer,model:out.model,experts:expertNames,used:true,
    reviewSkipped:false,finalized:!degraded,degraded,timeoutFallback:reviewFailed,truncated,
    agreementScore:Number(bestAgreement.toFixed(3)),
    latencyMs:Date.now()-started,expertLatencyMs:expertRun.latencyMs,reviewLatencyMs
  };
}
export const __test={casSupports,conclusionSignature,agreementScore,proofLike};
