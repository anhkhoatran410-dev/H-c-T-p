import crypto from "node:crypto";

const COOKIE_NAME = "study_attempt_session_v1";
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43,64}$/;

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

function deviceIdFromToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseToken(token) {
  const value = String(token || "");
  if (!TOKEN_RE.test(value)) return null;
  return { token: value, deviceId: deviceIdFromToken(value) };
}

function makeToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function setCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}; HttpOnly; Secure; SameSite=Strict`
  );
}

export function getAttemptSession(req) {
  return parseToken(readCookie(req));
}

export function getOrCreateAttemptSession(req, res) {
  const existing = getAttemptSession(req);
  if (existing) return existing;

  const token = makeToken();
  setCookie(res, token);
  return parseToken(token);
}
