import crypto from 'node:crypto';
import { applySecurityHeaders, enforceBodySize, sameOrigin, rateLimit, safeRequestId } from './_security.js';

const MAX_AI_BODY = 1_200_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

function internalSecret(){
  return String(process.env.INTERNAL_GATEWAY_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.GEMINI_API_KEY || '').trim();
}

function internalProof(){
  const s = internalSecret();
  return s ? crypto.createHmac('sha256', s).update('study-th-ai-gateway').digest('hex') : '';
}

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

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader('X-Request-ID', requestId);
  if(!['POST'].includes(String(req.method || '').toUpperCase())) return res.status(405).json({error:'Method not allowed',requestId});
  if(!enforceBodySize(req,res,MAX_AI_BODY)) return;
  if(!sameOrigin(req,res)) return;
  if(!rateLimit(req,res,{windowMs:WINDOW_MS,max:MAX_REQUESTS,keyPrefix:'ai-solve'})) return;

  const target = String(req.query?.target || '').trim();
  if(target !== 'solve') return res.status(404).json({error:'Gateway route not found',requestId});

  const proof = internalProof();
  const url = baseUrl(req);
  if(!proof || !url) return res.status(503).json({error:'AI gateway chưa được cấu hình đầy đủ.',requestId});

  const body = bodyOf(req);
  if(!body.message && !body.imageDataUrl) return res.status(400).json({error:'Thiếu đề bài hoặc ảnh.',requestId});
  if(typeof body.message === 'string' && body.message.length > 30_000) return res.status(413).json({error:'Đề bài quá dài.',requestId});

  try{
    const upstream = await fetch(`${url}/api/_solve-core`,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-STUDY-TH-INTERNAL':proof,'X-Request-ID':requestId},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(90_000)
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    return res.end(text);
  }catch(e){
    return res.status(504).json({error:'AI backend timeout hoặc không truy cập được.',requestId});
  }
}
