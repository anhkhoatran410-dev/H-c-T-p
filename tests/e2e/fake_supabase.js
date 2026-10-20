(function(){
 const M=window.__MOCK__;
 function builder(t){const s={t,op:'select',filters:[],payload:null,one:false};const api={
 select(){return api},insert(p){s.op='insert';s.payload=p;return api},upsert(p){s.op='insert';s.payload=p;return api},update(p){s.op='update';s.payload=p;return api},delete(){s.op='delete';return api},
 eq(c,v){s.filters.push([c,v]);return api},neq(){return api},in(){return api},is(){return api},gte(){return api},lte(){return api},or(){return api},ilike(){return api},order(){return api},limit(){return api},maybeSingle(){s.one=true;return api},single(){s.one=true;return api},
 then(ok,bad){return Promise.resolve(run()).then(ok,bad)}};
 function run(){M.calls.push({t:s.t,op:s.op,filters:s.filters,payload:s.payload});let rows=(M.tables[t]||[]).slice();for(const [c,v] of s.filters)rows=rows.filter(r=>String(r[c])===String(v));if(s.op==='insert'){const arr=[].concat(s.payload).map(r=>({...r,id:r.id||'mock-'+(M.calls.length),created_at:r.created_at||new Date().toISOString()}));(M.tables[t]=M.tables[t]||[]).push(...arr);return {data:s.one?arr[0]:arr,error:null}}if(s.op==='update'){rows.forEach(r=>Object.assign(r,s.payload));return {data:rows,error:null}}return {data:s.one?(rows[0]||null):rows,error:null}}
 return api}
 const client={from:builder,rpc(name,args){M.calls.push({rpc:name,args});const h=M.rpc[name];return Promise.resolve(h?{data:h(args),error:null}:{data:null,error:{message:'rpc '+name+' not mocked'}})},auth:{
 signUp:async(a)=>{M.calls.push({signUp:a});return {data:{user:{id:'u-new',email:a.email,user_metadata:{full_name:a.options?.data?.full_name}},session:null},error:null}},
 getSession:async()=>({data:{session:/access_token/.test(location.hash+location.search)||window.__SESSION__?{access_token:'mock',user:{id:'u-new',email:'new@gmail.com',email_confirmed_at:'2026-10-20T00:00:00Z',user_metadata:{full_name:'Nguyễn Văn C'}}}:null},error:null}),
 getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({data:{},error:{message:'mock'}}),signOut:async()=>({error:null})},
 channel(){const c={on(){return c},subscribe(){return c},unsubscribe(){}};return c},removeChannel(){}};
 window.supabase={createClient:()=>client};
})();