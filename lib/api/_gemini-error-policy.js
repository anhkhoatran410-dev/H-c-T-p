export function classifyGeminiFailure(status, error = {}) {
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || error?.providerMessage || '').toLowerCase();
  switch (Number(status || 0)) {
    case 401:
    case 403:
      return { action: 'trip-immediately', category: 'credential', circuit: 'open', countFailure: true };
    case 408:
    case 409:
    case 425:
    case 429:
      return { action: 'accumulate', category: 'transient', circuit: 'threshold', countFailure: true };
    default:
      if (Number(status || 0) >= 500) {
        return { action: 'accumulate', category: 'upstream', circuit: 'threshold', countFailure: true };
      }
      if (name === 'aborterror' || name === 'timeouterror' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN' || message.includes('timeout') || message.includes('temporarily unavailable') || message.includes('resource exhausted')) {
        return { action: 'accumulate', category: 'network', circuit: 'threshold', countFailure: true };
      }
      return { action: 'pass-through', category: 'non-key', circuit: 'unchanged', countFailure: false };
  }
}
