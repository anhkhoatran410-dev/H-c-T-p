import crypto from "node:crypto";
import {
  applySecurityHeaders,
  enforceBodySize,
  enforceJsonContentType,
  enforceMethod,
  sameOrigin,
  safeRequestId,
  distributedRateLimit
} from "../lib/api/_security.js";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const COOKIE_NAME = "study_student_session_v1";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 12;

function sessionSecret() {
  return String(process.env.STUDENT_SESSION_SECRET || SERVICE_KEY || "").trim();
}
function sign(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}
function makeToken(user) {
  const exp = Date.now() + SESSION_MS;
  const payload = JSON.stringify({ uid: user.id, exp });
  const raw = Buffer.from(payload).toString("base64url");
  return raw + "." + sign(raw);
}
function readCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}
function verifyToken(token) {
  try {
    const [raw, sig] = String(token || "").split(".");
    if (!raw || !sig || !sessionSecret()) return null;
    const expected = sign(raw);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!payload?.uid || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) < Date.now()) return null;
    return { uid: String(payload.uid) };
  } catch {
    return null;
  }
}
function setCookie(res, token) {
  res.setHeader("Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`
  );
}
function clearCookie(res) {
  res.setHeader("Set-Cookie",
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
  );
}
function readBody(req) {
  if (req?.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch { return {}; }
  }
  return {};
}
async function sb(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(8000)
  });
  const text = await r.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch {}
  if (!r.ok) throw new Error("Supabase request failed.");
  return data;
}
async function authAdmin(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(9000)
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!r.ok) throw new Error(data?.msg || data?.message || "Supabase Auth request failed.");
  return data;
}
function normalized(v) {
  return String(v || "").trim().normalize("NFC").toLocaleLowerCase("vi-VN");
}
function publicUser(profile, authUser) {
  return {
    id: profile.id,
    email: profile.email || authUser?.email || "",
    full_name: profile.full_name || authUser?.user_metadata?.full_name || "",
    student_code: profile.student_code || authUser?.user_metadata?.student_code || "",
    role: profile.role || "student",
    status: profile.status || "active",
    email_confirmed: !!authUser?.email_confirmed_at
  };
}
async function findUser(name, code) {
  const profiles = await sb("profiles?select=id,email,full_name,student_code,role,status&limit=1000");
  const wantedName = normalized(name);
  const wantedCode = String(code || "").trim();
  const exactProfiles = (Array.isArray(profiles) ? profiles : []).filter(p =>
    p.status !== "suspended" &&
    normalized(p.full_name) === wantedName &&
    String(p.student_code || "").trim() === wantedCode
  );

  if (!exactProfiles.length) {
    const usersData = await authAdmin("users?page=1&per_page=1000");
    const users = Array.isArray(usersData?.users) ? usersData.users : [];
    const match = users.find(u =>
      normalized(u.user_metadata?.full_name || "") === wantedName &&
      String(u.user_metadata?.student_code || "").trim() === wantedCode
    );
    if (!match) return null;
    if (!match.email_confirmed_at) return { unconfirmed: true };
    const fallbackProfile = (Array.isArray(profiles) ? profiles : []).find(p => String(p.id) === String(match.id)) || {
      id: match.id,
      full_name: match.user_metadata?.full_name || name,
      student_code: match.user_metadata?.student_code || wantedCode,
      email: match.email || "",
      role: match.app_metadata?.role || "student",
      status: "active"
    };
    return { profile: fallbackProfile, authUser: match };
  }

  if (exactProfiles.length > 1) return { ambiguous: true };

  const profile = exactProfiles[0];
  const authUser = await authAdmin(`users/${encodeURIComponent(profile.id)}`);
  if (!authUser?.email_confirmed_at) return { unconfirmed: true };
  return { profile, authUser };
}
async function loadSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  const verified = verifyToken(token);
  if (!verified) return null;
  const authUser = await authAdmin(`users/${encodeURIComponent(verified.uid)}`);
  if (!authUser || authUser.deleted_at || !authUser.email_confirmed_at) return null;
  const profiles = await sb(`profiles?id=eq.${encodeURIComponent(verified.uid)}&select=id,email,full_name,student_code,role,status&limit=1`);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || profile.status === "suspended") return null;
  return publicUser(profile, authUser);
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const requestId = safeRequestId();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!SUPABASE_URL || !SERVICE_KEY || !sessionSecret()) {
    return res.status(500).json({ ok: false, error: "Tài khoản học sinh chưa được cấu hình trên máy chủ.", requestId });
  }
  if (!enforceMethod(req, res, ["GET", "POST"])) return;
  if (!sameOrigin(req, res)) return;

  if (req.method === "GET") {
    try {
      const user = await loadSession(req);
      if (!user) return res.status(401).json({ ok: false, requestId });
      return res.status(200).json({ ok: true, user, requestId });
    } catch {
      return res.status(401).json({ ok: false, requestId });
    }
  }

  if (!enforceBodySize(req, res, 16_000)) return;
  if (!enforceJsonContentType(req, res)) return;
  if (String(req.body?.action || "") === "logout") {
    clearCookie(res);
    return res.status(200).json({ ok: true, requestId });
  }

  const limited = await distributedRateLimit(req, res, {
    windowMs: 60_000,
    max: MAX_ATTEMPTS,
    keyPrefix: "student-login"
  });
  if (!limited) return;

  const body = readBody(req);
  const name = String(body.name || "").trim().slice(0, 120);
  const code = String(body.code || "").trim().slice(0, 50);
  if (!name || !code) {
    return res.status(400).json({ ok: false, error: "Vui lòng nhập họ và mã học sinh.", requestId });
  }

  try {
    const found = await findUser(name, code);
    if (!found) return res.status(401).json({ ok: false, error: "Họ tên hoặc mã học sinh không đúng.", requestId });
    if (found.unconfirmed) return res.status(403).json({ ok: false, error: "Tài khoản chưa xác minh email. Hãy mở email xác nhận trước khi đăng nhập.", requestId });
    if (found.ambiguous) return res.status(409).json({ ok: false, error: "Có nhiều tài khoản trùng họ tên và mã học sinh. Hãy nhờ Admin kiểm tra lại.", requestId });

    const user = publicUser(found.profile, found.authUser);
    setCookie(res, makeToken(user));
    return res.status(200).json({ ok: true, user, expiresIn: Math.floor(SESSION_MS / 1000), requestId });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e?.message || "Không thể đăng nhập lúc này.", requestId });
  }
}
