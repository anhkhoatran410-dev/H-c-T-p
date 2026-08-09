async function ensureThread(){
  if(state.thread)return state.thread;
  await loadSupabase();
  let {data,error}=await db.from("support_threads").select("*").eq("device_id",deviceId()).maybeSingle();
  if(error)throw error;
  if(!data){
    const r=await db.from("support_threads").insert({device_id:deviceId(),student_name:state.candidate||localStorage.getItem("study_candidate")||"Người dùng",account_id:state.supportAccountId||null}).select().single();
    if(r.error)throw r.error;data=r.data;
  }else if(state.supportAccountId&&String(data.account_id||"")!==String(state.supportAccountId)){
    const r=await db.from("support_threads").update({account_id:state.supportAccountId}).eq("id",data.id).select().single();
    if(!r.error&&r.data)data=r.data;
  }
  state.thread=data;return data;
}
async function selectSupportAccount(id){state.supportAccountId=id;state.thread=null;state.messages=[];await startSupportLive();render()}
