const MAX_AI_RESPONSE_BYTES = 2_000_000;

function configuredSecrets(){
  const names=[];
  for(const [key,value] of Object.entries(process.env)){
    if(!value || typeof value!=='string') continue;
    if(/(?:API_KEY|TOKEN|SECRET|SERVICE_ROLE)/i.test(key) && value.length>=12) names.push(value);
  }
  return [...new Set(names)];
}

export function guardAiResponse(text, contentType='application/json; charset=utf-8'){
  const source=String(text||'');
  const byteLength=Buffer.byteLength(source,'utf8');
  if(byteLength>MAX_AI_RESPONSE_BYTES){
    return {ok:false,status:502,body:JSON.stringify({error:'AI response quá lớn.'}),contentType:'application/json; charset=utf-8'};
  }

  let safe=source;
  for(const secret of configuredSecrets()){
    if(secret.length>=12) safe=safe.split(secret).join('[REDACTED]');
  }

  // Never forward internal gateway material to clients.
  safe=safe
    .replace(/X-STUDY-TH-INTERNAL/gi,'[REDACTED-INTERNAL-HEADER]')
    .replace(/UPSTASH_REDIS_REST_TOKEN/gi,'[REDACTED-REDIS-TOKEN]');

  return {ok:true,status:null,body:safe,contentType:contentType||'application/json; charset=utf-8'};
}
