const ADMIN_TOKEN_KEY="study_admin_session_v2";
const loginForm=document.getElementById("loginForm");
loginForm?.addEventListener("submit",async e=>{
  e.preventDefault();
  const msg=document.getElementById("loginMsg");
  const input=document.getElementById("adminPassword");
  msg.textContent="Đang xác thực...";
  try{
    const r=await fetch("/api/admin-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:input.value})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||"Đăng nhập thất bại");
    sessionStorage.setItem(ADMIN_TOKEN_KEY,data.token);
    location.reload();
  }catch(err){msg.textContent=err.message||"Không thể đăng nhập";input.select()}
});
