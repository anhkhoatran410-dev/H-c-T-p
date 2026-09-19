import { acquireAiKey, reportAiFailure, reportAiSuccess } from './_ai-resilience.js';
import { classifyGeminiFailure } from './_gemini-error-policy.js';

const GEMINI_HOST='generativelanguage.googleapis.com';
const MAX_ATTEMPTS=8;
function headersWithoutKey(init){const headers=new Headers(init?.headers||{});headers.delete('x-goog-api-key');return headers;}
const nativeFetch=globalThis.fetch.bind(globalThis);

if(!globalThis.__STUDY_TH_GEMINI_GUARD__){
  globalThis.__STUDY_TH_GEMINI_GUARD__=true;
  globalThis.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:String(input?.url||'');
    let parsed;try{parsed=new URL(url);}catch{parsed=null;}
    if(!parsed||parsed.hostname!==GEMINI_HOST)return nativeFetch(input,init);
    const attempted=new Set();let lastError=null;
    for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++){
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
        if(attempt+1>=MAX_ATTEMPTS)throw error;
      }
    }
    if(lastError?.status)return new Response(JSON.stringify({error:{status:lastError.status,message:'All Gemini keys are temporarily unavailable.'}}),{status:lastError.status,headers:{'content-type':'application/json; charset=utf-8'}});
    return new Response(JSON.stringify({error:{status:503,message:'Gemini key pool is unavailable.'}}),{status:503,headers:{'content-type':'application/json; charset=utf-8'}});
  };
}
