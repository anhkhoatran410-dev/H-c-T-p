import { isAdminRequest } from './admin-login.js';

const SUPABASE_URL='https://mlqaeginqsgqacdqdzbm.supabase.co';
const SERVICE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const GEMINI_MODELS=['gemini-3.6-flash','gemini-3.5-flash-lite'];

const route=String(arguments?.query?.route||'');

async function health(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!isAdminRequest(req))return res.status(401).json({error:'Admin session required'});
  const gemini=String(process.env.GEMINI_API_KEY||'').replace(/^['\"`]+|['\"`]+$/g,'').replace(/[\u0000-\u0020\u007f-\u009f]/g,'').trim();
  const github=String(process.env.GITHUB_TOKEN||'').trim();
  const checks={GEMINI_API_KEY:!!gemini,Gemini_generateContent:false,SUPABASE_SERVICE_ROLE_KEY:!!SERVICE_KEY,GITHUB_TOKEN_for_future_AI_code_actions:!!github,Supabase_database:false};
  const details={};
  if(gemini){for(const model of GEMINI_MODELS){try{const r=await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':gemini},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Reply with exactly OK.'}]}],generationConfig:{maxOutputTokens:8}})});const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{}if(r.ok){checks.Gemini_generateContent=true;details.gemini_model=model;break}details[model]=data?.error?.message||`HTTP ${r.status}`}catch(e){details[model]=e.message||'request failed'}}}
  if(SERVICE_KEY){try{const r=await fetch(`${SUPABASE_URL}/rest/v1/exams?select=id&limit=1`,{headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`}});checks.Supabase_database=r.ok}catch{}}
  return res.status(200).json({checks,details,notes:{GITHUB_TOKEN_for_future_AI_code_actions:'Tuỳ chọn; chỉ cần khi muốn AI tạo/chuyển patch GitHub trực tiếp.'}});
}

async function adminGuard(req,res){if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});if(!isAdminRequest(req))return res.status(401).json({error:'Admin session required'});if(!SERVICE_KEY)return res.status(500).json({error:'SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trên Vercel.'});}

async function singleDelete(req,res){await adminGuard(req,res);if(!SERVICE_KEY||res.headersSent)return;const id=String(req.body?.id||'').trim();if(!id)return res.status(400).json({error:'Thiếu ID bài kiểm tra.'});try{const r=await fetch(`${SUPABASE_URL}/rest/v1/exams?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,Prefer:'return=minimal'}});if(!r.ok){const text=await r.text();return res.status(502).json({error:text||`Supabase HTTP ${r.status}`})}return res.status(200).json({ok:true,id})}catch(e){return res.status(500).json({error:e.message||'Không xoá được bài kiểm tra.'})}}

async function bulkDelete(req,res){await adminGuard(req,res);if(!SERVICE_KEY||res.headersSent)return;const body=req.body||{};const ids=Array.isArray(body.ids)?body.ids.map(String).filter(Boolean):[];const from=body.from?new Date(body.from):null;const to=body.to?new Date(body.to):null;if(from&&!Number.isFinite(from.getTime()))return res.status(400).json({error:'Ngày bắt đầu không hợp lệ.'});if(to&&!Number.isFinite(to.getTime()))return res.status(400).json({error:'Ngày kết thúc không hợp lệ.'});try{let url=`${SUPABASE_URL}/rest/v1/exams?`;if(ids.length)url+=`id=in.(${ids.map(x=>encodeURIComponent(x)).join(',')})`;else if(from||to){const parts=[];if(from)parts.push(`created_at=gte.${encodeURIComponent(from.toISOString())}`);if(to)parts.push(`created_at=lt.${encodeURIComponent(to.toISOString())}`);url+=parts.join('&')}else url+='id=not.is.null';const r=await fetch(url,{method:'DELETE',headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,Prefer:'return=representation'}});const text=await r.text();if(!r.ok)return res.status(502).json({error:text||`Supabase HTTP ${r.status}`});let deleted=[];try{deleted=JSON.parse(text)||[]}catch{}return res.status(200).json({ok:true,count:Array.isArray(deleted)?deleted.length:0})}catch(e){return res.status(500).json({error:e.message||'Không xoá được bài kiểm tra.'})}}

async function updateExam(req,res){await adminGuard(req,res);if(!SERVICE_KEY||res.headersSent)return;const id=String(req.body?.id||'').trim();const questions=Array.isArray(req.body?.questions)?req.body.questions:null;if(!id||!questions)return res.status(400).json({error:'Thiếu ID hoặc danh sách câu hỏi.'});try{const r=await fetch(`${SUPABASE_URL}/rest/v1/exams?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,Prefer:'return=representation'},body:JSON.stringify({questions,question_count:questions.length})});const raw=await r.text();if(!r.ok)return res.status(502).json({error:raw||`Supabase HTTP ${r.status}`});let data={};try{data=JSON.parse(raw)}catch{}return res.status(200).json({ok:true,exam:data?.[0]||null})}catch(e){return res.status(500).json({error:e.message||'Không cập nhật được bài kiểm tra.'})}}

async function clientMeta(req,res){const forwarded=String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'').split(',')[0].trim();const ip=forwarded||String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'')||null;return res.status(200).json({ip,userAgent:String(req.headers['user-agent']||'')})}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const path=String(req.query?.route||route||'').replace(/^\/+|\/+$/g,'');
  if(path==='admin-health')return health(req,res);
  if(path==='admin-delete-exam')return singleDelete(req,res);
  if(path==='admin-delete-exams-bulk')return bulkDelete(req,res);
  if(path==='admin-update-exam')return updateExam(req,res);
  if(path==='client-meta')return clientMeta(req,res);
  return res.status(404).json({error:'Admin utility route not found'});
}
