import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, sameOrigin, distributedRateLimit, safeRequestId, enforceMethod } from '../api/_security.js';
import { shieldGate } from '../api/_intrusion-shield.js';
import { enforceCostChallenge } from '../api/_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from '../api/_agent-threat-defense.js';

const SOURCE_HOST=String(process.env.SOURCE_STORAGE_HOST||'mlqaeginqsgqacdqdzbm.supabase.co').trim().toLowerCase();
const SOURCE_PATH_PREFIX='/storage/v1/object/public/support-media/';
const PROVIDER_ERROR=/gemini|generativelanguage|googleapis|api.?key|quota|billing|rate.?limit|fetch failed|node_modules|stack|traceback|\/home\/|\/app\/|service.?role|private.?key|access.?token/i;

function bodyOf(req){
  if(req?.body&&typeof req.body==='object'&&!Array.isArray(req.body))return req.body;
  if(typeof req?.body==='string'){try{const p=JSON.parse(req.body);return p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch{return {};}}
  return {};
}
function validateSourceUrls(req,res,requestId){
  const urls=Array.isArray(bodyOf(req).sourceUrls)?bodyOf(req).sourceUrls.slice(0,8):[];
  for(const raw of urls){
    try{
      const u=new URL(String(raw));
      const allowed=u.protocol==='https:'&&u.hostname.toLowerCase()===SOURCE_HOST&&u.pathname.startsWith(SOURCE_PATH_PREFIX);
      if(!allowed){res.status(400).json({error:'Nguồn tài liệu không được phép.',requestId});return false;}
    }catch{res.status(400).json({error:'URL nguồn tài liệu không hợp lệ.',requestId});return false;}
  }
  return true;
}
function shouldSanitize(status,value){
  const text=typeof value==='string'?value:JSON.stringify(value??'');
  return Number(status)>=500||(Number(status)===429&&PROVIDER_ERROR.test(text));
}
export async function protectGeneration(req,res,kind){
  const requestId=safeRequestId();
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID',requestId);
  if(!enforceMethod(req,res,['POST']))return null;
  if(!enforceJsonContentType(req,res))return null;
  const maxBody=kind==='exam'?4_000_000:2_000_000;
  const maxRequests=kind==='exam'?6:8;
  const keyPrefix=kind==='exam'?'ai-generate-exam':'ai-flashcards';
  if(!enforceBodySize(req,res,maxBody))return null;
  if(!sameOrigin(req,res))return null;
  if(!validateSourceUrls(req,res,requestId))return null;
  if(!(await shieldGate(req,res)))return null;
  if(!(await enforceAgentThreatDefense(req,res))){await recordAgentSignal(req,'generation-threat-block');return null;}
  if(!(await enforceCostChallenge(req,res))){await recordAgentSignal(req,'generation-cost-challenge');return null;}
  if(!(await distributedRateLimit(req,res,{windowMs:60_000,max:maxRequests,keyPrefix}))){
    await recordAgentSignal(req,'generation-rate-limit');
    return null;
  }
  if(req.body&&typeof req.body==='object'){
    for(const [key,limit] of [['media',4],['attachments',4],['sourceUrls',8],['sourceFiles',8],['fileNames',8]]){
      if(Array.isArray(req.body[key])&&req.body[key].length>limit)req.body[key]=req.body[key].slice(0,limit);
    }
  }
  const originalJson=typeof res.json==='function'?res.json.bind(res):null;
  const originalEnd=typeof res.end==='function'?res.end.bind(res):null;
  if(originalJson)res.json=payload=>{
    if(shouldSanitize(res.statusCode,payload))return originalJson({error:'AI generation tạm thời không khả dụng.',requestId});
    return originalJson(payload);
  };
  if(originalEnd)res.end=(...args)=>{
    if(shouldSanitize(res.statusCode,args[0])&&typeof args[0]==='string'){
      try{const parsed=JSON.parse(args[0]);if(parsed&&typeof parsed==='object'&&parsed.error)return originalEnd(JSON.stringify({error:'AI generation tạm thời không khả dụng.',requestId}));}catch{}
    }
    return originalEnd(...args);
  };
  return ()=>{if(originalJson)res.json=originalJson;if(originalEnd)res.end=originalEnd;};
}
