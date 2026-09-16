import crypto from 'node:crypto';

const REDIS_TIMEOUT_MS = 1200;
const LOCK_TTL_SECONDS = 60 * 60;
const LOCK_KEY = 'study-th:security:ai-lockdown';
let localUntil = 0;

function redisConfig(){
  const url=String(process.env.UPSTASH_REDIS_REST_URL||'').trim().replace(/\/$/,'');
  const token=String(process.env.UPSTASH_REDIS_REST_TOKEN||'').trim();
  return url&&token?{url,token}:null;
}

async function redis(command){
  const cfg=redisConfig();
  if(!cfg)return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REDIS_TIMEOUT_MS);
  try{
    const r=await fetch(`${cfg.url}/pipeline`,{
      method:'POST',
      headers:{Authorization:`Bearer ${cfg.token}`,'Content-Type':'application/json'},
      body:JSON.stringify([command]),
      signal:controller.signal
    });
    if(!r.ok)return null;
    const data=await r.json().catch(()=>null);
    return Array.isArray(data)?data[0]?.result??null:null;
  }catch{return null;}finally{clearTimeout(timer);}
}

export async function aiLockdownStatus(){
  const remote=Number(await redis(['GET',LOCK_KEY])||0);
  const local=localUntil;
  return {locked:remote>Date.now()||local>Date.now(),until:Math.max(remote,local)};
}

export async function enforceAiLockdown(req,res){
  const status=await aiLockdownStatus();
  const envLock=/^(1|true|yes|on)$/i.test(String(process.env.SECURITY_LOCKDOWN||''));
  if(!envLock&&!status.locked)return true;
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Retry-After',String(Math.max(60,status.until?Math.ceil((status.until-Date.now())/1000):300)));
  res.status(503).json({error:'AI services temporarily locked down for security.'});
  return false;
}

export async function setAiLockdown(enabled,seconds=LOCK_TTL_SECONDS){
  const until=Date.now()+Math.max(60,Math.min(24*60*60,Number(seconds)||LOCK_TTL_SECONDS))*1000;
  if(enabled){
    localUntil=until;
    if(redisConfig())await redis(['SET',LOCK_KEY,String(until),'EX',Math.ceil((until-Date.now())/1000)]);
  }else{
    localUntil=0;
    if(redisConfig())await redis(['DEL',LOCK_KEY]);
  }
  return {enabled:Boolean(enabled),until:enabled?until:0,fingerprint:crypto.createHash('sha256').update(String(until)).digest('hex').slice(0,12)};
}
