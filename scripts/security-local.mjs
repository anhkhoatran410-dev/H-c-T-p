import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const mode=String(process.env.SECURITY_LOCAL_MODE||'mock').toLowerCase();
const live=mode==='live';
const liveAi=process.argv.includes('--live-ai');
const baseUrl=String(process.env.SECURITY_LOCAL_BASE_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
const appOrigin=String(process.env.APP_ORIGIN||baseUrl).replace(/\/$/,'');
const adminPassword=String(process.env.ADMIN_PASSWORD||'');
const adminMfaCode=String(process.env.ADMIN_MFA_TOTP_CODE||'').replace(/\D/g,'').slice(0,6);
const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const supabaseKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
const redisUrl=String(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const redisToken=String(process.env.UPSTASH_REDIS_REST_TOKEN||'');
const workerUrl=String(process.env.SECURITY_AUDIT_WORKER_URL||'').trim().replace(/\/$/,'');
const workerSecret=String(process.env.SECURITY_AUDIT_CRON_SECRET||'');
const results=[];
const redisState=new Map();
let sessionCookie='';
function pass(name,detail=''){results.push({name,ok:true});console.log(`PASS  ${name}${detail?` — ${detail}`:''}`);}
function fail(name,detail='assertion failed'){results.push({name,ok:false});console.error(`FAIL  ${name} — ${detail}`);}
function skip(name,detail=''){results.push({name,ok:null});console.log(`SKIP  ${name}${detail?` — ${detail}`:''}`);}
function assert(ok,name,detail=''){if(ok)pass(name,detail);else fail(name,detail);return ok;}
function parseRedisHash(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function redisResult(command){
  const op=String(command?.[0]||'').toUpperCase(),key=String(command?.[1]||'');
  if(op==='SET'){redisState.set(key,String(command?.[2]??''));return 'OK';}
  if(op==='GET')return redisState.get(key)??null;
  if(op==='DEL')return redisState.delete(key)?1:0;
  if(op==='INCR'){const n=Number(redisState.get(key)||0)+1;redisState.set(key,String(n));return n;}
  if(op==='DECR'){const n=Number(redisState.get(key)||0)-1;redisState.set(key,String(n));return n;}
  if(op==='EXPIRE'||op==='PEXPIRE')return 1;
  if(op==='LPUSH'){const list=Array.isArray(redisState.get(key))?redisState.get(key):[];for(let i=2;i<command.length;i++)list.unshift(String(command[i]??''));redisState.set(key,list);return list.length;}
  if(op==='RPUSH'){const list=Array.isArray(redisState.get(key))?redisState.get(key):[];for(let i=2;i<command.length;i++)list.push(String(command[i]??''));redisState.set(key,list);return list.length;}
  if(op==='RPOP'){const list=Array.isArray(redisState.get(key))?redisState.get(key):[];const v=list.pop()??null;redisState.set(key,list);return v;}
  if(op==='LTRIM')return 'OK';
  if(op==='SADD'){const set=redisState.get(key) instanceof Set?redisState.get(key):new Set();for(let i=2;i<command.length;i++)set.add(String(command[i]));redisState.set(key,set);return set.size;}
  if(op==='SREM'){const set=redisState.get(key) instanceof Set?redisState.get(key):new Set();let n=0;for(let i=2;i<command.length;i++)if(set.delete(String(command[i])))n++;redisState.set(key,set);return n;}
  if(op==='HINCRBY'){const h=parseRedisHash(redisState.get(key));h[String(command?.[2])]=String(Number(h[String(command?.[2])]||0)+Number(command?.[3]||0));redisState.set(key,h);return h[String(command?.[2])];}
  if(op==='HSET'){const h=parseRedisHash(redisState.get(key));for(let i=2;i+1<command.length;i+=2)h[String(command[i])]=String(command[i+1]);redisState.set(key,h);return 1;}
  if(op==='HGETALL'){const h=parseRedisHash(redisState.get(key));return Object.entries(h).flatMap(([k,v])=>[k,v]);}
  if(op==='EVAL')return '1';
  return null;
}
const realFetch=globalThis.fetch;
if(!live){
  process.env.UPSTASH_REDIS_REST_URL='https://mock-redis.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN='mock-token';
  process.env.SUPABASE_URL='https://mock-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY='mock-service-role';
  process.env.GEMINI_API_KEY='mock-gemini-key';
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(/redis\.invalid|upstash|redis/i.test(target)){
      let body=[];try{body=JSON.parse(String(options.body||'[]'));}catch{}
      const commands=Array.isArray(body?.[0])?body:[body];
      const out=commands.map(redisResult);
      return new Response(JSON.stringify(target.endsWith('/pipeline')?out.map(result=>({result})):{result:out[0]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(/supabase/i.test(target)&&/\/rest\/v1\//.test(target))return new Response('',{status:201});
    return new Response('',{status:404});
  };
}
const {auditRecord,persistAudit}=await import('../api/_audit-log.js');
const {recordShieldViolation,shieldStatus,shieldSubjectFingerprint,setShieldSubjectBlock,clearShieldSubjectBlock,shieldSubjectStatus}=await import('../api/_intrusion-shield.js');
const {aiLockdownStatus,setAiLockdown}=await import('../api/_emergency-lock.js');
const {warmAiKeyPool}=await import('../api/_ai-resilience.js');
async function liveRequest(path,options={}){const headers={Accept:'application/json',Origin:appOrigin,'User-Agent':'STUDY-TH-security-local/2.0',...(options.headers||{})};if(sessionCookie)headers.Cookie=sessionCookie;return fetch(`${baseUrl}${path}`,{...options,headers,redirect:'manual'});}
async function liveJson(r){const t=await r.text();try{return JSON.parse(t||'{}');}catch{return{};}}
async function liveRedis(commands){if(!redisUrl||!redisToken)return null;try{const r=await fetch(`${redisUrl}/pipeline`,{method:'POST',headers:{Authorization:`Bearer ${redisToken}`,'Content-Type':'application/json'},body:JSON.stringify(commands),signal:AbortSignal.timeout(3000)});if(!r.ok)return null;const d=await r.json().catch(()=>null);return Array.isArray(d)?d.map(x=>x?.result):null;}catch{return null;}}
async function liveSupabase(path){if(!supabaseUrl||!supabaseKey)return null;try{const r=await fetch(`${supabaseUrl}/rest/v1/${path}`,{headers:{apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`,Accept:'application/json'},signal:AbortSignal.timeout(4000)});if(!r.ok)return null;return await r.json().catch(()=>null);}catch{return null;}}
async function runLive(){
  console.log(`\nSTUDY TH security local integration — live mode\nBASE_URL=${baseUrl}`);
  for(const [n,v] of [['UPSTASH_REDIS_REST_URL',redisUrl],['UPSTASH_REDIS_REST_TOKEN',redisToken],['SUPABASE_URL',supabaseUrl],['SUPABASE_SERVICE_ROLE_KEY',supabaseKey]])assert(Boolean(v),`Live environment: ${n} configured`);
  try{const r=await liveRequest('/api/system-control',{method:'GET'});assert(r.status===200,'Local Vercel dev reachable',`HTTP ${r.status}`);}catch(e){fail('Local Vercel dev reachable',`${e.message}. Hãy chạy vercel dev trước.`);return;}
  try{const r=await liveRequest('/api/solve',{method:'GET'});assert(r.status===405,'GET /api/solve rejected',`HTTP ${r.status}`);}catch(e){fail('GET /api/solve rejected',e.message);}
  try{const r=await liveRequest('/api/solve',{method:'POST',headers:{'Content-Type':'text/plain'},body:'security-local-content-type-probe'});assert(r.status===415,'AI JSON boundary',`HTTP ${r.status}`);}catch(e){fail('AI JSON boundary',e.message);}
  if(!adminPassword)skip('Admin → Redis end-to-end','Thiếu ADMIN_PASSWORD; không thực hiện thao tác Admin.');
  else try{
    const payload={password:adminPassword};if(adminMfaCode)payload.otp=adminMfaCode;
    let login=await liveRequest('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    let loginBody=await liveJson(login);
    if(loginBody.error==='MFA_REQUIRED'&&adminMfaCode&&!payload.otp){payload.otp=adminMfaCode;login=await liveRequest('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});loginBody=await liveJson(login);}
    if(!login.ok)fail('Admin login',`HTTP ${login.status}: ${loginBody.error||'unknown error'}`);
    else{
      const setCookie=login.headers.get('set-cookie')||'',match=setCookie.match(/study_admin_session_v3=([^;]+)/);sessionCookie=match?`study_admin_session_v3=${match[1]}`:'';assert(Boolean(sessionCookie),'Admin HttpOnly session captured');
      const subject=`security-local-${crypto.randomUUID()}`;
      const block=await liveRequest('/api/system-control?route=subject-block',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject,enabled:true,seconds:120,confirmAction:true})});assert(block.ok,'Admin → Redis subject quarantine write',`HTTP ${block.status}`);
      const blocked=await liveRequest('/api/solve',{method:'POST',headers:{'Content-Type':'application/json','X-Study-TH-Device':subject},body:JSON.stringify({message:'security-local blocked-path probe'})});assert(blocked.status===403,'Redis quarantine observed by next request',`HTTP ${blocked.status}`);
      const unblock=await liveRequest('/api/system-control?route=subject-block',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject,enabled:false,confirmAction:true})});assert(unblock.ok,'Admin → Redis subject quarantine clear',`HTTP ${unblock.status}`);
      const lockdown=await liveRequest('/api/system-control?route=lockdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,seconds:60,confirmAction:true})});assert(lockdown.ok,'Admin → Redis global AI lockdown write',`HTTP ${lockdown.status}`);
      const locked=await liveRequest('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'security-local lockdown probe'})});assert(locked.status===503,'Global Redis lockdown observed by next request',`HTTP ${locked.status}`);
      const unlock=await liveRequest('/api/system-control?route=lockdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:false,seconds:60,confirmAction:true})});assert(unlock.ok,'Admin → Redis global AI unlock',`HTTP ${unlock.status}`);
    }
  }catch(e){fail('Admin → Redis end-to-end',e.message);}
  if(!redisUrl||!redisToken)skip('Monitoring/security signal → Redis','Thiếu Redis credentials.');
  else try{const probeUa=`STUDY-TH-security-signal/${Date.now()}`;const r=await fetch(`${baseUrl}/api/solve`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',Origin:`${appOrigin}/wrong-origin`,'User-Agent':probeUa,'X-Real-IP':'203.0.113.77'},body:JSON.stringify({message:'security-local monitoring signal probe'})});assert(r.status===403,'Security signal rejected at boundary',`HTTP ${r.status}`);const actorHash=crypto.createHash('sha256').update(`203.0.113.77|${probeUa}`).digest('hex').slice(0,32);const rows=await liveRedis([['GET',`study-th:shield:score:${actorHash}`]]);assert(Number(rows?.[0]||0)>=1,'Threat signal visible in Redis shared state');}catch(e){fail('Monitoring/security signal → Redis',e.message);}
  if(!liveAi)skip('Response → Supabase audit sink','Thêm --live-ai để tạo request AI và đồng bộ queue qua worker.');
  else if(!workerUrl||!workerSecret)skip('Response → Supabase audit sink','Thiếu SECURITY_AUDIT_WORKER_URL/SECURITY_AUDIT_CRON_SECRET; không thể gọi worker trực tiếp.');
  else try{const r=await liveRequest('/api/solve',{method:'POST',headers:{'Content-Type':'application/json','X-Study-TH-Device':`security-audit-${crypto.randomUUID()}`},body:JSON.stringify({message:'Local security audit probe: tính 2 + 2 và trả lời thật ngắn.'})});const requestId=r.headers.get('x-request-id')||'';assert(Boolean(requestId),'AI request id returned');const w=await fetch(`${workerUrl}?batch=100`,{headers:{Authorization:`Bearer ${workerSecret}`},signal:AbortSignal.timeout(10000)});assert(w.ok,'Audit worker sync completed',`HTTP ${w.status}`);let row=null;for(let i=0;i<20&&!row;i++){const rows=await liveSupabase(`ai_request_audit?select=id,request_id,endpoint,status_code,outcome,model,response_hash,response_length,latency_ms,created_at&request_id=eq.${encodeURIComponent(requestId)}&limit=1`);row=Array.isArray(rows)?rows[0]||null:null;if(!row)await new Promise(s=>setTimeout(s,250));}assert(Boolean(row),'Response → Supabase audit row created',`HTTP ${r.status}`);if(row){assert(Boolean(row.response_hash),'Audit stores response hash');assert(Number(row.response_length)>=0,'Audit stores only response metadata');assert(!Object.prototype.hasOwnProperty.call(row,'response_text'),'Audit API exposes no raw response field');}}catch(e){fail('Response → Supabase audit sink',e.message);}
}
async function runMock(){
  console.log(`\nSTUDY TH security local test — mode=mock`);
  await setAiLockdown(true,120);assert((await aiLockdownStatus()).locked,'Admin → Redis: AI lockdown visible from shared state');assert(redisState.has('study-th:security:ai-lockdown'),'Admin → Redis: lockdown key written');await setAiLockdown(false,120);assert(!(await aiLockdownStatus()).locked,'Admin → Redis: unlock clears shared state');
  const subject='device-local-001';await setShieldSubjectBlock(subject,180);const subjectState=await shieldSubjectStatus(subject);assert(subjectState.blocked,'Admin → Redis: targeted subject quarantine visible');assert(subjectState.subjectHash===shieldSubjectFingerprint(subject),'Admin → Redis: one-way subject fingerprint used');const blockedReq={method:'POST',headers:{'x-real-ip':'203.0.113.10','user-agent':'STUDY-TH-local-security-test/2.0','x-study-th-device':subject},body:{device_id:subject}};assert((await shieldStatus(blockedReq)).blocked,'Admin → Redis: next request observes quarantine');await clearShieldSubjectBlock(subject);assert(!(await shieldSubjectStatus(subject)).blocked,'Admin → Redis: targeted quarantine clears');
  const responseReq={method:'POST',headers:{'x-real-ip':'203.0.113.10','user-agent':'STUDY-TH-local-security-test/2.0','x-study-th-device':'device-local-001'},body:{}};const audit=auditRecord(responseReq,{request_id:crypto.randomUUID(),endpoint:'/api/solve',status_code:200,outcome:'response_delivered',model:'gemini-test',response_text:'SAFE TEST RESPONSE',latency_ms:42});await persistAudit(audit);const queued=redisState.get('study-th:audit:queue');const queuedRow=Array.isArray(queued)&&queued.length?JSON.parse(queued[0]):null;assert(Array.isArray(queued)&&queued.length===1,'Response → Audit: event queued in Redis');assert(Boolean(queuedRow?.event_id),'Response → Audit: stable event id created');assert(Boolean(queuedRow?.response_hash)&&!queuedRow?.response_text,'Response → Audit: raw response is not stored');assert(Boolean(queuedRow?.actor_hash)&&Boolean(queuedRow?.device_hash),'Response → Audit: actor/device are one-way hashes');
  const warmed=await warmAiKeyPool('GEMINI');const meta=String(redisState.get('study-th:ai-keypool-meta:GEMINI')||'');assert(warmed,'Dynamic key pool: cache warm completed');assert(meta.includes('fingerprint')&&!meta.includes('mock-gemini-key'),'Dynamic key pool: Redis warm state contains fingerprints only');
  const threatReq={method:'POST',headers:{'x-real-ip':'203.0.113.77','user-agent':'STUDY-TH-local-security-test/2.0','x-study-th-device':'device-local-threat'},body:{}};for(let i=0;i<5;i++)await recordShieldViolation(threatReq,`local-probe-${i}`);assert((await shieldStatus(threatReq)).blocked,'Monitoring → Redis: repeated threat score produces quarantine');const threatKeys=[...redisState.keys()].filter(k=>k.startsWith('study-th:shield:score:'));assert(threatKeys.length>=1,'Monitoring → Redis: threat score persisted');
}
if(live)await runLive();else await runMock();
for(const [name,file,needle] of [['AI gateway JSON boundary','../api/_ai-gateway.js','enforceJsonContentType(req,res)'],['AI gateway DLP/semantic guard','../api/_ai-gateway.js','sanitizeAiIngress'],['AI core replay proof','../api/_solve-core.js','consumeNonce'],['Support AI audit sink','../api/support-ai.js','persistAudit'],['Admin lockdown Redis state','../api/_emergency-lock.js','study-th:security:ai-lockdown'],['Subject quarantine Redis state','../api/_intrusion-shield.js','study-th:shield:subject:block:'],['Audit worker queue drain','../api/_audit-worker.js','study-th:audit:queue'],['Dynamic key-pool warming','../api/_ai-resilience.js','warmAiKeyPool']]){try{const text=await fs.readFile(new URL(file,import.meta.url),'utf8');assert(text.includes(needle),`Source: ${name}`,needle);}catch(e){fail(`Source: ${name}`,e.message);}}
globalThis.fetch=realFetch;const failed=results.filter(x=>x.ok===false),skipped=results.filter(x=>x.ok===null);console.log(`\nSummary: ${results.length-failed.length-skipped.length} pass, ${failed.length} fail, ${skipped.length} skipped.`);if(failed.length){console.error('Local security test failed.');process.exitCode=1;}else console.log(live?'Live local integration test completed.':'Mock local security architecture test passed.');