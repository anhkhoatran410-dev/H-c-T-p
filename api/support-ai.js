import { acquireAiKey, reportAiFailure, reportAiSuccess } from './_ai-resilience.js';
import { enforceBodySize, enforceJsonContentType, sameOrigin, distributedRateLimit, applySecurityHeaders, safeRequestId } from './_security.js';
import { enforceCostChallenge } from './_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from './_agent-threat-defense.js';
import { sanitizeAiIngress } from './_ai-input-guard.js';
import { auditRecord, persistAudit } from './_audit-log.js';

const MODELS=['gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash-lite'];
const SUPPORT_MODEL='gemini-3.8-flash';
const SUPPORT_TIMEOUT_MS=18000;
const MAX_KEY_ATTEMPTS=3;
function cleanKey(value){return String(value||'').replace(/^['"`]+|['"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();}
function providerMessage(data,status){return data?.error?.message||data?.message||`Gemini HTTP ${status}`;}
function extractInteractionText(data){const direct=String(data?.output_text||'').trim();if(direct)return direct;const outputs=Array.isArray(data?.outputs)?data.outputs:[];for(const item of outputs){const text=Array.isArray(item?.content)?item.content.filter(x=>x?.type==='text').map(x=>String(x.text||'')).join(' ').trim():'';if(text)return text;}const steps=Array.isArray(data?.steps)?data.steps:[];for(let i=steps.length-1;i>=0;i--){const content=steps[i]?.content;const text=Array.isArray(content)?content.filter(x=>x?.type==='text').map(x=>String(x.text||'')).join(' ').trim():'';if(text)return text;}return '';}
function writeAudit(req,fields){try{void persistAudit(auditRecord(req,{endpoint:'/api/support-ai',...fields}));}catch{}}
export default async function handler(req,res){
  const started=Date.now();
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader('X-Request-ID',requestId);
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed',requestId});
  if(!enforceJsonContentType(req,res))return;
  if(!(await enforceAgentThreatDefense(req,res)))return;
  if(!(await enforceCostChallenge(req,res))){await recordAgentSignal(req,'cost-challenge');return;}
  if(!enforceBodySize(req,res,1_000_000)){await recordAgentSignal(req,'oversized-body');return;}
  if(!sameOrigin(req,res)){await recordAgentSignal(req,'bad-origin');return;}
  if(!(await distributedRateLimit(req,res,{windowMs:60_000,max:20,keyPrefix:'support-ai'}))){await recordAgentSignal(req,'rate-limit');return;}

  const message=String(req.body?.message||'').trim();
  if(!message)return res.status(400).json({error:'Thiếu câu hỏi.',requestId});
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-8):[];
  const ingress=sanitizeAiIngress(message,history);
  if(!ingress.ok){await recordAgentSignal(req,ingress.code);return res.status(ingress.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ ngữ nghĩa.',code:ingress.code,requestId});}
  const guardedMessage=ingress.message;
  const guardedHistory=ingress.history;
  const first=await acquireAiKey('GEMINI');
  if(!first)return res.status(503).json({error:'AI hỗ trợ tạm thời không khả dụng.',requestId});
  const noteFailure=async(k,e)=>{if(k)await reportAiFailure('GEMINI',k.id,e);};
  const noteSuccess=async k=>{if(k)await reportAiSuccess('GEMINI',k.id);};
  const badIndex=[...first.key].findIndex(ch=>ch.charCodeAt(0)>127);
  if(badIndex>=0){await noteFailure(first,{status:401});return res.status(500).json({error:'AI hỗ trợ chưa sẵn sàng.',requestId});}
  const subject=String(req.body?.subject||'').trim();
  const system=`Bạn là AI hỗ trợ học tập của STUDY TH. Trả lời bằng tiếng Việt, thân thiện, ngắn gọn nhưng đủ bước. Bạn có thể giải thích kiến thức, hướng dẫn cách làm bài, sửa lỗi tư duy và hướng dẫn sử dụng website. Không bịa dữ liệu của website. Nếu câu hỏi cần dữ liệu nội bộ mà bạn không được cung cấp, nói rõ rằng cần Admin kiểm tra. Không tự nhận là Admin.\n\nQUY TẮC ĐỊNH DẠNG TOÁN BẮT BUỘC:\n- Mọi công thức toán phải dùng LaTeX có delimiter. Công thức inline bắt buộc viết dạng \\( ... \\). Công thức đứng riêng/bảng công thức bắt buộc viết dạng \\[ ... \\].\n- Không được trả về LaTeX trần như \\frac{a}{b}, \\sqrt{x}, x^2 hoặc \\infty bên ngoài delimiter.\n- Có thể dùng Unicode đơn giản như ∞, √, ≤, ≥, × khi không cần công thức LaTeX.\n- Khi có phân số, căn, đạo hàm, tích phân, giới hạn, ma trận hoặc công thức nhiều bước, ưu tiên LaTeX có delimiter để giao diện KaTeX render chính xác.`;
  const transcript=guardedHistory.map(x=>`${x.role||'user'}: ${String(x.message||x.content||'')}`).join('\n');
  const prompt=`${system}\nMôn hiện tại: ${subject||'chưa chọn'}\nLịch sử chat:\n${transcript}\nCâu hỏi mới: ${guardedMessage}`;
  let last='';const attempted=new Set();
  try{
    for(let keyAttempt=0;keyAttempt<MAX_KEY_ATTEMPTS;keyAttempt++){
      const keyEntry=keyAttempt===0?first:await acquireAiKey('GEMINI',Array.from(attempted));
      if(!keyEntry)break;attempted.add(keyEntry.id);const key=cleanKey(keyEntry.key);
      try{
        const interaction=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({model:SUPPORT_MODEL,store:false,input:prompt,generation_config:{thinking_level:'low'}}),signal:AbortSignal.timeout(SUPPORT_TIMEOUT_MS)});
        const raw=await interaction.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
        if(interaction.ok){const answer=extractInteractionText(data);if(answer){await noteSuccess(keyEntry);writeAudit(req,{request_id:requestId,status_code:200,outcome:'response_delivered',model:data?.model||SUPPORT_MODEL,response_text:answer,response_length:answer.length,latency_ms:Date.now()-started});return res.status(200).json({answer,model:data?.model||SUPPORT_MODEL,api:'interactions',security:{dlpRedactions:ingress.dlp.types.length}});}last='Interactions API trả về rỗng.';await noteFailure(keyEntry,{status:502});}else{last=providerMessage(data,interaction.status);await noteFailure(keyEntry,{status:interaction.status});}
      }catch(e){last=e?.message||'Gemini Interactions API lỗi.';await noteFailure(keyEntry,{status:e?.status||0,code:e?.code});}
    }
    for(const model of MODELS){
      const keyEntry=await acquireAiKey('GEMINI',Array.from(attempted));if(!keyEntry)break;attempted.add(keyEntry.id);const key=cleanKey(keyEntry.key);
      try{
        const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1200}}),signal:AbortSignal.timeout(30000)});
        const raw2=await r.text();let data2={};try{data2=raw2?JSON.parse(raw2):{}}catch{}
        if(r.ok){const answer=data2?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';if(answer){await noteSuccess(keyEntry);writeAudit(req,{request_id:requestId,status_code:200,outcome:'response_delivered',model,response_text:answer,response_length:answer.length,latency_ms:Date.now()-started});return res.status(200).json({answer,model,security:{dlpRedactions:ingress.dlp.types.length}});}last=`${model}: AI trả về rỗng.`;await noteFailure(keyEntry,{status:502});}else{last=providerMessage(data2,r.status);await noteFailure(keyEntry,{status:r.status});}
      }catch(e){last=e?.message||`${model}: request failed`;await noteFailure(keyEntry,{status:e?.status||0,code:e?.code});}
    }
    writeAudit(req,{request_id:requestId,status_code:503,outcome:'provider_error',reason:String(last||'provider-unavailable').slice(0,120),response_length:0,latency_ms:Date.now()-started});
    return res.status(503).json({error:'AI hỗ trợ tạm thời không khả dụng.',requestId});
  }catch(e){writeAudit(req,{request_id:requestId,status_code:500,outcome:'internal_error',reason:'support-ai-internal-error',response_length:0,latency_ms:Date.now()-started});return res.status(500).json({error:'Không thể xử lý yêu cầu lúc này.',requestId});}
}
