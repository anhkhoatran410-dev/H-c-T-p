import { isAdminRequest } from "./admin-login.js";

const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req,res){
  if(req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  if(!isAdminRequest(req)) return res.status(401).json({error:"Admin session required"});
  if(!SERVICE_KEY) return res.status(500).json({error:"SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên Vercel."});
  const body=req.body||{};
  const ids=Array.isArray(body.ids)?body.ids.map(String).filter(Boolean):[];
  const from=body.from?new Date(body.from):null;
  const to=body.to?new Date(body.to):null;
  if(from&&!Number.isFinite(from.getTime())) return res.status(400).json({error:"Ngày bắt đầu không hợp lệ."});
  if(to&&!Number.isFinite(to.getTime())) return res.status(400).json({error:"Ngày kết thúc không hợp lệ."});
  try{
    let url=`${SUPABASE_URL}/rest/v1/exams?`;
    if(ids.length) url+=`id=in.(${ids.map(x=>encodeURIComponent(x)).join(",")})`;
    else if(from||to){
      const parts=[];
      if(from)parts.push(`created_at=gte.${encodeURIComponent(from.toISOString())}`);
      if(to)parts.push(`created_at=lt.${encodeURIComponent(to.toISOString())}`);
      url+=parts.join("&");
    }else url+="id=not.is.null";
    const r=await fetch(url,{method:"DELETE",headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,Prefer:"return=representation"}});
    const text=await r.text();
    if(!r.ok)return res.status(502).json({error:text||`Supabase HTTP ${r.status}`});
    let deleted=[];try{deleted=JSON.parse(text)||[]}catch{}
    return res.status(200).json({ok:true,count:Array.isArray(deleted)?deleted.length:0});
  }catch(e){return res.status(500).json({error:e.message||"Không xoá được bài kiểm tra."});}
}
