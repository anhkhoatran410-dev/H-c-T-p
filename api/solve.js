import './_gemini-network-guard.js';
import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, sameOrigin, distributedRateLimit, safeRequestId } from './_security.js';
import { shieldGate, recordShieldViolation } from './_intrusion-shield.js';
import { enforceCostChallenge } from './_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from './_agent-threat-defense.js';
import { aiLockdownStatus } from './_emergency-lock.js';
import { guardAiResponse } from './_response-guard.js';
import { sanitizeAiBody } from './_prompt-security.js';
import { sanitizeAiIngress } from './_ai-input-guard.js';
import { auditRecord, persistAudit } from './_audit-log.js';
import solveHandler from '../lib/solve-legacy.js';

const MAX_AI_BODY = 1_200_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

function writeAudit(req,fields){
  try{ void persistAudit(auditRecord(req,{endpoint:'/api/solve',...fields})); }catch{}
}

export const config = { api: { bodyParser: { sizeLimit: '1.2mb' } } };

export default async function handler(req,res){
  const started=Date.now();
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader('X-Request-ID',requestId);

  if(!enforceMethod(req,res,['POST']))return;
  if(!enforceJsonContentType(req,res))return;
  if(!enforceBodySize(req,res,MAX_AI_BODY)){
    await recordShieldViolation(req,'oversized-body');
    await recordAgentSignal(req,'oversized-body');
    return;
  }
  if(!sameOrigin(req,res)){
    await recordShieldViolation(req,'bad-origin');
    await recordAgentSignal(req,'bad-origin');
    return;
  }
  const lock=await aiLockdownStatus();
  if(lock.locked)return res.status(503).json({error:'AI service temporarily locked down.',requestId});
  if(!(await shieldGate(req,res)))return;
  if(!(await enforceAgentThreatDefense(req,res)))return;
  if(!(await enforceCostChallenge(req,res))){
    await recordAgentSignal(req,'cost-challenge');
    return;
  }
  if(!(await distributedRateLimit(req,res,{windowMs:WINDOW_MS,max:MAX_REQUESTS,keyPrefix:'ai-solve'}))){
    // Rate limiting a normal user is already a defensive control. Do not feed
    // legitimate rate-limit hits into the threat score, which could escalate
    // a student into the separate anti-automation challenge path.
    await recordShieldViolation(req,'rate-limit');
    return;
  }

  const raw=req?.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  if(!raw.message&&!raw.imageDataUrl){
    await recordShieldViolation(req,'empty-ai-request');
    await recordAgentSignal(req,'empty-ai-request');
    return res.status(400).json({error:'Thiếu đề bài hoặc ảnh.',requestId});
  }

  const guarded=sanitizeAiBody(raw);
  if(!guarded.ok){
    await recordShieldViolation(req,guarded.code);
    await recordAgentSignal(req,guarded.code);
    return res.status(guarded.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ đầu vào.',code:guarded.code,requestId});
  }
  const ingress=sanitizeAiIngress(guarded.body.message||'',guarded.body.history||[]);
  if(!ingress.ok){
    await recordShieldViolation(req,ingress.code);
    await recordAgentSignal(req,ingress.code);
    return res.status(ingress.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ ngữ nghĩa.',code:ingress.code,requestId});
  }
  req.body={...guarded.body,message:ingress.message,history:ingress.history};

  const originalEnd=typeof res.end==='function'?res.end.bind(res):null;
  try{
    const internal=req.body;
    let responseCaptured=null;
    const proxyRes={
      ...res,
      statusCode:res.statusCode,
      status(code){res.status(code);proxyRes.statusCode=code;return proxyRes;},
      setHeader(...args){res.setHeader(...args);return proxyRes;},
      getHeader(...args){return res.getHeader?.(...args);},
      json(payload){
        responseCaptured=JSON.stringify(payload??{});
        const guardedResponse=guardAiResponse(responseCaptured,'application/json; charset=utf-8');
        res.status(guardedResponse.ok?res.statusCode:guardedResponse.status);
        res.setHeader('Content-Type',guardedResponse.contentType);
        return res.end(guardedResponse.body);
      },
      end(body,...rest){
        const text=body==null?'':String(body);
        const response=guardAiResponse(text,res.getHeader?.('content-type')||'application/json; charset=utf-8');
        return originalEnd(response.ok?body:response.body,...rest);
      }
    };
    await solveHandler(req,proxyRes);
    writeAudit(req,{request_id:requestId,status_code:Number(res.statusCode||200),outcome:'response_delivered',model:null,response_text:responseCaptured||'',response_length:responseCaptured?.length||0,latency_ms:Date.now()-started});
  }catch(e){
    writeAudit(req,{request_id:requestId,status_code:500,outcome:'upstream_error',reason:'solver-error',response_length:0,latency_ms:Date.now()-started});
    if(!res.headersSent)return res.status(500).json({error:'Solver error.',requestId});
  }
}
