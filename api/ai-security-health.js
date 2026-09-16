import { isAdminRequest } from './admin-login.js';
import { applySecurityHeaders, enforceMethod, rateLimit, sameOrigin, safeRequestId } from './_security.js';
import { aiPoolSnapshot } from './_ai-resilience.js';

export default async function handler(req,res){
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID',safeRequestId());
  if(!enforceMethod(req,res,['GET'])) return;
  if(!sameOrigin(req,res)) return;
  if(!rateLimit(req,res,{max:10,windowMs:60_000,keyPrefix:'ai-security-health'})) return;
  if(!isAdminRequest(req)) return res.status(401).json({error:'Admin session required'});

  const pool=aiPoolSnapshot('GEMINI');
  return res.status(200).json({
    ok:true,
    provider:'GEMINI',
    totalKeys:pool.length,
    healthyKeys:pool.filter(x=>x.circuit==='closed').length,
    openCircuits:pool.filter(x=>x.circuit==='open').length,
    keys:pool
  });
}
