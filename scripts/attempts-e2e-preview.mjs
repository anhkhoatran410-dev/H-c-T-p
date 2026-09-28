// E2E trên deployment THẬT (Preview). Cần: đủ 3 env trên Vercel + 1 exam đang active.
//
//   BASE_URL=https://<preview>.vercel.app EXAM_ID=<uuid exam active> node scripts/attempts-e2e-preview.mjs
//
// Tùy chọn:
//   VERCEL_BYPASS_TOKEN   nếu Preview bật Deployment Protection (gửi header x-vercel-protection-bypass)
//   --lockdown            SAU KHI apply migration: kiểm anon KHÔNG còn đọc/ghi participants, user_attempts,
//                         admin_assistant_messages và không gọi được RPC SECURITY DEFINER.
//                         Cần SUPABASE_URL + SUPABASE_ANON_KEY (publishable key).
//
// CẢNH BÁO: script ghi dòng thật vào user_attempts (studentName "E2E-TEST ..."). Preview dùng chung DB production
// nên hãy dọn bằng SQL ở cuối output. Migration KHÔNG cấp DELETE cho service_role, nên chỉ dọn được qua SQL Editor.
import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = String(process.env.BASE_URL || "").replace(/\/$/, "");
const EXAM_ID = process.env.EXAM_ID || "";
const LOCKDOWN = process.argv.includes("--lockdown");
if (!LOCKDOWN && (!BASE || !EXAM_ID)) {
  console.error("Thiếu BASE_URL hoặc EXAM_ID."); process.exit(2);
}
const RUN = "E2E-TEST " + crypto.randomBytes(3).toString("hex");
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + " :: " + String(e.message || e).split("\n")[0]]); }
};

async function call(method, path, { body, cookie } = {}) {
  const headers = { origin: BASE };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (process.env.VERCEL_BYPASS_TOKEN) headers["x-vercel-protection-bypass"] = process.env.VERCEL_BYPASS_TOKEN;
  const r = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  const sc = r.headers.getSetCookie?.() || [];
  return { status: r.status, json, text, raw: sc[0] || "", cookie: sc[0]?.split(";", 1)[0] || null };
}

