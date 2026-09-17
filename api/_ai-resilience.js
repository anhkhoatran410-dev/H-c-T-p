import crypto from 'node:crypto';
import { envAiKeyPool, resolveAiKeyPool, secretProviderMode } from './_secret-provider.js';

const FAILURE_THRESHOLD=3,COOLDOWN_MS=60000,PROBE_MS=15000,REDIS_TIMEOUT=1500,MAX_KEYS=50;
const local=new Map();
function poolFp(pool){return crypto.createHash('sha256').update(pool.map(k=>`${k.id}:${k.fingerprint}`).join('|')).digest('hex').slice(0,32);}
function st(id){if(!local.has(id))local.set(id,{failures:0,successes:0,uses:0,openedUntil:0,probeUntil:0,lastFailure:0,lastUsed:0});return local.get(id);}
function cfg(){const url=String(process.env.UPSTASH_REDIS_REST_URL||'').trim().replace(/\/$/,'');const token=String(process.env.UPSTASH_REDIS_REST_TOKEN||'').trim();return url&&token?{url,token}:null;}
async function redis(command,endpoint='',timeout=REDIS_TIMEOUT){const c=cfg();if(!c)return null;const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);try{const r=await fetch(c.url+endpoint,{method:'POST',headers:{Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:ac.signal});if(!r.ok)return null;const d=await r.json().catch(()=>null);return d&&d.error===undefined?d.result:null;}catch{return null;}finally{clearTimeout(timer);}}
function key(prefix,id){return `study-th:ai-circuit:${prefix}:${encodeURIComponent(id)}`;}
function probeKey(prefix,id){return `study-th:ai-probe:${prefix}:${encodeURIComponent(id)}`;}
function metaKey(prefix){return `study-th:ai-keypool-meta:${prefix}`;}
function activeKey(prefix){return `study-th:ai-keypool-active:${prefix}`;}
function obj(v){if(!v)return{};if(!Array.isArray(v))return v;const o={};for(let i=0;i<v.length;i+=2)o[String(v[i])]=v[i+1];return o;}
async function load(prefix,pool){if(!cfg())return null;const rows=await redis(pool.map(k=>['HGETALL',key(prefix,k.id)]),'/pipeline');return Array.isArray(rows)?rows.map(x=>obj(x?.result??x)):null;}
export function getAiKeyPool(prefix='GEMINI'){return envAiKeyPool(prefix);}
export async function warmAiKeyPool(prefix='GEMINI'){
  const pool=await resolveAiKeyPool(prefix);
  if(!pool?.length)return false;
  if(!cfg())return true;
  const fingerprint=poolFp(pool);
  const desired=JSON.stringify({version:2,provider:secretProviderMode(),fingerprint,keys:pool.map(k=>({id:k.id,fingerprint:k.fingerprint}))});
  const current=await redis(['GET',metaKey(prefix)],'',1200);
  if(current===null){
    const ok=await redis(['SET',metaKey(prefix),desired],'',1200);
    if(ok!=='OK')return false;
  }else if(String(current)!==desired){
    let previous=[];try{previous=JSON.parse(String(current))?.keys||[];}catch{}
    const oldIds=previous.map(x=>String(x?.id||'')).filter(Boolean);
    const commands=[['SET',metaKey(prefix),desired],['SADD',activeKey(prefix),...pool.map(k=>k.id)]];
    if(oldIds.length)commands.push(['SREM',activeKey(prefix),...oldIds.filter(id=>!pool.some(k=>k.id===id))]);
    const results=await redis(commands,'/pipeline',1500);
    if(!Array.isArray(results))return false;
  }else{
    const touch=await redis(['SADD',activeKey(prefix),...pool.map(k=>k.id)],'',1200);
    if(touch===null)return false;
  }
  return true;
}
export async function acquireAiKey(prefix='GEMINI',excludedIds=[]){
  const warmed=await warmAiKeyPool(prefix);
  if(!warmed)return null;
  const resolved=await resolveAiKeyPool(prefix); if(!resolved?.length)return null;
  const ex=new Set((Array.isArray(excludedIds)?excludedIds:[]).map(String));
  const pool=resolved.filter(k=>!ex.has(k.id)).slice(0,MAX_KEYS);if(!pool.length)return null;
  const now=Date.now(),remote=await load(prefix,pool);
  pool.forEach((k,i)=>{const r=remote?.[i];if(!r)return;const s=st(k.id);for(const f of ['failures','successes','uses','openedUntil','probeUntil','lastFailure','lastUsed'])if(r[f]!==undefined)s[f]=Number(r[f])||0;});
  let candidates=pool.filter(k=>{const s=st(k.id);return s.openedUntil<=now&&s.probeUntil<=now;});
  if(!candidates.length)return null;
  candidates.sort((a,b)=>{const x=st(a.id),y=st(b.id);return(x.failures-y.failures)||(x.lastUsed-y.lastUsed)||(x.uses-y.uses);});
  for(const selected of candidates){
    const s=st(selected.id);
    if(s.openedUntil>0&&s.openedUntil<=now&&cfg()){
      const ok=await redis(['SET',probeKey(prefix,selected.id),String(now),'NX','PX',PROBE_MS]);
      if(ok!=='OK')continue;
      s.probeUntil=now+PROBE_MS;
    }
    s.lastUsed=now;s.uses+=1;
    if(!cfg())return selected;
    await redis(['HINCRBY',key(prefix,selected.id),'uses',1]);
    await redis(['HSET',key(prefix,selected.id),'lastUsed',now,'probeUntil',s.probeUntil]);
    return selected;
  }
  return null;
}
const SUCCESS_LUA="local k=KEYS[1] redis.call('HSET',k,'failures',0,'openedUntil',0,'probeUntil',0,'lastFailure',0,'lastUsed',ARGV[1]) redis.call('HINCRBY',k,'successes',1) return 1";
const FAILURE_LUA="local k=KEYS[1] local status=tonumber(ARGV[1]) local now=tonumber(ARGV[2]) local threshold=tonumber(ARGV[3]) local cooldown=tonumber(ARGV[4]) local f=tonumber(redis.call('HGET',k,'failures') or '0') local opened=0 if status==401 or status==403 then f=threshold opened=now+cooldown elseif status==429 or status>=500 or ARGV[5]=='ETIMEDOUT' or ARGV[5]=='ECONNRESET' or ARGV[5]=='EAI_AGAIN' then f=f+1 if f>=threshold then opened=now+cooldown end end redis.call('HSET',k,'failures',f,'openedUntil',opened,'probeUntil',0,'lastFailure',now) return {f,opened}";
export async function reportAiSuccess(prefix,id){const s=st(id),now=Date.now();s.failures=0;s.openedUntil=0;s.probeUntil=0;s.lastFailure=0;s.lastUsed=now;s.successes+=1;if(cfg())await redis(['EVAL',SUCCESS_LUA,'1',key(prefix,id),now]);}
export async function reportAiFailure(prefix,id,error={}){const s=st(id),status=Number(error?.status||0),now=Date.now();if(status===401||status===403){s.failures=FAILURE_THRESHOLD;s.openedUntil=now+COOLDOWN_MS;s.probeUntil=0;}else if(status===429||status>=500||['ETIMEDOUT','ECONNRESET','EAI_AGAIN'].includes(error?.code)){s.failures+=1;if(s.failures>=FAILURE_THRESHOLD){s.openedUntil=now+COOLDOWN_MS;s.probeUntil=0;}}s.lastFailure=now;if(cfg()){const result=await redis(['EVAL',FAILURE_LUA,'1',key(prefix,id),status,now,FAILURE_THRESHOLD,COOLDOWN_MS,String(error?.code||'')]);if(Array.isArray(result)){s.failures=Number(result[0])||0;s.openedUntil=Number(result[1])||0;s.probeUntil=0;}}return{opened:s.openedUntil>Date.now(),failures:s.failures,retryAt:s.openedUntil||null};}
export async function aiPoolSnapshot(prefix='GEMINI'){const pool=await resolveAiKeyPool(prefix)||[],warmed=Boolean(pool.length&&await warmAiKeyPool(prefix)),now=Date.now(),remote=await load(prefix,pool);return pool.map((k,i)=>{const s=st(k.id),r=remote?.[i];if(r)for(const f of ['failures','successes','uses','openedUntil','probeUntil','lastFailure','lastUsed'])if(r[f]!==undefined)s[f]=Number(r[f])||0;return{id:k.id,fingerprint:k.fingerprint,failures:s.failures,successes:s.successes,uses:s.uses,circuit:s.openedUntil>now?'open':(s.probeUntil>now?'half-open':'closed'),retryAt:s.openedUntil||null,lastFailure:s.lastFailure||null,lastUsed:s.lastUsed||null,warmed};});}
