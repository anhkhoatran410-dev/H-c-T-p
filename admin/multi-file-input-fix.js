/* STUDY TH — persistent multi-file picker for Admin > Bài kiểm tra.
   Native <input type=file multiple> replaces its FileList every time the picker opens.
   This wrapper accumulates files across repeated selections and exposes the merged FileList
   back through input.files, so users can click the picker again to add another Unit/chapter.
*/
(function(){
  'use strict';
  if(window.__studyAdminMultiFileFix)return;
  window.__studyAdminMultiFileFix=true;

  function uniq(files){
    var out=[], seen=new Set();
    Array.from(files||[]).forEach(function(f){
      var key=[f.name,f.size,f.lastModified,f.type].join('|');
      if(!seen.has(key)){seen.add(key);out.push(f)}
    });
    return out;
  }
  function setFiles(input, files){
    try{
      var dt=new DataTransfer();
      uniq(files).forEach(function(f){dt.items.add(f)});
      input.files=dt.files;
      return true;
    }catch(e){
      console.warn('Multi-file picker: DataTransfer unavailable',e);
      return false;
    }
  }
  function renderLabel(input){
    var files=Array.from(input.files||[]);
    var label=input.closest('label');
    if(!label)return;
    var old=label.querySelector('.study-multi-file-list');
    if(old)old.remove();
    var box=document.createElement('div');
    box.className='study-multi-file-list';
    if(!files.length){box.innerHTML='<small>Chưa chọn tài liệu</small>'}
    else{
      box.innerHTML='<b>📚 '+files.length+' tài liệu đã chọn</b>'+files.map(function(f,i){
        return '<div class="study-multi-file-row"><span>'+ (i+1)+'. '+escapeHtml(f.name)+'</span><small>'+formatSize(f.size)+'</small></div>';
      }).join('')+'<small class="study-multi-file-hint">Bấm Chọn tệp lần nữa để thêm Unit/chương khác.</small>';
    }
    label.appendChild(box);
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function formatSize(n){if(!n)return '0 B';var u=['B','KB','MB','GB'],i=Math.min(3,Math.floor(Math.log(n)/Math.log(1024)));return (n/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i]}
  function bind(){
    var input=document.getElementById('file');
    if(!input||input.__studyMultiBound)return;
    input.__studyMultiBound=true;
    input.setAttribute('multiple','multiple');
    input.addEventListener('change',function(){
      var current=Array.from(input.files||[]);
      var old=input.__studySelectedFiles||[];
      var merged=uniq(old.concat(current));
      input.__studySelectedFiles=merged;
      setFiles(input,merged);
      renderLabel(input);
    });
    input.__studySelectedFiles=[];
    renderLabel(input);
  }
  function css(){
    if(document.getElementById('study-multi-file-fix-css'))return;
    var s=document.createElement('style');s.id='study-multi-file-fix-css';s.textContent='.study-multi-file-list{margin-top:10px;padding:10px 12px;border:1px dashed var(--line,#dfe5ef);border-radius:12px;background:rgba(99,102,241,.04);display:grid;gap:5px}.study-multi-file-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;align-items:center}.study-multi-file-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.study-multi-file-hint{margin-top:4px;opacity:.7}.study-multi-file-list b{font-size:13px}';document.head.appendChild(s);
  }
  function boot(){css();bind()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  var mo=new MutationObserver(function(){bind()});
  mo.observe(document.documentElement,{childList:true,subtree:true});
})();
