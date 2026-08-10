import { isAdminRequest } from './admin-login.js';
const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!isAdminRequest(req))return res.status(401).json({error:'Admin session required'});
  if(!SERVICE_KEY)return res.status(500).json({error:'SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên Vercel.'});
  const id=String(req.body?.id||'').trim();const questions=Array.isArray(req.body?.questions)?req.body.questions:null;
  if(!id||!questions)return res.status(400).json({error:'Thiếu ID hoặc danh sách câu hỏi.'});
  try{const r=await fetch(`${SUPABASE_URL}/rest/v1/exams?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,Prefer:'return=representation'},body:JSON.stringify({questions,question_count:questions.length})});const raw=await r.text();if(!r.ok)return res.status(502).json({error:raw||`Supabase HTTP ${r.status}`});let data={};try{data=JSON.parse(raw)}catch{}return res.status(200).json({ok:true,exam:data?.[0]||null})}catch(e){return res.status(500).json({error:e.message||'Không cập nhật được bài kiểm tra.'})}
}
