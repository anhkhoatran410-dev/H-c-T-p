const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co').trim().replace(/\/$/,'');
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();

function authHeaders(extra={}){
  return {'Content-Type':'application/json','apikey':SERVICE_KEY,'Authorization':'Bearer '+SERVICE_KEY,...extra};
}
async function sbFetch(path,options={}){
  if(!SERVICE_KEY)throw new Error('SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình.');
  const r=await fetch(SUPABASE_URL+path,{...options,headers:authHeaders(options.headers||{}),signal:AbortSignal.timeout(7000)});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok)throw new Error(data?.message||data?.hint||data?.error||('Supabase HTTP '+r.status));
  return data;
}
export async function rpc(name,body){
  return sbFetch('/rest/v1/rpc/'+encodeURIComponent(name),{method:'POST',body:JSON.stringify(body||{})});
}
export async function getJob(id){
  const rows=await sbFetch('/rest/v1/ai_solver_jobs?id=eq.'+encodeURIComponent(id)+'&select=id,status,tier,stage,stage_detail,error,result,attempts,max_attempts,created_at,started_at,finished_at,updated_at&limit=1');
  return Array.isArray(rows)?(rows[0]||null):null;
}
export async function createJob({idempotencyKey,tier,payload,maxAttempts=2}){
  const rows=await rpc('ai_solver_create_job',{p_idempotency_key:idempotencyKey,p_tier:tier,p_payload:payload,p_max_attempts:maxAttempts});
  return Array.isArray(rows)?rows[0]||null:null;
}
