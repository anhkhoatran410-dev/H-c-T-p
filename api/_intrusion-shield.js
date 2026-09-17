import crypto from 'node:crypto';

const REDIS_TIMEOUT = 1200;
const SCORE_TTL = 10 * 60;
const BLOCK_TTL = 15 * 60;
const SCORE_THRESHOLD = 5;
const SUBJECT_BLOCK_TTL = 24 * 60 * 60;

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
      signal:controller.signal,
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

function subjectHash(value){
  const raw=String(value||'').trim();
  return raw?crypto.createHash('sha256').update(raw).digest('hex').slice(0,32):'';
}

function requestSubject(req){
  const body=req?.body;
  if(body && typeof body==='object' && !Array.isArray(body)){
    const value=String(body.device_id||body.deviceId||'').trim();
    if(value && value.length<=180)return value;
  }
  const header=String(req?.headers?.['x-study-th-device']||'').trim();
  return header && header.length<=180 ? header : '';
}

function scoreKey(id){return `study-th:shield:score:${id}`;}
function blockKey(id){return `study-th:shield:block:${id}`;}
function subjectBlockKey(value){return `study-th:shield:subject:block:${subjectHash(value)}`;}

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

async function subjectBlockedRemote(value){
  const hash=subjectHash(value);
  if(!hash)return false;
  const valueRemote=await redis(['GET',subjectBlockKey(value)]);
  return Number(valueRemote||0)>Date.now();
}

export async function shieldStatus(req){
  const id=idHash(req);
  const localBlock=localState(id).blockedUntil;
  const remoteBlock=await blockedRemote(id);
  const subject=requestSubject(req);
  const subjectBlock=await subjectBlockedRemote(subject);
  return {id,subjectHash:subject?subjectHash(subject):null,blocked:remoteBlock||localBlock>Date.now()||subjectBlock};
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

export async function setShieldSubjectBlock(subject, seconds=SUBJECT_BLOCK_TTL){
  const raw=String(subject||'').trim();
  if(!raw || raw.length>180) throw new Error('Invalid subject.');
  const ttl=Math.max(60,Math.min(SUBJECT_BLOCK_TTL,Number(seconds)||SUBJECT_BLOCK_TTL));
  const until=Date.now()+ttl*1000;
  if(redisConfig()) await redis(['SET',subjectBlockKey(raw),String(until),'EX',ttl]);
  return {subjectHash:subjectHash(raw),until,ttlSeconds:ttl,stored:Boolean(redisConfig())};
}

export async function clearShieldSubjectBlock(subject){
  const raw=String(subject||'').trim();
  if(!raw || raw.length>180) throw new Error('Invalid subject.');
  if(redisConfig()) await redis(['DEL',subjectBlockKey(raw)]);
  return {subjectHash:subjectHash(raw),stored:Boolean(redisConfig())};
}

export async function shieldSubjectStatus(subject){
  const raw=String(subject||'').trim();
  if(!raw)return {blocked:false,subjectHash:null};
  const until=Number(await redis(['GET',subjectBlockKey(raw)])||0);
  return {blocked:until>Date.now(),until:until||0,subjectHash:subjectHash(raw)};
}

export function shieldFingerprint(req){return idHash(req);}
export function shieldSubjectFingerprint(value){return subjectHash(value);}
