import generateExam from './generate-exam.js';
import generateFlashcards from './generate-flashcards.js';
import { enforceBodySize, enforceJsonContentType, sameOrigin, distributedRateLimit, applySecurityHeaders, safeRequestId, enforceMethod } from './_security.js';
import { enforceCostChallenge } from './_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from './_agent-threat-defense.js';

const CONFIG = {
  exam: { handler: generateExam, keyPrefix: 'generate-exam', maxBody: 900_000, maxRequests: 5 },
  flashcards: { handler: generateFlashcards, keyPrefix: 'generate-flashcards', maxBody: 900_000, maxRequests: 5 },
};

function safePublicResponse(res, requestId) {
  const originalJson = typeof res.json === 'function' ? res.json.bind(res) : null;
  const originalEnd = typeof res.end === 'function' ? res.end.bind(res) : null;
  if (originalJson) {
    res.json = payload => {
      if (res.statusCode >= 500 && payload && typeof payload === 'object') {
        return originalJson({ error: 'AI generation tạm thời không khả dụng.', requestId });
      }
      return originalJson(payload);
    };
  }
  if (originalEnd) {
    res.end = (...args) => {
      if (res.statusCode >= 500 && typeof args[0] === 'string') {
        try {
          const parsed = JSON.parse(args[0]);
          if (parsed && typeof parsed === 'object' && parsed.error) {
            return originalEnd(JSON.stringify({ error: 'AI generation tạm thời không khả dụng.', requestId }));
          }
        } catch {}
      }
      return originalEnd(...args);
    };
  }
  return () => {
    if (originalJson) res.json = originalJson;
    if (originalEnd) res.end = originalEnd;
  };
}

export default async function handler(req, res) {
  const requestId = safeRequestId();
  applySecurityHeaders(res);
  res.setHeader('X-Request-ID', requestId);

  if (!enforceMethod(req, res, ['POST'])) return;
  if (!enforceJsonContentType(req, res)) return;

  const target = String(req.query?.target || '').trim().toLowerCase();
  const config = CONFIG[target];
  if (!config) return res.status(404).json({ error: 'Generation route not found', requestId });

  if (!enforceBodySize(req, res, config.maxBody)) return;
  if (!sameOrigin(req, res)) return;
  if (!(await enforceAgentThreatDefense(req, res))) {
    await recordAgentSignal(req, 'generation-threat-block');
    return;
  }
  if (!(await enforceCostChallenge(req, res))) {
    await recordAgentSignal(req, 'generation-cost-challenge');
    return;
  }
  if (!(await distributedRateLimit(req, res, { windowMs: 60_000, max: config.maxRequests, keyPrefix: config.keyPrefix }))) {
    await recordAgentSignal(req, 'generation-rate-limit');
    return;
  }

  const cleanup = safePublicResponse(res, requestId);
  try {
    // Cap collection fan-out before the handler builds expensive multimodal
    // Gemini requests. These caps do not change the normal single-document path.
    if (req.body && typeof req.body === 'object') {
      if (Array.isArray(req.body.media) && req.body.media.length > 4) req.body.media = req.body.media.slice(0, 4);
      if (Array.isArray(req.body.attachments) && req.body.attachments.length > 4) req.body.attachments = req.body.attachments.slice(0, 4);
      if (Array.isArray(req.body.sourceUrls) && req.body.sourceUrls.length > 4) req.body.sourceUrls = req.body.sourceUrls.slice(0, 4);
      if (Array.isArray(req.body.sourceFiles) && req.body.sourceFiles.length > 4) req.body.sourceFiles = req.body.sourceFiles.slice(0, 4);
      if (Array.isArray(req.body.fileNames) && req.body.fileNames.length > 4) req.body.fileNames = req.body.fileNames.slice(0, 4);
    }
    return await config.handler(req, res);
  } catch {
    return res.status(503).json({ error: 'AI generation tạm thời không khả dụng.', requestId });
  } finally {
    cleanup();
  }
}
