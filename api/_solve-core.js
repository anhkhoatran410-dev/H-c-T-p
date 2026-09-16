import crypto from 'node:crypto';
import './_gemini-network-guard.js';
import solveHandler from './solve.js';
import { applySecurityHeaders, enforceBodySize, rateLimit, safeRequestId } from './_security.js';
import { consumeNonce, internalSignature, timingSafeHexEqual, verifyTimestamp } from './_internal-replay.js';
import { recordThreat } from './_adaptive-defense.js';

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
  return solveHandler(req,res);
}
