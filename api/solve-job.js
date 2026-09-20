import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, sameOrigin, rateLimit, safeRequestId } from '../lib/api/_security.js';
import { sanitizeAiBody } from '../lib/api/_prompt-security.js';
import { sanitizeAiIngress } from '../lib/api/_ai-input-guard.js';
import { createJob, rpc } from '../lib/api/_ai-job-store.js';

const INLINE_WORKER_ID_PREFIX='vercel-inline-deep';

function fakeResponse(){
  let body=''; let statusCode=200; const headers={};
  const res={
    get statusCode(){return statusCode;},
    set statusCode(v){statusCode=Number(v)||500;},
    status(code){statusCode=Number(code)||500;return res;},
    setHeader(k,v){headers[String(k).toLowerCase()]=String(v);return res;},
    getHeader(k){return headers[String(k).toLowerCase()];},
    json(payload){body=JSON.stringify(payload??{});return res.end(body);},
    end(value){if(value!==undefined)body=String(value);return res;}
  };
  return {res,getBody:()=>body,getStatus:()=>statusCode};
}

async function processInlineJob(jobId,payload,requestId){
  const workerId=`${INLINE_WORKER_ID_PREFIX}-${String(requestId||Date.now()).slice(0,90)}`;
  const claimedRows=await rpc('ai_solver_claim_job',{p_job_id:jobId,p_worker_id:workerId,p_lease_seconds:55,p_max_concurrency:1});
  const claimed=Array.isArray(claimedRows)?(claimedRows[0]||null):claimedRows;
  if(!claimed?.claimed)return {processed:false,reason:String(claimed?.reason||'busy'),status:'queued'};

  const fakeReq={method:'POST',body:{...payload,deep:true},headers:{'content-type':'application/json','origin':'https://hoc-va-choi.vercel.app'},query:{},__aiWorker:false,
    __aiStage:async(name,detail={})=>{await rpc('ai_solver_update_stage',{p_job_id:jobId,p_worker_id:workerId,p_stage:name,p_detail:detail}).catch(()=>{});}};
  const fake=fakeResponse();
  try{
    await rpc('ai_solver_update_stage',{p_job_id:jobId,p_worker_id:workerId,p_stage:'worker_started',p_detail:{workerId,inline:true,attempt:claimed.attempts}}).catch(()=>{});
    const mod=await import('../lib/solve-legacy.js');
    const solver=mod.default;
    await solver(fakeReq,fake.res);
    let data={};try{data=fake.getBody()?JSON.parse(fake.getBody()):{};}catch{}
    const status=fake.getStatus();
    if(status>=200&&status<300&&data?.answer){
      await rpc('ai_solver_complete_job',{p_job_id:jobId,p_worker_id:workerId,p_result:data});
      return {processed:true,status:'done'};
    }
    const retryable=data?.retryable===false?false:(status>=500||status===429||status===408);
    await rpc('ai_solver_fail_job',{p_job_id:jobId,p_worker_id:workerId,p_error:String(data?.error||('Solver HTTP '+status)),p_retryable:retryable});
    return {processed:true,status:'failed'};
  }catch(e){
    await rpc('ai_solver_fail_job',{p_job_id:jobId,p_worker_id:workerId,p_error:String(e?.message||e),p_retryable:true}).catch(()=>{});
    return {processed:true,status:'failed'};
  }
}


const MAX_BODY=1_200_000;
const DEEP_RE=/\b(?:vmo|imo|aime|olympiad|olympic|vmop|vòng chọn đội|đội tuyển|kỳ thi olympic)\b/i;

export const config={api:{bodyParser:{sizeLimit:'1.2mb'}},maxDuration:60};

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId=safeRequestId(); res.setHeader('X-Request-ID',requestId);
  if(!enforceMethod(req,res,['POST']))return;
  if(!enforceJsonContentType(req,res))return;
  if(!enforceBodySize(req,res,MAX_BODY))return;
  if(!sameOrigin(req,res))return;
  if(!(await rateLimit(req,res,{windowMs:60_000,max:15,keyPrefix:'ai-solver-job'})))return;

  const raw=req?.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  if(!raw.message&&!raw.imageDataUrl)return res.status(400).json({error:'Thiếu đề bài hoặc ảnh.',requestId});

  const guarded=sanitizeAiBody(raw);
  if(!guarded.ok)return res.status(guarded.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ đầu vào.',code:guarded.code,requestId});
  const ingress=sanitizeAiIngress(guarded.body.message||'',guarded.body.history||[]);
  if(!ingress.ok)return res.status(ingress.status).json({error:'Yêu cầu AI bị chặn bởi lớp bảo vệ ngữ nghĩa.',code:ingress.code,requestId});

  const body={...guarded.body,message:ingress.message,history:ingress.history};
  const isDeep=body.deep===true||DEEP_RE.test(String(body.message||''));
  if(!isDeep)return res.status(400).json({error:'Chỉ bài Deep/VMO mới được đưa vào hàng đợi nền.',code:'job-not-needed',requestId});

  const idempotencyKey=String(req.headers?.['x-idempotency-key']||body.idempotencyKey||'').trim().slice(0,180);
  if(idempotencyKey.length<8)return res.status(400).json({error:'Thiếu idempotency key hợp lệ.',code:'missing-idempotency-key',requestId});

  const tier=DEEP_RE.test(String(body.message||''))?'deep':'deep';
  const payload={
    message:String(body.message||''),
    subject:String(body.subject||''),
    history:Array.isArray(body.history)?body.history.slice(-4):[],
    imageDataUrl:String(body.imageDataUrl||''),
    deep:true,
    requestId
  };

  try{
    const job=await createJob({idempotencyKey,tier,payload,maxAttempts:2});
    if(!job?.job_id)return res.status(503).json({error:'Không tạo được job AI.',code:'job-create-failed',requestId});
    if(job.status==='queued'){
      const inline=await processInlineJob(job.job_id,payload,requestId).catch(()=>({processed:false,reason:'inline-error',status:'queued'}));
      if(inline.status==='done')return res.status(202).json({jobId:job.job_id,status:'done',reused:Boolean(job.reused),tier,requestId});
      if(inline.status==='failed')return res.status(202).json({jobId:job.job_id,status:'failed',reused:Boolean(job.reused),tier,requestId});
    }
    return res.status(202).json({jobId:job.job_id,status:job.status||'queued',reused:Boolean(job.reused),tier,requestId});
  }catch(e){
    return res.status(503).json({error:'Hàng đợi AI tạm thời chưa sẵn sàng.',code:'job-queue-unavailable',requestId});
  }
}
