import '../lib/api/_gemini-network-guard.js';
import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, sameOrigin, distributedRateLimit, safeRequestId } from '../lib/api/_security.js';
import { shieldGate, recordShieldViolation } from '../lib/api/_intrusion-shield.js';
import { enforceCostChallenge } from '../lib/api/_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from '../lib/api/_agent-threat-defense.js';
import { aiLockdownStatus } from '../lib/api/_emergency-lock.js';
import { guardAiResponse } from '../lib/api/_response-guard.js';
import { sanitizeAiBody } from '../lib/api/_prompt-security.js';
import { sanitizeAiIngress } from '../lib/api/_ai-input-guard.js';
import { auditRecord, persistAudit } from '../lib/api/_audit-log.js';
import solveHandler from '../lib/solve-legacy.js';

const MAX_AI_BODY = 1_200_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

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
    // The dedicated rate limiter is the control here. A normal rate-limit hit
    // must not also increase threat/quarantine scores.
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

  const wantsStream=String(req?.query?.stream||'')==='1' || String(req?.headers?.accept||'').includes('text/event-stream');
  if(wantsStream){
    res.statusCode=200;
    res.setHeader('Content-Type','text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control','no-cache, no-transform');
    res.setHeader('Connection','keep-alive');
    res.setHeader('X-Accel-Buffering','no');
    const writeEvent=(event,payload)=>{
      if(res.writableEnded)return;
      try{res.write('event: '+event+'\\n'+'data: '+JSON.stringify(payload??{})+'\\n\\n');}catch{}
    };
    writeEvent('connected',{requestId});
    req.__aiStage=async(stage,data={})=>writeEvent('stage',{stage,...data});
    const heartbeat=setInterval(()=>writeEvent('ping',{t:Date.now()}),5000);

    const originalEndStream=typeof res.end==='function'?res.end.bind(res):null;
    const proxyStream={
      ...res,
      statusCode:200,
      status(code){proxyStream.statusCode=code;return proxyStream;},
      setHeader(...args){try{res.setHeader(...args)}catch{}return proxyStream;},
      getHeader(...args){return res.getHeader?.(...args);},
      json(payload){
        clearInterval(heartbeat);
        const body=JSON.stringify(payload??{});
        const guardedResponse=guardAiResponse(body,'application/json; charset=utf-8');
        writeEvent('result',{status:guardedResponse.ok?proxyStream.statusCode:guardedResponse.status,data:guardedResponse.ok?payload:JSON.parse(guardedResponse.body)});
        writeEvent('done',{});
        return originalEndStream?originalEndStream():undefined;
      },
      end(body){
        clearInterval(heartbeat);
        if(body!=null){
          let payload=body;
          try{payload=JSON.parse(String(body))}catch{}
          writeEvent('result',{status:proxyStream.statusCode,data:payload});
        }
        writeEvent('done',{});
        return originalEndStream?originalEndStream():undefined;
      }
    };
    try{
      await solveHandler(req,proxyStream);
    }catch(e){
      clearInterval(heartbeat);
      writeEvent('error',{message:String(e?.message||e),requestId});
      writeEvent('done',{});
      if(!res.writableEnded&&originalEndStream)originalEndStream();
    }
    return;
  }

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
