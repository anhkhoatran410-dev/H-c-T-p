import crypto from 'node:crypto';

const REDIS_TIMEOUT = 1200;
const SCORE_TTL = 10 * 60;
const BLOCK_TTL = 15 * 60;
const SCORE_THRESHOLD = 5;

function redisConfig(){
  const url=String(process.env.UPSTASH_REDIS_REST_URL||'').trim().replace(/\/$/,'');
  const token=String(process.env.UPSTASH_REDIS_REST_TOKEN||'').trim();
  return url&&token?{url,token}:null;
}

async function redis(command, endpoint=''){
  const cfg=redisConfig();
  if(!cfg)return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REDIS_TIMEOUT);
  try{
    const r=await fetch(cfg.url+endpoint,{
      method:'POST',
      headers:{Authorization:`Bearer ${cfg.token}`,'Content-Type':'application/json'},
      body:JSON.stringify(command),
      signal:controller.signal
    });
    if(!r.ok)return null;
    const d=await r.json().catch(()=>null);
    return d&&d.error===undefined?d.result:null;
  }catch{return null;}finally{clearTimeout(timer);}
}

function clientIdentity(req){
  const ip=String(req?.headers?.['x-forwarded-for']||req?.headers?.['x-real-ip']||req?.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const ua=String(req?.headers?.['user-agent']||'').slice(0,180);
  return `${ip}|${ua}`;
}

function idHash(req){
  return crypto.createHash('sha256').update(clientIdentity(req)).digest('hex').slice(0,32);
}

function scoreKey(id){return `study-th:shield:score:${id}`;}
function blockKey(id){return `study-th:shield:block:${id}`;}

const local=new Map();
function localState(id){
  let s=local.get(id);
  if(!s){s={score:0,resetAt:0,blockedUntil:0};local.set(id,s);}
  return s;
}

async function blockedRemote(id){
  const value=await redis(['GET',blockKey(id)]);
  return Number(value||0)>Date.now();
}

export async function shieldStatus(req){
  const id=idHash(req);
  const localBlock=localState(id).blockedUntil;
  const remoteBlock=await blockedRemote(id);
  return {id,blocked:remoteBlock||localBlock>Date.now()};
}

export async function shieldGate(req,res){
  const status=await shieldStatus(req);
  if(status.blocked){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Retry-After','900');
    res.status(403).json({error:'Request quarantined.',requestId:crypto.randomBytes(12).toString('hex')});
    return false;
  }
  return true;
}

export async function recordShieldViolation(req, reason='policy'){
  const id=idHash(req);
  const now=Date.now();
  const s=localState(id);
  if(s.resetAt<now){s.score=0;s.resetAt=now+SCORE_TTL*1000;}
  s.score+=1;
  if(s.score>=SCORE_THRESHOLD){
    s.blockedUntil=now+BLOCK_TTL*1000;
    await redis(['SET',blockKey(id),String(s.blockedUntil),'EX',BLOCK_TTL]);
  }
  if(redisConfig()){
    await redis(['INCR',scoreKey(id)]);
    await redis(['EXPIRE',scoreKey(id),SCORE_TTL]);
  }
  return {reason,score:s.score,quarantined:s.score>=SCORE_THRESHOLD};
}

export function shieldFingerprint(req){return idHash(req);}
