// CI syntax validation for JavaScript loaded by the app, API routes and workers.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'docs', 'benchmarks']);
const LEGACY_UNUSED = new Set(['ui-redesign-20260929-v2.js']); // not loaded by index.html
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(m?js)$/.test(name) && !LEGACY_UNUSED.has(name)) files.push(path);
  }
})('.');

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures++;
    console.error('SYNTAX ERROR:', file, '\n', result.stderr.split('\n').slice(0, 4).join('\n'));
  }
}
if (failures) {
  console.error(`${failures} file(s) have syntax errors.`);
  process.exit(1);
}
console.log(`OK: ${files.length} JavaScript files parse successfully.`);
