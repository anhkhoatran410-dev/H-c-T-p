import { distributedRateLimit, enforceBodySize, applySecurityHeaders, sameOrigin, safeRequestId } from './_security.js';
import { internalNonce, internalSignature, internalTimestamp } from './_internal-replay.js';
import { shieldGate, recordShieldViolation } from './_intrusion-shield.js';
import { enforceCostChallenge } from './_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from './_agent-threat-defense.js';
import { aiLockdownStatus } from './_emergency-lock.js';
import { guardAiResponse } from './_response-guard.js';
import { inspectAiPrompt } from './_prompt-security.js';

const MAX_AI_BODY = 1_200_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

function internalSecret(){ return String(process.env.INTERNAL_GATEWAY_SECRET || '').trim(); }
function baseUrl(req){
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}
function bodyOf(req){
  if(req?.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if(typeof req?.body === 'string') { try { const v = JSON.parse(req.body); return v && typeof v === 'object' ? v : {}; } catch {} }
  return {};
}
function guardPromptBody(body){
  if(!body || typeof body !== 'object' || Array.isArray(body)) return { ok:false, code:'invalid-ai-body', status:400, body:{} };
  if(typeof body.message === 'string'){
    const checked=inspectAiPrompt(body.message);
    if(!checked.ok) return { ...checked, body:{} };
    body={...body,message:checked.text};
  }
  if(Array.isArray(body.history)){
    if(body.history.length>80) return {ok:false,code:'history-too-large',status:413,body:{}};
    const history=[];
    for(const item of body.history){
      if(!item || typeof item!=='object'){ history.push(item); continue; }
      if(typeof item.content!=='string'){ history.push(item); continue; }
      const checked=inspectAiPrompt(item.content);
      if(!checked.ok) return {...checked,body:{}};
      history.push({...item,content:checked.text});
    }
    body={...body,history};
  }
  return {ok:true,body};
}
export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader('X-Request-ID', requestId);
  if(String(req.method || '').toUpperCase() !== 'POST') return res.status(405).json({error:'Method not allowed',requestId});
  const lock=await aiLockdownStatus();
  if(lock.locked) return res.status(503).json({error:'AI service temporarily locked down.',requestId});
  if(!(await shieldGate(req,res))) return;
  if(!(await enforceAgentThreatDefense(req,res))) return;
  if(!(await enforceCostChallenge(req,res))) { await recordAgentSignal(req,'cost-challenge'); return; }
  if(!enforceBodySize(req,res,MAX_AI_BODY)) { await recordShieldViolation(req,'oversized-body'); await recordAgentSignal(req,'oversized-body'); return; }
  if(!sameOrigin(req,res)) { await recordShieldViolation(req,'bad-origin'); await recordAgentSignal(req,'bad-origin'); return; }
  if(!(await distributedRateLimit(req,res,{windowMs:WINDOW_MS,max:MAX_REQUESTS,keyPrefix:'ai-solve'}))) {
    await recordShieldViolation(req,'rate-limit');
    await recordAgentSignal(req,'rate-limit');
    return;
  }
  const target = String(req.query?.target || '').trim();
  if(target !== 'solve') { await recordShieldViolation(req,'unexpected-route'); await recordAgentSignal(req,'unexpected-route'); return res.status(404).json({error:'Gateway route not found',requestId}); }
  const secret = internalSecret();
  const url = baseUrl(req);
  if(!secret || !url) return res.status(503).json({error:'AI gateway chưa được cấu hình đầy đủ.',requestId});
  let body = bodyOf(req);
  if(!body.message && !body.imageDataUrl) { await recordShieldViolation(req,'empty-ai-request'); await recordAgentSignal(req,'empty-ai-request'); return res.status(400).json({error:'Thiếu đề bài hoặc ảnh.',requestId}); }
  if(typeof body.message === 'string' && body.message.length > 30_000) { await recordShieldViolation(req,'oversized-message'); await recordAgentSignal(req,'oversized-message'); return res.status(413).json({error:'Đề bài quá dài.',requestId}); }
  const promptGuard=guardPromptBody(body);
  if(!promptGuard.ok){ await recordShieldViolation(req,promptGuard.code); await recordAgentSignal(req,promptGuard.code); return res.status(promptGuard.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ đầu vào.',code:promptGuard.code,requestId}); }
  body=promptGuard.body;
  const timestamp = internalTimestamp();
  const nonce = internalNonce();
  const signature = internalSignature(secret,timestamp,nonce);
  try{
    const upstream = await fetch(`${url}/api/_solve-core`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-STUDY-TH-INTERNAL':signature,'X-STUDY-TH-TIMESTAMP':String(timestamp),'X-STUDY-TH-NONCE':nonce,'X-Request-ID':requestId},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(60_000)
    });
    const text = await upstream.text();
    const guarded=guardAiResponse(text, upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.status(guarded.ok ? upstream.status : guarded.status);
    res.setHeader('Content-Type', guarded.contentType);
    return res.end(guarded.body);
  }catch(e){ return res.status(504).json({error:'AI backend timeout hoặc không truy cập được.',requestId}); }
}
