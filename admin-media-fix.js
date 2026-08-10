(function(){
  window.sendReplyFile=async function(file){
    if(!file||typeof admin==='undefined'||!admin.thread)return;
    try{
      if(!String(file.type||'').startsWith('image/'))throw new Error('Chỉ nhận ảnh và GIF.');
      if(file.size>8*1024*1024)throw new Error('Ảnh/GIF tối đa 8MB.');
      await loadSupabase();
      var safe=(file.name||'image').replace(/[^a-zA-Z0-9._-]/g,'_');
      var path='admin/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+safe;
      var up=await db.storage.from('support-media').upload(path,file,{contentType:file.type,upsert:false});
      if(up.error)throw up.error;
      var pub=db.storage.from('support-media').getPublicUrl(path).data.publicUrl;
      var r=await db.from('support_messages').insert({thread_id:admin.thread.id,account_id:admin.thread.account_id||null,sender:'admin',sender_name:'Admin',message:file.type==='image/gif'?'🎞️ GIF':'📷 Hình ảnh',attachment_url:pub,attachment_type:file.type,attachment_name:file.name});
      if(r.error)throw r.error;
      await openThread(admin.thread.id);await loadSupportThreads();
    }catch(e){toast('Không gửi được file: '+(e?.message||e))}
  };
})();
