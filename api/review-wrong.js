import crypto from "node:crypto";
import { applySecurityHeaders, enforceBodySize, enforceJsonContentType, sameOrigin, distributedRateLimit, safeRequestId, enforceMethod } from "../lib/api/_security.js";
import { sanitizeDlpText, inspectSemanticConversation } from "../lib/api/_ai-input-guard.js";
import { installAiResponseGuard } from "../lib/api/_response-guard.js";
import { acquireAiKey, getAiKeyPool, reportAiFailureAsync, reportAiSuccessAsync } from "../lib/api/_ai-resilience.js";
export default async function handler(req,res){
  const requestId=crypto.randomBytes(12).toString("hex");

  applySecurityHeaders(res);
  res.setHeader("X-Request-ID",requestId);
  const uninstallAiResponseGuard=installAiResponseGuard(res);
  if(!enforceMethod(req,res,["POST"]))return;
  if(!enforceJsonContentType(req,res))return;
  if(!enforceBodySize(req,res,160_000))return;
  if(!sameOrigin(req,res))return;
  if(!(await distributedRateLimit(req,res,{windowMs:60_000,max:20,keyPrefix:"review-wrong"})))return;
  try{
    const {question,userAnswer,correctAnswer,explanation,subject}=req.body||{};
    if(!question)return res.status(400).json({error:"Thiếu câu hỏi",requestId});
    const fields={question:String(question||""),userAnswer:String(userAnswer||""),correctAnswer:String(correctAnswer||""),explanation:String(explanation||""),subject:String(subject||"")};
    for(const key of Object.keys(fields))fields[key]=sanitizeDlpText(fields[key]).text;
    const semantic=inspectSemanticConversation(
      [fields.question,fields.userAnswer,fields.correctAnswer,fields.explanation].join("\n"),[]
    );
    if(semantic.score>=1)return res.status(422).json({error:"Dữ liệu bài sửa chứa tín hiệu prompt injection bị chặn.",code:"review-prompt-injection",requestId});
    if(!getAiKeyPool("GEMINI").length)return res.status(503).json({error:"GEMINI_API_KEY chưa được cấu hình.",requestId});
    const prompt=`Bạn là gia sư AI. Hãy giúp học sinh sửa một câu sai.\nMôn: ${fields.subject||"tự xác định"}\nCâu hỏi: ${JSON.stringify(fields.question)}\nHọc sinh trả lời: ${JSON.stringify(fields.userAnswer)}\nĐáp án đúng: ${JSON.stringify(fields.correctAnswer)}\nGiải thích hiện có: ${JSON.stringify(fields.explanation)}\n\nHãy kiểm tra lại đáp án dựa trên câu hỏi. Nếu đáp án đúng trong dữ liệu có vẻ sai, hãy nói rõ và đưa đáp án đúng hơn. Trả JSON thuần theo cấu trúc: {"whyWrong":"...","correctAnswer":"...","explanation":"...","memoryTip":"...","practice":{"question":"...","options":["...","...","...","..."],"answer":0}}. Câu luyện tập phải tương tự kiến thức, không quá dễ, và chỉ có một đáp án đúng.`;
    const models=["gemini-3.5-flash-lite","gemini-3.6-flash"];
    let last=null;
    for(const model of models){
      const entry=await acquireAiKey("GEMINI");
      if(!entry){last=new Error("Gemini key pool exhausted");continue;}
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":entry.key},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}}),signal:AbortSignal.timeout(18_000)});
      const raw=await r.text();let d={};try{d=JSON.parse(raw)}catch{}
      if(!r.ok){last=new Error(`Gemini ${r.status}: ${d?.error?.message||raw.slice(0,200)}`);last.status=r.status;reportAiFailureAsync("GEMINI",entry.id,last);if(r.status===404||r.status>=500||r.status===429)continue;throw last}
      const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim()||"";
      reportAiSuccessAsync("GEMINI",entry.id);
      try{return res.status(200).json(JSON.parse(text.replace(/^```json\s*/i,"").replace(/\s*```$/,"")))}catch{throw new Error("Gemini trả về JSON không hợp lệ.")}
    }
    throw last||new Error("Không gọi được Gemini.");
  }catch(e){console.error("review-wrong",e);return res.status(500).json({error:"Không thể xử lý yêu cầu lúc này.",requestId})}finally{uninstallAiResponseGuard()}
}
