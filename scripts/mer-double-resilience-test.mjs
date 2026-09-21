import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const mode=process.argv[2]||'parent';
const scenarios=['success','http-error','empty','truncated-empty','abort'];

if(mode==='parent'){
  for(const childMode of ['web','worker']){
    for(const scenario of scenarios){
      const key='test-'+childMode+'-'+scenario;
      const r=spawnSync(process.execPath,[process.argv[1],childMode,scenario],{
        encoding:'utf8',
        env:{...process.env,GEMINI_API_KEY:key,GEMINI_API_KEY_2:''}
      });
      if(r.status!==0){
        process.stderr.write(r.stdout||'');
        process.stderr.write(r.stderr||'');
        throw new Error(childMode+' '+scenario+' test failed');
      }
      console.log((r.stdout||'').trim());
    }
  }

  const mer=fs.readFileSync(new URL('../lib/mer-engine.js',import.meta.url),'utf8');
  assert.doesNotMatch(mer,/stage\([^\n]*keyId/i,'keyId must never be sent to onStage/SSE');
  assert.doesNotMatch(mer,/stage\([^\n]*fingerprint/i,'key-pool metadata must never be sent to onStage/SSE');
  assert.doesNotMatch(mer,/merSolve[\s\S]*?return\s*\{[^}]*keyId/i,'keyId must stay out of merSolve response');
  console.log('PATCH1_STATIC_SSE_GUARD=PASS');
  process.exit(0);
}

const scenario=process.argv[3];
assert.ok(scenarios.includes(scenario),'unknown scenario');

globalThis.fetch=async()=>{
  if(scenario==='abort'){
    const e=new Error('simulated timeout');
    e.code='ETIMEDOUT';
    throw e;
  }
  if(scenario==='http-error'){
    return new Response(JSON.stringify({error:{message:'bad key'}}),{
      status:500,
      headers:{'content-type':'application/json'}
    });
  }
  if(scenario==='truncated-empty'){
    return new Response(JSON.stringify({candidates:[{
      content:{parts:[]},
      finishReason:'MAX_TOKENS'
    }]}),{
      status:200,
      headers:{'content-type':'application/json'}
    });
  }
  if(scenario==='empty'){
    return new Response(JSON.stringify({candidates:[{
      content:{parts:[]},
      finishReason:'STOP'
    }]}),{
      status:200,
      headers:{'content-type':'application/json'}
    });
  }
  return new Response(JSON.stringify({
    candidates:[{
      content:{parts:[{text:'FINAL_OK'}]},
      finishReason:'STOP'
    }]
  }),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

if(mode==='web') await import('../lib/api/_gemini-network-guard.js');
const {__test}=await import('../lib/mer-engine.js');
const {aiPoolSnapshot}=await import('../lib/api/_ai-resilience.js');
assert.equal(typeof __test?.ask,'function','ask test hook missing');

const before=(await aiPoolSnapshot('GEMINI'))[0]||{};
let result=null,error=null;
try{
  result=await __test.ask('gemini-test','2+3','',2000,256);
}catch(e){
  error=e;
}

if(scenario==='success'){
  assert.equal(error,null,mode+' success should not throw');
  assert.equal(result.answer,'FINAL_OK',mode+' success answer');
  assert.equal(result.keyId,'GEMINI_API_KEY',mode+' success keyId');
}else{
  assert.ok(error,mode+' '+scenario+' should throw');
  assert.notEqual(String(error?.message||'').includes('Cannot read properties of null'),true,mode+' '+scenario+' must not crash on apiEntry');
}

const after=(await aiPoolSnapshot('GEMINI'))[0]||{};
const successDelta=Number(after.successes||0)-Number(before.successes||0);
const failureDelta=Number(after.failures||0)-Number(before.failures||0);

if(scenario==='success'){
  assert.equal(successDelta,1,mode+' success must report exactly once');
}else if(scenario==='empty'||scenario==='truncated-empty'){
  if(mode==='web'){
    assert.equal(successDelta,1,mode+' provider success must be recorded exactly once');
    assert.equal(failureDelta,0,mode+' MER must not double-report provider-success output validation');
  }else{
    assert.equal(failureDelta,1,mode+' worker output validation failure must be reported once');
  }
}else{
  assert.equal(failureDelta,1,mode+' '+scenario+' must report exactly once');
}

console.log('PATCH1_'+mode.toUpperCase()+'_'+scenario.toUpperCase().replaceAll('-','_')+'=PASS');
