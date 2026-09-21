import solverHandler from '../lib/solve-legacy.js';
import { installAiResponseGuard } from '../lib/api/_response-guard.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co').trim().replace(/\/$/,'');
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const WORKER_ID=String(process.env.AI_WORKER_ID||('worker-'+process.pid)).slice(0,120);
const POLL_MS=Math.max(500,Number(process.env.AI_WORKER_POLL_MS||1500));
const LEASE_SECONDS=Math.max(30,Math.min(600,Number(process.env.AI_JOB_LEASE_SECONDS||120)));
const MAX_CONCURRENCY=Math.max(1,Math.min(20,Number(process.env.AI_MAX_CONCURRENCY||1)));
const MAX_JOB_MS=Math.max(30,Number(process.env.AI_JOB_MAX_SECONDS||600))*1000;
const BUSY_RETRY_S=Math.max(2,Number(process.env.AI_QUEUE_BUSY_RETRY_SECONDS||5));
const REAP_MS=Math.max(10000,Number(process.env.AI_REAP_INTERVAL_MS||30000));
const RETENTION_DAYS=Math.max(1,Number(process.env.AI_JOB_RETENTION_DAYS||7));
const SHUTDOWN_GRACE_MS=Math.max(0,Number(process.env.AI_SHUTDOWN_GRACE_MS||25000));
let current=null;
let shuttingDown=false;

function headers(){return {'Content-Type':'application/json','apikey':SERVICE_KEY,'Authorization':'Bearer '+SERVICE_KEY}}
async function rpc(name,body){
  if(!SERVICE_KEY)throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+encodeURIComponent(name),{
    method:'POST',headers:headers(),body:JSON.stringify(body||{}),signal:AbortSignal.timeout(7000)
  });
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok)throw new Error(data?.message||data?.hint||data?.error||('RPC '+name+' HTTP '+r.status));
  return data;
}

function fakeResponse(){
  let body='';let statusCode=200;const h={};
  const res={
    get statusCode(){return statusCode},
    set statusCode(v){statusCode=v},
    headersSent:false,
    status(code){statusCode=Number(code)||500;return res},
    setHeader(k,v){h[String(k).toLowerCase()]=String(v);return res},
    getHeader(k){return h[String(k).toLowerCase()]},
    json(payload){body=JSON.stringify(payload??{});res.headersSent=true;return res.end(body)},
    end(value){if(value!==undefined)body=String(value);res.headersSent=true;return res}
  };
  return {res,getBody:()=>body,getStatus:()=>statusCode};
}

async function runSolver(payload,onStage){
  const fakeReq={
    method:'POST',
    body:payload,
    headers:{'content-type':'application/json','origin':'https://worker.internal'},
    query:{},
    __aiStage:onStage,
    __aiWorker:true
  };
  const fake=fakeResponse();
  const uninstallAiResponseGuard=installAiResponseGuard(fake.res);
  try{
    await solverHandler(fakeReq,fake.res);
  }finally{
    uninstallAiResponseGuard();
  }
  let data={};
  try{data=fake.getBody()?JSON.parse(fake.getBody()):{}}catch{}
  return {status:fake.getStatus(),data};
}

