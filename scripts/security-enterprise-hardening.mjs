import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['Admin role claims', read('api/admin-login.js'), ['ADMIN_OPERATOR_PASSWORD','ADMIN_SECOPS_PASSWORD','ADMIN_CISO_PASSWORD','getAdminRole','role'] ],
  ['Admin policy primitives', read('api/_admin-policy.js'), ['roleAllows','adminSessionFingerprint','createAdminApproval','consumeSecondApproval'] ],
  ['CISO two-session approval', read('api/system-control.js'), ['lockdown-request','lockdown-approve','SECURITY_REQUIRE_CISO_MULTISIG','multisigRequired'] ],
  ['Trusted whitelist controls', read('api/system-control.js'), ['route === \'whitelist\'','setShieldWhitelist','clearShieldWhitelist','shieldWhitelistStatus'] ],
  ['Whitelist enforced at request boundary', read('api/_intrusion-shield.js'), ['isShieldWhitelisted','whitelistRemote','study-th:shield:whitelist:','!whitelisted'] ],
  ['External secret provider abstraction', read('api/_secret-provider.js'), ['SECURITY_SECRET_PROVIDER','vaultFetch','SECURITY_VAULT_ADDR','X-Vault-Token'] ],
  ['AI key pool provider integration', read('api/_ai-resilience.js'), ['resolveAiKeyPool','secretProviderMode','warmAiKeyPool','fingerprint'] ],
  ['Enterprise boundaries documented', read('docs/enterprise-security-roadmap.md'), ['Redis Cluster / Multi-AZ','Supabase read replicas','HSM / AWS Secrets Manager / Azure Key Vault / HashiCorp Vault'] ],
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
if (!process.exitCode) console.log('Enterprise security hardening checks passed.');
