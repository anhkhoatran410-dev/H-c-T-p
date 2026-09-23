import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY='mer-test-key';
process.env.UPSTASH_REDIS_REST_URL='https://fake-redis.local';
process.env.UPSTASH_REDIS_REST_TOKEN='test-token';

let evalCount=0;
let providerMode='empty';

globalThis.fetch=async(input,init={})=>{
  const url=String(input);
  if(url.startsWith('https://fake-redis.local')){
    const command=JSON.parse(init.body);
    if(Array.isArray(command)&&command[0]==='GET'){
      return new Response(JSON.stringify({result:null}),{status:200});
    }
    if(Array.isArray(command)&&command[0]==='SET'){
      return new Response(JSON.stringify({result:'OK'}),{status:200});
    }
    if(url.endsWith('/pipeline')){
      if(Array.isArray(command)&&command.every(x=>Array.isArray(x)&&x[0]==='HGETALL')){
        return new Response(JSON.stringify({result:command.map(()=>({result:[]}))}),{status:200});
      }
      return new Response(JSON.stringify({result:'OK'}),{status:200});
    }
    if(Array.isArray(command)&&command[0]==='EVAL'){
      evalCount++;
      return new Response(JSON.stringify({result:[0,0]}),{status:200});
    }
    return new Response(JSON.stringify({result:'OK'}),{status:200});
  }

  if(providerMode==='http-error'){
    return new Response(JSON.stringify({error:{message:'simulated provider failure'}}),{
      status:503,
      headers:{'content-type':'application/json'}
    });
  }

  if(providerMode==='network-error'){
    const e=new Error('simulated network reset');
    e.code='ECONNRESET';
    throw e;
  }

  return new Response(JSON.stringify({
    candidates:[{
      content:{parts:[]},
      finishReason:'STOP'
    }]
  }),{
    status:200,
    headers:{'content-type':'application/json'}
  });
};

const {__test}=await import('../lib/mer-engine.js');

async function runScenario(name){
  evalCount=0;
  providerMode=name;
  let error=null;
  try{
    await __test.ask('gemini-test',name,null,1000,1000);
  }catch(e){
    error=e;
  }
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(evalCount,1,`${name} must produce exactly one Redis EVAL report; got ${evalCount}`);
  return error;
}

const emptyError=await runScenario('empty');
assert.equal(emptyError?.code,'AI_EMPTY');

const httpError=await runScenario('http-error');
assert.equal(httpError?.status,503);

const networkError=await runScenario('network-error');
assert.equal(networkError?.code,'ECONNRESET');

const secondEmpty=await runScenario('empty');
assert.equal(secondEmpty?.code,'AI_EMPTY');

console.log('MER_RESILIENCE_REPORT_ONCE=PASS');
