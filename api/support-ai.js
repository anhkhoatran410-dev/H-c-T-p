import '../lib/api/_gemini-network-guard.js';
import { enforceBodySize, enforceJsonContentType, sameOrigin, distributedRateLimit, applySecurityHeaders, safeRequestId } from '../lib/api/_security.js';
import { enforceCostChallenge } from '../lib/api/_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from '../lib/api/_agent-threat-defense.js';
import { sanitizeAiIngress } from '../lib/api/_ai-input-guard.js';
import { auditRecord, persistAudit } from '../lib/api/_audit-log.js';
import { acquireAiKey, getAiKeyPool, reportAiFailure, reportAiSuccess } from '../lib/api/_ai-resilience.js';
import { installAiResponseGuard } from '../lib/api/_response-guard.js';

const MODELS=['gemini-3.6-flash','gemini-3.5-flash-lite'];

function providerMessage(data,status){
  return data?.error?.message||data?.message||`Gemini HTTP ${status}`;
}
function writeAudit(req,fields){
  try{void persistAudit(auditRecord(req,{endpoint:'/api/support-ai',...fields}));}catch{}
}

export default async function handler(req,res){
  const started=Date.now();
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader('X-Request-ID',requestId);
  const uninstallAiResponseGuard=installAiResponseGuard(res);
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed',requestId});
  if(!enforceJsonContentType(req,res))return;
  if(!(await enforceAgentThreatDefense(req,res)))return;
  if(!(await enforceCostChallenge(req,res))){await recordAgentSignal(req,'cost-challenge');return;}
  if(!enforceBodySize(req,res,1_000_000)){await recordAgentSignal(req,'oversized-body');return;}
  if(!sameOrigin(req,res)){await recordAgentSignal(req,'bad-origin');return;}
  if(!(await distributedRateLimit(req,res,{windowMs:60_000,max:20,keyPrefix:'support-ai'}))){await recordAgentSignal(req,'rate-limit');return;}

  const message=String(req.body?.message||'').trim();
  if(!message)return res.status(400).json({error:'Thiếu câu hỏi.',requestId});
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-6):[];
  const ingress=sanitizeAiIngress(message,history);
  if(!ingress.ok){
    await recordAgentSignal(req,ingress.code);
    return res.status(ingress.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ ngữ nghĩa.',code:ingress.code,requestId});
  }

  const guardedMessage=String(ingress.message||'').slice(0,12000);
  const guardedHistory=ingress.history.slice(-6).map(x=>({
    role:String(x?.role||'user'),
    message:String(x?.message||x?.content||'').slice(0,2500)
  }));
  const subject=String(req.body?.subject||'').trim().slice(0,1200);
  const system=`Bạn là AI hỗ trợ học tập của STUDY TH. Trả lời bằng tiếng Việt, thân thiện, ngắn gọn nhưng đủ bước. Bạn có thể giải thích kiến thức, hướng dẫn cách làm bài, sửa lỗi tư duy và hướng dẫn sử dụng website. Không bịa dữ liệu của website. Nếu câu hỏi cần dữ liệu nội bộ mà bạn không được cung cấp, nói rõ rằng cần Admin kiểm tra. Không tự nhận là Admin.

QUY TẮC ĐỊNH DẠNG TOÁN:
- Công thức inline dùng \\( ... \\).
- Công thức đứng riêng dùng \\[ ... \\].
- Không trả LaTeX trần ngoài delimiter.`;
  const transcript=guardedHistory.map(x=>`${x.role}: ${x.message}`).join('\\n');
  const prompt=`${system}\\nMôn hiện tại: ${subject||'chưa chọn'}\\nLịch sử chat:\\n${transcript}\\nCâu hỏi mới: ${guardedMessage}`;

  let last='';
  try{
    if(!getAiKeyPool('GEMINI').length){
      return res.status(503).json({error:'AI hỗ trợ chưa được cấu hình Gemini.',requestId});
    }
    for(const model of MODELS){
      try{
        const body={
          contents:[{role:'user',parts:[{text:prompt}]}],
          generationConfig:{
            maxOutputTokens:1000,
            ...(model!=='gemini-3.5-flash-lite'?{thinkingConfig:{thinkingLevel:'low'}}:{})
          }
        };
        const apiEntry=await acquireAiKey('GEMINI');
        if(!apiEntry){last='Gemini key pool exhausted';continue;}
        const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-goog-api-key':apiEntry.key},
          body:JSON.stringify(body),
          signal:AbortSignal.timeout(18000)
        });
        const raw=await r.text();
        let data={};
        try{data=raw?JSON.parse(raw):{}}catch{}
        if(r.ok){
          await reportAiSuccess('GEMINI',apiEntry.id);
          const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim()||'';
          if(answer){
            writeAudit(req,{request_id:requestId,status_code:200,outcome:'response_delivered',model,response_text:answer,response_length:answer.length,latency_ms:Date.now()-started});
            return res.status(200).json({answer,model,security:{dlpRedactions:ingress.dlp.types.length}});
          }
          last=model+': AI trả về rỗng.';
        }else{
          const err=Object.assign(new Error(providerMessage(data,r.status)),{status:r.status,providerMessage:providerMessage(data,r.status)});
          await reportAiFailure('GEMINI',apiEntry.id,err);
          last=providerMessage(data,r.status);
          if(![400,404,429,500,502,503].includes(r.status))break;
        }
      }catch(e){
        last=e?.message||model+': request failed';
      }
    }
    writeAudit(req,{request_id:requestId,status_code:503,outcome:'provider_error',reason:String(last||'provider-unavailable').slice(0,120),response_length:0,latency_ms:Date.now()-started});
    return res.status(503).json({error:'AI hỗ trợ tạm thời không khả dụng.',requestId});
  }catch(e){
    writeAudit(req,{request_id:requestId,status_code:500,outcome:'internal_error',reason:'support-ai-internal-error',response_length:0,latency_ms:Date.now()-started});
    return res.status(500).json({error:'Không thể xử lý yêu cầu lúc này.',requestId});
  }finally{
    uninstallAiResponseGuard();
  }
}
