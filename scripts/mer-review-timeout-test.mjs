import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const mode=process.argv[2]||'parent';

if(mode==='parent'){
  const r=spawnSync(process.execPath,[process.argv[1],'review-budget'],{
    encoding:'utf8',
    env:{
      ...process.env,
      GEMINI_API_KEY:'key-1',
      GEMINI_API_KEY_2:'key-2',
      GEMINI_ATTEMPT_TIMEOUT_MS:'50',
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

const {__test}=await import('../lib/mer-engine.js');

const started=Date.now();
let error=null;
try{
  await __test.runReview('review test','',180,256);
}catch(e){
  error=e;
}
const elapsed=Date.now()-started;

assert.ok(error,'review should exhaust its total timeout budget');
assert.equal(attempts.length,2,'review should get one retry while budget remains');
assert.notStrictEqual(attempts[0].signal,attempts[1].signal,'each review retry must get a fresh caller timeout signal');
assert.ok(attempts[0].durationMs>=95&&attempts[0].durationMs<140,'first review attempt should consume most of the total budget');
assert.ok(attempts[1].durationMs>=35&&attempts[1].durationMs<120,'second review attempt must be bounded by the remaining budget, not a fixed 5000 ms timeout');
assert.ok(elapsed<230,'review retry phase must stay bounded by the total timeout budget');
console.log('PATCH3_REVIEW_TOTAL_BUDGET=PASS total=180ms firstAttempt='+attempts[0].durationMs+'ms secondAttempt='+attempts[1].durationMs+'ms elapsed='+elapsed+'ms');
