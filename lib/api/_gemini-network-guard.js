import { acquireAiKey, reportAiFailure, reportAiSuccess } from './_ai-resilience.js';
import { classifyGeminiFailure } from './_gemini-error-policy.js';

const GEMINI_HOST='generativelanguage.googleapis.com';
const MAX_ATTEMPTS=8;
const DEFAULT_ATTEMPT_TIMEOUT_MS=Math.min(numberOrNull(process.env.GEMINI_ATTEMPT_TIMEOUT_MS)||5000,15000);
const INTERNAL_KEY_HEADER='X-Study-Th-Key-Id';

function numberOrNull(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>0?n:null;
}
function timeoutError(message='Gemini request timed out.'){
  const e=new Error(message);
  e.code='ETIMEDOUT';
  e.name='TimeoutError';
  return e;
}
function headersWithoutKey(init){const headers=new Headers(init?.headers||{});headers.delete('x-goog-api-key');return headers;}
const nativeFetch=globalThis.fetch.bind(globalThis);

if(!globalThis.__STUDY_TH_GEMINI_GUARD__){
  globalThis.__STUDY_TH_GEMINI_GUARD__=true;
  globalThis.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:String(input?.url||'');
    let parsed;try{parsed=new URL(url);}catch{parsed=null;}
    if(!parsed||parsed.hostname!==GEMINI_HOST)return nativeFetch(input,init);

    const totalTimeoutMs=numberOrNull(init?.timeoutMs);
    const deadline=totalTimeoutMs===null?null:Date.now()+totalTimeoutMs;
    const callerSignal=init?.signal||null;
    const forwardInit={...init};
    delete forwardInit.timeoutMs;

    const attempted=new Set();let lastError=null;
    for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++){
      if(callerSignal?.aborted){
        lastError=callerSignal.reason||new Error('Gemini request aborted.');
        break;
      }
      if(deadline!==null&&Date.now()>=deadline){
        lastError=lastError||timeoutError('Gemini request deadline exceeded.');
        break;
      }

      const entry=await acquireAiKey('GEMINI',[...attempted]);
      if(!entry)break;
      attempted.add(entry.id);

      const remaining=deadline===null?null:Math.max(1,deadline-Date.now());
      const attemptTimeoutMs=remaining===null
        ?null
        :Math.max(1,Math.min(DEFAULT_ATTEMPT_TIMEOUT_MS,remaining));

      const nextHeaders=headersWithoutKey(forwardInit);
      nextHeaders.set('x-goog-api-key',entry.key);

      let attemptSignal=callerSignal;
      let timeoutSignal=null;
      if(attemptTimeoutMs!==null){
        timeoutSignal=AbortSignal.timeout(attemptTimeoutMs);
        attemptSignal=callerSignal
          ? AbortSignal.any([callerSignal,timeoutSignal])
          : timeoutSignal;
      }

      try{
        const response=await nativeFetch(input,{...forwardInit,headers:nextHeaders,signal:attemptSignal});
        if(response.ok){
          await reportAiSuccess('GEMINI',entry.id);
          const responseHeaders=new Headers(response.headers);
          responseHeaders.set(INTERNAL_KEY_HEADER,entry.id);
          return new Response(response.body,{
            status:response.status,
            statusText:response.statusText,
            headers:responseHeaders
          });
        }

        const status=Number(response.status||0);
        const policy=classifyGeminiFailure(status,{message:`HTTP ${status}`});
        if(!policy.countFailure)return response;

        await reportAiFailure('GEMINI',entry.id,{status});
        lastError={status,category:policy.category};

        if(deadline!==null&&Date.now()>=deadline)break;
      }catch(error){
        const totalDeadlineExpired=deadline!==null&&Date.now()>=deadline;
        const attemptTimedOut=Boolean(attemptSignal?.aborted)&&!Boolean(callerSignal?.aborted)&&!totalDeadlineExpired;
        const normalizedError=(attemptTimedOut||totalDeadlineExpired)
          ? timeoutError(attemptTimedOut?'Gemini attempt timed out.':'Gemini request deadline exceeded.')
          : error;

        const status=Number(normalizedError?.status||0);
        const policy=classifyGeminiFailure(status,normalizedError);
        if(policy.countFailure){
          await reportAiFailure('GEMINI',entry.id,{
            status,
            code:normalizedError?.code
          });
        }
        lastError=normalizedError;

        if(attempt+1>=MAX_ATTEMPTS||totalDeadlineExpired)break;
      }
    }

    if(lastError?.status){
      return new Response(JSON.stringify({error:{status:lastError.status,message:'All Gemini keys are temporarily unavailable.'}}),{
        status:lastError.status,
        headers:{'content-type':'application/json; charset=utf-8'}
      });
    }
    if(lastError)throw lastError;

    return new Response(JSON.stringify({error:{status:503,message:'Gemini key pool is unavailable.'}}),{
      status:503,
      headers:{'content-type':'application/json; charset=utf-8'}
    });
  };
}
