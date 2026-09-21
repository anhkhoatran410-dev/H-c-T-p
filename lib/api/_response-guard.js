const MAX_AI_RESPONSE_BYTES = 2_000_000;

const OUTPUT_BLOCK_PATTERNS = [
  { name: 'pem-private-key', re: /-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----[\s\S]*?-----END(?: RSA| EC| OPENSSH)? PRIVATE KEY-----/i },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'api-key', re: /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/ },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { name: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}\b/i },
  { name: 'internal-header', re: /X-STUDY-TH-INTERNAL|X-STUDY-TH-TIMESTAMP|X-STUDY-TH-NONCE/i },
  { name: 'secret-env-name', re: /(?:UPSTASH_REDIS_REST_TOKEN|SUPABASE_SERVICE_ROLE_KEY|INTERNAL_GATEWAY_SECRET|ADMIN_SESSION_SECRET|ADMIN_MFA_TOTP_SECRET)/i },
];

function configuredSecrets(){
  const names=[];
  for(const [key,value] of Object.entries(process.env)){
    if(!value || typeof value!=='string') continue;
    if(/(?:API_KEY|TOKEN|SECRET|SERVICE_ROLE)/i.test(key) && value.length>=12) names.push(value);
  }
  return [...new Set(names)];
}

function failure(code='response-guard-blocked'){
  return {
    ok:false,
    status:502,
    body:JSON.stringify({ok:false,error:'AI response bị chặn bởi lớp bảo vệ đầu ra.',code}),
    contentType:'application/json; charset=utf-8',
  };
}

export function safeClientError(error, fallback='Yêu cầu không thể xử lý.'){
  const safeFallback=String(fallback||'Yêu cầu không thể xử lý.');
  return safeFallback;
}

export function guardAiResponse(text, contentType='application/json; charset=utf-8'){
  const source=String(text||'');
  const byteLength=Buffer.byteLength(source,'utf8');
  if(byteLength>MAX_AI_RESPONSE_BYTES) return failure('response-too-large');

  for(const secret of configuredSecrets()){
    if(secret.length>=12 && source.includes(secret)) return failure('sensitive-secret-detected');
  }
  for(const pattern of OUTPUT_BLOCK_PATTERNS){
    if(pattern.re.test(source)) return failure(pattern.name);
  }

  // Response Guard fails closed for high-confidence infrastructure material.
  // Ordinary educational output remains unchanged.
  return {ok:true,status:null,body:source,contentType:contentType||'application/json; charset=utf-8'};
}


export function installAiResponseGuard(res) {
  const originalJson = typeof res?.json === 'function' ? res.json.bind(res) : null;
  const originalEnd = typeof res?.end === 'function' ? res.end.bind(res) : null;
  if (!originalJson && !originalEnd) return () => {};
  const restore = () => {
    if (originalJson) res.json = originalJson;
    if (originalEnd) res.end = originalEnd;
  };

  if (originalJson) {
    res.json = (payload) => {
      const checked = guardAiResponse(JSON.stringify(payload ?? {}), 'application/json; charset=utf-8');
      if (!checked.ok) {
        res.statusCode = checked.status;
        res.setHeader?.('Content-Type', checked.contentType);
        return originalEnd ? originalEnd(checked.body) : originalJson(JSON.parse(checked.body));
      }
      return originalJson(payload);
    };
  }

  if (originalEnd) {
    res.end = (body, ...rest) => {
      if (typeof body === 'string' && body.length) {
        const checked = guardAiResponse(
          body,
          res.getHeader?.('content-type') || 'application/json; charset=utf-8'
        );
        if (!checked.ok) {
          res.statusCode = checked.status;
          res.setHeader?.('Content-Type', checked.contentType);
          return originalEnd(checked.body, ...rest);
        }
      }
      return originalEnd(body, ...rest);
    };
  }

  return restore;
}
