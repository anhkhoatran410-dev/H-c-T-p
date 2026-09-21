import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const mode=process.argv[2]||'parent';
const scenario=process.argv[3]||'timeout';

if(mode==='parent'){
  for(const [childMode,childScenario] of [['web','timeout'],['web','retry-success'],['worker','worker-contract']]){
    const r=spawnSync(process.execPath,[process.argv[1],childMode,childScenario],{
      encoding:'utf8',
      env:{
        ...process.env,
        GEMINI_API_KEY:'key-1',
        GEMINI_API_KEY_2:'key-2',
        GEMINI_API_KEY_3:'key-3',
        GEMINI_ATTEMPT_TIMEOUT_MS:'50'
      }
    });
    if(r.status!==0){
      process.stderr.write(r.stdout||'');
      process.stderr.write(r.stderr||'');
      throw new Error(childMode+' '+childScenario+' failed');
    }
    console.log((r.stdout||'').trim());
  }
  process.exit(0);
}

const attempts=[];
globalThis.fetch=async(_input,init={})=>{
  attempts.push({
    timeoutMs:init.timeoutMs,
    signal:!!init.signal,
    apiKey:new Headers(init.headers||{}).get('x-goog-api-key')
  });

  if(scenario==='timeout'){
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(resolve,500);
      const onAbort=()=>{
        clearTimeout(timer);
        reject(init.signal?.reason||Object.assign(new Error('aborted'),{name:'AbortError'}));
      };
      if(init.signal?.aborted)return onAbort();
      init.signal?.addEventListener('abort',onAbort,{once:true});
    });
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'TOO_LATE'}]},finishReason:'STOP'}]}),{
      status:200,headers:{'content-type':'application/json'}
    });
  }

  if(scenario==='retry-success'&&attempts.length===1){
    return new Response(JSON.stringify({error:{message:'temporary'}}),{
      status:500,headers:{'content-type':'application/json'}
    });
  }

  return new Response(JSON.stringify({candidates:[{
    content:{parts:[{text:'FINAL_OK'}]},
    finishReason:'STOP'
  }]}),{status:200,headers:{'content-type':'application/json'}});
};

if(mode==='web'){
  await import('../lib/api/_gemini-network-guard.js');
}

const {__test}=await import('../lib/mer-engine.js');

const started=Date.now();
let result=null,error=null;
try{
  result=await __test.ask('gemini-test','2+3','',scenario==='worker-contract'?200:scenario==='timeout'?140:200,256);
}catch(e){
  error=e;
}
const elapsed=Date.now()-started;

if(scenario==='timeout'){
  assert.ok(error,'deadline test should time out');
  assert.equal(error.code,'ETIMEDOUT','deadline must surface as ETIMEDOUT');
  assert.equal(attempts.length,3,'fresh per-attempt timeout should allow three keys within the total budget');
  assert.ok(elapsed<350,'total elapsed time must stay bounded near the requested deadline');
  assert.ok(attempts.every(x=>x.timeoutMs===undefined),'internal timeoutMs must never reach provider fetch');
}else if(scenario==='retry-success'){
  assert.equal(error,null,'retry-success should not throw');
  assert.equal(result.answer,'FINAL_OK');
  assert.equal(result.keyId,'GEMINI_API_KEY_2','actual successful retry key must propagate');
  assert.equal(attempts.length,2);
  assert.ok(elapsed<200,'retry path should remain inside total budget');
  assert.ok(attempts.every(x=>x.timeoutMs===undefined),'internal timeoutMs must never reach provider fetch');
}else{
  assert.equal(error,null,'worker should succeed');
  assert.equal(result.keyId,'GEMINI_API_KEY');
  assert.equal(attempts.length,1);
  assert.equal(attempts[0].timeoutMs,undefined,'worker path must not send timeoutMs');
  assert.equal(attempts[0].apiKey,'key-1');
}

console.log('PATCH2_'+mode.toUpperCase()+'_'+scenario.toUpperCase().replaceAll('-','_')+'=PASS elapsed='+elapsed+'ms attempts='+attempts.length);
