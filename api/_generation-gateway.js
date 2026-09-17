import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, sameOrigin, distributedRateLimit, safeRequestId, enforceMethod } from './_security.js';
import { shieldGate } from './_intrusion-shield.js';
import { enforceCostChallenge } from './_adaptive-defense.js';
import { enforceAgentThreatDefense, recordAgentSignal } from './_agent-threat-defense.js';
import generateExam from './generate-exam.js';
import generateFlashcards from './generate-flashcards.js';

const CONFIG = {
  exam: { handler: generateExam, keyPrefix: 'ai-generate-exam', maxBody: 4_000_000, maxRequests: 6 },
  flashcards: { handler: generateFlashcards, keyPrefix: 'ai-flashcards', maxBody: 2_000_000, maxRequests: 8 },
};

const SOURCE_HOST = String(process.env.SOURCE_STORAGE_HOST || 'mlqaeginqsgqacdqdzbm.supabase.co').trim().toLowerCase();
const SOURCE_PATH_PREFIX = '/storage/v1/object/public/support-media/';
const PROVIDER_ERROR = /gemini|generativelanguage|googleapis|api.?key|quota|billing|rate.?limit|fetch failed|node_modules|stack|traceback|\/home\/|\/app\/|service.?role|private.?key|access.?token/i;

function bodyOf(req) {
  if (req?.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function validateSourceUrls(req, res, requestId) {
  const body = bodyOf(req);
  const urls = Array.isArray(body.sourceUrls) ? body.sourceUrls.slice(0, 8) : [];
  for (const raw of urls) {
    try {
      const u = new URL(String(raw));
      const allowed = u.protocol === 'https:' && u.hostname.toLowerCase() === SOURCE_HOST && u.pathname.startsWith(SOURCE_PATH_PREFIX);
      if (!allowed) {
        res.status(400).json({ error: 'Nguồn tài liệu không được phép.', requestId });
        return false;
      }
    } catch {
      res.status(400).json({ error: 'URL nguồn tài liệu không hợp lệ.', requestId });
      return false;
    }
  }
  return true;
}

function shouldSanitize(status, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return Number(status) >= 500 || (Number(status) === 429 && PROVIDER_ERROR.test(text));
}

function safePublicResponse(res, requestId) {
  const originalJson = typeof res.json === 'function' ? res.json.bind(res) : null;
  const originalEnd = typeof res.end === 'function' ? res.end.bind(res) : null;
  if (originalJson) {
    res.json = payload => {
      if (shouldSanitize(res.statusCode, payload) && payload && typeof payload === 'object') {
        return originalJson({ error: 'AI generation tạm thời không khả dụng.', requestId });
      }
      return originalJson(payload);
    };
  }
  if (originalEnd) {
    res.end = (...args) => {
      if (shouldSanitize(res.statusCode, args[0]) && typeof args[0] === 'string') {
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

  // Cheap rejection first: prevent oversized bodies from reaching any
  // external service or expensive security/provider checks.
  if (!enforceBodySize(req, res, config.maxBody)) return;
  if (!sameOrigin(req, res)) return;
  if (!validateSourceUrls(req, res, requestId)) return;
  if (!(await shieldGate(req, res))) return;
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
    if (req.body && typeof req.body === 'object') {
      if (Array.isArray(req.body.media) && req.body.media.length > 4) req.body.media = req.body.media.slice(0, 4);
      if (Array.isArray(req.body.attachments) && req.body.attachments.length > 4) req.body.attachments = req.body.attachments.slice(0, 4);
      if (Array.isArray(req.body.sourceUrls) && req.body.sourceUrls.length > 8) req.body.sourceUrls = req.body.sourceUrls.slice(0, 8);
      if (Array.isArray(req.body.sourceFiles) && req.body.sourceFiles.length > 8) req.body.sourceFiles = req.body.sourceFiles.slice(0, 8);
      if (Array.isArray(req.body.fileNames) && req.body.fileNames.length > 8) req.body.fileNames = req.body.fileNames.slice(0, 8);
    }
    return await config.handler(req, res);
  } catch {
    return res.status(503).json({ error: 'AI generation tạm thời không khả dụng.', requestId });
  } finally {
    cleanup();
  }
}
