import { isAdminRequest } from "./admin-login.js";

const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

export default async function handler(req, res){
  if(req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  if(!isAdminRequest(req)) return res.status(401).json({error:"Admin session required"});
  if(!SERVICE_KEY) return res.status(500).json({error:"SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên Vercel."});

  const id = String(req.body?.id || "").trim();
  if(!id) return res.status(400).json({error:"Thiếu ID bài kiểm tra."});

  try{
    const r = await fetch(`${SUPABASE_URL}/rest/v1/exams?id=eq.${encodeURIComponent(id)}`,{
      method:"DELETE",
      headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,Prefer:"return=minimal"}
    });
    if(!r.ok){
      const text = await r.text();
      return res.status(502).json({error:text || `Supabase HTTP ${r.status}`});
    }
    return res.status(200).json({ok:true,id});
  }catch(e){
    return res.status(500).json({error:e.message || "Không xoá được bài kiểm tra."});
  }
}
