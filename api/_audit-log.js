import crypto from 'node:crypto';

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://mlqaeginqsgqacdqdzbm.supabase.co').trim().replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
const REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();

function sha(value){
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
}
function ip(req){
  return String(req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
function device(req){
  const fromBody = req?.body && typeof req.body === 'object' ? String(req.body.device_id || req.body.deviceId || '') : '';
  return fromBody || String(req?.headers?.['x-study-th-device'] || '');
}

async function supabaseInsert(row){
  if(!SERVICE_KEY || !SUPABASE_URL) return false;
  try{
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_request_audit`, {
      method:'POST',
      headers:{'Content-Type':'application/json',apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`},
      body:JSON.stringify(row),
      signal:AbortSignal.timeout(2500),
    });
    return r.ok;
  }catch{return false;}
}

async function redisEvent(row){
  if(!REDIS_URL || !REDIS_TOKEN) return false;
  try{
    const payload = JSON.stringify(row);
    const key = `study-th:audit:event:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
    const r = await fetch(`${REDIS_URL}/pipeline`,{
      method:'POST',
      headers:{Authorization:`Bearer ${REDIS_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify([
        ['SET',key,payload,'EX',86400],
        ['LPUSH','study-th:audit:recent',payload],
        ['LTRIM','study-th:audit:recent','0','199'],
        ['EXPIRE','study-th:audit:recent',86400],
      ]),
      signal:AbortSignal.timeout(1200),
    });
    return r.ok;
  }catch{return false;}
}

export function auditIdentity(req){
  const d=device(req);
  const actor=sha(`${ip(req)}|${String(req?.headers?.['user-agent']||'').slice(0,180)}`);
  return {actor,device:d?sha(d):null};
}

export function auditRecord(req, fields={}){
  const id=auditIdentity(req);
  return {
    request_id:String(fields.request_id || ''),
    actor_hash:id.actor,
    device_hash:id.device,
    endpoint:String(fields.endpoint || ''),
    method:String(req?.method || 'POST').toUpperCase(),
    status_code:Number(fields.status_code || 0) || null,
    outcome:String(fields.outcome || 'unknown').slice(0,40),
    reason:String(fields.reason || '').slice(0,120) || null,
    model:String(fields.model || '').slice(0,120) || null,
    response_hash:fields.response_text ? sha(fields.response_text) : null,
    response_length:Math.max(0,Number(fields.response_length ?? (fields.response_text ? String(fields.response_text).length : 0)) || 0),
    latency_ms:Math.max(0,Number(fields.latency_ms || 0) || 0),
    created_at:new Date().toISOString(),
  };
}

export async function persistAudit(row){
  // Best effort only: audit persistence must never hold up the user response.
  await Promise.allSettled([supabaseInsert(row),redisEvent(row)]);
}
