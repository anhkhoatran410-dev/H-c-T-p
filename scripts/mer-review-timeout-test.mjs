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
    await wait(120);
    return new Response(JSON.stringify({error:{message:'temporary'}}),{
      status:500,
      headers:{'content-type':'application/json'}
    });
  }

  await wait(900);
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
const askStarts=[];
const reviewBudget=800;
const askSpy=async(...args)=>{
  askStarts.push(Date.now());
  askTimeouts.push(args[3]);
  return __test.ask(...args);
};

const started=Date.now();
let error=null;
try{
  await __test.runReview('review test','',reviewBudget,256,askSpy);
}catch(e){
  error=e;
}
const elapsed=Date.now()-started;
const expectedSecondRemaining=reviewBudget-(askStarts[1]-started);

assert.ok(error,'review should exhaust its total timeout budget');
assert.equal(askTimeouts.length,2,'review should perform one logical retry while budget remains');
assert.ok(Math.abs(askTimeouts[0]-reviewBudget)<=5,'first logical attempt must receive essentially the full review budget');
assert.ok(Math.abs(askTimeouts[1]-expectedSecondRemaining)<=5,'second logical attempt must receive the actual remaining review budget');
assert.equal(attempts.length,2,'network guard composition should reach exactly one provider call per logical attempt');
assert.notStrictEqual(attempts[0].signal,attempts[1].signal,'each review retry must get a fresh provider signal');
assert.ok(attempts[0].durationMs>=90&&attempts[0].durationMs<250,'first provider attempt should return well before the total review deadline');
assert.ok(Math.abs(attempts[1].durationMs-askTimeouts[1])<=25,'second provider attempt duration should track the nested remaining budget');
assert.ok(attempts.every(x=>x.timeoutMs===undefined),'review timeoutMs must be consumed by the network guard, not forwarded to provider fetch');
assert.ok(elapsed<230,'review retry phase must stay bounded by the total timeout budget');
console.log('PATCH3_REVIEW_TOTAL_BUDGET=PASS logicalTimeouts='+askTimeouts.map(x=>Math.round(x)).join(',')+'ms expectedSecondRemaining='+Math.round(expectedSecondRemaining)+'ms providerTimeoutMsStripped='+attempts.every(x=>x.timeoutMs===undefined)+' providerAttempts='+attempts.length+' firstAttempt='+attempts[0].durationMs+'ms secondAttempt='+attempts[1].durationMs+'ms elapsed='+elapsed+'ms');
