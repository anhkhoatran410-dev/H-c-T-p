import crypto from "node:crypto";
import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, enforceMethod, sameOrigin, safeRequestId } from "./_security.js";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();
const SESSION_MS = 60 * 60 * 1000;
const MAX_TRACKED_IPS = 10_000;
const COOKIE_NAME = "study_admin_session_v3";
const LEGACY_COOKIE_NAME = "study_admin_session_v2";
const MFA_STEP_SECONDS = 30;
const ROLES = ["operator", "secops", "ciso"];

function configuredSecret(name){ return String(process.env[name] || "").trim(); }
function secret(){
  const sessionSecret = configuredSecret("ADMIN_SESSION_SECRET");
  if (!sessionSecret) throw new Error("ADMIN_SESSION_SECRET chưa được cấu hình trên Vercel.");
  return sessionSecret;
}
function roleEnv(role){ return `ADMIN_${String(role).toUpperCase()}_PASSWORD`; }
function defaultRole(){
  const role=String(process.env.ADMIN_DEFAULT_ROLE||"ciso").trim().toLowerCase();
  return ROLES.includes(role)?role:"ciso";
}
function credentials(){
  const out=[];
  for(const role of ROLES){
    const value=configuredSecret(roleEnv(role));
    if(value) out.push({role,password:value});
  }
  const legacy=configuredSecret("ADMIN_PASSWORD");
  if(legacy) out.push({role:defaultRole(),password:legacy});
  const seen=new Set();
  return out.filter(item=>{const k=`${item.role}\u0000${item.password}`;if(seen.has(k))return false;seen.add(k);return true;});
}
function mfaSecret(role=""){
  const roleSpecific=role&&configuredSecret(`ADMIN_${String(role).toUpperCase()}_MFA_TOTP_SECRET`);
  return roleSpecific||configuredSecret("ADMIN_MFA_TOTP_SECRET");
}
function digest(value){ return crypto.createHash("sha256").update(String(value)).digest(); }
function sign(payload){ return crypto.createHmac("sha256", secret()).update(payload).digest("base64url"); }
function base32Decode(value){
  const clean=String(value||"").toUpperCase().replace(/[^A-Z2-7]/g,"");
  let bits="";
  for(const ch of clean){const n="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch);if(n<0)continue;bits+=n.toString(2).padStart(5,"0");}
  const out=[];
  for(let i=0;i+8<=bits.length;i+=8)out.push(parseInt(bits.slice(i,i+8),2));
  return Buffer.from(out);
}
function hotp(secretValue,counter){
  const key=base32Decode(secretValue);if(!key.length)return "";
  const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(counter));
  const mac=crypto.createHmac("sha1",key).update(msg).digest();
  const offset=mac[mac.length-1]&0x0f;
  const n=((mac[offset]&0x7f)<<24)|(mac[offset+1]<<16)|(mac[offset+2]<<8)|mac[offset+3];
  return String(n%1_000_000).padStart(6,"0");
}
function validTotp(code,role=""){
  const configured=mfaSecret(role);if(!configured)return true;
  const value=String(code||"").replace(/\D/g,"");if(value.length!==6)return false;
  const counter=Math.floor(Date.now()/1000/MFA_STEP_SECONDS);
  for(const delta of [-1,0,1]){
    const expected=hotp(configured,counter+delta);
    const a=Buffer.from(value),b=Buffer.from(expected);
    if(a.length===b.length&&crypto.timingSafeEqual(a,b))return true;
  }
  return false;
}
function makeToken(role="ciso",mfaVerified=false){
  const exp = Date.now() + SESSION_MS;
  const nonce = crypto.randomBytes(18).toString("base64url");
  const safeRole=ROLES.includes(role)?role:"ciso";
  const payload = `admin:${exp}:${nonce}:${safeRole}:${mfaVerified?"mfa":"pwd"}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}
function validToken(token){
  try{
    const [raw, sig] = String(token || "").split(".");
    if(!raw || !sig) return null;
    const payload = Buffer.from(raw,"base64url").toString("utf8");
    const [kind, expRaw, nonce, role, authLevel] = payload.split(":");
    if(kind !== "admin" || !ROLES.includes(role) || !nonce || nonce.length < 12 || !Number.isFinite(Number(expRaw)) || Number(expRaw) < Date.now()) return null;
    if(mfaSecret(role) && authLevel !== "mfa") return null;
    const expected = sign(payload);
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if(!(a.length === b.length && crypto.timingSafeEqual(a,b))) return null;
    return {role,authLevel};
  }catch{return null;}
}
function readCookie(req,name){
  const header=String(req.headers?.cookie||"");
  for(const part of header.split(";")){
    const i=part.indexOf("=");
    if(i<0)continue;
    const key=part.slice(0,i).trim();
    if(key!==name)continue;
    return decodeURIComponent(part.slice(i+1).trim());
  }
  return "";
}
function sessionClaims(req){
  const cookieToken=readCookie(req,COOKIE_NAME)||readCookie(req,LEGACY_COOKIE_NAME);
  const cookieClaims=validToken(cookieToken);
  if(cookieClaims)return cookieClaims;
  return validToken(String(req.headers?.authorization || "").replace(/^Bearer\s+/i,""));
}
function setSessionCookie(res,token){
  res.setHeader("Set-Cookie",[
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_MS/1000)}; HttpOnly; Secure; SameSite=Strict`,
    `${LEGACY_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  ]);
}
function clearSessionCookie(res){
  res.setHeader("Set-Cookie",[
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    `${LEGACY_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  ]);
}
export function isAdminRequest(req){ return Boolean(sessionClaims(req)); }
export function getAdminRole(req){ return sessionClaims(req)?.role || ""; }
export function getAdminClaims(req){ return sessionClaims(req); }
function matchedCredential(password){
  const input=digest(password);
  for(const item of credentials()){
    const candidate=digest(item.password);
    if(crypto.timingSafeEqual(input,candidate)) return item;
  }
  return null;
}
function readBody(req){
  if(req?.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if(typeof req?.body === "string"){ try{return JSON.parse(req.body || "{}");}catch{return {};} }
  return {};
}

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader("X-Request-ID",requestId);
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(!enforceMethod(req,res,["POST"])) return;
  if(!enforceBodySize(req,res,16_000)) return;
  if(!sameOrigin(req,res)) return;

  if(String(req.query?.check || "") === "1"){
    const claims=sessionClaims(req);
    if(!claims) return res.status(401).json({ok:false,requestId});
    return res.status(200).json({ok:true,role:claims.role,expiresIn:SESSION_MS/1000,mfaRequired:Boolean(mfaSecret(claims.role)),requestId});
  }
  if(String(req.query?.logout || "") === "1"){
    clearSessionCookie(res);
    return res.status(200).json({ok:true,requestId});
  }
  if(!enforceJsonContentType(req,res)) return;

  const ip = String(req.headers?.["x-real-ip"] || req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  if(attempts.size >= MAX_TRACKED_IPS && !attempts.has(ip)){
    for(const [k,v] of attempts){ if(now-v.start > WINDOW_MS) attempts.delete(k); if(attempts.size < MAX_TRACKED_IPS) break; }
  }
  const entry = attempts.get(ip) || {start:now,count:0};
  if(now-entry.start > WINDOW_MS){entry.start=now;entry.count=0;}
  entry.count += 1;
  attempts.set(ip,entry);
  if(entry.count > MAX_ATTEMPTS){
    res.setHeader("Retry-After","60");
    return res.status(429).json({error:"Thử đăng nhập quá nhiều lần. Hãy đợi một phút.",requestId});
  }

  const body = readBody(req);
  const password = String(body.password || "");
  const matched = matchedCredential(password);
  if(!matched) return res.status(401).json({error:"Mật khẩu Admin không đúng.",requestId});

  const role=matched.role;
  const mfaEnabled=Boolean(mfaSecret(role));
  if(mfaEnabled && !validTotp(body.otp || body.mfaCode,role)){
    return res.status(401).json({error:"MFA_REQUIRED",mfaRequired:true,requestId});
  }

  attempts.delete(ip);
  try{
    const token = makeToken(role,mfaEnabled);
    setSessionCookie(res, token);
    return res.status(200).json({ok:true,role,expiresIn:SESSION_MS/1000,mfaRequired:mfaEnabled,requestId});
  }catch(e){
    return res.status(500).json({error:e.message || "Không tạo được phiên Admin.",requestId});
  }
}
