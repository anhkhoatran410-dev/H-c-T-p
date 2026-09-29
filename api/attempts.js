import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, distributedRateLimit, sameOrigin, safeRequestId } from "../lib/api/_security.js";
import { getAttemptSession, getOrCreateAttemptSession } from "../lib/api/_attempt-session.js";
import { supabasePublicReady, supabasePublicRequest } from "../lib/api/_supabase-public.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestBody(req) {
  if (req?.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch {}
  }
  return {};
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, max);
}

function toChoiceIndex(value) {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : NaN;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

export function answerIsCorrect(q, answer) {
  const type = String(q?.type || "mcq");
  if (type === "true_false") {
    const expected = Array.isArray(q.answers) ? q.answers : [];
    return expected.length === 4 && expected.every((v, i) => Array.isArray(answer) && answer[i] === v);
  }
  if (type === "short") {
    const expected = String(q?.answer ?? "").trim().toLowerCase();
    if (!expected) return false;
    const actual = Array.isArray(answer) ? answer.join("") : String(answer ?? "");
    return actual.trim().toLowerCase() === expected;
  }
  const actual = toChoiceIndex(answer);
  const expected = toChoiceIndex(q?.a);
  return Number.isFinite(actual) && Number.isFinite(expected) && actual === expected;
}

async function activeExam(examId) {
  return supabasePublicRequest(
    `exams?id=eq.${encodeURIComponent(examId)}&status=eq.active&select=id,title,subject,duration,questions,open_at,close_at,question_count&limit=1`,
    { method: "GET" }
  );
}

function responseAttempt(attempt) {
  return {
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
  };
}

async function submitAttempt(req, res, requestId) {
  if (!enforceMethod(req, res, ["POST"])) return;
  if (!enforceBodySize(req, res, 900 * 1024)) return;
  if (!enforceJsonContentType(req, res)) return;
  if (!sameOrigin(req, res)) return;
  if (!await distributedRateLimit(req, res, { max: 20, windowMs: 60_000, keyPrefix: "submit-attempt" })) return;
  if (!supabasePublicReady()) return res.status(500).json({ error: "Supabase public credentials chưa được cấu hình.", requestId });

  const session = getOrCreateAttemptSession(req, res);
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

  const exam = await activeExam(examId);
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

  // Chấm lại ở đây để giữ response nhất quán; DB RPC cũng tự chấm lại trước khi INSERT.
  let correct = 0;
  const wrongIndexes = [];
  for (let i = 0; i < questions.length; i += 1) {
    if (answerIsCorrect(questions[i], answers[String(i)])) correct += 1;
    else wrongIndexes.push(i);
  }

  const inserted = await supabasePublicRequest("rpc/attempt_submit_session", {
    method: "POST",
    body: JSON.stringify({
      p_token: session.token,
      p_exam_id: examRow.id,
      p_student_name: studentName,
      p_student_code: studentCode || null,
      p_duration_seconds: durationSeconds,
      p_auto_submitted: autoSubmitted,
      p_answers: answers,
    }),
  });

  if (!inserted.ok) return res.status(502).json({ error: "Không lưu được lượt làm bài.", requestId });

  const attempt = Array.isArray(inserted.data) ? inserted.data[0] : null;
  if (!attempt?.id) return res.status(502).json({ error: "Không nhận được mã lượt làm bài.", requestId });

  if (Number(attempt.correct) !== correct || Number(attempt.total) !== questions.length) {
    return res.status(502).json({ error: "Kết quả chấm máy không nhất quán.", requestId });
  }

  return res.status(200).json({
    ok: true,
    requestId,
    attempt: responseAttempt(attempt),
  });
}

async function listAttempts(req, res, requestId) {

  if (!enforceMethod(req, res, ["GET"])) return;
  if (!sameOrigin(req, res)) return;
  if (!await distributedRateLimit(req, res, { max: 40, windowMs: 60_000, keyPrefix: "attempts" })) return;
  if (!supabasePublicReady()) return res.status(500).json({ error: "Supabase public credentials chưa được cấu hình.", requestId });

  const studentCode = cleanText(req.query?.studentCode, 32);
  let rows;
  if (studentCode) {
    rows = await supabasePublicRequest("rpc/attempt_list_student", {
      method: "POST",
      body: JSON.stringify({ p_student_code: studentCode }),
    });
  } else {
    const session = getAttemptSession(req);
    if (!session) return res.status(401).json({ error: "Attempt session required.", code: "ATTEMPT_SESSION_REQUIRED", requestId });
    rows = await supabasePublicRequest("rpc/attempt_list_session", {
      method: "POST",
      body: JSON.stringify({ p_token: session.token }),
    });
  }
  if (!rows.ok || !Array.isArray(rows.data)) return res.status(502).json({ error: "Không tải được lịch sử làm bài.", requestId });

  return res.status(200).json({ attempts: rows.data.map(responseAttempt), requestId });
}

export async function reviewAttemptCore({ attemptId, questionIndex, token }, deps = {}) {
  const request = deps.supabaseRequest || supabasePublicRequest;
  const result = await request("rpc/attempt_review_session", {
    method: "POST",
    body: JSON.stringify({
      p_token: token,
      p_attempt_id: attemptId,
      p_question_index: questionIndex,
    }),
  });

  if (!result.ok || !Array.isArray(result.data)) {
    return { status: 502, body: { error: "Không lưu được trạng thái ôn tập." } };
  }

  const row = result.data[0];
  if (!row) return { status: 404, body: { error: "Không tìm thấy lượt làm bài." } };
  const code = Number(row.status_code);
  if (code === 400) return { status: 400, body: { error: "Câu này không thuộc danh sách câu sai." } };
  if (code !== 200 || !Array.isArray(row.reviewed_indexes)) {
    return { status: 404, body: { error: "Không tìm thấy lượt làm bài." } };
  }

  return { status: 200, body: { ok: true, reviewed_indexes: row.reviewed_indexes } };
}

async function reviewAttempt(req, res, requestId) {
  if (!enforceMethod(req, res, ["POST"])) return;
  if (!enforceBodySize(req, res, 20_000)) return;
  if (!enforceJsonContentType(req, res)) return;
  if (!sameOrigin(req, res)) return;
  if (!await distributedRateLimit(req, res, { max: 60, windowMs: 60_000, keyPrefix: "attempt-review" })) return;
  if (!supabasePublicReady()) return res.status(500).json({ error: "Supabase public credentials chưa được cấu hình.", requestId });

  const body = requestBody(req);
  const studentCode = cleanText(body.studentCode, 32);
  const session = studentCode ? null : getAttemptSession(req);
  if (!studentCode && !session) return res.status(401).json({ error: "Attempt session required.", code: "ATTEMPT_SESSION_REQUIRED", requestId });
  const attemptId = String(body.attemptId || "").trim();
  const questionIndex = Number(body.questionIndex);
  if (!UUID_RE.test(attemptId) || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 500) {
    return res.status(400).json({ error: "Dữ liệu ôn tập không hợp lệ.", requestId });
  }

  const result = studentCode
    ? await reviewStudentCore({ attemptId, questionIndex, studentCode })
    : await reviewAttemptCore({ attemptId, questionIndex, token: session.token });
  return res.status(result.status).json({ ...result.body, requestId });
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("Cache-Control", "no-store");

  // route is dispatch-only, not a security boundary.
  // Each handler performs its own method/auth/ownership checks.
  const route = String(req.query?.route || "list");
  if (route === "submit") return submitAttempt(req, res, requestId);
  if (route === "review") return reviewAttempt(req, res, requestId);
  return listAttempts(req, res, requestId);
}
