import crypto from "node:crypto";

const COOKIE_NAME = "study_attempt_session_v1";
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;

function configuredSecret() {
  const value = String(process.env.STUDY_ATTEMPT_SESSION_SECRET || "").trim();
  if (!value) throw new Error("STUDY_ATTEMPT_SESSION_SECRET chưa được cấu hình trên Vercel.");
  return value;
}

function sign(payload) {
  return crypto.createHmac("sha256", configuredSecret()).update(payload).digest("base64url");
}

function readCookie(req) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== COOKIE_NAME) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ""; }
  }
  return "";
}

function makeToken(deviceId, exp) {
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `attempt:${exp}:${deviceId}:${nonce}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function parseToken(token) {
  try {
    const [raw, sig] = String(token || "").split(".");
    if (!raw || !sig) return null;
    const payload = Buffer.from(raw, "base64url").toString("utf8");
    const [kind, expRaw, deviceId, nonce] = payload.split(":");
    const exp = Number(expRaw);
    if (kind !== "attempt" || !deviceId || !nonce || nonce.length < 12 || !Number.isFinite(exp) || exp < Date.now()) return null;
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return { deviceId, expiresAt: exp };
  } catch {
    return null;
  }
}

function setCookie(res, token, exp) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor((exp - Date.now()) / 1000)}; HttpOnly; Secure; SameSite=Strict`);
}

export function getAttemptSession(req) {
  return parseToken(readCookie(req));
}

export function getOrCreateAttemptSession(req, res) {
  const existing = getAttemptSession(req);
  if (existing) return existing;

  const deviceId = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_MS;
  setCookie(res, makeToken(deviceId, expiresAt), expiresAt);
  return { deviceId, expiresAt };
}
