import crypto from 'node:crypto';

const REDIS_TIMEOUT_MS = 1800;
const TTL_SECONDS = 6 * 60 * 60;

function cfg(){
  const url=String(process.env.UPSTASH_REDIS_REST_URL||'').trim().replace(/\/$/,'');
  const token=String(process.env.UPSTASH_REDIS_REST_TOKEN||'').trim();
  return url&&token?{url,token}:null;
}
async function command(parts){
  const c=cfg(); if(!c)return null;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),REDIS_TIMEOUT_MS);
  try{
    const r=await fetch(c.url+'/pipeline',{
      method:'POST',
      headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},
      body:JSON.stringify([parts]),
      signal:ctrl.signal
    });
    if(!r.ok)return null;
    const d=await r.json().catch(()=>null);
    return Array.isArray(d)?d[0]?.result??null:null;
  }catch{return null}finally{clearTimeout(timer)}
}
export function cacheKey({message,subject,tier}){
  const raw=JSON.stringify({v:1,message:String(message||'').trim(),subject:String(subject||''),tier:String(tier||'fast')});
  return 'study-th:ai:answer:'+crypto.createHash('sha256').update(raw).digest('hex');
}
export async function getCached(key){
  const v=await command(['GET',key]);
  if(!v)return null;
  try{return JSON.parse(String(v))}catch{return null}
}
export async function setCached(key,value){
  try{
    const payload=JSON.stringify(value);
    if(payload.length>450000)return false;
    const r=await command(['SET',key,payload,'EX',String(TTL_SECONDS)]);
    return r==='OK';
  }catch{return false}
}
