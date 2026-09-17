import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, sameOrigin, rateLimit, safeRequestId } from './_security.js';
import solveHandler from '../lib/solve-legacy.js';

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader('X-Request-ID', requestId);

  if (!enforceMethod(req, res, ['POST'])) return;
  if (!enforceJsonContentType(req, res)) return;
  if (!enforceBodySize(req, res, 1_200_000)) return;
  if (!sameOrigin(req, res)) return;
  if (!rateLimit(req, res, { windowMs: 60_000, max: 30, keyPrefix: 'solve-direct-guard' })) return;

  try {
    return await solveHandler(req, res);
  } catch (_) {
    if (!res.headersSent) return res.status(500).json({ error: 'Solver error.', requestId });
  }
}
