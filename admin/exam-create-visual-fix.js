/* STUDY TH Admin — replace native file input with app-native picker */
(function(){
 if(window.__examCreateVisualFix)return; window.__examCreateVisualFix=true;
 function init(){
  var sec=document.getElementById('tests'),input=document.getElementById('file'); if(!sec||!input||input.__visualized)return; input.__visualized=true;
  var label=input.closest('label'); if(!label)return;
  label.className='exam-file-picker'; label.innerHTML='';
  var inner=document.createElement('div'); inner.className='exam-upload-inner';
  inner.innerHTML='<div class="exam-upload-icon">📚</div><div class="exam-upload-copy"><strong>Thêm tài liệu để AI tạo đề</strong><span>PDF, DOCX, TXT, MD, CSV hoặc hình ảnh · Có thể thêm nhiều file</span></div><span class="exam-upload-action">＋ Chọn tài liệu</span>';
  label.appendChild(inner); label.appendChild(input);
  var list=document.createElement('div'); list.className='exam-files'; list.id='examSelectedFiles'; label.parentNode.insertBefore(list,label.nextSibling);
  function render(){list.innerHTML='';Array.from(input.files||[]).forEach(function(f,i){var c=document.createElement('div');c.className='exam-file-chip';c.innerHTML='<span>📄 '+f.name+'</span><button type="button" aria-label="Xóa">×</button>';c.querySelector('button').onclick=function(e){e.preventDefault();e.stopPropagation();remove(i)};list.appendChild(c)}); if(input.files&&input.files.length){inner.querySelector('strong').textContent=input.files.length+' tài liệu đã chọn';inner.querySelector('.exam-upload-action').textContent='＋ Thêm tài liệu';}else{inner.querySelector('strong').textContent='Thêm tài liệu để AI tạo đề';inner.querySelector('.exam-upload-action').textContent='＋ Chọn tài liệu'}}
  function remove(index){var dt=new DataTransfer();Array.from(input.files).forEach(function(f,i){if(i!==index)dt.items.add(f)});input.files=dt.files;render();input.dispatchEvent(new Event('change',{bubbles:true}))}
  input.addEventListener('change',function(){
   var old=window.__examPickedFiles||[],incoming=Array.from(input.files||[]),all=old.concat(incoming),seen=new Set(),unique=all.filter(function(f){var k=f.name+'|'+f.size+'|'+f.lastModified;if(seen.has(k))return false;seen.add(k);return true});
   var dt=new DataTransfer();unique.forEach(function(f){dt.items.add(f)});input.files=dt.files;window.__examPickedFiles=unique;render();
  });
  render();
 }
 function boot(){init();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
 new MutationObserver(boot).observe(document.body,{childList:true,subtree:true});
})();
