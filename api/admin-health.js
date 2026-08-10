import { isAdminRequest } from './admin-login.js';

const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!isAdminRequest(req))return res.status(401).json({error:'Admin session required'});
  const service=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const gemini=String(process.env.GEMINI_API_KEY||'').trim();
  const github=String(process.env.GITHUB_TOKEN||'').trim();
  const checks={GEMINI_API_KEY:!!gemini,SUPABASE_SERVICE_ROLE_KEY:!!service,GITHUB_TOKEN_for_future_AI_code_actions:!!github,Supabase_database:false};
  if(service){try{const r=await fetch(`${SUPABASE_URL}/rest/v1/exams?select=id&limit=1`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});checks.Supabase_database=r.ok}catch{}}
  return res.status(200).json({checks,notes:{GITHUB_TOKEN_for_future_AI_code_actions:'Tuỳ chọn; chỉ cần khi muốn AI tạo/chuyển patch GitHub trực tiếp.'}});
}
