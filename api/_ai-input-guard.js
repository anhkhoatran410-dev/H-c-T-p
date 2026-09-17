import crypto from 'node:crypto';

const MAX_CONTEXT_ITEMS = 16;
const MAX_CONTEXT_CHARS = 60_000;

// DLP patterns are intentionally conservative. They redact obvious high-value
// identifiers/secrets instead of blocking ordinary educational content.
const DLP_PATTERNS = [
  { name: 'email', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[EMAIL_REDACTED]' },
  { name: 'phone', re: /(?<!\d)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(?!\d)/g, replacement: '[PHONE_REDACTED]' },
  { name: 'vn-id', re: /(?<!\d)\d{12}(?!\d)/g, replacement: '[ID_REDACTED]' },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: '[TOKEN_REDACTED]' },
  { name: 'api-key', re: /\b(?:AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/g, replacement: '[SECRET_REDACTED]' },
  { name: 'bearer', re: /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}\b/gi, replacement: 'Bearer [TOKEN_REDACTED]' },
];

// High-confidence multi-turn semantic signals. This is a bounded heuristic
// guardrail, not a claim of complete semantic jailbreak detection.
const SEMANTIC_SIGNALS = [
  /ignore\s+(?:all\s+)?previous\s+(?:instructions|rules|messages)/i,
  /disregard\s+(?:all\s+)?previous\s+(?:instructions|rules|messages)/i,
  /reveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|instructions)/i,
  /(?:show|print|dump|output)\s+(?:the\s+)?(?:api[_ -]?key|token|secret|credential|environment\s+variables?)/i,
  /act\s+as\s+(?:the\s+)?(?:system|developer|admin|root)/i,
  /(?:new|highest|higher)\s+priority\s+(?:instruction|rule)/i,
  /(?:pretend|assume)\s+(?:you\s+are|this\s+is)\s+(?:a\s+)?(?:system|developer|admin)/i,
  /bypass\s+(?:the\s+)?(?:guard|filter|policy|security)/i,
];

function normalize(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFKC');
}

function redact(text) {
  let out = normalize(text);
  const redactions = new Set();
  for (const item of DLP_PATTERNS) {
    item.re.lastIndex = 0;
    if (item.re.test(out)) redactions.add(item.name);
    item.re.lastIndex = 0;
    out = out.replace(item.re, item.replacement);
  }
  return { text: out, redactions: [...redactions] };
}

function collectConversation(message, history) {
  const safeHistory = Array.isArray(history) ? history.slice(-MAX_CONTEXT_ITEMS) : [];
  const chunks = [];
  for (const item of safeHistory) {
    if (!item || typeof item !== 'object') continue;
    const role = String(item.role || 'user').slice(0, 32);
    const content = String(item.content ?? item.message ?? '');
    if (content) chunks.push(`${role}: ${content}`);
  }
  if (message) chunks.push(`user: ${message}`);
  return chunks.join('\n').slice(-MAX_CONTEXT_CHARS);
}

export function inspectSemanticConversation(message, history = []) {
  const context = collectConversation(message, history);
  let score = 0;
  const signals = [];
  for (const pattern of SEMANTIC_SIGNALS) {
    if (pattern.test(context)) {
      score += 1;
      signals.push(String(pattern));
    }
  }
  // Two or more independent high-confidence signals in conversation context
  // are enough to stop the request before provider execution.
  return {
    ok: score < 2,
    code: score >= 2 ? 'semantic-risk-high' : null,
    score,
    signals: signals.length,
  };
}

export function sanitizeAiIngress(message, history = []) {
  const messageRedacted = redact(message);
  const nextHistory = Array.isArray(history) ? history.slice(-MAX_CONTEXT_ITEMS).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const content = typeof item.content === 'string'
      ? item.content
      : (typeof item.message === 'string' ? item.message : null);
    if (content === null) return item;
    const r = redact(content);
    if (typeof item.content === 'string') return { ...item, content: r.text };
    return { ...item, message: r.text };
  }) : history;

  const semantic = inspectSemanticConversation(messageRedacted.text, nextHistory);
  if (!semantic.ok) {
    return {
      ok: false,
      code: semantic.code,
      status: 422,
      message: '',
      history: [],
      dlp: { message: messageRedacted.redactions.length, history: 0, types: messageRedacted.redactions },
      semantic,
    };
  }

  const allTypes = new Set(messageRedacted.redactions);
  let historyRedactions = 0;
  for (const item of nextHistory) {
    if (!item || typeof item !== 'object') continue;
    const value = String(item.content ?? item.message ?? '');
    const r = redact(value);
    if (r.redactions.length) {
      historyRedactions += r.redactions.length;
      r.redactions.forEach((x) => allTypes.add(x));
    }
  }

  return {
    ok: true,
    code: null,
    status: 200,
    message: messageRedacted.text,
    history: nextHistory,
    dlp: { message: messageRedacted.redactions.length, history: historyRedactions, types: [...allTypes] },
    semantic,
  };
}

export function guardEventId() {
  return crypto.randomBytes(8).toString('hex');
}
