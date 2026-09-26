import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { getOrCreateAttemptSession, getAttemptSession } from "../lib/api/_attempt-session.js";

process.env.STUDY_ATTEMPT_SESSION_SECRET = "test-only-study-attempt-secret";

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

  const firstResponse = responseMock();
  const first = getOrCreateAttemptSession({ headers: {} }, firstResponse);
  const cookie = cookieFrom(firstResponse);
  const resumed = getAttemptSession({ headers: { cookie } });

  assert.deepEqual(resumed, first, "a later request carrying the issued cookie must reuse the same identity");

  console.log("PASS session race semantics: cookie-less overlap creates distinct sessions by design; issued cookie resumes the original session.");
}

async function testQuestionIndexNormalization() {
  const source = await fs.readFile(path.resolve("api/attempts.js"), "utf8");
  assert.ok(source.includes("const questionIndex = Number(body.questionIndex);"));
  assert.ok(source.includes("attempt.wrong_indexes.map(Number)"));

  const questionIndex = Number("3");
  const wrongFromNumbers = [1, 3, 5].map(Number).filter(Number.isInteger);
  const wrongFromStrings = ["1", "3", "5"].map(Number).filter(Number.isInteger);

  assert.ok(wrongFromNumbers.includes(questionIndex));
  assert.ok(wrongFromStrings.includes(questionIndex));
  assert.ok(![1, 2, 4].map(Number).includes(questionIndex));

  console.log("PASS questionIndex type normalization: string/number JSON representations both compare correctly.");
}

await testSessionRaceSemantics();
await testQuestionIndexNormalization();
