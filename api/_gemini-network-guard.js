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

    const attempted=new Set();
    let lastError=null;
    const attempts=maxAttempts(init);
    const primary=String(process.env.GEMINI_API_KEY||'').trim().replace(/^['"`]+|['"`]+$/g,'');
    const primaryId='GEMINI_API_KEY';

    // Hot path: use the primary configured key first. This avoids Redis latency
    // for healthy requests and keeps ordinary AI responses fast.
    if(primary){
      attempted.add(primaryId);
      const primaryHeaders=headersWithoutKey(init);
      primaryHeaders.set('x-goog-api-key',primary);
      try{
        const response=await nativeFetch(input,{...init,headers:primaryHeaders});
        if(response.ok)return response;
        const status=Number(response.status||0);
        const policy=classifyGeminiFailure(status,{message:`HTTP ${status}`});
        if(!policy.countFailure)return response;
        await reportAiFailure('GEMINI',primaryId,{status});
        lastError={status,category:policy.category};
      }catch(error){
        const status=Number(error?.status||0);
        const policy=classifyGeminiFailure(status,error);
        if(policy.countFailure)await reportAiFailure('GEMINI',primaryId,{status,code:error?.code});
        lastError=error;
      }
    }

    // Cold/failover path: only touch the distributed key pool after the primary
    // key has failed, so Redis cannot slow down a healthy request.
    for(let attempt=primary?1:0;attempt<attempts;attempt++){
      const entry=await acquireAiKey('GEMINI',[...attempted]);
      if(!entry)break;
      attempted.add(entry.id);
      const nextHeaders=headersWithoutKey(init);
      nextHeaders.set('x-goog-api-key',entry.key);
      try{
        const response=await nativeFetch(input,{...init,headers:nextHeaders});
        if(response.ok){
          await reportAiSuccess('GEMINI',entry.id);
          return response;
        }
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
        if(attempt+1>=attempts)break;
      }
    }

    if(lastError?.status){
      return new Response(JSON.stringify({error:{status:lastError.status,message:'All Gemini keys are temporarily unavailable.'}}),{
        status:lastError.status,
        headers:{'content-type':'application/json; charset=utf-8'}
      });
    }
    return new Response(JSON.stringify({error:{status:503,message:'Gemini key pool is unavailable.'}}),{
      status:503,
      headers:{'content-type':'application/json; charset=utf-8'}
    });
  };
