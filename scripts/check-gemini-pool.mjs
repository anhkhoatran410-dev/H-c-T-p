import crypto from 'node:crypto';

const MAX_KEYS = 50;
const PREFIX = 'GEMINI';

function readKeys() {
  const values = [];
  const base = String(process.env[`${PREFIX}_API_KEY`] || '').trim();
  if (base) values.push({ id: `${PREFIX}_API_KEY`, value: base });

  for (let i = 2; i <= MAX_KEYS; i += 1) {
    const value = String(process.env[`${PREFIX}_API_KEY_${i}`] || '').trim();
    if (value) values.push({ id: `${PREFIX}_API_KEY_${i}`, value });
  }

  const packed = String(process.env[`${PREFIX}_API_KEYS`] || '').trim();
  if (packed) {
    for (const [index, raw] of packed.split(',').map((x) => x.trim()).filter(Boolean).entries()) {
      if (values.length >= MAX_KEYS) break;
      values.push({ id: `${PREFIX}_API_KEYS_${index + 1}`, value: raw });
    }
  }

  return values.slice(0, MAX_KEYS);
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

const keys = readKeys();
const fingerprints = keys.map((item) => fingerprint(item.value));
const unique = new Set(fingerprints);

console.log(`Gemini key pool: ${keys.length}/${MAX_KEYS} configured, ${unique.size} unique.`);

const duplicates = fingerprints.filter((fp, index) => fingerprints.indexOf(fp) !== index);
if (duplicates.length) {
  console.error(`Duplicate key material detected (${new Set(duplicates).size} duplicate fingerprint(s)).`);
  process.exitCode = 1;
}

const indexed = keys
  .map((item) => item.id.match(/_API_KEY_(\d+)$/)?.[1])
  .filter(Boolean)
  .map(Number)
  .sort((a, b) => a - b);

if (indexed.length) {
  const gaps = [];
  for (let i = 2; i <= Math.max(...indexed); i += 1) {
    if (!indexed.includes(i)) gaps.push(i);
  }
  if (gaps.length) {
    console.log(`Note: indexed env slots are sparse: ${gaps.join(', ')}.`);
  }
}

console.log('Only fingerprints/counts are printed; raw API keys are never logged.');
