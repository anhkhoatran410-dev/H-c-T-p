import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../lib/solve-legacy.js',import.meta.url),'utf8');

assert.match(source,/function usingGeminiNetworkGuard(){return globalThis\.__STUDY_TH_GEMINI_GUARD__===true;}/);
assert.equal((source.match(/const usingGuard=usingGeminiNetworkGuard()/g)||[]).length,3,'analyzeRoute/gemini/verify must all use the network-guard ownership contract');
assert.equal((source.match(/if(usingGuard)requestInit\.timeoutMs=/g)||[]).length,3,'all guarded Gemini calls must pass a total timeout to the network guard');
assert.equal((source.match(/if(!usingGuard&&apiEntry)reportAi(?:Success|Failure)/g)||[]).length,7,'direct key/report ownership must be gated behind !usingGuard');
assert.doesNotMatch(source,/await\s+reportAi(?:Success|Failure)\s*\(/,'solver should not await resilience reporting');
assert.doesNotMatch(source,/headers:\s*\{\s*'Content-Type':\s*'application\/json',\s*'x-goog-api-key':\s*api\s*\}/,'solver must not force a key while the network guard owns Gemini requests');
console.log('SOLVE_GEMINI_GUARD_OWNERSHIP=PASS');
