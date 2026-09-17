import crypto from 'node:crypto';

const MAX_KEYS = 50;
const TIMEOUT_MS = 2500;

export function secretProviderMode(){
  const mode=String(process.env.SECURITY_SECRET_PROVIDER||'env').trim().toLowerCase();
  return mode==='vault'?'vault':'env';
}

function envKeys(prefix){
  const out=[];
  const base=String(process.env[`${prefix}_API_KEY`]||'').trim();
  if(base)out.push({id:`${prefix}_API_KEY`,key:base});
  for(let i=2;i<=MAX_KEYS;i++){
    const value=String(process.env[`${prefix}_API_KEY_${i}`]||'').trim();
    if(value)out.push({id:`${prefix}_API_KEY_${i}`,key:value});
  }
  const packed=String(process.env[`${prefix}_API_KEYS`]||'').trim();
  if(packed)for(const [i,value] of packed.split(',').map(x=>x.trim()).filter(Boolean).entries())out.push({id:`${prefix}_API_KEYS_${i+1}`,key:value});
  return out;
}

function fingerprint(key){
  return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0,16);
}

export function envAiKeyPool(prefix='GEMINI'){
  return envKeys(prefix).map(item=>({...item,fingerprint:fingerprint(item.key)}));
}

async function vaultFetch(prefix){
  const addr=String(process.env.SECURITY_VAULT_ADDR||'').trim().replace(/\/$/,'');
  const token=String(process.env.SECURITY_VAULT_TOKEN||'').trim();
  const path=String(process.env.SECURITY_VAULT_AI_KEY_PATH||'kv/data/study-th/ai').trim().replace(/^\/+|\/+$/g,'');
  if(!addr||!token)return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const response=await fetch(`${addr}/v1/${path}/${encodeURIComponent(prefix)}`,{
      headers:{'X-Vault-Token':token,'Accept':'application/json'},
      signal:controller.signal,
    });
    if(!response.ok)return null;
    const payload=await response.json().catch(()=>null);
    const data=payload?.data?.data&&typeof payload.data.data==='object'?payload.data.data:payload?.data&&typeof payload.data==='object'?payload.data:null;
    if(!data||typeof data!=='object')return null;
    const entries=[];
    for(const [rawId,value] of Object.entries(data)){
      if(entries.length>=MAX_KEYS)break;
      if(typeof value!=='string'||!value.trim())continue;
      const id=String(rawId).trim();
      if(!/^(?:(?:API_KEY(?:_\d+)?)|(?:[A-Z0-9]+_API_KEY(?:_\d+)?))$/i.test(id))continue;
      const canonical=id.toUpperCase().startsWith(`${prefix.toUpperCase()}_`)?id.toUpperCase():`${prefix}_${id.toUpperCase()}`;
      entries.push({id:canonical,key:value.trim(),fingerprint:fingerprint(value.trim())});
    }
    return entries.length?entries:null;
  }catch{return null;}finally{clearTimeout(timer);}
}

export async function resolveAiKeyPool(prefix='GEMINI'){
  if(secretProviderMode()==='vault'){
    const vault=await vaultFetch(prefix);
    if(vault?.length)return vault;
    return null;
  }
  return envAiKeyPool(prefix);
}
