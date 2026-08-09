const originalCheckReview=window.checkReview;
window.checkReview=async function(){
  const x=state.review,item=x?.items?.[x.cursor],q=item?.question;
  if(!item||!q)return originalCheckReview?.();
  let userAnswer=null;
  if(q.type==="mcq")userAnswer=Number(state.reviewChoice);
  else if(q.type==="short")userAnswer=document.getElementById("reviewShort")?.value.trim();
  else userAnswer=state.reviewTF||[];
  const msg=document.getElementById("reviewMsg");
  if(msg)msg.innerHTML="<p class='muted'>🤖 Gemini đang phân tích lỗi và tạo câu luyện tập...</p>";
  try{
    const r=await fetch("/api/review-wrong",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:state.subject||state.review.exam?.subject,question:q,userAnswer,correctAnswer:q.type==="mcq"?(q.opts||[])[q.a]:q.type==="short"?q.answer:q.answers,explanation:q.explanation||""})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"Gemini không phản hồi");
    const practice=d.practice||{};
    if(msg)msg.innerHTML=`<div class='card' style='margin-top:12px'><p><b>Vì sao sai:</b> ${esc(d.whyWrong||"")}</p><p><b>Đáp án đúng:</b> ${esc(String(d.correctAnswer??""))}</p><p><b>Giải thích:</b> ${esc(d.explanation||"")}</p><p><b>🧠 Mẹo nhớ:</b> ${esc(d.memoryTip||"")}</p>${practice.question?`<hr><p><b>🎯 Câu luyện tập:</b> ${esc(practice.question)}</p>${(practice.options||[]).map((o,i)=>`<label class='option'><input type='radio' name='practiceQ' value='${i}'> ${String.fromCharCode(65+i)}. ${esc(o)}</label>`).join("")}<button class='btn' onclick='checkGeminiPractice(${Number(practice.answer||0)})'>Kiểm tra câu luyện tập</button>`:""}</div>`;
  }catch(e){if(msg)msg.innerHTML=`<p class='danger-text'>Không gọi được Gemini: ${esc(e.message)}</p>`}
};
window.checkGeminiPractice=function(correct){const picked=document.querySelector('input[name="practiceQ"]:checked');const msg=document.getElementById("reviewMsg");if(!picked)return;if(Number(picked.value)===Number(correct))msg.innerHTML+="<p class='success'>✅ Câu luyện tập đúng! Bạn đã sửa được lỗi này.</p>";else msg.innerHTML+="<p class='danger-text'>❌ Chưa đúng. Hãy đọc lại phần giải thích rồi thử lại.</p>"};
