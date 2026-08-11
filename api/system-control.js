import { isAdminRequest } from './admin-login.js';
const URL=String(process.env.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co').trim();
const KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
async function sb(path,options={}){const r=await fetch(`${URL}/rest/v1/${path}`,{...options,headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`,...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok)throw new Error(data?.message||data?.hint||`Supabase ${r.status}`);return data}
export default async function handler(req,res){
 if(req.method==='GET'){try{const d=await sb('system_control?select=maintenance,maintenance_title,maintenance_message,updated_at&id=eq.true');return res.status(200).json(d?.[0]||{maintenance:false});}catch(e){return res.status(200).json({maintenance:false,unavailable:true});}}
 if(!isAdminRequest(req))return res.status(401).json({error:'Admin session required'});
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const body=req.body||{};
 try{const d=await sb('system_control?id=eq.true',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({maintenance:!!body.maintenance,maintenance_title:String(body.title||'Hệ thống đang được chăm sóc một chút 💛'),maintenance_message:String(body.message||'Xin lỗi bạn nhé! STUDY TH đang được bảo trì để mọi thứ chạy ổn định hơn. Bạn quay lại sau ít phút nhé.'),updated_at:new Date().toISOString()})});return res.status(200).json(d?.[0]||{});}catch(e){return res.status(500).json({error:e.message});}
}
