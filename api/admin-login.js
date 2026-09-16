import crypto from "node:crypto";
import { applySecurityHeaders, enforceBodySize, sameOrigin } from "./_security.js";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();
const SESSION_MS = 2 * 60 * 60 * 1000;

function configuredSecret(name){
  return String(process.env[name] || "").trim();
}

function secret(){
  const sessionSecret = configuredSecret("ADMIN_SESSION_SECRET");
  if (!sessionSecret) throw new Error("ADMIN_SESSION_SECRET chưa được cấu hình trên Vercel.");
  return sessionSecret;
}

function digest(value){
  return crypto.createHash("sha256").update(String(value)).digest();
}

function sign(payload){
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function makeToken(){
  const exp = Date.now() + SESSION_MS;
  const nonce = crypto.randomBytes(18).toString("base64url");
  const payload = `admin:${exp}:${nonce}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function validToken(token){
  try{
    const [raw, sig] = String(token || "").split(".");
    if(!raw || !sig) return false;
    const payload = Buffer.from(raw,"base64url").toString("utf8");
    const [kind, expRaw, nonce] = payload.split(":");
    if(kind !== "admin" || !nonce || Number(expRaw) < Date.now()) return false;
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a,b);
  }catch{return false;}
}

export function isAdminRequest(req){
  return validToken(String(req.headers?.authorization || "").replace(/^Bearer\s+/i,""));
}

function readBody(req){
  if(req?.body && typeof req.body === "object") return req.body;
  if(typeof req?.body === "string"){
    try{return JSON.parse(req.body || "{}")}catch{return {}}
  }
  return {};
}

export default async function handler(req,res){
  applySecurityHeaders(res);
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  if(!enforceBodySize(req,res,16_000)) return;
  if(!sameOrigin(req,res)) return;

  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const entry = attempts.get(ip) || {start:now,count:0};
  if(now-entry.start > WINDOW_MS){entry.start=now;entry.count=0;}
  entry.count += 1;
  attempts.set(ip,entry);
  if(entry.count > MAX_ATTEMPTS){
    res.setHeader("Retry-After", "60");
    return res.status(429).json({error:"Thử đăng nhập quá nhiều lần. Hãy đợi một phút."});
  }

  const body = readBody(req);
  const password = String(body.password || "");
  const configured = configuredSecret("ADMIN_PASSWORD");
  if(!configured) return res.status(500).json({error:"ADMIN_PASSWORD chưa được cấu hình trên Vercel."});

  const ok = crypto.timingSafeEqual(digest(password), digest(configured));
  if(!ok) return res.status(401).json({error:"Mật khẩu Admin không đúng."});

  attempts.delete(ip);
  try{
    const token = makeToken();
    return res.status(200).json({ok:true,token,expiresIn:SESSION_MS/1000});
  }catch(e){
    return res.status(500).json({error:e.message || "Không tạo được phiên Admin."});
  }
}
