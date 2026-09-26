import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, distributedRateLimit, sameOrigin, safeRequestId } from "../lib/api/_security.js";
import { getOrCreateAttemptSession } from "../lib/api/_attempt-session.js";
import { supabaseReady, supabaseRequest } from "../lib/api/_supabase-service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, max);
}

function answerIsCorrect(q, answer) {
  const type = String(q?.type || "mcq");
  if (type === "true_false") {
    const expected = Array.isArray(q.answers) ? q.answers : [];
    return expected.length === 4 && expected.every((v, i) => Array.isArray(answer) && answer[i] === v);
  }
  if (type === "short") {
    const actual = Array.isArray(answer) ? answer.join("") : String(answer ?? "");
    return actual.trim().toLowerCase() === String(q?.answer ?? "").trim().toLowerCase();
  }
  const actual = Number(answer);
  const expected = Number(q?.a);
  return Number.isFinite(actual) && Number.isFinite(expected) && actual === expected;
}

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
  if (!enforceBodySize(req, res, 900 * 1024)) return;
  if (!enforceJsonContentType(req, res)) return;
  if (!sameOrigin(req, res)) return;
  if (!await distributedRateLimit(req, res, { max: 20, windowMs: 60_000, keyPrefix: "submit-attempt" })) return;

  if (!supabaseReady()) {
    return res.status(500).json({ error: "Supabase server credentials chưa được cấu hình.", requestId });
  }

  let session;
  try {
    session = getOrCreateAttemptSession(req, res);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Không tạo được attempt session.", requestId });
  }

  const body = requestBody(req);
  const examId = cleanText(body.examId, 64);
  const studentName = cleanText(body.studentName, 200);
  const studentCode = cleanText(body.studentCode, 100);
  const answers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : {};
  const autoSubmitted = body.autoSubmitted === true;
  const suppliedDuration = Number(body.durationSeconds);
  const durationSeconds = Number.isFinite(suppliedDuration) && suppliedDuration >= 0 ? Math.floor(suppliedDuration) : 0;

  if (!UUID_RE.test(examId)) return res.status(400).json({ error: "examId không hợp lệ.", requestId });
  if (!studentName) return res.status(400).json({ error: "Thiếu họ và tên.", requestId });
  if (Object.keys(answers).length > 1000) return res.status(413).json({ error: "Dữ liệu đáp án quá lớn.", requestId });

  const exam = await supabaseRequest(
    `exams?id=eq.${encodeURIComponent(examId)}&status=eq.active&select=id,title,subject,duration,questions,open_at,close_at,question_count&limit=1`,
    { method: "GET" }
  );
  const examRow = Array.isArray(exam.data) ? exam.data[0] : null;
  if (!exam.ok || !examRow) return res.status(404).json({ error: "Không tìm thấy bài kiểm tra đang hoạt động.", requestId });

  const now = Date.now();
  if (examRow.open_at) {
    const openAt = new Date(examRow.open_at).getTime();
    if (Number.isFinite(openAt) && now < openAt) return res.status(409).json({ error: "Bài kiểm tra chưa mở.", requestId });
  }
  if (examRow.close_at) {
    const closeAt = new Date(examRow.close_at).getTime();
    if (Number.isFinite(closeAt) && now > closeAt) return res.status(409).json({ error: "Bài kiểm tra đã đóng.", requestId });
  }

  const questions = Array.isArray(examRow.questions) ? examRow.questions : [];
  if (!questions.length || questions.length > 500) {
    return res.status(409).json({ error: "Bài kiểm tra không có cấu trúc câu hỏi hợp lệ.", requestId });
  }

  let correct = 0;
  const wrongIndexes = [];
  for (let i = 0; i < questions.length; i += 1) {
    const answer = answers[String(i)];
    if (answerIsCorrect(questions[i], answer)) correct += 1;
    else wrongIndexes.push(i);
  }

  const total = questions.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const maxDuration = Number(examRow.duration || 0) > 0 ? Number(examRow.duration) * 60 : Number.MAX_SAFE_INTEGER;
  const boundedDuration = Math.min(durationSeconds, maxDuration);

  const inserted = await supabaseRequest("user_attempts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      device_id: session.deviceId,
      exam_id: examRow.id,
      exam_title: examRow.title,
      student_name: studentName,
      student_code: studentCode || null,
      score,
      correct,
      total,
      duration_seconds: boundedDuration,
      auto_submitted: autoSubmitted,
      answers,
      wrong_indexes: wrongIndexes,
      reviewed_indexes: [],
    }),
  });

  if (!inserted.ok) {
    return res.status(502).json({ error: "Không lưu được lượt làm bài.", requestId });
  }

  const attempt = Array.isArray(inserted.data) ? inserted.data[0] : null;
  if (!attempt?.id) return res.status(502).json({ error: "Không nhận được mã lượt làm bài.", requestId });

  return res.status(200).json({
    ok: true,
    requestId,
    attempt: {
      id: attempt.id,
      exam_id: attempt.exam_id,
      exam_title: attempt.exam_title,
      student_name: attempt.student_name,
      student_code: attempt.student_code,
      score: attempt.score,
      correct: attempt.correct,
      total: attempt.total,
      duration_seconds: attempt.duration_seconds,
      auto_submitted: attempt.auto_submitted,
      answers: attempt.answers,
      wrong_indexes: attempt.wrong_indexes,
      reviewed_indexes: attempt.reviewed_indexes || [],
      created_at: attempt.created_at,
    },
  });
}
