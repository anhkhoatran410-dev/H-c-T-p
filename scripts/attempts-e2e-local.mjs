import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

const EXAM_ID = "33333333-3333-4333-8333-333333333333";
const exams = [{
  id: EXAM_ID, title: "Đề thử", subject: "toan", duration: 30, status: "active",
  open_at: null, close_at: null, question_count: 5,
  questions: [
    { type: "mcq", a: 1 },
    { type: "mcq", a: 2 },
    { type: "true_false", answers: [true, false, true, false] },
    { type: "short", answer: "Hà Nội" },
    { type: "mcq", a: 0 },
  ],
}];
const attempts = [];

function deviceIdFromToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function choice(value) {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : NaN;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

function answerIsCorrect(q, answer) {
  if (q.type === "true_false") return Array.isArray(answer) && q.answers.length === 4 && q.answers.every((v, i) => answer[i] === v);
  if (q.type === "short") return String((Array.isArray(answer) ? answer.join("") : answer ?? "")).trim().toLowerCase() === String(q.answer ?? "").trim().toLowerCase() && String(q.answer ?? "").trim() !== "";
  return Number.isFinite(choice(answer)) && Number.isFinite(choice(q.a)) && choice(answer) === choice(q.a);
}

const fakeSupabase = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    assert.ok(req.headers.apikey, "publishable key must be sent");
    assert.equal(req.headers.apikey, process.env.SUPABASE_PUBLISHABLE_KEY);

    if (url.pathname === "/rest/v1/exams" && req.method === "GET") {
      const id = url.searchParams.get("id")?.slice(3);
      const status = url.searchParams.get("status")?.slice(3);
      return send(200, exams.filter((e) => (!id || e.id === id) && (!status || e.status === status)));
    }

    if (url.pathname === "/rest/v1/rpc/attempt_submit_session" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      const deviceId = deviceIdFromToken(b.p_token);
      const exam = exams.find((e) => e.id === b.p_exam_id && e.status === "active");
      if (!exam) return send(200, []);
      let correct = 0;
      const wrong = [];
      for (let i = 0; i < exam.questions.length; i += 1) {
        if (answerIsCorrect(exam.questions[i], b.p_answers?.[i] ?? b.p_answers?.[String(i)])) correct += 1;
        else wrong.push(i);
      }
      const duration = Math.min(Math.max(Number(b.p_duration_seconds) || 0, 0), exam.duration * 60);
      const row = {
        id: crypto.randomUUID(), device_id: deviceId, exam_id: exam.id, exam_title: exam.title,
        student_name: String(b.p_student_name || "").trim(), student_code: b.p_student_code || null,
        score: Math.round((correct / exam.questions.length) * 100), correct, total: exam.questions.length,
        duration_seconds: duration, auto_submitted: b.p_auto_submitted === true,
        answers: b.p_answers || {}, wrong_indexes: wrong, reviewed_indexes: [], created_at: new Date().toISOString(),
      };
      attempts.push(row);
      return send(200, [row]);
    }

    if (url.pathname === "/rest/v1/rpc/attempt_list_session" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      const deviceId = deviceIdFromToken(b.p_token);
      return send(200, attempts.filter((a) => a.device_id === deviceId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300));
    }

    if (url.pathname === "/rest/v1/rpc/attempt_review_session" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      const deviceId = deviceIdFromToken(b.p_token);
      const attempt = attempts.find((a) => a.id === b.p_attempt_id && a.device_id === deviceId);
      if (!attempt) return send(200, [{ status_code: 404, reviewed_indexes: null }]);
      if (!attempt.wrong_indexes.includes(Number(b.p_question_index))) {
        return send(200, [{ status_code: 400, reviewed_indexes: null }]);
      }
      if (!attempt.reviewed_indexes.includes(Number(b.p_question_index))) attempt.reviewed_indexes.push(Number(b.p_question_index));
      return send(200, [{ status_code: 200, reviewed_indexes: attempt.reviewed_indexes }]);
    }

    return send(404, { message: "unhandled " + req.method + " " + url.pathname });
  });
});

await new Promise((r) => fakeSupabase.listen(0, "127.0.0.1", r));
const supaPort = fakeSupabase.address().port;
process.env.SUPABASE_URL = `http://127.0.0.1:${supaPort}`;
process.env.SUPABASE_PUBLISHABLE_KEY = "local-publishable-key";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.STUDY_ATTEMPT_SESSION_SECRET;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { default: handler } = await import("../api/attempts.js");

