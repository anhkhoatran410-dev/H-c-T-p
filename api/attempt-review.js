import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, distributedRateLimit, sameOrigin, safeRequestId } from "../lib/api/_security.js";
import { getAttemptSession } from "../lib/api/_attempt-session.js";
import { supabaseReady, supabaseRequest } from "../lib/api/_supabase-service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestBody(req) {
  if (req?.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch {}
  }
  return {};
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("Cache-Control", "no-store");

  if (!enforceMethod(req, res, ["POST"])) return;
  if (!enforceBodySize(req, res, 20_000)) return;
  if (!enforceJsonContentType(req, res)) return;
  if (!sameOrigin(req, res)) return;
  if (!await distributedRateLimit(req, res, { max: 60, windowMs: 60_000, keyPrefix: "attempt-review" })) return;

  if (!supabaseReady()) return res.status(500).json({ error: "Supabase server credentials chưa được cấu hình.", requestId });

  const session = getAttemptSession(req);
  if (!session) return res.status(401).json({ error: "Attempt session required.", code: "ATTEMPT_SESSION_REQUIRED", requestId });

  const body = requestBody(req);
  const attemptId = String(body.attemptId || "").trim();
  const questionIndex = Number(body.questionIndex);
  if (!UUID_RE.test(attemptId) || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 500) {
    return res.status(400).json({ error: "Dữ liệu ôn tập không hợp lệ.", requestId });
  }

  const lookup = await supabaseRequest(
    `user_attempts?id=eq.${encodeURIComponent(attemptId)}&select=id,device_id,wrong_indexes,reviewed_indexes&limit=1`,
    { method: "GET" }
  );
  const attempt = Array.isArray(lookup.data) ? lookup.data[0] : null;
  if (!lookup.ok || !attempt || String(attempt.device_id) !== String(session.deviceId)) {
    return res.status(404).json({ error: "Không tìm thấy lượt làm bài.", requestId });
  }

  const wrong = Array.isArray(attempt.wrong_indexes) ? attempt.wrong_indexes.map(Number).filter(Number.isInteger) : [];
  if (!wrong.includes(questionIndex)) {
    return res.status(400).json({ error: "Câu này không thuộc danh sách câu sai.", requestId });
  }

  const previous = Array.isArray(attempt.reviewed_indexes) ? attempt.reviewed_indexes.map(Number).filter(Number.isInteger) : [];
  const reviewedIndexes = [...new Set([...previous, questionIndex])];

  const updated = await supabaseRequest(
    `user_attempts?id=eq.${encodeURIComponent(attemptId)}&device_id=eq.${encodeURIComponent(session.deviceId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ reviewed_indexes: reviewedIndexes }),
    }
  );
  if (!updated.ok) return res.status(502).json({ error: "Không lưu được trạng thái ôn tập.", requestId });

  return res.status(200).json({ ok: true, reviewed_indexes: reviewedIndexes, requestId });
}
