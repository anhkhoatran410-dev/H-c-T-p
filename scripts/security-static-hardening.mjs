import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [
  ['common security headers', read('api/_security.js'), ['X-DNS-Prefetch-Control', 'X-Permitted-Cross-Domain-Policies', 'X-Robots-Tag']],
  ['JSON content-type guard', read('api/_security.js'), ['function enforceJsonContentType']],
  ['HttpOnly admin cookie', read('api/admin-login.js'), ['HttpOnly', 'Secure', 'SameSite=Strict', 'study_admin_session_v3']],
  ['cookie session health check', read('admin/login-fix.js'), ['admin-login?check=1', 'checkExistingSession', 'credentials:\'same-origin\'']],
  ['no admin token browser storage', read('admin/login-fix.js'), ['credentials:\'same-origin\'', 'await startAdmin()', 'checkExistingSession']],
  ['admin dashboard no token persistence', read('admin/app.js'), ['credentials:"same-origin"', 'async function adminApi', 'admin-create-account', 'admin-create-bot-rule']],
  ['copilot cookie auth', read('admin/admin-copilot-final.js'), ['credentials:\'same-origin\'', "headers:{'Content-Type':'application/json'}"]],
  ['AI DLP extensions', read('api/_ai-input-guard.js'), ['aws-access-key', 'private-key', 'safeRole', 'forget\\s+']],
  ['server-side admin config routes', read('api/admin-tools.js'), ['admin-accounts', 'admin-create-account', 'admin-bot-rules', 'admin-create-bot-rule']],
  ['DB admin-config lockdown migration', read('supabase/migrations/20260917_security_admin_config.sql'), ['revoke insert, update, delete', 'support_accounts_write', 'support_bot_rules_write']],
  ['AI gateway JSON boundary', read('api/_ai-gateway.js'), ['enforceJsonContentType(req,res)']],
  ['AI core JSON boundary', read('api/_solve-core.js'), ['enforceJsonContentType(req,res)']],
  ['support AI JSON boundary', read('api/support-ai.js'), ['enforceJsonContentType(req,res)']],
  ['AI response audit sink', read('api/_audit-log.js'), ['ai_request_audit', 'persistAudit', 'Promise.allSettled']],
  ['AI gateway non-blocking audit', read('api/_ai-gateway.js'), ['auditRecord', 'persistAudit', "outcome:delivered?'response_delivered':'response_guard_blocked'"]],
  ['support AI audit', read('api/support-ai.js'), ['auditRecord', 'persistAudit', 'response_delivered']],
  ['Redis subject quarantine', read('api/_intrusion-shield.js'), ['setShieldSubjectBlock', 'clearShieldSubjectBlock', 'study-th:shield:subject:block']],
  ['Admin Redis block control', read('api/system-control.js'), ['subject-block', 'setShieldSubjectBlock', 'clearShieldSubjectBlock', 'redis-subject-block']],
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
if (!process.exitCode) console.log('All static security hardening assertions passed.');
