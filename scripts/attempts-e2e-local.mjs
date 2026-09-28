// Local E2E: chạy handler THẬT api/attempts.js qua HTTP thật, với Supabase REST giả (in-memory).
// Xác minh: cookie session, chấm điểm server-side, list theo session, review + ownership, route bypass.
// KHÔNG xác minh: RLS/GRANT thật, trigger participants, cấu hình env trên Vercel (cần E2E trên Preview).
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

// ---- Supabase REST giả: chỉ hiện thực đúng các truy vấn mà api/attempts.js dùng ----
function parseFilters(qs) {
  const f = {};
  for (const [k, v] of qs.entries()) if (v.startsWith("eq.")) f[k] = v.slice(3);
  return f;
}
const fakeSupabase = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const table = url.pathname.replace("/rest/v1/", "");
  const filters = parseFilters(url.searchParams);
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    assert.ok(req.headers.authorization?.startsWith("Bearer "), "service key must be sent");
    if (table === "exams" && req.method === "GET") {
      return send(200, exams.filter((e) => (!filters.id || e.id === filters.id) && (!filters.status || e.status === filters.status)));
    }
    if (table === "user_attempts" && req.method === "POST") {
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...JSON.parse(raw) };
      attempts.push(row);
      return send(201, [row]);
    }
    if (table === "user_attempts" && req.method === "GET") {
      let rows = attempts.filter((a) => (!filters.id || a.id === filters.id) && (!filters.device_id || a.device_id === filters.device_id));
      rows = rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return send(200, rows);
    }
    if (table === "user_attempts" && req.method === "PATCH") {
      const rows = attempts.filter((a) => a.id === filters.id && a.device_id === filters.device_id);
      const patch = JSON.parse(raw);
      rows.forEach((r) => Object.assign(r, patch));
      return send(200, rows);
    }
    return send(404, { message: "unhandled " + req.method + " " + table });
  });
});
await new Promise((r) => fakeSupabase.listen(0, "127.0.0.1", r));
const supaPort = fakeSupabase.address().port;

