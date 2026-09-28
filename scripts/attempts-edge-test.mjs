import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { getOrCreateAttemptSession, getAttemptSession } from "../lib/api/_attempt-session.js";


function responseMock() {
  const headers = new Map();
  return {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
  };
}

function cookieFrom(response) {
  const setCookie = response.getHeader("set-cookie");
  assert.ok(setCookie, "expected Set-Cookie");
  return String(setCookie).split(";", 1)[0];
}

async function testSessionRaceSemantics() {
  const [a, b] = await Promise.all([
    Promise.resolve().then(() => getOrCreateAttemptSession({ headers: {} }, responseMock())),
    Promise.resolve().then(() => getOrCreateAttemptSession({ headers: {} }, responseMock())),
  ]);

  assert.notEqual(a.deviceId, b.deviceId, "two cookie-less concurrent requests intentionally create two session identities");
  assert.match(a.token, /^[A-Za-z0-9_-]{43,64}$/);
  assert.match(b.token, /^[A-Za-z0-9_-]{43,64}$/);

  const firstResponse = responseMock();
  const first = getOrCreateAttemptSession({ headers: {} }, firstResponse);
  const cookie = cookieFrom(firstResponse);
  const resumed = getAttemptSession({ headers: { cookie } });

  assert.deepEqual(resumed, first, "a later request carrying the issued cookie must reuse the same opaque identity");

  console.log("PASS session race semantics: cookie-less overlap creates distinct sessions by design; issued cookie resumes the original session.");
}

async function testQuestionIndexNormalization() {
  const { reviewAttemptCore } = await import("../api/attempts.js");

  const deviceId = "11111111-1111-4111-8111-111111111111";
  const attemptId = "22222222-2222-4222-8222-222222222222";
  const calls = [];

  // Giả lập PostgREST trả wrong_indexes dưới dạng mảng string, đúng dạng dữ liệu thật
  // có thể gặp tùy kiểu cột — đây chính là ca đã gây nghi ngờ "3" !== 3 trước đây.
  const fakeSupabaseRequest = async (path, init) => {
    calls.push({ path, method: init?.method });
    if (init?.method === "GET") {
      return {
        ok: true,
        data: [{
          id: attemptId,
          device_id: deviceId,
          wrong_indexes: ["1", "3", "5"],
          reviewed_indexes: [],
        }],
      };
    }
    if (init?.method === "PATCH") {
      const body = JSON.parse(init.body);
      return { ok: true, data: [{ id: attemptId, reviewed_indexes: body.reviewed_indexes }] };
    }
    throw new Error("unexpected call: " + init?.method);
  };

  // Client gửi questionIndex dưới dạng số 3 (JSON number thật, như body đã qua JSON.parse ở tầng HTTP thật)
  const result = await reviewAttemptCore(
    { attemptId, questionIndex: 3, deviceId },
    { supabaseRequest: fakeSupabaseRequest }
  );

  assert.equal(result.status, 200, "expected review to succeed against string-typed wrong_indexes from PostgREST");
  assert.deepEqual(result.body.reviewed_indexes, [3]);
  assert.equal(calls.length, 2, "expected exactly one lookup and one patch call");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].method, "PATCH");

  // Ownership: deviceId khác phải bị từ chối (404), dù wrong_indexes/questionIndex giống hệt.
  const otherDeviceResult = await reviewAttemptCore(
    { attemptId, questionIndex: 3, deviceId: "99999999-9999-4999-8999-999999999999" },
    { supabaseRequest: fakeSupabaseRequest }
  );
  assert.equal(otherDeviceResult.status, 404, "a mismatched deviceId must not be able to review someone else's attempt");

  // questionIndex không thuộc wrong_indexes phải bị từ chối (400), không âm thầm chấp nhận.
  const notWrongResult = await reviewAttemptCore(
    { attemptId, questionIndex: 2, deviceId },
    { supabaseRequest: fakeSupabaseRequest }
  );
  assert.equal(notWrongResult.status, 400);

  console.log("PASS questionIndex type normalization: reviewAttemptCore correctly matches string-typed wrong_indexes, enforces ownership, and rejects non-wrong questionIndex.");
}

async function testScoringRejectsFalsyCoercion() {
  const { answerIsCorrect } = await import("../api/attempts.js");
  const q0 = { type: "mcq", a: 0 };
  // Number(null) === Number("") === Number(false) === Number([]) === 0: không được chấm đúng.
  for (const blank of [undefined, null, "", false, [], {}, "abc", -1, 0.5, NaN, "0.5", " "]) {
    assert.equal(answerIsCorrect(q0, blank), false, `blank/invalid answer ${JSON.stringify(blank)} must not be graded correct`);
  }
  assert.equal(answerIsCorrect(q0, 0), true);
  assert.equal(answerIsCorrect(q0, "0"), true);
  assert.equal(answerIsCorrect({ type: "mcq", a: 2 }, "2"), true);
  assert.equal(answerIsCorrect({ type: "mcq", a: 2 }, 1), false);
  // Đề lỗi (thiếu đáp án) không được chấm đúng cho bất kỳ câu trả lời nào.
  assert.equal(answerIsCorrect({ type: "mcq", a: null }, 0), false);
  assert.equal(answerIsCorrect({ type: "mcq" }, 0), false);
  assert.equal(answerIsCorrect({ type: "short", answer: "" }, null), false);
  assert.equal(answerIsCorrect({ type: "short", answer: "Hà Nội" }, " hà nội "), true);
  assert.equal(answerIsCorrect({ type: "true_false", answers: [true, false, true, false] }, [true, false, true, false]), true);
  assert.equal(answerIsCorrect({ type: "true_false", answers: [true, false, true, false] }, null), false);
  console.log("PASS scoring: null/''/false/[] are never graded correct for choice index 0; malformed exams never award points.");
}

await testSessionRaceSemantics();
await testQuestionIndexNormalization();
await testScoringRejectsFalsyCoercion();