import { applySecurityHeaders, enforceMethod, enforceBodySize, enforceJsonContentType, sameOrigin, safeRequestId } from "../lib/api/_security.js";
import { isAdminRequest } from "./admin-login.js";

const URL = String(process.env.SUPABASE_URL || "https://mlqaeginqsgqacdqdzbm.supabase.co").trim();
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

async function sb(path, init={}){
  if(!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình.");
  const r=await fetch(`${URL}/rest/v1/${path}`,{
    ...init,
    headers:{
      apikey:KEY,
      Authorization:`Bearer ${KEY}`,
      "Content-Type":"application/json",
      ...(init.headers||{})
    }
  });
  const text=await r.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}};
  if(!r.ok) throw new Error(data?.message||data?.error||`Supabase HTTP ${r.status}`);
  return data;
}

async function authAdmin(path, init={}){
  if(!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình.");
  const r=await fetch(`${URL}/auth/v1/admin/${path}`,{
    ...init,
    headers:{
      apikey:KEY,
      Authorization:`Bearer ${KEY}`,
      "Content-Type":"application/json",
      ...(init.headers||{})
    }
  });
  const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}};
  if(!r.ok) throw new Error(data?.msg||data?.message||data?.error_description||`Auth HTTP ${r.status}`);
  return data;
}

function bodyOf(req){if(req?.body&&typeof req.body==="object"&&!Array.isArray(req.body))return req.body;try{return JSON.parse(String(req?.body||"{}"))}catch{return {}}}

export default async function handler(req,res){
  applySecurityHeaders(res);
  const requestId=safeRequestId();
  res.setHeader("X-Request-ID",requestId);
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(!enforceMethod(req,res,["GET","POST","PATCH","DELETE"]))return;
  if(!enforceBodySize(req,res,32_000))return;
  if(!sameOrigin(req,res))return;
  if(!isAdminRequest(req))return res.status(401).json({error:"Admin session required",requestId});
  try{
    if(req.method==="GET"){
      const page=Math.max(1,Number(req.query?.page||1));
      const perPage=Math.min(100,Math.max(1,Number(req.query?.perPage||50)));
      const data=await authAdmin(`users?page=${page}&per_page=${perPage}`);
      const users=Array.isArray(data?.users)?data.users:[];
      const profiles=await sb(`profiles?select=id,full_name,student_code,role,status,created_at,updated_at&id=in.(${users.map(u=>u.id).join(",")||"00000000-0000-0000-0000-000000000000"})&order=created_at.desc`);
      const byId=new Map((profiles||[]).map(p=>[String(p.id),p]));
      return res.status(200).json({users:users.map(u=>{const p=byId.get(String(u.id))||{};return {id:u.id,email:u.email||"",full_name:p.full_name||u.user_metadata?.full_name||"",student_code:p.student_code||u.user_metadata?.student_code||"",role:p.role||u.app_metadata?.role||"student",status:p.status||"active",email_confirmed:!!u.email_confirmed_at,last_sign_in_at:u.last_sign_in_at||null,created_at:u.created_at,updated_at:p.updated_at||u.updated_at}}),total:Number(data?.total||users.length),page,perPage,requestId});
    }
    if(!enforceJsonContentType(req,res))return;
    const body=bodyOf(req);
    const id=String(req.query?.id||body.id||"").trim();
    if(!id) return res.status(400).json({error:"Thiếu user id.",requestId});
    if(req.method==="PATCH"){
      const full_name=String(body.full_name??"").trim().slice(0,120);
      const student_code=String(body.student_code??"").trim().slice(0,50)||null;
      const status=body.status==="suspended"?"suspended":"active";
      const role=body.role==="admin"?"admin":"student";
      await authAdmin(`users/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({ban_duration:status==="suspended"?"876000h":"none"})});
      await sb(`profiles?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({full_name,student_code,status,role,updated_at:new Date().toISOString()})});
      if(body.password){
        const password=String(body.password); if(password.length<8)return res.status(400).json({error:"Mật khẩu tối thiểu 8 ký tự.",requestId});
        await authAdmin(`users/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({password})});
      }
      return res.status(200).json({ok:true,requestId});
    }
    if(req.method==="DELETE"){
      await authAdmin(`users/${encodeURIComponent(id)}`,{method:"DELETE"});
      return res.status(200).json({ok:true,requestId});
    }
  }catch(e){return res.status(500).json({error:e.message||"Không quản lý được tài khoản.",requestId})}
}