process.env.SUPABASE_URL = `http://127.0.0.1:${supaPort}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-service-key";
process.env.STUDY_ATTEMPT_SESSION_SECRET = "local-e2e-secret";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { default: handler } = await import("../api/attempts.js");

// ---- Adapter kiểu Vercel: req.query, req.body, res.status().json() ----
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

await check("submit: 200, cookie phiên được cấp với HttpOnly+Secure+SameSite=Strict", async () => {
  const r = await call("POST", "/api/attempts?route=submit", {
    body: { examId: EXAM_ID, studentName: "An", studentCode: "HS01", answers: allWrong, autoSubmitted: false, durationSeconds: 60 },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.cookie?.startsWith("study_attempt_session_v1="));
  assert.match(r.raw, /HttpOnly/); assert.match(r.raw, /Secure/); assert.match(r.raw, /SameSite=Strict/);
  cookieA = r.cookie; attemptA = r.json.attempt;
});

await check("submit: server tự chấm, bỏ qua score/correct/total do client gửi", async () => {
  const r = await call("POST", "/api/attempts?route=submit", {
    body: { examId: EXAM_ID, studentName: "An", answers: allWrong, score: 100, correct: 4, total: 4, wrong_indexes: [], device_id: "attacker-chosen" },
    cookie: cookieA,
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.attempt.score, 0);
  assert.equal(r.json.attempt.correct, 0);
  assert.equal(r.json.attempt.total, 5);
  assert.deepEqual(r.json.attempt.wrong_indexes, [0, 1, 2, 3, 4]);
  const stored = attempts.find((a) => a.id === r.json.attempt.id);
  assert.notEqual(stored.device_id, "attacker-chosen", "client-supplied device_id must be ignored");
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

await check("submit: câu bỏ trống gửi null/\"\"/false KHÔNG được ăn điểm câu có đáp án index 0", async () => {
  for (const blank of [null, "", false, []]) {
    const r = await call("POST", "/api/attempts?route=submit", {
      body: { examId: EXAM_ID, studentName: "An", answers: { 0: 99, 1: 99, 2: "x", 3: "sai", 4: blank } }, cookie: cookieA,
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.attempt.correct, 0, "blank " + JSON.stringify(blank) + " must not earn a point");
  }
});

await check("submit: examId sai định dạng → 400; exam không tồn tại → 404", async () => {
  const bad = await call("POST", "/api/attempts?route=submit", { body: { examId: "not-a-uuid", studentName: "An", answers: {} } });
  assert.equal(bad.status, 400);
  const missing = await call("POST", "/api/attempts?route=submit", { body: { examId: "44444444-4444-4444-8444-444444444444", studentName: "An", answers: {} } });
  assert.equal(missing.status, 404);
});

await check("submit: thiếu tên → 400", async () => {
  const r = await call("POST", "/api/attempts?route=submit", { body: { examId: EXAM_ID, studentName: "  ", answers: {} } });
  assert.equal(r.status, 400);
});

await check("list: không cookie → 401", async () => {
  const r = await call("GET", "/api/attempts");
  assert.equal(r.status, 401);
});

await check("list: có cookie → chỉ thấy attempt của chính session", async () => {
  const r = await call("GET", "/api/attempts", { cookie: cookieA });
  assert.equal(r.status, 200);
  assert.ok(r.json.attempts.length >= 3);
  assert.ok(r.json.attempts.some((a) => a.id === attemptA.id));
});

await check("list: ?device_id=... trên query KHÔNG được dùng để chọn dữ liệu", async () => {
  const other = await call("POST", "/api/attempts?route=submit", { body: { examId: EXAM_ID, studentName: "Binh", answers: allWrong } });
  cookieB = other.cookie;
  const victimDevice = attempts.find((a) => a.id === attemptA.id).device_id;
  const r = await call("GET", `/api/attempts?device_id=${victimDevice}`, { cookie: cookieB });
  assert.equal(r.status, 200);
  assert.ok(!r.json.attempts.some((a) => a.id === attemptA.id), "session B must not see session A's attempts");
});

await check("review: chủ sở hữu, câu sai → 200 và ghi nhận reviewed_indexes", async () => {
  const r = await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: 2 }, cookie: cookieA });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.reviewed_indexes, [2]);
  const r2 = await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: "0" }, cookie: cookieA });
  assert.equal(r2.status, 200);
  assert.deepEqual(r2.json.reviewed_indexes.sort(), [0, 2]);
});

await check("review: session khác (B) review attempt của A → 404", async () => {
  const r = await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: 1 }, cookie: cookieB });
  assert.equal(r.status, 404);
  const stored = attempts.find((a) => a.id === attemptA.id);
  assert.ok(!stored.reviewed_indexes.includes(1), "attempt A must be unchanged");
});

await check("review: không cookie → 401; câu không sai → 400; dữ liệu xấu → 400", async () => {
  assert.equal((await call("POST", "/api/attempts?route=review", { body: { attemptId: attemptA.id, questionIndex: 1 } })).status, 401);
  const correct = await call("POST", "/api/attempts?route=submit", {
    body: { examId: EXAM_ID, studentName: "An", answers: { 0: 1, 1: 2, 2: [true, false, true, false], 3: "Hà Nội", 4: 0 } }, cookie: cookieA,
  });
  const notWrong = await call("POST", "/api/attempts?route=review", { body: { attemptId: correct.json.attempt.id, questionIndex: 0 }, cookie: cookieA });
  assert.equal(notWrong.status, 400);
  assert.equal((await call("POST", "/api/attempts?route=review", { body: { attemptId: "zzz", questionIndex: -1 }, cookie: cookieA })).status, 400);
});

await check("cookie giả mạo / bị sửa payload → coi như không có session (401)", async () => {
  const [name, value] = cookieA.split("=");
  const [raw, sig] = decodeURIComponent(value).split(".");
  const payload = Buffer.from(raw, "base64url").toString().split(":");
  payload[2] = attempts.find((a) => a.id === attemptA.id).device_id === payload[2] ? "forged-device" : payload[2];
  const forged = `${name}=${encodeURIComponent(Buffer.from(payload.join(":")).toString("base64url") + "." + sig)}`;
  assert.equal((await call("GET", "/api/attempts", { cookie: forged })).status, 401);
  assert.equal((await call("GET", "/api/attempts", { cookie: `${name}=garbage` })).status, 401);
});

await check("gọi thẳng ?route= sai method → 405 (không bypass method của handler)", async () => {
  assert.equal((await call("GET", "/api/attempts?route=submit")).status, 405);
  assert.equal((await call("GET", "/api/attempts?route=review")).status, 405);
  assert.equal((await call("POST", "/api/attempts", { body: {} })).status, 405);
});

await check("Origin lạ → bị chặn (same-origin)", async () => {
  const r = await fetch(base + "/api/attempts?route=submit", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", host: `127.0.0.1:${app.address().port}`, "x-forwarded-proto": "http" },
    body: JSON.stringify({ examId: EXAM_ID, studentName: "An", answers: {} }),
  });
  assert.equal(r.status, 403, "got " + r.status);
  const legit = await call("POST", "/api/attempts?route=submit", { body: { examId: EXAM_ID, studentName: "An", answers: {} } });
  assert.equal(legit.status, 200, "same payload with correct Origin must succeed (test must not pass vacuously)");
});

await check("response không lộ đáp án đúng của đề (q.a / q.answer / q.answers)", async () => {
  const r = await call("POST", "/api/attempts?route=submit", { body: { examId: EXAM_ID, studentName: "An", answers: allWrong }, cookie: cookieA });
  assert.equal(r.status, 200, "must reach the success path (not pass vacuously)");
  const dump = JSON.stringify(r.json);
  assert.ok(!dump.includes("Hà Nội") && !/"questions"/.test(dump));
});

await check("thiếu STUDY_ATTEMPT_SESSION_SECRET → 500 rõ ràng, không cấp cookie yếu", async () => {
  const saved = process.env.STUDY_ATTEMPT_SESSION_SECRET;
  delete process.env.STUDY_ATTEMPT_SESSION_SECRET;
  const r = await call("POST", "/api/attempts?route=submit", { body: { examId: EXAM_ID, studentName: "An", answers: {} } });
  process.env.STUDY_ATTEMPT_SESSION_SECRET = saved;
  assert.equal(r.status, 500);
  assert.equal(r.setCookie.length, 0);
});

fakeSupabase.close(); app.close();
let failed = 0;
for (const [s, n] of results) { console.log(`${s}  ${n}`); if (s === "FAIL") failed++; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);