import crypto from "node:crypto";

const FALLBACK_PASSWORD = "0307";
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();

function secret(){
  return String(process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || FALLBACK_PASSWORD);
}

function digest(value){
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function sign(payload){
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function makeToken(){
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `admin:${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function validToken(token){
  try{
    const [raw, sig] = String(token || "").split(".");
    if(!raw || !sig) return false;
    const payload = Buffer.from(raw,"base64url").toString("utf8");
    const [kind, expRaw] = payload.split(":");
    if(kind !== "admin" || Number(expRaw) < Date.now()) return false;
    const expected = sign(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a,b);
  }catch{return false}
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
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method !== "POST") return res.status(405).json({error:"Method not allowed"});

  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const entry = attempts.get(ip) || {start:now,count:0};
  if(now-entry.start > WINDOW_MS){entry.start=now;entry.count=0;}
  entry.count += 1;
  attempts.set(ip,entry);
  if(entry.count > MAX_ATTEMPTS) return res.status(429).json({error:"Thử đăng nhập quá nhiều lần. Hãy đợi một phút."});

  const body = readBody(req);
  const password = String(body.password || "");
  const configured = String(process.env.ADMIN_PASSWORD || FALLBACK_PASSWORD);
  const ok = digest(password) === digest(configured);
  if(!ok) return res.status(401).json({error:"Mật khẩu Admin không đúng."});

  attempts.delete(ip);
  return res.status(200).json({ok:true,token:makeToken(),expiresIn:8*60*60});
}
