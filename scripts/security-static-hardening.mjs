import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const order = (text, needles) => {
  const positions = needles.map((needle) => text.indexOf(needle));
  return positions.every((position) => position >= 0) && positions.every((position, i) => i === 0 || position > positions[i - 1]);
};
const absent = (text, needles) => needles.every((needle) => !text.includes(needle));
const checks = [
  ['common security headers', read('api/_security.js'), ['X-DNS-Prefetch-Control', 'X-Permitted-Cross-Domain-Policies', 'X-Robots-Tag']],
  ['JSON content-type guard', read('api/_security.js'), ['function enforceJsonContentType']],
  ['HttpOnly admin cookie', read('api/admin-login.js'), ['HttpOnly', 'Secure', 'SameSite=Strict', 'study_admin_session_v3']],
  ['Admin TOTP MFA', read('api/admin-login.js'), ['ADMIN_MFA_TOTP_SECRET', 'validTotp', 'mfaRequired', 'MFA_REQUIRED']],
  ['cookie session health check', read('admin/login-fix.js'), ['admin-login?check=1', 'checkExistingSession', 'credentials:\'same-origin\'']],
  ['no admin token browser storage', read('admin/login-fix.js'), ['credentials:\'same-origin\'', 'await startAdmin()', 'checkExistingSession']],
  ['admin dashboard no token persistence', read('admin/app.js'), ['credentials:"same-origin"', 'async function adminApi', 'admin-create-account', 'admin-create-bot-rule']],
  ['copilot cookie auth', read('admin/admin-copilot-final.js'), ['credentials:\'same-origin\'', "headers:{'Content-Type':'application/json'}"]],
  ['AI DLP extensions', read('api/_ai-input-guard.js'), ['aws-access-key', 'private-key', 'safeRole', 'forget\\s+']],
  ['server-side admin config routes', read('api/admin-tools.js'), ['admin-accounts', 'admin-create-account', 'admin-bot-rules', 'admin-create-bot-rule']],
  ['DB admin-config lockdown migration', read('supabase/migrations/20260917_security_admin_config.sql'), ['revoke insert, update, delete', 'support_accounts_write', 'support_bot_rules_write']],
  ['server-side security-state lockdown', read('supabase/migrations/20260917_security_admin_routing.sql'), ['revoke all on table public.system_control', 'revoke all on table public.system_incidents']],
  ['AI gateway JSON boundary', read('api/_ai-gateway.js'), ['enforceJsonContentType(req,res)']],
  ['AI core JSON boundary', read('api/_solve-core.js'), ['enforceJsonContentType(req,res)']],
  ['support AI JSON boundary', read('api/support-ai.js'), ['enforceJsonContentType(req,res)']],
  ['AI response audit sink', read('api/_audit-log.js'), ['persistAudit', 'ENQUEUE_LUA', 'AUDIT_QUEUE_KEY', 'AUDIT_QUEUE_MAX']],
  ['AI gateway non-blocking audit', read('api/_ai-gateway.js'), ['auditRecord', 'persistAudit', "outcome:delivered?'response_delivered':'response_guard_blocked'"]],
  ['support AI audit', read('api/support-ai.js'), ['auditRecord', 'persistAudit', 'response_delivered']],
  ['Redis audit worker', read('api/_audit-worker.js'), ['CRON_SECRET', 'study-th:audit:queue', 'EVAL', 'resolution=ignore-duplicates']],
  ['Redis audit worker retry-safe', read('api/_audit-worker.js'), ['MAX_RETRIES', 'shouldRetry', 'retryDelay', '2 ** attempt', 'Math.random']],
  ['bounded audit queue admission', read('api/_audit-log.js'), ['AUDIT_QUEUE_MAX', 'LLEN', 'AUDIT_DROPPED_KEY', 'return {0,count,d}', 'AUDIT_QUEUE_LIMIT']],
  ['bounded audit DLQ', read('api/_audit-worker.js'), ['DLQ_KEY', 'DLQ_MAX', 'DLQ_LUA', 'moveToDlq', 'dlqDropped']],
  ['audit no restore loop', read('api/_audit-worker.js'), ['bounded DLQ instead of returning queue']],
  ['audit dedicated redis option', read('api/_audit-log.js'), ['AUDIT_REDIS_REST_URL', 'AUDIT_REDIS_REST_TOKEN', 'AUDIT_REDIS_IS_DEDICATED']],
  ['replay nonce bounded TTL', read('api/_internal-replay.js'), ['NONCE_TTL_MS', "'PX', NONCE_TTL_MS", 'verifyTimestamp', 'WINDOW_MS']],
  ['Response Guard fail-safe boundary', read('api/_response-guard.js'), ['OUTPUT_BLOCK_PATTERNS', 'sensitive-secret-detected', 'response-guard-blocked', 'safeClientError']],
  ['Redis subject quarantine', read('api/_intrusion-shield.js'), ['setShieldSubjectBlock', 'clearShieldSubjectBlock', 'study-th:shield:subject:block']],
  ['Admin Redis block control', read('api/system-control.js'), ['subject-block', 'setShieldSubjectBlock', 'clearShieldSubjectBlock', 'redis-subject-block']],
  ['dynamic key pool cache warming', read('api/_ai-resilience.js'), ['warmAiKeyPool', 'study-th:ai-keypool-meta', 'study-th:ai-keypool-active']],
  ['scheduled audit queue sync', read('.github/workflows/security-audit-sync.yml'), ['SECURITY_AUDIT_WORKER_URL', 'SECURITY_AUDIT_CRON_SECRET', '*/15 * * * *']],
  ['architecture monitoring state bus', read('docs/SECURITY_ARCHITECTURE.md'), ['MONITORING / SIEM + AUTO-RESPONSE', 'REDIS / STATE BUS', 'Response Guard', 'AUDIT DATA', 'Admin actions']],
  ['AI audit migration', read('supabase/migrations/20260917_ai_request_audit.sql'), ['create table if not exists public.ai_request_audit', 'alter table public.ai_request_audit enable row level security']],
];
for (const [name, text, needles] of checks) {
  for (const needle of needles) {
    if (!text.includes(needle)) {
      console.error(`FAIL: ${name}: missing ${needle}`);
      process.exitCode = 1;
    }
  }
  if (process.exitCode) break;
  console.log(`PASS: ${name}`);
}
const worker = read('api/_audit-worker.js');
if (!absent(worker, ['restore(rows)', 'queue đã được khôi phục'])) {
  console.error('FAIL: audit worker must not restore failed batches into the main queue');
  process.exitCode = 1;
} else {
  console.log('PASS: audit worker has no restore-to-main-queue loop');
}
const auditLog = read('api/_audit-log.js');
if (!absent(auditLog, ["['SET',key,payload,'EX',86400]"])) {
  console.error('FAIL: audit queue should not create per-event duplicate payload keys');
  process.exitCode = 1;
} else {
  console.log('PASS: audit queue avoids per-event duplicate payload storage');
}
const gateway = read('api/_ai-gateway.js');
if (!order(gateway, ['const timestamp = internalTimestamp();', 'const guarded = sanitizeAiBody(rawBody);', 'const ingress = sanitizeAiIngress(guarded.body.message || \'\', guarded.body.history || []);', "fetch(`${url}/api/_solve-core`"])) {
  console.error('FAIL: AI gateway request order: internal proof must precede expensive input guards and upstream call');
  process.exitCode = 1;
} else {
  console.log('PASS: AI gateway request order: internal proof precedes input guards/upstream');
}
if (!process.exitCode) console.log('All static security hardening assertions passed.');
