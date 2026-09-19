import solverHandler from '../lib/solve-legacy.js';

const SUPABASE_URL=String(process.env.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co').trim().replace(/\/$/,'');
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const WORKER_ID=String(process.env.AI_WORKER_ID||('worker-'+process.pid)).slice(0,120);
const POLL_MS=Math.max(500,Number(process.env.AI_WORKER_POLL_MS||1500));
const LEASE_SECONDS=Math.max(30,Math.min(600,Number(process.env.AI_JOB_LEASE_SECONDS||120)));
const MAX_CONCURRENCY=Math.max(1,Math.min(20,Number(process.env.AI_MAX_CONCURRENCY||1)));

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
    __aiStage:onStage
  };
  const fake=fakeResponse();
  await solverHandler(fakeReq,fake.res);
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
    // Job may already be done by another worker; the queue message can be discarded safely.
    await rpc('ai_solver_queue_delete',{p_msg_id:msg.msg_id}).catch(()=>{});
    return;
  }

  let timer=setInterval(()=>{
    rpc('ai_solver_renew_job',{p_job_id:jobId,p_worker_id:WORKER_ID,p_lease_seconds:LEASE_SECONDS}).catch(()=>{});
  },Math.max(10000,Math.floor(LEASE_SECONDS*500)));

  const stage=async(name,detail={})=>{
    await rpc('ai_solver_update_stage',{p_job_id:jobId,p_worker_id:WORKER_ID,p_stage:name,p_detail:detail}).catch(()=>{});
  };

  try{
    await stage('worker_started',{workerId:WORKER_ID,attempt:row.attempts});
    const result=await runSolver(row.payload,stage);
    if(result.status>=200&&result.status<300&&result.data?.answer){
      await rpc('ai_solver_complete_job',{p_job_id:jobId,p_worker_id:WORKER_ID,p_result:result.data});
    }else{
      const retryable=result.status>=500||result.status===429||result.status===408;
      await rpc('ai_solver_fail_job',{
        p_job_id:jobId,p_worker_id:WORKER_ID,
        p_error:String(result.data?.error||('Solver HTTP '+result.status)),
        p_retryable:retryable
      });
    }
  }catch(e){
    await rpc('ai_solver_fail_job',{
      p_job_id:jobId,p_worker_id:WORKER_ID,p_error:String(e?.message||e),
      p_retryable:true
    }).catch(()=>{});
  }finally{
    clearInterval(timer);
    await rpc('ai_solver_queue_delete',{p_msg_id:msg.msg_id}).catch(()=>{});
  }
}

async function loop(){
  if(!SERVICE_KEY)throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  for(;;){
    try{
      const rows=await rpc('ai_solver_queue_read',{p_visibility_seconds:LEASE_SECONDS});
      const messages=Array.isArray(rows)?rows:[];
      if(messages.length)for(const msg of messages)await processOne(msg);
      else await new Promise(r=>setTimeout(r,POLL_MS));
    }catch(e){
      console.error('[worker]',e?.message||e);
      await new Promise(r=>setTimeout(r,Math.max(POLL_MS,3000)));
    }
  }
}

process.on('SIGTERM',()=>process.exit(0));
process.on('SIGINT',()=>process.exit(0));
loop().catch(e=>{console.error(e);process.exit(1)});
