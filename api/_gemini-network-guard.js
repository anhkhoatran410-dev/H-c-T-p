import { acquireAiKey, reportAiFailure, reportAiSuccess } from './_ai-resilience.js';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const MAX_ATTEMPTS = 8;
const TRANSIENT_CODES = new Set([408, 409, 425, 429]);

function shouldRotate(status) {
  return TRANSIENT_CODES.has(status) || status === 401 || status === 403 || status >= 500;
}

function headersWithoutKey(init) {
  const headers = new Headers(init?.headers || {});
  headers.delete('x-goog-api-key');
  return headers;
}

const nativeFetch = globalThis.fetch.bind(globalThis);

if (!globalThis.__STUDY_TH_GEMINI_GUARD__) {
  globalThis.__STUDY_TH_GEMINI_GUARD__ = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    let parsed;
    try { parsed = new URL(url); } catch (_) { parsed = null; }
    if (!parsed || parsed.hostname !== GEMINI_HOST) return nativeFetch(input, init);

    const attempted = new Set();
    let lastError = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const entry = acquireAiKey('GEMINI', [...attempted]);
      if (!entry) break;
      attempted.add(entry.id);
      const nextHeaders = headersWithoutKey(init);
      nextHeaders.set('x-goog-api-key', entry.key);
      const nextInit = { ...init, headers: nextHeaders };
      try {
        const response = await nativeFetch(input, nextInit);
        if (response.ok) {
          reportAiSuccess('GEMINI', entry.id);
          return response;
        }
        const status = Number(response.status || 0);
        if (shouldRotate(status)) {
          reportAiFailure('GEMINI', entry.id, { status });
          lastError = { status };
          continue;
        }
        return response;
      } catch (error) {
        const status = Number(error?.status || 0);
        reportAiFailure('GEMINI', entry.id, { status, code: error?.code });
        lastError = error;
        if (attempt + 1 >= MAX_ATTEMPTS) throw error;
      }
    }
    if (lastError?.status) {
      return new Response(JSON.stringify({ error: { status: lastError.status, message: 'All Gemini keys are temporarily unavailable.' } }), {
        status: lastError.status,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
    return nativeFetch(input, init);
  };
}
