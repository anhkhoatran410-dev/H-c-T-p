import { acquireAiKey, reportAiFailure, reportAiSuccess } from './_ai-resilience.js';
import { classifyGeminiFailure } from './_gemini-error-policy.js';

const GEMINI_HOST='generativelanguage.googleapis.com';
const DEFAULT_MAX_ATTEMPTS=4;
function maxAttempts(init){const tier=String(new Headers(init?.headers||{}).get('x-study-th-ai-tier')||'').toLowerCase();return tier==='fast'?2:tier==='deep'?4:DEFAULT_MAX_ATTEMPTS;}
function headersWithoutKey(init){const headers=new Headers(init?.headers||{});headers.delete('x-goog-api-key');return headers;}
const nativeFetch=globalThis.fetch.bind(globalThis);

if(!globalThis.__STUDY_TH_GEMINI_GUARD__){
  globalThis.__STUDY_TH_GEMINI_GUARD__=true;
  globalThis.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:String(input?.url||'');
    let parsed;try{parsed=new URL(url);}catch{parsed=null;}
    if(!parsed||parsed.hostname!==GEMINI_HOST)return nativeFetch(input,init);
    const attempted=new Set();let lastError=null;
    const attempts=maxAttempts(init);
    for(let attempt=0;attempt<attempts;attempt++){
      const entry=await acquireAiKey('GEMINI',[...attempted]);
      if(!entry)break;
      attempted.add(entry.id);
      const nextHeaders=headersWithoutKey(init);nextHeaders.set('x-goog-api-key',entry.key);
      try{
        const response=await nativeFetch(input,{...init,headers:nextHeaders});
        if(response.ok){await reportAiSuccess('GEMINI',entry.id);return response;}
        const status=Number(response.status||0);
        const policy=classifyGeminiFailure(status,{message:`HTTP ${status}`});
        if(!policy.countFailure)return response;
        await reportAiFailure('GEMINI',entry.id,{status});
        lastError={status,category:policy.category};
      }catch(error){
        const status=Number(error?.status||0);
        const policy=classifyGeminiFailure(status,error);
        if(policy.countFailure)await reportAiFailure('GEMINI',entry.id,{status,code:error?.code});
        lastError=error;
        if(attempt+1>=attempts)throw error;
      }
    }
    // Availability guard: if the distributed pool is temporarily unavailable,
    // fall back to the primary configured key instead of turning a healthy API
    // request into an immediate 503.
    const primary=getAiKeyPool('GEMINI')[0];
    if(primary?.key){
      const fallbackHeaders=headersWithoutKey(init);fallbackHeaders.set('x-goog-api-key',primary.key);
      try{
        const response=await nativeFetch(input,{...init,headers:fallbackHeaders});
        if(response.ok){await reportAiSuccess('GEMINI',primary.id);return response;}
        const status=Number(response.status||0);
        if(status===401||status===403||status===404||status===429||status>=500)await reportAiFailure('GEMINI',primary.id,{status});
        return response;
      }catch(error){lastError=error;}
    }
    if(lastError?.status)return new Response(JSON.stringify({error:{status:lastError.status,message:'All Gemini keys are temporarily unavailable.'}}),{status:lastError.status,headers:{'content-type':'application/json; charset=utf-8'}});
    return new Response(JSON.stringify({error:{status:503,message:'Gemini key pool is unavailable.'}}),{status:503,headers:{'content-type':'application/json; charset=utf-8'}});
  };
}
