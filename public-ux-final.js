/* STUDY TH — final public UX repair: support composer controls + reliable sending/media + exam layout/theme. */
(function(){
  if(window.__studyPublicUxFinalV1)return;
  window.__studyPublicUxFinalV1=true;

  function state(){return window.state||window.studyState||null}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function closeMenus(){document.querySelectorAll('.support-media-menu').forEach(function(x){x.classList.add('hidden')})}
  function ensureTools(){
    var composer=document.querySelector('.support-composer');
    if(!composer)return;
    composer.style.position='relative';
    var input=document.getElementById('supportInput');
    if(!input)return;
    var tools=composer.querySelector('.support-tools');
    if(!tools){
      tools=document.createElement('div');tools.className='support-tools';
      tools.innerHTML='<button type="button" class="support-tool" data-support-action="emoji" title="Emoji">😊</button><button type="button" class="support-tool" data-support-action="sticker" title="Sticker">✨</button><button type="button" class="support-tool" data-support-action="gif" title="GIF">GIF</button><button type="button" class="support-tool" data-support-action="file" title="Ảnh / file">📎</button>';
      composer.insertBefore(tools,input);
    }
    var fileInput=composer.querySelector('#supportMediaInput');
    if(!fileInput){
      fileInput=document.createElement('input');fileInput.type='file';fileInput.id='supportMediaInput';fileInput.accept='image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip';fileInput.hidden=true;composer.appendChild(fileInput);
      fileInput.addEventListener('change',function(){if(fileInput.files&&fileInput.files[0])uploadSupportMedia(fileInput.files[0]);fileInput.value=''})
    }
    var status=composer.querySelector('.support-upload-status');
    if(!status){status=document.createElement('span');status.className='support-upload-status';composer.appendChild(status)}
    if(!composer.querySelector('.support-media-menu')){
      var menu=document.createElement('div');menu.className='support-media-menu hidden';menu.innerHTML='<button type="button" data-quick-emoji="😊">😊</button><button type="button" data-quick-emoji="😂">😂</button><button type="button" data-quick-emoji="🥹">🥹</button><button type="button" data-quick-emoji="❤️">❤️</button><button type="button" data-quick-emoji="🔥">🔥</button><button type="button" data-quick-sticker="👍 Sticker">👍</button><button type="button" data-quick-sticker="🎉 Sticker">🎉</button><button type="button" data-quick-sticker="🤝 Sticker">🤝</button>';
      composer.appendChild(menu);
    }
  }

  async function uploadSupportMedia(file){
    var s=state();if(!s||!file)return;
    var composer=document.querySelector('.support-composer'),status=composer&&composer.querySelector('.support-upload-status');
    if(status)status.textContent='Đang tải '+file.name+'…';
    try{
      if(typeof window.loadSupabase!=='function')throw new Error('Hỗ trợ chưa sẵn sàng.');
      await window.loadSupabase();
      var path='public/'+(typeof window.deviceId==='function'?window.deviceId():'device')+'/'+Date.now()+'-'+String(file.name).replace(/[^a-zA-Z0-9._-]/g,'_');
      var up=await db.storage.from('support-media').upload(path,file,{upsert:false,contentType:file.type||undefined});
      if(up.error)throw up.error;
      var pub=db.storage.from('support-media').getPublicUrl(path);var url=pub&&pub.data&&pub.data.publicUrl;
      if(!url)throw new Error('Không lấy được URL file.');
      await window.sendSupportMessage({message:file.type&&file.type.indexOf('image/')===0?'📷 Hình ảnh':'📎 '+file.name,attachment_url:url,attachment_type:file.type||'application/octet-stream',attachment_name:file.name});
      if(typeof window.refreshPublicChat==='function')await window.refreshPublicChat();
      if(status)status.textContent='Đã gửi ✓';
    }catch(e){console.error('support media upload',e);if(status)status.textContent='Lỗi: '+(e.message||e);alert('Không gửi được file: '+(e.message||e))}
    setTimeout(function(){if(status)status.textContent=''},2500)
  }

  async function sendText(){
    var input=document.getElementById('supportInput'),text=input&&input.value.trim();if(!text)return;
    if(window.__studyPublicUxSending)return;
    window.__studyPublicUxSending=true;
    try{
      if(typeof window.sendSupportMessage!=='function')throw new Error('Hỗ trợ chưa sẵn sàng.');
      await window.sendSupportMessage({message:text});
      if(input)input.value='';
      if(typeof window.refreshPublicChat==='function')await window.refreshPublicChat();
    }catch(e){if(input)input.value=text;console.error('support send',e);alert('Không gửi được tin nhắn: '+(e.message||e))}
    finally{window.__studyPublicUxSending=false}
  }

  function quickEmoji(v){var input=document.getElementById('supportInput');if(!input)return;input.value+=(input.value?' ':'')+v;input.focus();closeMenus()}
  async function quickSticker(v){closeMenus();try{if(typeof window.sendSupportMessage!=='function')throw new Error('Hỗ trợ chưa sẵn sàng.');await window.sendSupportMessage({sticker:v,message:'✨ '+v});if(typeof window.refreshPublicChat==='function')await window.refreshPublicChat()}catch(e){alert('Không gửi được sticker: '+(e.message||e))}}
  function openGif(){
    closeMenus();
    var url=window.prompt('Dán URL GIF (ví dụ link .gif):');
    if(!url)return;
    try{new URL(url)}catch(e){return alert('URL GIF không hợp lệ.')}
    window.sendSupportMessage({message:'GIF',attachment_url:url,attachment_type:'image/gif',attachment_name:'animation.gif'}).then(function(){if(typeof window.refreshPublicChat==='function')return window.refreshPublicChat()}).catch(function(e){alert('Không gửi được GIF: '+(e.message||e))})
  }

  function installComposer(){
    ensureTools();
    var composer=document.querySelector('.support-composer');if(!composer||composer.__uxBound)return;
    composer.__uxBound=true;
    composer.addEventListener('click',function(e){
      var action=e.target.closest('[data-support-action]');
      if(action){e.preventDefault();e.stopPropagation();var a=action.getAttribute('data-support-action');if(a==='emoji'||a==='sticker'){var menu=composer.querySelector('.support-media-menu');if(menu)menu.classList.toggle('hidden');return}if(a==='gif'){openGif();return}if(a==='file'){composer.querySelector('#supportMediaInput')?.click();return}}
      var emoji=e.target.closest('[data-quick-emoji]');if(emoji){e.preventDefault();quickEmoji(emoji.getAttribute('data-quick-emoji'));return}
      var sticker=e.target.closest('[data-quick-sticker]');if(sticker){e.preventDefault();quickSticker(sticker.getAttribute('data-quick-sticker'));return}
      var send=e.target.closest('.send-btn,.composer-send,[data-support-send]');if(send){e.preventDefault();sendText()}
    },true);
    var input=document.getElementById('supportInput');
    if(input&&!input.__uxBound){input.__uxBound=true;input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendText()}})}
  }

  function repairExamLayout(){
    var app=document.getElementById('app');if(!app)return;
    document.body.classList.toggle('study-exam-active',!!(state()&&state().page==='exam'));
    app.querySelectorAll('.q,.question,.attempt-question').forEach(function(q){q.style.maxWidth='100%';q.style.boxSizing='border-box'});
    app.querySelectorAll('.q .option').forEach(function(o){o.style.maxWidth='100%';o.style.boxSizing='border-box'});
    app.querySelectorAll('.q .option > span').forEach(function(s){s.style.minWidth='0';s.style.overflowWrap='anywhere'});
  }

  function boot(){installComposer();repairExamLayout()}
  var root=document.getElementById('app');
  if(root)new MutationObserver(function(){clearTimeout(window.__studyUxFinalTimer);window.__studyUxFinalTimer=setTimeout(boot,30)}).observe(root,{childList:true,subtree:true});
  document.addEventListener('click',function(e){if(!e.target.closest('.support-composer'))closeMenus()},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,100)});else setTimeout(boot,100);
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,100)});
  setInterval(boot,1000);
})();
