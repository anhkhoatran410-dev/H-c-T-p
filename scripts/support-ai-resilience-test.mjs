import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const scenario=process.argv[2]||'success';

if(scenario==='parent'){
  for(const child of ['success','http-error']){
    const r=spawnSync(process.execPath,[process.argv[1],child],{
      encoding:'utf8',
      env:{
        ...process.env,
        GEMINI_API_KEY:'support-ai-test-key'
      }
    });
    if(r.status!==0){
      process.stderr.write(r.stdout||'');
      process.stderr.write(r.stderr||'');
      throw new Error('support-ai '+child+' test failed');
    }
    console.log((r.stdout||'').trim());
  }

  const source=fs.readFileSync(new URL('../api/support-ai.js',import.meta.url),'utf8');
  assert.match(source,/import ['']\.\.\/lib\/api\/_gemini-network-guard\.js[''];/);
  assert.match(source,/const usingNetworkGuard = globalThis\.__STUDY_TH_GEMINI_GUARD__ === true/);
  assert.match(source,/if\(!usingNetworkGuard\)\{\s*apiEntry=await acquireAiKey\('GEMINI'\)/);
  assert.doesNotMatch(source,/await\s+reportAi(?:Success|Failure)\s*\(/);
  console.log('SUPPORT_AI_STATIC_OWNERSHIP=PASS');
  process.exit(0);
}

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.AUDIT_REDIS_REST_URL;
delete process.env.AUDIT_REDIS_REST_TOKEN;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.GEMINI_API_KEY='support-ai-test-key';

const providerStatus=scenario==='http-error'?503:200;
globalThis.fetch=async()=>{
  if(providerStatus===200){
    return new Response(JSON.stringify({
      candidates:[{
        content:{parts:[{text:'SUPPORT_AI_OK'}]},
        finishReason:'STOP'
      }]
    }),{
      status:200,
      headers:{'content-type':'application/json'}
    });
  }
  return new Response(JSON.stringify({error:{message:'simulated provider failure'}}),{
    status:503,
    headers:{'content-type':'application/json'}
  });
};

const {aiPoolSnapshot}=await import('../lib/api/_ai-resilience.js');
const before=(await aiPoolSnapshot('GEMINI'))[0]||{};

const {default:handler}=await import('../api/support-ai.js');
assert.equal(globalThis.__STUDY_TH_GEMINI_GUARD__,true,'support-ai must load the network guard');

const headers={
  'content-type':'application/json',
  host:'localhost:3000',
  origin:'https://localhost:3000',
  'user-agent':'Mozilla/5.0 support-ai-test'
};
const req={
  method:'POST',
  headers,
  body:{message:'Giải thích định luật Newton ở mức cơ bản.',history:[],subject:'Vật lý'}
};

let statusCode=200;
let payload=null;
const responseHeaders=new Map();
const res={
  statusCode:200,
  setHeader(name,value){responseHeaders.set(String(name).toLowerCase(),String(value));},
  getHeader(name){return responseHeaders.get(String(name).toLowerCase());},
  status(code){this.statusCode=code;statusCode=code;return this;},
  json(value){payload=value;return this;},
  end(body){payload=body;return this;}
};

await handler(req,res);
await Promise.resolve();

const after=(await aiPoolSnapshot('GEMINI'))[0]||{};
const successDelta=Number(after.successes||0)-Number(before.successes||0);
const failureDelta=Number(after.failures||0)-Number(before.failures||0);

if(scenario==='success'){
  assert.equal(statusCode,200,'support-ai success status');
  assert.equal(payload?.answer,'SUPPORT_AI_OK','support-ai success answer');
  assert.equal(successDelta,1,'network guard must own the single success report');
  assert.equal(failureDelta,0,'success must not record a failure');
}else{
  assert.equal(statusCode,503,'support-ai provider error status');
  assert.equal(successDelta,0,'provider failure must not record success');
  assert.equal(failureDelta,1,'network guard must own the single failure report');
}

console.log('SUPPORT_AI_'+scenario.toUpperCase()+'_RUNTIME=PASS');
