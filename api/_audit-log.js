import crypto from 'node:crypto';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const PRIMARY_REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
const PRIMARY_REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const AUDIT_REDIS_URL = String(process.env.AUDIT_REDIS_REST_URL || PRIMARY_REDIS_URL).trim().replace(/\/$/, '');
const AUDIT_REDIS_TOKEN = String(process.env.AUDIT_REDIS_REST_TOKEN || PRIMARY_REDIS_TOKEN).trim();
const AUDIT_QUEUE_KEY = 'study-th:audit:queue';
const AUDIT_RECENT_KEY = 'study-th:audit:recent';
const AUDIT_DROPPED_KEY = 'study-th:audit:dropped';
const AUDIT_QUEUE_MAX = Math.max(100, Math.min(20_000, Number(process.env.AUDIT_QUEUE_MAX || 5_000)));
const AUDIT_RECENT_MAX = 200;
const AUDIT_COUNTER_TTL_SECONDS = 86_400;

function sha(value){ return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32); }
function ip(req){ return String(req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown').split(',')[0].trim(); }
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

const ENQUEUE_LUA = `
local queue=KEYS[1]
local recent=KEYS[2]
local dropped=KEYS[3]
local max=tonumber(ARGV[1])
local payload=ARGV[2]
local count=redis.call('LLEN',queue)
if count >= max then
  local d=redis.call('INCR',dropped)
  redis.call('EXPIRE',dropped,ARGV[3])
  return {0,count,d}
end
local next=redis.call('RPUSH',queue,payload)
redis.call('LPUSH',recent,payload)
redis.call('LTRIM',recent,0,ARGV[4])
redis.call('EXPIRE',recent,ARGV[3])
return {1,next,0}
`;

async function enqueueAudit(row){
  if(!AUDIT_REDIS_URL || !AUDIT_REDIS_TOKEN) return false;
  try{
    const payload=JSON.stringify(row);
    const r=await fetch(`${AUDIT_REDIS_URL}/pipeline`,{
      method:'POST',
      headers:{Authorization:`Bearer ${AUDIT_REDIS_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify([[
        'EVAL',ENQUEUE_LUA,'3',AUDIT_QUEUE_KEY,AUDIT_RECENT_KEY,AUDIT_DROPPED_KEY,
        String(AUDIT_QUEUE_MAX),payload,String(AUDIT_COUNTER_TTL_SECONDS),String(AUDIT_RECENT_MAX - 1)
      ]]),
      signal:AbortSignal.timeout(1200),
    });
    if(!r.ok) return false;
    const data=await r.json().catch(()=>null);
    const result=Array.isArray(data)?data[0]?.result:null;
    return Array.isArray(result) && Number(result[0])===1;
  }catch{return false;}
}

export async function persistAudit(row){
  // Best-effort audit. Admission is atomic and bounded so audit cannot consume
  // unbounded memory from the shared security state.
  try{return await enqueueAudit(row);}catch{return false;}
}

export const AUDIT_QUEUE_LIMIT = AUDIT_QUEUE_MAX;
export const AUDIT_REDIS_IS_DEDICATED = Boolean(process.env.AUDIT_REDIS_REST_URL);
export const AUDIT_QUEUE_SCRIPT = ENQUEUE_LUA;