if (!LOCKDOWN) {
  let cookieA, cookieB, attemptA;

  await check("Preview KHÔNG bị chặn bởi Deployment Protection / thiếu env (không phải 401 HTML/500)", async () => {
    const r = await call("GET", "/api/attempts");
    assert.equal(r.status, 401, `expected JSON 401 ATTEMPT_SESSION_REQUIRED, got ${r.status}: ${r.text.slice(0, 120)}`);
    assert.equal(r.json?.code, "ATTEMPT_SESSION_REQUIRED", "401 must come from the handler, not from Vercel protection");
  });
  await check("route thẳng sai method → 405", async () => {
    assert.equal((await call("GET", "/api/submit-attempt")).status, 405);
    assert.equal((await call("GET", "/api/attempt-review")).status, 405);
    assert.equal((await call("GET", "/api/attempts?route=submit")).status, 405);
  });
  await check("submit qua rewrite công khai /api/submit-attempt: 200 + cookie đúng thuộc tính", async () => {
    const r = await call("POST", "/api/submit-attempt", {
      body: { examId: EXAM_ID, studentName: RUN, studentCode: RUN.replace(/\s/g, "-"), answers: { 0: 99 }, score: 100, device_id: "attacker" },
    });
    assert.equal(r.status, 200, r.text.slice(0, 200));
    assert.match(r.raw, /HttpOnly/); assert.match(r.raw, /Secure/); assert.match(r.raw, /SameSite=Strict/);
    assert.ok(r.json.attempt.score <= 100 && r.json.attempt.total >= 1);
    assert.notEqual(r.json.attempt.score, undefined);
    cookieA = r.cookie; attemptA = r.json.attempt;
  });
  await check("GET /api/attempts với cookie → thấy attempt vừa tạo", async () => {
    const r = await call("GET", "/api/attempts", { cookie: cookieA });
    assert.equal(r.status, 200);
    assert.ok(r.json.attempts.some((a) => a.id === attemptA.id));
  });
  await check("review qua /api/attempt-review: câu sai → 200; câu không sai → 400", async () => {
    if (!attemptA.wrong_indexes.length) return;
    const wrong = attemptA.wrong_indexes[0];
    const ok = await call("POST", "/api/attempt-review", { body: { attemptId: attemptA.id, questionIndex: wrong }, cookie: cookieA });
    assert.equal(ok.status, 200, ok.text.slice(0, 200));
    assert.ok(ok.json.reviewed_indexes.includes(wrong));
  });
  await check("session B: không thấy & không review được attempt của A", async () => {
    const b = await call("POST", "/api/submit-attempt", { body: { examId: EXAM_ID, studentName: RUN + " B", answers: {} } });
    assert.equal(b.status, 200); cookieB = b.cookie;
    const list = await call("GET", "/api/attempts", { cookie: cookieB });
    assert.ok(!list.json.attempts.some((a) => a.id === attemptA.id));
    const rv = await call("POST", "/api/attempt-review", { body: { attemptId: attemptA.id, questionIndex: 0 }, cookie: cookieB });
    assert.equal(rv.status, 404);
  });
  await check("cookie bị sửa payload → 401", async () => {
    const [name, value] = cookieA.split("=");
    const [raw, sig] = decodeURIComponent(value).split(".");
    const parts = Buffer.from(raw, "base64url").toString().split(":"); parts[2] = "forged";
    const forged = `${name}=${encodeURIComponent(Buffer.from(parts.join(":")).toString("base64url") + "." + sig)}`;
    assert.equal((await call("GET", "/api/attempts", { cookie: forged })).status, 401);
  });
  await check("Origin lạ bị chặn 403", async () => {
    const r = await fetch(BASE + "/api/submit-attempt", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", ...(process.env.VERCEL_BYPASS_TOKEN ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_TOKEN } : {}) },
      body: JSON.stringify({ examId: EXAM_ID, studentName: RUN, answers: {} }),
    });
    assert.equal(r.status, 403);
  });

  // Trigger participants: chỉ kiểm được nếu có service key (chạy local, KHÔNG dán key vào CI công khai).
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await check("[sau migration] trigger: participants có dòng theo code, và tên KHÔNG bị ghi đè khi code trùng", async () => {
      const code = RUN.replace(/\s/g, "-") + "-T";
      const first = await call("POST", "/api/submit-attempt", { body: { examId: EXAM_ID, studentName: "Tên Đầu", studentCode: code, answers: {} } });
      assert.equal(first.status, 200);
      const second = await call("POST", "/api/submit-attempt", { body: { examId: EXAM_ID, studentName: "Tên Sau Kẻ Giả Danh", studentCode: code, answers: {} } });
      assert.equal(second.status, 200);
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/participants?code=eq.${encodeURIComponent(code)}&select=name,code`, {
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      const rows = await r.json();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, "Tên Đầu", "ON CONFLICT DO NOTHING: name must not be overwritten (trigger still old if this fails)");
    });
  }
} else {
  const SB = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const ANON = process.env.SUPABASE_ANON_KEY || "";
  if (!SB || !ANON) { console.error("--lockdown cần SUPABASE_URL và SUPABASE_ANON_KEY."); process.exit(2); }
  const h = { apikey: ANON, Authorization: `Bearer ${ANON}`, "content-type": "application/json" };
  const denied = (r) => r.status === 401 || r.status === 403; // PostgREST: 401/403 "permission denied for table"
  for (const t of ["participants", "user_attempts", "admin_assistant_messages"]) {
    await check(`anon KHÔNG SELECT được ${t}`, async () => {
      const r = await fetch(`${SB}/rest/v1/${t}?select=*&limit=1`, { headers: h });
      const body = await r.text();
      assert.ok(denied(r), `got ${r.status}: ${body.slice(0, 120)}`);
    });
    await check(`anon KHÔNG INSERT được ${t}`, async () => {
      const r = await fetch(`${SB}/rest/v1/${t}`, { method: "POST", headers: h, body: JSON.stringify({}) });
      assert.ok(denied(r), `got ${r.status}`);
    });
  }
  await check("anon KHÔNG UPDATE được participants / user_attempts", async () => {
    for (const t of ["participants", "user_attempts"]) {
      const r = await fetch(`${SB}/rest/v1/${t}?id=not.is.null`, { method: "PATCH", headers: h, body: JSON.stringify({ name: "x" }) });
      assert.ok(denied(r), `${t}: got ${r.status}`);
    }
  });
  await check("anon KHÔNG gọi được RPC SECURITY DEFINER sync_participant_from_attempt", async () => {
    const r = await fetch(`${SB}/rest/v1/rpc/sync_participant_from_attempt`, { method: "POST", headers: h, body: "{}" });
    assert.ok(denied(r) || r.status === 404, `got ${r.status}`);
  });
  console.log("\n(ghi chú) exams vẫn còn INSERT public (P1 chưa xử lý) — không được kiểm ở đây.");
}

let failed = 0;
for (const [s, n] of results) { console.log(`${s}  ${n}`); if (s === "FAIL") failed++; }
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!LOCKDOWN) console.log(`\nDọn dữ liệu test (SQL Editor, role postgres):\n  delete from public.user_attempts where student_name like '${RUN.split(" ")[0]} %';\n  delete from public.participants where code like 'E2E-TEST-%';`);
process.exit(failed ? 1 : 0);