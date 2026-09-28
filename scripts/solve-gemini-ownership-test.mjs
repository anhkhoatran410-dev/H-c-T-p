import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../lib/solve-legacy.js',import.meta.url),'utf8');
const solveSource=fs.readFileSync(new URL('../api/solve.js',import.meta.url),'utf8');
assert.equal(solveSource.includes("import { getAiKeyPool } from '../lib/api/_ai-resilience.js';"),false,'api/solve fallback must not acquire its own Gemini key when the network guard owns requests');
assert.equal((solveSource.match(/x-goog-api-key/g)||[]).length,0,'api/solve must not inject a Gemini API key directly');
assert.match(solveSource,/const fallbackDeadline=Date\.now\(\)\+25000/,'solve fallback must enforce one total 25s budget across fallback models');
assert.match(solveSource,/timeoutMs:remaining/,'solve fallback must pass its remaining deadline to the Gemini network guard');


assert.ok(source.includes('function usingGeminiNetworkGuard(){return globalThis.__STUDY_TH_GEMINI_GUARD__===true;}'));
assert.equal((source.match(/const usingGuard=usingGeminiNetworkGuard\(\)/g)||[]).length,3,'analyzeRoute/gemini/verify must all use the network-guard ownership contract');
assert.equal((source.match(/if\(usingGuard\)requestInit\.timeoutMs=/g)||[]).length,3,'all guarded Gemini calls must pass a total timeout to the network guard');
assert.equal((source.match(/if\(!usingGuard&&apiEntry\)reportAi(?:Success|Failure)/g)||[]).length,7,'direct key/report ownership must be gated behind !usingGuard');
assert.equal((source.match(/await\s+reportAi(?:Success|Failure)\s*\(/g)||[]).length,0,'solver should not await resilience reporting');
assert.equal((source.match(/headers:\s*\{\s*'Content-Type':\s*'application\/json',\s*'x-goog-api-key':\s*api\s*\}/g)||[]).length,0,'solver must not force a key while the network guard owns Gemini requests');
assert.match(source,/if\(audit\?\.verdict==='FAIL'\)/,'Olympiad audit FAIL must enter the repair engine');
assert.match(source,/repair\(\{message,subject,image,cas,candidate,audit,attempt:1,codeExecutionTools\}/,'Repair Engine must be invoked on an audit FAIL');
assert.match(source,/repairCount=1;/,'Successful repair must increment repairCount');
assert.match(source,/tool:repairCount>0\?'Repair Engine'/,'Response must expose Repair Engine when repair is used');
const hardWorkflow=fs.readFileSync(new URL('../.github/workflows/study-th-hard-benchmark.yml',import.meta.url),'utf8');
assert.equal(hardWorkflow.includes('ai-speed-stability-20260918'),false,'hard benchmark must not use the retired preview endpoint');
const securityWorkflow=fs.readFileSync(new URL('../.github/workflows/security-audit.yml',import.meta.url),'utf8');
assert.equal(securityWorkflow.includes('ai-speed-stability-20260918'),false,'security smoke must not use the retired preview endpoint');
console.log('SOLVE_GEMINI_GUARD_OWNERSHIP=PASS');
