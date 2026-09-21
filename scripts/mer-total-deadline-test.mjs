import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const mode=process.argv[2]||'parent';
const scenario=process.argv[3]||'timeout';

if(mode==='parent'){
  const cases=[
    ['web','timeout','50'],
    ['web','retry-success','50'],
    ['web','legacy-no-timeout','50'],
    ['web','legacy-with-signal','50'],
    ['web','edge-remaining','300'],
    ['worker','worker-contract','50']
  ];
  for(const [childMode,childScenario,attemptTimeoutMs] of cases){
    const r=spawnSync(process.execPath,[process.argv[1],childMode,childScenario],{
      encoding:'utf8',
      env:{
        ...process.env,
        GEMINI_API_KEY:'key-1',
        GEMINI_API_KEY_2:'key-2',
        GEMINI_API_KEY_3:'key-3',
        GEMINI_ATTEMPT_TIMEOUT_MS:attemptTimeoutMs
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
  const started=Date.now();
  const record={
    timeoutMs:init.timeoutMs,
    signal:init.signal,
    apiKey:new Headers(init.headers||{}).get('x-goog-api-key'),
    started
  };
  attempts.push(record);

  if(scenario==='timeout'){
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(resolve,500);
      const onAbort=()=>{
        clearTimeout(timer);
        record.durationMs=Date.now()-started;
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
    record.durationMs=Date.now()-started;
    return new Response(JSON.stringify({error:{message:'temporary'}}),{
      status:500,headers:{'content-type':'application/json'}
    });
  }

  if(scenario==='edge-remaining'){
    if(attempts.length===1){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(resolve,500);
        const onAbort=()=>{
          clearTimeout(timer);
          record.durationMs=Date.now()-started;
          reject(init.signal?.reason||Object.assign(new Error('aborted'),{name:'AbortError'}));
        };
        if(init.signal?.aborted)return onAbort();
        init.signal?.addEventListener('abort',onAbort,{once:true});
      });
      record.durationMs=Date.now()-started;
      return new Response(JSON.stringify({error:{message:'temporary'}}),{
        status:500,headers:{'content-type':'application/json'}
      });
    }

    await new Promise((resolve,reject)=>{
      const fallback=setTimeout(()=>{
        record.durationMs=Date.now()-started;
        record.aborted=false;
        resolve();
      },5200);
      const onAbort=()=>{
        clearTimeout(fallback);
        record.durationMs=Date.now()-started;
        record.aborted=true;
        reject(init.signal?.reason||Object.assign(new Error('aborted'),{name:'AbortError'}));
      };
      if(init.signal?.aborted)return onAbort();
      if(!init.signal){
        clearTimeout(fallback);
        record.durationMs=Date.now()-started;
        record.aborted=false;
        return resolve();
      }
      init.signal.addEventListener('abort',onAbort,{once:true});
    });
  }

  record.durationMs=Date.now()-started;
  return new Response(JSON.stringify({candidates:[{
    content:{parts:[{text:'FINAL_OK'}]},
    finishReason:'STOP'
  }]}),{status:200,headers:{'content-type':'application/json'}});
};

if(mode==='web'){
  await import('../lib/api/_gemini-network-guard.js');
}

const {__test}=await import('../lib/mer-engine.js');

if(scenario==='legacy-no-timeout'){
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:'{}'
  });
  assert.equal(response.status,200);
  assert.equal(attempts.length,1);
  assert.equal(attempts[0].timeoutMs,undefined);
  assert.equal(attempts[0].signal,undefined);
  console.log('PATCH2_WEB_LEGACY_NO_TIMEOUT=PASS');
  process.exit(0);
}

if(scenario==='legacy-with-signal'){
  const callerController=new AbortController();
  const callerSignal=callerController.signal;
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:'{}',
    signal:callerSignal
  });
  assert.equal(response.status,200);
  assert.equal(attempts.length,1);
  assert.equal(attempts[0].timeoutMs,undefined);
  assert.strictEqual(attempts[0].signal,callerSignal,'legacy caller signal must pass through unchanged when timeoutMs is absent');
  console.log('PATCH2_WEB_LEGACY_WITH_SIGNAL=PASS');
  process.exit(0);
}

const started=Date.now();
let result=null,error=null;
try{
  result=await __test.ask(
    'gemini-test',
    '2+3',
    '',
    scenario==='worker-contract'?200:scenario==='timeout'?300:scenario==='edge-remaining'?700:200,
    256
  );
}catch(e){
  error=e;
}
const elapsed=Date.now()-started;

if(scenario==='timeout'){
  assert.ok(error,'deadline test should time out');
  assert.equal(error.code,'ETIMEDOUT','deadline must surface as ETIMEDOUT');
  assert.equal(error.status,408,'deadline timeout should retain HTTP 408 semantics');
  assert.equal(attempts.length,3,'fresh per-attempt timeout should allow three keys within the total budget');
  assert.equal(new Set(attempts.map(x=>x.signal)).size,3,'each provider attempt must receive a fresh signal');
  assert.ok(elapsed<450,'total elapsed time must stay bounded near the requested deadline');
  assert.ok(attempts.every(x=>x.timeoutMs===undefined),'internal timeoutMs must never reach provider fetch');
}else if(scenario==='retry-success'){
  assert.equal(error,null,'retry-success should not throw');
  assert.equal(result.answer,'FINAL_OK');
  assert.equal(result.keyId,'GEMINI_API_KEY_2','actual successful retry key must propagate');
  assert.equal(attempts.length,2);
  assert.notStrictEqual(attempts[0].signal,attempts[1].signal,'retry attempt must receive a fresh signal');
  assert.ok(elapsed<200,'retry path should remain inside total budget');
  assert.ok(attempts.every(x=>x.timeoutMs===undefined),'internal timeoutMs must never reach provider fetch');
}else if(scenario==='edge-remaining'){
  assert.ok(error,`edge remaining test should eventually time out; attempts=${attempts.length}; firstMs=${attempts[0]?.durationMs}; secondMs=${attempts[1]?.durationMs}`);
  assert.equal(error.code,'ETIMEDOUT');
  assert.equal(error.status,408);
  assert.equal(attempts.length,2,'the second provider attempt must start while some budget remains');
  assert.ok(attempts[0].durationMs>=450&&attempts[0].durationMs<560,'first attempt should consume most of the 700ms total budget');
  assert.ok(attempts[1].durationMs>50,'second attempt should receive a real remaining budget');
  assert.ok(attempts[1].durationMs<260,'second attempt timeout must be coed to the remaining budget, not the fixed 300ms attempt timeout');
  assert.ok(attempts[1].durationMs<300,'second attempt must be shorter than the fixed per-attempt cap');
  console.log('PATCH2_WEB_EDGE_REMAINING=PASS total=700ms first='+attempts[0].durationMs+'ms second='+attempts[1].durationMs+'ms');
  assert.notStrictEqual(attempts[0].signal,attempts[1].signal,'edge retry must use a fresh signal');
  assert.ok(attempts.every(x=>x.timeoutMs===undefined),'internal timeoutMs must never reach provider fetch');
}else{
  assert.equal(error,null,'worker should succeed');
  assert.equal(result.keyId,'GEMINI_API_KEY');
  assert.equal(attempts.length,1);
  assert.equal(attempts[0].timeoutMs,undefined,'worker path must not send timeoutMs');
  assert.equal(attempts[0].apiKey,'key-1');
}

console.log('PATCH2_'+mode.toUpperCase()+'_'+scenario.toUpperCase().replaceAll('-','_')+'=PASS elapsed='+elapsed+'ms attempts='+attempts.length);
