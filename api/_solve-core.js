import crypto from 'node:crypto';
import './_gemini-network-guard.js';
import solveHandler from './solve.js';
import { applySecurityHeaders, enforceBodySize, rateLimit, safeRequestId } from './_security.js';
import { consumeNonce, internalSignature, timingSafeHexEqual, verifyTimestamp } from './_internal-replay.js';
import { recordThreat } from './_adaptive-defense.js';
import { sanitizeAiBody } from './_prompt-security.js';
import { sanitizeAiIngress } from './_ai-input-guard.js';

function secret(){ return String(process.env.INTERNAL_GATEWAY_SECRET || '').trim(); }

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader('X-Request-ID',requestId);
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed',requestId});

  const s=secret();
  const signature=String(req.headers?.['x-study-th-internal']||'');
  const timestamp=String(req.headers?.['x-study-th-timestamp']||'');
  const nonce=String(req.headers?.['x-study-th-nonce']||'');
  if(!s || !signature || !timestamp || !nonce){ await recordThreat(req,'missing-internal-proof'); return res.status(404).json({error:'Not found',requestId}); }
  if(!verifyTimestamp(timestamp)){ await recordThreat(req,'stale-internal-proof'); return res.status(404).json({error:'Not found',requestId}); }

  const expected=internalSignature(s,Number(timestamp),nonce);
  if(!timingSafeHexEqual(signature,expected)){ await recordThreat(req,'invalid-internal-signature'); return res.status(404).json({error:'Not found',requestId}); }
  if(!(await consumeNonce(nonce))){ await recordThreat(req,'replayed-internal-nonce'); return res.status(404).json({error:'Not found',requestId}); }

  if(!enforceBodySize(req,res,1_200_000)) return;
  if(!rateLimit(req,res,{windowMs:60_000,max:12,keyPrefix:'ai-core'})) return;

  const rawBody = req?.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const guarded = sanitizeAiBody(rawBody);
  if(!guarded.ok){ await recordThreat(req,guarded.code); return res.status(guarded.status).json({error:'Invalid AI request.',code:guarded.code,requestId}); }
  const ingress = sanitizeAiIngress(guarded.body.message || '', guarded.body.history || []);
  if(!ingress.ok){ await recordThreat(req,ingress.code); return res.status(ingress.status).json({error:'Invalid AI request.',code:ingress.code,requestId}); }
  req.body = { ...guarded.body, message: ingress.message, history: ingress.history };

  return solveHandler(req,res);
}
