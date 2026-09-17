const SIGNALS = [
  { id: 'instruction-override', re: /(?:ignore|disregard|forget|override)\s+(?:all|any|the|previous|prior)\s+(?:instructions?|rules?)/i, weight: 2 },
  { id: 'system-prompt-extraction', re: /(?:reveal|show|print|leak|dump|repeat)\s+(?:the\s+)?(?:system|developer|hidden)\s+(?:prompt|instructions?)/i, weight: 3 },
  { id: 'secret-extraction', re: /(?:reveal|show|print|dump|leak)\s+(?:api[_ -]?key|token|secret|service[_ -]?role|environment variables?)/i, weight: 4 },
  { id: 'tool-policy-bypass', re: /(?:bypass|disable|circumvent|evade)\s+(?:the\s+)?(?:security|safety|policy|guard|filter|authentication)/i, weight: 2 },
];

const MAX_SCAN_CHARS = 40_000;

export function inspectPrompt(message) {
  const text = String(message || '').slice(0, MAX_SCAN_CHARS);
  const matches = [];
  let score = 0;
  for (const signal of SIGNALS) {
    if (signal.re.test(text)) {
      matches.push(signal.id);
      score += signal.weight;
    }
  }
  return { suspicious: score >= 3, score, matches };
}

export function sanitizePromptForModel(message) {
  return String(message || '').slice(0, MAX_SCAN_CHARS);
}
