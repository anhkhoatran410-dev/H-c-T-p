import { isAdminRequest } from './admin-login.js';

const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
const GEMINI_MODELS=['gemini-3.6-flash','gemini-3.5-flash-lite'];
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!isAdminRequest(req))return res.status(401).json({error:'Admin session required'});
  const service=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const gemini=String(process.env.GEMINI_API_KEY||'').replace(/^['"`]+|['"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();
  const github=String(process.env.GITHUB_TOKEN||'').trim();
  const checks={GEMINI_API_KEY:!!gemini,Gemini_generateContent:false,SUPABASE_SERVICE_ROLE_KEY:!!service,GITHUB_TOKEN_for_future_AI_code_actions:!!github,Supabase_database:false};
  const details={};
  if(gemini){
    for(const model of GEMINI_MODELS){
      try{
        const r=await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':gemini},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Reply with exactly OK.'}]}],generationConfig:{maxOutputTokens:8}})});
        const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}
        if(r.ok){checks.Gemini_generateContent=true;details.gemini_model=model;break}
        details[model]=data?.error?.message||`HTTP ${r.status}`;
      }catch(e){details[model]=e.message||'request failed'}
    }
  }
  if(service){try{const r=await fetch(`${SUPABASE_URL}/rest/v1/exams?select=id&limit=1`,{headers:{apikey:service,Authorization:`Bearer ${service}`}});checks.Supabase_database=r.ok}catch{}}
  return res.status(200).json({checks,details,notes:{GITHUB_TOKEN_for_future_AI_code_actions:'Tuỳ chọn; chỉ cần khi muốn AI tạo/chuyển patch GitHub trực tiếp.'}});
}
