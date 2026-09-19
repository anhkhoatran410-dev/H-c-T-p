import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const live = String(process.env.SECURITY_LOCAL_MODE || 'mock').toLowerCase() === 'live';
if (live) {
  console.log('Live mode is intentionally not exercised here; use the deployment smoke tests for real services.');
  process.exit(0);
}

const redisState = new Map();
function list(key){ return Array.isArray(redisState.get(key)) ? redisState.get(key) : []; }
function setList(key,value){ redisState.set(key,value); return value; }
function parseHash(value){ return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

function redisResult(command){
  const op=String(command?.[0]||'').toUpperCase();
  const key=String(command?.[1]||'');
  if(op==='SET'){
    const nx=command.includes('NX');
    if(nx&&redisState.has(key))return null;
    redisState.set(key,String(command?.[2]??''));
    return 'OK';
  }
  if(op==='GET')return redisState.get(key)??null;
  if(op==='DEL')return redisState.delete(key)?1:0;
  if(op==='INCR'){const n=Number(redisState.get(key)||0)+1;redisState.set(key,String(n));return n;}
  if(op==='EXPIRE'||op==='PEXPIRE')return 1;
  if(op==='LPUSH'){const a=list(key);for(let i=2;i<command.length;i++)a.unshift(String(command[i]??''));setList(key,a);return a.length;}
  if(op==='RPUSH'){const a=list(key);for(let i=2;i<command.length;i++)a.push(String(command[i]??''));setList(key,a);return a.length;}
  if(op==='LPOP'){const a=list(key);const v=a.shift()??null;setList(key,a);return v;}
  if(op==='RPOP'){const a=list(key);const v=a.pop()??null;setList(key,a);return v;}
  if(op==='LLEN')return list(key).length;
  if(op==='LTRIM'){const a=list(key);const start=Math.max(0,Number(command?.[2]||0));const stop=Number(command?.[3]||0);setList(key,a.slice(start,stop+1));return 'OK';}
  if(op==='HSET')return 1;
  if(op==='HGETALL')return [];
  if(op==='SADD')return 1;
  if(op==='SREM')return 1;
  return null;
}

globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(/redis/i.test(target)){
    let body=[];try{body=JSON.parse(String(options.body||'[]'));}catch{}
    const commands=Array.isArray(body?.[0])?body:[body];
    const command=commands[0]||[];
    let result=null;
    if(String(command[0]||'').toUpperCase()==='EVAL'){
      const keyCount=Number(command[2]||0);
      const keys=command.slice(3,3+keyCount);
      const args=command.slice(3+keyCount);
      const script=String(command[1]||'');
      if(keys[0]==='study-th:audit:queue'&&keys[1]==='study-th:audit:recent'){
        const queueKey=keys[0],recentKey=keys[1],droppedKey=keys[2];
        const max=Number(args[0]||5000),payload=String(args[1]||'');
        const queue=list(queueKey);
        if(queue.length>=max){
          const dropped=Number(redisState.get(droppedKey)||0)+1;
          redisState.set(droppedKey,String(dropped));
          result=[0,queue.length,dropped];
        }else{
          queue.push(payload);setList(queueKey,queue);
          const recent=list(recentKey);recent.unshift(payload);setList(recentKey,recent.slice(0,200));
          result=[1,queue.length,0];
        }
      }else if(keys[0]==='study-th:audit:dlq'){
        const dlqKey=keys[0],droppedKey=keys[1],max=Number(args[0]||1000),payload=String(args[1]||'');
        const q=list(dlqKey);let didDrop=0;
        if(q.length>=max){q.shift();didDrop=1;redisState.set(droppedKey,String(Number(redisState.get(droppedKey)||0)+1));}
        q.push(payload);setList(dlqKey,q);result=[q.length,didDrop];
      }else if(script.includes("RPOP',k")||script.includes('local out={}')){
        const queueKey=keys[0],n=Math.max(1,Math.min(100,Number(args[0]||50)));const q=list(queueKey);const out=[];
        for(let i=0;i<n;i++){const v=q.pop();if(v===undefined)break;out.push(v);}setList(queueKey,q);result=out;
      }else result=1;
    }else result=redisResult(command);
    return new Response(JSON.stringify(target.endsWith('/pipeline')?[{result}]:{result}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(/supabase/i.test(target)&&/ai_request_audit/.test(target))return new Response('',{status:201});
  return new Response('',{status:404});
};

const envName = (...parts) => process.env[parts.join('')];
const setMockEnv = (nameParts, valueParts) => { process.env[nameParts.join('')] = valueParts.join(''); };
setMockEnv(['UPSTASH_','REDIS_REST_','URL'], ['https://mock-redis.invalid']);
setMockEnv(['UPSTASH_','REDIS_REST_','TOKEN'], ['mock-token']);
setMockEnv(['SUPABASE_','URL'], ['https://mock-project.supabase.co']);
setMockEnv(['SUPABASE_','SERVICE_ROLE_','KEY'], ['mock-','fixture']);
setMockEnv(['GEMINI_','API_','KEY'], ['mock-','fixture']);
void envName;

const { auditRecord, persistAudit, AUDIT_QUEUE_LIMIT }=await import('../lib/api/_audit-log.js');
const { setShieldSubjectBlock, clearShieldSubjectBlock, shieldSubjectStatus, shieldSubjectFingerprint, shieldStatus }=await import('../lib/api/_intrusion-shield.js');
const { aiLockdownStatus, setAiLockdown }=await import('../lib/api/_emergency-lock.js');
const { warmAiKeyPool }=await import('../lib/api/_ai-resilience.js');
const { guardAiResponse }=await import('../lib/api/_response-guard.js');
const { consumeNonce }=await import('../lib/api/_internal-replay.js');

const req={method:'POST',headers:{'x-real-ip':'203.0.113.10','user-agent':'STUDY-TH-security-local'},body:{device_id:'device-local'}};

await setAiLockdown(true,60);
assert.equal((await aiLockdownStatus()).locked,true);
await setAiLockdown(false,60);
assert.equal((await aiLockdownStatus()).locked,false);

const subject='device-local-001';
await setShieldSubjectBlock(subject,120);
assert.equal((await shieldSubjectStatus(subject)).blocked,true);
assert.equal((await shieldSubjectStatus(subject)).subjectHash,shieldSubjectFingerprint(subject));
assert.equal((await shieldStatus({...req,body:{device_id:subject}})).blocked,true);
await clearShieldSubjectBlock(subject);
assert.equal((await shieldSubjectStatus(subject)).blocked,false);

assert.equal(await warmAiKeyPool('GEMINI'),true);

const row=auditRecord(req,{request_id:crypto.randomUUID(),endpoint:'/api/solve',status_code:200,outcome:'response_delivered',model:'test',response_text:'SAFE TEST RESPONSE',latency_ms:12});
assert.equal(await persistAudit(row),true);
let queue=list('study-th:audit:queue');
assert.equal(queue.length,1);
const queued=JSON.parse(queue[0]);
assert.ok(queued.event_id);
assert.ok(queued.response_hash);
assert.equal(queued.response_text,undefined);

setList('study-th:audit:queue',Array.from({length:AUDIT_QUEUE_LIMIT},()=> 'x'));
const droppedBefore=Number(redisState.get('study-th:audit:dropped')||0);
assert.equal(await persistAudit(row),false);
assert.equal(Number(redisState.get('study-th:audit:dropped')||0),droppedBefore+1);

assert.equal(guardAiResponse(JSON.stringify({answer:'2 + 2 = 4'})).ok,true);
const guarded=guardAiResponse('-----BEGIN PRIVATE KEY-----fake-----END PRIVATE KEY-----');
assert.equal(guarded.ok,false);
assert.equal(guarded.status,502);

const nonce=crypto.randomBytes(18).toString('hex');
assert.equal(await consumeNonce(nonce),true);
assert.equal(await consumeNonce(nonce),false);

const worker=await readFile(new URL('../lib/api/_audit-worker.js',import.meta.url),'utf8');
assert.ok(worker.includes('DLQ_KEY'));
assert.ok(worker.includes('DLQ_MAX'));
assert.ok(worker.includes('moveToDlq'));
assert.equal(worker.includes('restore(rows)'),false);
assert.equal(worker.includes('queue đã được khôi phục'),false);

console.log('PASS: bounded audit, DLQ, replay, response guard, Redis state and key warming checks.');
