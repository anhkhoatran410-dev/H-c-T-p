import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, sameOrigin, rateLimit, safeRequestId } from '../lib/api/_security.js';
import { sanitizeAiBody } from '../lib/api/_prompt-security.js';
import { sanitizeAiIngress } from '../lib/api/_ai-input-guard.js';
import { createJob } from '../lib/api/_ai-job-store.js';

const MAX_BODY=1_200_000;
const DEEP_RE=/\b(?:vmo|imo|aime|olympiad|olympic|vmop|vòng chọn đội|đội tuyển|kỳ thi olympic)\b/i;

export const config={api:{bodyParser:{sizeLimit:'1.2mb'}}};

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
    return res.status(202).json({jobId:job.job_id,status:job.status,reused:Boolean(job.reused),tier,requestId});
  }catch(e){
    return res.status(503).json({error:'Hàng đợi AI tạm thời chưa sẵn sàng.',code:'job-queue-unavailable',requestId});
  }
}
