/* STUDY TH Admin — multi-file exam + flashcard intake repair
   Adds a stable multi-source picker without replacing the app's existing exam builder.
*/
(function(){
  'use strict';
  if(window.__examMultiSourceFlashcardRepair)return;
  window.__examMultiSourceFlashcardRepair=true;
  var state={files:[]};
  function input(){return document.getElementById('file')}
  function panel(){var i=input();return i&&i.closest('.panel')}
  function ensure(){
    var i=input(),p=panel(); if(!i||!p||i.__multiRepair)return;
    i.__multiRepair=true;i.multiple=true;
    var wrap=document.createElement('div');wrap.id='examMultiSourceControls';wrap.className='exam-multi-source-controls';
    wrap.innerHTML='<div class="exam-source-head"><div><b>📚 Nguồn tài liệu</b><small>Thêm nhiều Unit/chương rồi yêu cầu AI kết hợp.</small></div><span class="exam-source-count">0 file</span></div><div class="exam-source-list"></div><textarea class="exam-source-prompt" id="examSourcePrompt" rows="3" placeholder="Yêu cầu AI (tùy chọn): Ví dụ: Kết hợp từ vựng Unit 1 và Unit 2; lấy Unit 1 khoảng 70%, Unit 2 khoảng 30%; ưu tiên các từ chưa xuất hiện ở bài trước..."></textarea><div class="exam-source-hint">💡 Nếu có từ 2 file trở lên, AI sẽ nhận toàn bộ nguồn cùng yêu cầu này.</div>';
    i.parentNode.insertBefore(wrap,i.nextSibling);
    i.addEventListener('change',function(){mergeFiles(Array.from(i.files||[]))});
    render();
  }
  function mergeFiles(incoming){
    var all=state.files.concat(incoming),seen={};state.files=all.filter(function(f){var k=[f.name,f.size,f.lastModified].join('|');if(seen[k])return false;seen[k]=1;return true});
    try{var dt=new DataTransfer();state.files.forEach(function(f){dt.items.add(f)});input().files=dt.files}catch(e){}
    render();
  }
  function render(){var w=document.getElementById('examMultiSourceControls');if(!w)return;var list=w.querySelector('.exam-source-list');list.innerHTML='';state.files.forEach(function(f,n){var el=document.createElement('div');el.className='exam-source-file';el.innerHTML='<span>📄</span><strong title="'+esc(f.name)+'">'+esc(f.name)+'</strong><small>'+format(f.size)+'</small><button type="button" data-i="'+n+'">×</button>';el.querySelector('button').onclick=function(){state.files.splice(n,1);sync();render()};list.appendChild(el)});w.querySelector('.exam-source-count').textContent=state.files.length+(state.files.length===1?' file':' file');}
  function sync(){try{var dt=new DataTransfer();state.files.forEach(function(f){dt.items.add(f)});input().files=dt.files;input().dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function format(n){if(!n)return '0 B';var u=['B','KB','MB','GB'],i=Math.floor(Math.log(n)/Math.log(1024));return (n/Math.pow(1024,i)).toFixed(i?1:0)+' '+u[i]}
  function css(){if(document.getElementById('exam-multi-source-repair-css'))return;var s=document.createElement('style');s.id='exam-multi-source-repair-css';s.textContent='#tests .exam-multi-source-controls{margin:10px 0 18px;padding:16px;border:1px solid color-mix(in srgb,var(--line,#e5eaf2) 75%,#7c5cff 25%);border-radius:18px;background:color-mix(in srgb,var(--panel,#fff) 94%,#7c5cff 6%)}#tests .exam-source-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.exam-source-head b{display:block}.exam-source-head small{display:block;margin-top:3px;opacity:.65}.exam-source-count{font-size:12px;font-weight:800;padding:7px 10px;border-radius:999px;background:rgba(124,92,255,.12);color:#6947e8}.exam-source-list{display:grid;gap:7px;margin-top:12px}.exam-source-file{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:12px;background:var(--panel,#fff);border:1px solid var(--line,#e5eaf2);min-width:0}.exam-source-file strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.exam-source-file small{opacity:.55;font-size:11px}.exam-source-file button{border:0;background:transparent;cursor:pointer;font-size:18px;opacity:.55}.exam-source-prompt{width:100%;box-sizing:border-box;margin-top:12px;resize:vertical;border-radius:13px;border:1px solid var(--line,#e5eaf2);padding:11px;font:inherit}.exam-source-hint{font-size:11px;opacity:.62;margin-top:8px}@media(max-width:600px){#tests .exam-multi-source-controls{padding:13px}.exam-source-file small{display:none}}';document.head.appendChild(s)}
  function boot(){css();ensure()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  new MutationObserver(function(){ensure()}).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,50)});
})();
