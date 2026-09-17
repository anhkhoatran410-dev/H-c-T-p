import { distributedRateLimit, enforceBodySize, enforceJsonContentType, applySecurityHeaders, sameOrigin, safeRequestId } from './_security.js';
import { internalNonce, internalSignature, internalTimestamp } from './_internal-replay.js';
import { shieldGate, recordShieldViolation } from './_intrusion-shield.js';
import { enforceCostChallenge } from './_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from './_agent-threat-defense.js';
import { aiLockdownStatus } from './_emergency-lock.js';
import { guardAiResponse } from './_response-guard.js';
import { sanitizeAiBody } from './_prompt-security.js';
import { sanitizeAiIngress } from './_ai-input-guard.js';
import { auditRecord, persistAudit } from './_audit-log.js';

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
function providerModel(text){
  try { const data=JSON.parse(String(text||'')); return String(data?.model||'').slice(0,120) || null; } catch { return null; }
}
function writeAudit(req, fields){
  try { void persistAudit(auditRecord(req,{endpoint:'/api/solve',...fields})); } catch {}
}

export default async function handler(req,res){
  const started=Date.now();
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader('X-Request-ID', requestId);
  if(String(req.method || '').toUpperCase() !== 'POST') return res.status(405).json({error:'Method not allowed',requestId});
  if(!enforceJsonContentType(req,res)) return;
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

  const rawBody = bodyOf(req);
  if(!rawBody.message && !rawBody.imageDataUrl) {
    await recordShieldViolation(req,'empty-ai-request');
    await recordAgentSignal(req,'empty-ai-request');
    return res.status(400).json({error:'Thiếu đề bài hoặc ảnh.',requestId});
  }

  const guarded = sanitizeAiBody(rawBody);
  if(!guarded.ok){
    await recordShieldViolation(req,guarded.code);
    await recordAgentSignal(req,guarded.code);
    return res.status(guarded.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ đầu vào.',code:guarded.code,requestId});
  }

  const ingress = sanitizeAiIngress(guarded.body.message || '', guarded.body.history || []);
  if(!ingress.ok){
    await recordShieldViolation(req,ingress.code);
    await recordAgentSignal(req,ingress.code);
    return res.status(ingress.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ ngữ nghĩa.',code:ingress.code,requestId});
  }
  guarded.body.message = ingress.message;
  guarded.body.history = ingress.history;

  const timestamp = internalTimestamp();
  const nonce = internalNonce();
  const signature = internalSignature(secret,timestamp,nonce);
  try{
    const upstream = await fetch(`${url}/api/_solve-core`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-STUDY-TH-INTERNAL':signature,'X-STUDY-TH-TIMESTAMP':String(timestamp),'X-STUDY-TH-NONCE':nonce,'X-Request-ID':requestId},
      body:JSON.stringify(guarded.body),
      signal:AbortSignal.timeout(60_000)
    });
    const text = await upstream.text();
    const response=guardAiResponse(text, upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    const delivered=response.ok;
    writeAudit(req,{
      request_id:requestId,
      status_code:upstream.status,
      outcome:delivered?'response_delivered':'response_guard_blocked',
      reason:delivered?'':'response-guard',
      model:providerModel(response.body),
      response_text:response.body,
      response_length:String(response.body||'').length,
      latency_ms:Date.now()-started,
    });
    res.status(delivered ? upstream.status : response.status);
    res.setHeader('Content-Type', response.contentType);
    return res.end(response.body);
  }catch(e){
    writeAudit(req,{
      request_id:requestId,
      status_code:504,
      outcome:'upstream_error',
      reason:'upstream-timeout-or-unreachable',
      response_length:0,
      latency_ms:Date.now()-started,
    });
    return res.status(504).json({error:'AI backend timeout hoặc không truy cập được.',requestId});
  }
}
