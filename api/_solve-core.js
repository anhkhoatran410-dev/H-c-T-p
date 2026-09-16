import crypto from 'node:crypto';
import solveHandler from './solve.js';
import { applySecurityHeaders, enforceBodySize, rateLimit, safeRequestId } from './_security.js';

function secret(){ return String(process.env.INTERNAL_GATEWAY_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.GEMINI_API_KEY || '').trim(); }
function expected(){ const s=secret(); return s ? crypto.createHmac('sha256',s).update('study-th-ai-gateway').digest('hex') : ''; }
function authorized(req){
  const got=String(req.headers?.['x-study-th-internal']||'');
  const exp=expected();
  if(!got||!exp) return false;
  const a=Buffer.from(got); const b=Buffer.from(exp);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader('X-Request-ID',requestId);
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed',requestId});
  if(!authorized(req)) return res.status(404).json({error:'Not found',requestId});
  if(!enforceBodySize(req,res,1_200_000)) return;
  if(!rateLimit(req,res,{windowMs:60_000,max:12,keyPrefix:'ai-core'})) return;
  return solveHandler(req,res);
}
