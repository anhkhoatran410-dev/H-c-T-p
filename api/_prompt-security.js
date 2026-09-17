const MAX_PROMPT_CHARS = 30_000;
const MAX_REPEATED_LINES = 24;
const MAX_HISTORY_ITEMS = 80;

// High-confidence prompt-abuse indicators only. This is a defensive pre-filter,
// not an attempt to classify every malicious prompt or identify agents perfectly.
const BLOCK_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions|messages|rules)/i,
  /disregard\s+(all\s+)?previous\s+(instructions|messages|rules)/i,
  /forget\s+(all\s+)?previous\s+(instructions|rules)/i,
  /reveal\s+(the\s+)?(system|developer)\s+(prompt|instructions)/i,
  /show\s+(me\s+)?(the\s+)?(system|developer)\s+(prompt|instructions)/i,
  /print\s+(the\s+)?(system|developer)\s+(prompt|instructions)/i,
  /what\s+(is|are)\s+(your|the)\s+(system|developer)\s+(prompt|instructions)/i,
  /output\s+(all\s+)?(hidden|secret|internal)\s+(instructions|prompt|rules)/i,
  /reveal\s+(api[_ -]?key|token|secret|credential)/i,
  /(?:show|print|dump|output)\s+(the\s+)?(api[_ -]?key|token|secret|credential|environment\s+variables?)/i,
  /process\.env\b.*\b(output|print|show|dump|reveal)/i,
  /<\s*system\s*>[\s\S]*<\s*\/\s*system\s*>/i,
  /<\s*developer\s*>[\s\S]*<\s*\/\s*developer\s*>/i,
  /BEGIN\s+(SYSTEM|DEVELOPER)\s+(PROMPT|INSTRUCTIONS)/i,
];

function normalize(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .normalize('NFKC');
}

function repeatedLineAbuse(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length < MAX_REPEATED_LINES) return false;
  const counts = new Map();
  for (const line of lines) {
    if (line.length < 12) continue;
    const key = line.slice(0, 180);
    const count = (counts.get(key) || 0) + 1;
    if (count >= MAX_REPEATED_LINES) return true;
    counts.set(key, count);
  }
  return false;
}

export function inspectAiPrompt(value) {
  const text = normalize(value);
  if (!text) return { ok: true, text };
  if (text.length > MAX_PROMPT_CHARS) {
    return { ok: false, code: 'prompt-too-large', status: 413, text: '' };
  }
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(text)) return { ok: false, code: 'prompt-security-policy', status: 422, text: '' };
  }
  if (repeatedLineAbuse(text)) {
    return { ok: false, code: 'repeated-input-abuse', status: 422, text: '' };
  }
  return { ok: true, text };
}

export function sanitizeAiBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid-ai-body', status: 400, body: {} };
  }
  const out = { ...body };
  if (typeof out.message === 'string') {
    const checked = inspectAiPrompt(out.message);
    if (!checked.ok) return { ...checked, body: {} };
    out.message = checked.text;
  }
  if (Array.isArray(out.history)) {
    if (out.history.length > MAX_HISTORY_ITEMS) {
      return { ok: false, code: 'history-too-large', status: 413, body: {} };
    }
    const sanitizedHistory = [];
    for (const item of out.history) {
      if (!item || typeof item !== 'object') {
        sanitizedHistory.push(item);
        continue;
      }
      if (typeof item.content !== 'string') {
        sanitizedHistory.push(item);
        continue;
      }
      const checked = inspectAiPrompt(item.content);
      if (!checked.ok) return { ...checked, body: {} };
      sanitizedHistory.push({ ...item, content: checked.text });
    }
    out.history = sanitizedHistory;
  }
  return { ok: true, body: out };
}