const app = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    req.query = Object.fromEntries(url.searchParams.entries());
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(obj)); return res; };
    Promise.resolve(handler(req, res)).catch((e) => { res.statusCode = 500; res.end(String(e?.stack || e)); });
  });
});
await new Promise((r) => app.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.address().port}`;

async function call(method, path, { body, cookie } = {}) {
  const headers = { origin: base, host: `127.0.0.1:${app.address().port}`, "x-forwarded-proto": "http" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  const setCookie = r.headers.getSetCookie?.() || [];
  return { status: r.status, json, setCookie, cookie: setCookie[0]?.split(";", 1)[0] || null, raw: setCookie[0] || "" };
}

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " :: " + (e.message || e).toString().split("\n")[0]]); }
};

const allWrong = { 0: 99, 1: 99, 2: "x", 3: "sai", 4: 99 };
let cookieA, attemptA, cookieB;

await check("submit: 200, cookie opaque được cấp với HttpOnly+Secure+SameSite=Strict", async () => {
  const r = await call("POST", "/api/attempts?route=submit", {
    body: { examId: EXAM_ID, studentName: "An", studentCode: "HS01", answers: allWrong, autoSubmitted: false, durationSeconds: 60 },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.cookie?.startsWith("study_attempt_session_v1="));
  assert.match(r.raw, /HttpOnly/); assert.match(r.raw, /Secure/); assert.match(r.raw, /SameSite=Strict/);
  cookieA = r.cookie; attemptA = r.json.attempt;
});

await check("submit: server + DB tự chấm, bỏ qua score/correct/total do client gửi", async () => {
  const r = await call("POST", "/api/attempts?route=submit", {
    body: { examId: EXAM_ID, studentName: "An", answers: allWrong, score: 100, correct: 4, total: 4, wrong_indexes: [], device_id: "attacker-chosen" },
    cookie: cookieA,
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.attempt.score, 0);
  assert.equal(r.json.attempt.correct, 0);
  assert.equal(r.json.attempt.total, 5);
  assert.deepEqual(r.json.attempt.wrong_indexes, [0, 1, 2, 3, 4]);
});

await check("submit: đáp án đúng được chấm đúng (mcq, true_false, short)", async () => {
  const r = await call("POST", "/api/attempts?route=submit", {
    body: { examId: EXAM_ID, studentName: "An", answers: { 0: 1, 1: "2", 2: [true, false, true, false], 3: " hà nội ", 4: 0 } },
    cookie: cookieA,
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.attempt.correct, 5);
  assert.equal(r.json.attempt.score, 100);
});

await check("submit: blank null/\"\"/false/[] KHÔNG ăn điểm đáp án index 0", async () => {
  for (const blank of [null, "", false, []]) {
    const r = await call("POST", "/api/attempts?route=submit", {
      body: { examId: EXAM_ID, studentName: "An", answers: { 0: 99, 1: 99, 2: "x", 3: "sai", 4: blank } }, cookie: cookieA,
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.attempt.correct, 0);
  }
});

await check("submit: examId sai → 400; exam không tồn tại → 404", async () => {
  assert.equal((await call("POST", "/api/attempts?route=submit", { body: { examId: "not-a-uuid", studentName: "An", answers: {} } })).status, 400);
  assert.equal((await call("POST", "/api/attempts?route=submit", { body: { examId: "44444444-4444-4444-8444-444444444444", studentName: "An", answers: {} } })).status, 404);
});

await check("list: không cookie → 401", async () => {
  assert.equal((await call("GET", "/api/attempts")).status, 401);
});

await check("list: có cookie → chỉ thấy attempt của chính session", async () => {
  const r = await call("GET", "/api/attempts", { cookie: cookieA });
  assert.equal(r.status, 200);
  assert.ok(r.json.attempts.length >= 3);
  assert.ok(r.json.attempts.some((a) => a.id === attemptA.id));
});

await check("list: ?device_id=... không được dùng để chọn dữ liệu", async () => {
  const other = await call("POST", "/api/attempts?route=submit", { body: { examId: EXAM_ID, studentName: "Binh", answers: allWrong } });
  cookieB = other.cookie;
  const r = await call("GET", `/api/attempts?device_id=attacker-query-value`, { cookie: cookieB });
  assert.equal(r.status, 200);
  assert.ok(!r.json.attempts.some((a) => a.id === attemptA.id));
});

await check("review: chủ sở hữu, câu sai → 200", async () => {
  const r = await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: 2 }, cookie: cookieA });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.reviewed_indexes, [2]);
  const r2 = await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: "0" }, cookie: cookieA });
  assert.equal(r2.status, 200);
  assert.deepEqual([...r2.json.reviewed_indexes].sort(), [0, 2]);
});

await check("review: session khác (B) → 404", async () => {
  const r = await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: 1 }, cookie: cookieB });
  assert.equal(r.status, 404);
});

await check("review: không cookie → 401; câu không sai → 400; dữ liệu xấu → 400", async () => {
  assert.equal((await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: 1 } })).status, 401);
  const notWrong = await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: 99 }, cookie: cookieA });
  assert.equal(notWrong.status, 400);
  assert.equal((await call("POST", "/api/attempts?route=review", { body: { attemptId: "zzz", questionIndex: -1 }, cookie: cookieA })).status, 400);
});

await check("cookie well-formed nhưng ngẫu nhiên → phiên mới, không thấy dữ liệu session A", async () => {
  const randomCookie = `study_attempt_session_v1=${crypto.randomBytes(32).toString("base64url")}`;
  const r = await call("GET", "/api/attempts", { cookie: randomCookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.attempts, []);
});

await check("cookie sai định dạng → 401", async () => {
  assert.equal((await call("GET", "/api/attempts", { cookie: "study_attempt_session_v1=garbage" })).status, 401);
});

await check("gọi thẳng ?route= sai method → 405", async () => {
  assert.equal((await call("GET", "/api/attempts?route=submit")).status, 405);
  assert.equal((await call("GET", "/api/attempts?route=review")).status, 405);
  assert.equal((await call("POST", "/api/attempts", { body: {} })).status, 405);
});

await check("Origin lạ → 403", async () => {
  const r = await fetch(base + "/api/attempts?route=submit", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", host: `127.0.0.1:${app.address().port}`, "x-forwarded-proto": "http" },
    body: JSON.stringify({ examId: EXAM_ID, studentName: "An", answers: {} }),
  });
  assert.equal(r.status, 403);
});

await check("response không lộ đáp án đúng của đề", async () => {
  const r = await call("POST", "/api/attempts?route=submit", { body: { examId: EXAM_ID, studentName: "An", answers: allWrong }, cookie: cookieA });
  assert.equal(r.status, 200);
  const dump = JSON.stringify(r.json);
  assert.ok(!dump.includes("Hà Nội") && !/"questions"/.test(dump));
});

fakeSupabase.close(); app.close();
let failed = 0;
for (const [s, n] of results) { console.log(`${s}  ${n}`); if (s === "FAIL") failed++; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
