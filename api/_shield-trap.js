import { applySecurityHeaders, enforceBodySize, safeRequestId } from './_security.js';
import { recordShieldViolation, shieldFingerprint } from './_intrusion-shield.js';

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader('X-Request-ID',requestId);
  await recordShieldViolation(req,'honeypot-route');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Retry-After','900');
  // Intentionally reveal no route details, fingerprints, or defensive state.
  return res.status(404).json({error:'Not found',requestId});
}
