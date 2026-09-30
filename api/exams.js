import { applySecurityHeaders, enforceMethod, sameOrigin, safeRequestId } from "../lib/api/_security.js";
import { supabasePublicReady, supabasePublicRequest } from "../lib/api/_supabase-public.js";

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("Cache-Control", "no-store");
  if (!enforceMethod(req, res, ["GET"])) return;
  if (!sameOrigin(req, res)) return;
  if (!supabasePublicReady()) {
    return res.status(500).json({ error: "Supabase public credentials chưa được cấu hình.", requestId });
  }

  const result = await supabasePublicRequest(
    "exams?status=eq.active&select=id,title,subject,difficulty,duration,question_count,questions,status,open_at,close_at,created_at&order=created_at.desc&limit=200",
    { method: "GET" }
  );

  if (!result.ok || !Array.isArray(result.data)) {
    return res.status(502).json({ error: "Không tải được bài kiểm tra.", requestId });
  }

  return res.status(200).json({
    ok: true,
    exams: result.data.map((e) => ({
      ...e,
      questions: Array.isArray(e.questions) ? e.questions : [],
    })),
    requestId,
  });
}
