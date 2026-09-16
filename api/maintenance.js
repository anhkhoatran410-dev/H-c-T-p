import { isAdminRequest } from "./admin-login.js";
const URL="https://mlqaeginqsgqacdqdzbm.supabase.co";
const KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
async function call(path,opts={}){const r=await fetch(`${URL}/rest/v1/${path}`,{...opts,headers:{"Content-Type":"application/json",apikey:KEY,Authorization:`Bearer ${KEY}`,...(opts.headers||{})},signal:AbortSignal.timeout(7000)});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok)throw new Error(data?.message||data?.hint||`Supabase ${r.status}`);return data;}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 try{
  if(req.method==="GET"){
   try{return res.status(200).json({data:(await call("system_control?select=*&id=eq.true&limit=1"))?.[0]||{maintenance:false}})}
   catch(_){return res.status(200).json({data:{maintenance:false},unavailable:true})}
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!isAdminRequest(req))return res.status(401).json({error:"Admin session required"});
  if(!KEY)return res.status(500).json({error:"Dịch vụ bảo trì chưa được cấu hình."});
  const maintenance=Boolean(req.body?.maintenance);
  const data=await call("system_control?id=eq.true",{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({maintenance,updated_at:new Date().toISOString()})});
  return res.status(200).json({data:data?.[0]||null});
 }catch(e){console.error("maintenance handler error",e);return res.status(500).json({error:"Không thể cập nhật trạng thái bảo trì lúc này."})}
}