async function processOne(msg){
  const jobId=String(msg?.message?.job_id||'');
  if(!jobId){await rpc('ai_solver_queue_delete',{p_msg_id:msg.msg_id});return;}
  const claimed=await rpc('ai_solver_claim_job',{
    p_job_id:jobId,p_worker_id:WORKER_ID,p_lease_seconds:LEASE_SECONDS,p_max_concurrency:MAX_CONCURRENCY
  });
  const row=Array.isArray(claimed)?claimed[0]:claimed;
  if(!row?.claimed){
    const reason=String(row?.reason||'unknown');
    if(reason==='busy'){
      await rpc('ai_solver_queue_set_vt',{p_msg_id:msg.msg_id,p_seconds:BUSY_RETRY_S}).catch(()=>{});
      return 'busy';
    }
    await rpc('ai_solver_queue_delete',{p_msg_id:msg.msg_id}).catch(()=>{});
    return reason;
  }

  current={jobId,msgId:msg.msg_id};
  let lostLease=false;
  let timer=setInterval(async()=>{
    try{
      const ok=await rpc('ai_solver_renew_job',{p_job_id:jobId,p_worker_id:WORKER_ID,p_lease_seconds:LEASE_SECONDS});
      if(ok!==true){lostLease=true;return;}
      await rpc('ai_solver_queue_set_vt',{p_msg_id:msg.msg_id,p_seconds:LEASE_SECONDS+30}).catch(()=>{});
    }catch(_e){}
  },Math.max(5000,Math.floor(LEASE_SECONDS*1000/3));

  const stage=async(name,detail={})=>{
    await rpc('ai_solver_update_stage',{p_job_id:jobId,p_worker_id:WORKER_ID,p_stage:name,p_detail:detail}).catch(()=>{});
  };

  try{
    await stage('worker_started',{workerId:WORKER_ID,attempt:row.attempts});
    let capTimer=null;
    const cap=new Promise((_,rej)=>{
      capTimer=setTimeout(()=>{const e=new Error('Job vượt quá thời gian tối đa ('+Math.round(MAX_JOB_MS/1000)+'s).');e.code='JOB_TIMEOUT';rej(e)},MAX_JOB_MS);
    });
    const result=await Promise.race([runSolver(row.payload,stage),cap]);
    if(lostLease)return 'lost';
    if(result.status>=200&&result.status<300&&result.data?.answer){
      await rpc('ai_solver_complete_job',{p_job_id:jobId,p_worker_id:WORKER_ID,p_result:result.data});
    }else{
      const retryable=result.data?.retryable===false?false:(result.status>=500||result.status===429||result.status===408);
      await rpc('ai_solver_fail_job',{
        p_job_id:jobId,p_worker_id:WORKER_ID,
        p_error:String(result.data?.error||('Solver HTTP '+result.status)),
        p_retryable:retryable
      });
    }
    clearTimeout(capTimer);
    return 'done';
  }catch(e){
    const retryable=e?.code!=='JOB_TIMEOUT';
    await rpc('ai_solver_fail_job',{
      p_job_id:jobId,p_worker_id:WORKER_ID,p_error:String(e?.message||e),
      p_retryable:retryable
    }).catch(()=>{});
    return 'error';
  }finally{
    clearInterval(timer);
    current=null;
    await rpc('ai_solver_queue_delete',{p_msg_id:msg.msg_id}).catch(()=>{});
  }
}

async function reap(){
  try{await rpc('ai_solver_reap',{p_retention_days:RETENTION_DAYS});}catch(e){console.error('[worker] reap',e?.message||e);}
}
async function shutdown(sig){
  if(shuttingDown)return;
  shuttingDown=true;
  const deadline=Date.now()+SHUTDOWN_GRACE_MS;
  while(current&&Date.now()<deadline)await new Promise(r=>setTimeout(r,500));
  if(current){
    await rpc('ai_solver_fail_job',{p_job_id:current.jobId,p_worker_id:WORKER_ID,p_error:'Worker shutdown',p_retryable:true}).catch(()=>{});
  }
  process.exit(0);
}
async function loop(){
  if(!SERVICE_KEY)throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  try{await rpc('ai_solver_reap',{p_retention_days:RETENTION_DAYS});}
  catch(e){throw new Error('Database is not ready (apply ai_solver_queue_hardening migration): '+(e?.message||e));}
  setInterval(reap,REAP_MS).unref?.();
  while(!shuttingDown){
    try{
      const rows=await rpc('ai_solver_queue_read',{p_visibility_seconds:LEASE_SECONDS+30});
      const messages=Array.isArray(rows)?rows:[];
      if(!messages.length){await new Promise(r=>setTimeout(r,POLL_MS));continue;}
      for(const msg of messages){
        if(shuttingDown)break;
        const result=await processOne(msg);
        if(result==='busy')await new Promise(r=>setTimeout(r,POLL_MS));
      }
    }catch(e){
      console.error('[worker]',e?.message||e);
      await new Promise(r=>setTimeout(r,Math.max(POLL_MS,3000)));
    }
  }
}

process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
loop().catch(e=>{console.error(e);process.exit(1)});
