import crypto from 'node:crypto';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
const REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const AUDIT_QUEUE_KEY = 'study-th:audit:queue';
const AUDIT_RECENT_KEY = 'study-th:audit:recent';

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

export function auditIdentity(req){
  const d=device(req);
  const actor=sha(`${ip(req)}|${String(req?.headers?.['user-agent']||'').slice(0,180)}`);
  return {actor,device:d?sha(d):null};
}

export function auditRecord(req, fields={}){
  const id=auditIdentity(req);
  return {
    event_id:crypto.randomUUID(),
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

async function enqueueAudit(row){
  if(!REDIS_URL || !REDIS_TOKEN) return false;
  try{
    const payload=JSON.stringify(row);
    const key=`study-th:audit:event:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
    const r=await fetch(`${REDIS_URL}/pipeline`,{
      method:'POST',
      headers:{Authorization:`Bearer ${REDIS_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify([
        ['LPUSH',AUDIT_QUEUE_KEY,payload],
        ['SET',key,payload,'EX',86400],
        ['LPUSH',AUDIT_RECENT_KEY,payload],
        ['LTRIM',AUDIT_RECENT_KEY,'0','199'],
        ['EXPIRE',AUDIT_RECENT_KEY,86400],
      ]),
      signal:AbortSignal.timeout(1200),
    });
    return r.ok;
  }catch{return false;}
}

export async function persistAudit(row){
  // Request path only enqueues to Redis. Supabase is written by the audit worker in batches.
  try{ await enqueueAudit(row); }catch{}
}
