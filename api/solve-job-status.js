import { applySecurityHeaders, enforceMethod, sameOrigin, rateLimit, safeRequestId } from '../lib/api/_security.js';
import { getJob } from '../lib/api/_ai-job-store.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId=safeRequestId();res.setHeader('X-Request-ID',requestId);
  if(!enforceMethod(req,res,['GET']))return;
  if(!sameOrigin(req,res))return;
  if(!(await rateLimit(req,res,{windowMs:60_000,max:60,keyPrefix:'ai-solver-job-status'})))return;

  const id=String(req.query?.id||'').trim();
  if(!UUID.test(id))return res.status(400).json({error:'job id không hợp lệ.',code:'invalid-job-id',requestId});

  try{
    const job=await getJob(id);
    if(!job)return res.status(404).json({error:'Không tìm thấy job.',code:'job-not-found',requestId});
    return res.status(200).json({
      jobId:job.id,
      status:job.status,
      tier:job.tier,
      stage:job.stage||null,
      stageDetail:job.stage_detail||{},
      attempts:job.attempts,
      maxAttempts:job.max_attempts,
      error:job.status==='failed'?job.error:null,
      result:job.status==='done'?job.result:null,
      createdAt:job.created_at,
      startedAt:job.started_at,
      finishedAt:job.finished_at,
      updatedAt:job.updated_at,
      requestId
    });
  }catch(e){
    return res.status(503).json({error:'Không đọc được trạng thái job.',code:'job-status-unavailable',requestId});
  }
}
