import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const mode=process.argv[2]||'parent';

if(mode==='parent'){
  const r=spawnSync(process.execPath,[process.argv[1],'review-budget'],{
    encoding:'utf8',
    env:{
      ...process.env,
      GEMINI_API_KEY:'key-1',
      GEMINI_ATTEMPT_TIMEOUT_MS:'5000',
      UPSTASH_REDIS_REST_URL:'',
      UPSTASH_REDIS_REST_TOKEN:''
    }
  });
  if(r.status!==0){
    process.stderr.write(r.stdout||'');
    process.stderr.write(r.stderr||'');
    throw new Error('review-budget failed');
  }
  console.log((r.stdout||'').trim());
  process.exit(0);
}

const attempts=[];
globalThis.fetch=async(_input,init={})=>{
  const started=Date.now();
  const record={signal:init.signal,started};
  attempts.push(record);

  const wait=(ms)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      record.durationMs=Date.now()-started;
      resolve();
    },ms);
    const onAbort=()=>{
      clearTimeout(timer);
      record.durationMs=Date.now()-started;
      reject(init.signal?.reason||Object.assign(new Error('aborted'),{name:'AbortError'}));
    };
    if(init.signal?.aborted)return onAbort();
    init.signal?.addEventListener('abort',onAbort,{once:true});
  });

  if(attempts.length===1){
    await wait(105);
    return new Response(JSON.stringify({error:{message:'temporary'}}),{
      status:500,
      headers:{'content-type':'application/json'}
    });
  }

  await wait(250);
  return new Response(JSON.stringify({
    candidates:[{
      content:{parts:[{text:'SECOND_SHOULD_NOT_FINISH'}]},
      finishReason:'STOP'
    }]
  }),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

await import('../lib/api/_gemini-network-guard.js');
const {__test}=await import('../lib/mer-engine.js');

const askTimeouts=[];
const askSpy=async(...args)=>{
  askTimeouts.push(args[3]);
  return __test.ask(...args);
};

const started=Date.now();
let error=null;
try{
  await __test.runReview('review test','',180,256,askSpy);
}catch(e){
  error=e;
}
const elapsed=Date.now()-started;

assert.ok(error,'review should exhaust its total timeout budget');
assert.equal(askTimeouts.length,2,'review should perform one logical retry while budget remains');
assert.ok(askTimeouts[0]>=175&&askTimeouts[0]<=180,'first logical attempt must receive the full remaining review budget');
assert.ok(askTimeouts[1]>=65&&askTimeouts[1]<=80,'second logical attempt must receive the actual remaining review budget');
assert.equal(attempts.length,2,'network guard composition should reach exactly one provider call per logical attempt');
assert.notStrictEqual(attempts[0].signal,attempts[1].signal,'each review retry must get a fresh provider signal');
assert.ok(attempts[0].durationMs>=95&&attempts[0].durationMs<140,'first provider attempt should consume most of the total budget');
assert.ok(attempts[1].durationMs>=35&&attempts[1].durationMs<120,'second provider attempt must be bounded by the nested remaining budget, not a fixed 5000 ms timeout');
assert.ok(attempts.every(x=>x.timeoutMs===undefined),'review timeoutMs must be consumed by the network guard, not forwarded to provider fetch');
assert.ok(elapsed<230,'review retry phase must stay bounded by the total timeout budget');
console.log('PATCH3_REVIEW_TOTAL_BUDGET=PASS logicalTimeouts='+askTimeouts.map(x=>Math.round(x)).join(',')+'ms providerAttempts='+attempts.length+' firstAttempt='+attempts[0].durationMs+'ms secondAttempt='+attempts[1].durationMs+'ms elapsed='+elapsed+'ms');
