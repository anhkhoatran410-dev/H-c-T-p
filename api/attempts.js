import { applySecurityHeaders, enforceMethod, distributedRateLimit, sameOrigin, safeRequestId } from "../lib/api/_security.js";
import { getAttemptSession } from "../lib/api/_attempt-session.js";
import { supabaseReady, supabaseRequest } from "../lib/api/_supabase-service.js";

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("Cache-Control", "no-store");

  if (!enforceMethod(req, res, ["GET"])) return;
  if (!sameOrigin(req, res)) return;
  if (!await distributedRateLimit(req, res, { max: 40, windowMs: 60_000, keyPrefix: "attempts" })) return;

  if (!supabaseReady()) return res.status(500).json({ error: "Supabase server credentials chưa được cấu hình.", requestId });

  const session = getAttemptSession(req);
  if (!session) return res.status(401).json({ error: "Attempt session required.", code: "ATTEMPT_SESSION_REQUIRED", requestId });

  const rows = await supabaseRequest(
    `user_attempts?device_id=eq.${encodeURIComponent(session.deviceId)}&select=id,exam_id,exam_title,student_name,student_code,score,correct,total,duration_seconds,auto_submitted,answers,wrong_indexes,reviewed_indexes,created_at&order=created_at.desc&limit=300`,
    { method: "GET" }
  );
  if (!rows.ok || !Array.isArray(rows.data)) return res.status(502).json({ error: "Không tải được lịch sử làm bài.", requestId });

  return res.status(200).json({ attempts: rows.data, requestId });
}
