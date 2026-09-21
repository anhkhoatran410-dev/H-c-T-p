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
import { getAiKeyPool } from '../lib/api/_ai-resilience.js';


let solveHandlerPromise=null;
async function loadSolveHandler(){
  if(!solveHandlerPromise) solveHandlerPromise=import('../lib/solve-legacy.js').then(m=>m.default);
  return solveHandlerPromise;
}

function configuredGeminiModels(){
  const configured=String(process.env.GEMINI_MODEL||'').trim();
  const extra=String(process.env.GEMINI_FALLBACK_MODELS||'').split(',').map(x=>String(x||'').trim()).filter(Boolean);
  return [...new Set([configured,...extra,'gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash-lite'].filter(Boolean))];
}

function imageInlinePart(image){
  const s=String(image||'');
  const m=s.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
  return m?{inlineData:{mimeType:m[1],data:m[2]}}:null;
}

async function directGeminiFallback(body){
  const pool=getAiKeyPool('GEMINI');
  const models=configuredGeminiModels();
  const message=String(body?.message||'Giải bài trong ảnh.');
  const subject=String(body?.subject||'').trim();
  const image=String(body?.imageDataUrl||'');
  const parts=[{text:[
    'Bạn là STUDY TH — bộ giải học tập dự phòng.',
    'Giải trực tiếp từ đề hiện tại; không sử dụng dữ kiện từ câu hỏi trước.',
    'Với toán: nêu dữ kiện, mục tiêu, ý tưởng, biến đổi quan trọng, kiểm tra và kết luận.',
    'Với bài chứng minh: không được chỉ thử số; phải chứng minh mệnh đề tổng quát.',
    'Mọi công thức phải nằm trong \\( ... \\) hoặc \\[ ... \\].',
    'Môn: '+(subject||'chưa chọn'),
    'Đề/Yêu cầu:',message
  ].join('\\n')}];
  const img=imageInlinePart(image); if(img)parts.push(img);
  let last=null;
  for(const apiEntry of pool.length?pool:[{key:String(process.env.GEMINI_API_KEY||'')}]){
    const api=String(apiEntry?.key||'').trim(); if(!api)continue;
    for(const model of models){
      try{
        const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-goog-api-key':api},
          body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:7000,thinkingConfig:{thinkingLevel:'high'}}}),
          signal:AbortSignal.timeout(25000)
        });
        const raw=await r.text(); let d={}; try{d=raw?JSON.parse(raw):{}}catch{}
        if(!r.ok){last=new Error(String(d?.error?.message||('Gemini HTTP '+r.status)));last.status=r.status;continue;}
        const answer=String(d?.candidates?.[0]?.content?.parts?.filter(p=>p?.text).map(p=>p.text).join('')||'').trim();
        if(answer)return {answer,model,source:'gemini-fallback',finalized:true,degraded:false,reviewSkipped:true};
        last=new Error('Gemini trả về rỗng.');
      }catch(e){last=e;}
    }
  }
  throw last||Object.assign(new Error('GEMINI_API_KEY chưa được cấu hình.'),{code:'AI_CONFIG_MISSING'});
}

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
      try{res.write('event: '+event+'\n'+'data: '+JSON.stringify(payload??{})+'\n\n');}catch{}
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
          const raw=String(body);
          const checked=guardAiResponse(raw,'application/json; charset=utf-8');
          let payload=body;
          let status=proxyStream.statusCode;
          try{payload=JSON.parse(checked.ok?raw:checked.body)}catch{payload=checked.ok?raw:JSON.parse(checked.body)}
          if(!checked.ok)status=checked.status;
          writeEvent('result',{status,data:payload});
        }
        writeEvent('done',{});
        return originalEndStream?originalEndStream():undefined;
      }
    };
    try{
      const solveHandler=await loadSolveHandler();
      await solveHandler(req,proxyStream);
    }catch(e){
      clearInterval(heartbeat);
      try{
        const fallback=await directGeminiFallback(req.body);
        const fallbackPayload={answer:fallback.answer,model:fallback.model,source:fallback.source,finalized:true,degraded:true,reviewSkipped:true};
        const fallbackGuard=guardAiResponse(JSON.stringify(fallbackPayload),'application/json; charset=utf-8');
        if(!fallbackGuard.ok) writeEvent('result',{status:fallbackGuard.status,data:JSON.parse(fallbackGuard.body)});
        else writeEvent('result',{status:200,data:fallbackPayload});
        writeEvent('done',{});
      }catch(fallbackError){
        writeEvent('error',{message:String(fallbackError?.message||e?.message||e),requestId,code:fallbackError?.code||'solver-failed'});
        writeEvent('done',{});
      }
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
    const solveHandler=await loadSolveHandler();
    await solveHandler(req,proxyRes);
    writeAudit(req,{request_id:requestId,status_code:Number(res.statusCode||200),outcome:'response_delivered',model:null,response_text:responseCaptured||'',response_length:responseCaptured?.length||0,latency_ms:Date.now()-started});
  }catch(e){
    try{
      const fallback=await directGeminiFallback(req.body);
      const payload={answer:fallback.answer,model:fallback.model,source:fallback.source,finalized:true,degraded:true,reviewSkipped:true,fallback:true,requestId};
      const fallbackGuard=guardAiResponse(JSON.stringify(payload),'application/json; charset=utf-8');
      const safePayload=fallbackGuard.ok?payload:JSON.parse(fallbackGuard.body);
      const safeStatus=fallbackGuard.ok?200:fallbackGuard.status;
      writeAudit(req,{request_id:requestId,status_code:safeStatus,outcome:'fallback_response',model:fallback.model,response_text:fallbackGuard.ok?fallback.answer:'[blocked by response guard]',response_length:fallbackGuard.ok?fallback.answer.length:0,latency_ms:Date.now()-started});
      if(!res.headersSent){
        res.statusCode=safeStatus;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        return res.end(JSON.stringify(safePayload));
      }
    }catch(fallbackError){
      writeAudit(req,{request_id:requestId,status_code:502,outcome:'solver_fallback_failed',reason:String(fallbackError?.code||'fallback-failed'),response_length:0,latency_ms:Date.now()-started});
      if(!res.headersSent)return res.status(502).json({error:'Bộ giải AI tạm thời không khả dụng.',code:String(fallbackError?.code||'solver-fallback-failed'),requestId});
    }
  }
}
