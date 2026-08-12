/* STUDY TH — Exam Builder click / multi-file hotfix */
(function(){
'use strict';
if(window.__studyExamBuilderClickHotfix)return;
window.__studyExamBuilderClickHotfix=true;
function key(f){return [f.name,f.size,f.lastModified,f.type].join('|')}
function merge(input,incoming){
 var old=Array.from(input.__ebHotfixFiles||[]),map=new Map();
 old.concat(Array.from(incoming||[])).forEach(function(f){map.set(key(f),f)});
 var all=Array.from(map.values());
 try{var dt=new DataTransfer();all.forEach(function(f){dt.items.add(f)});input.files=dt.files}catch(_){ }
 input.__ebHotfixFiles=all;return all;
}
function bind(){
 var drop=document.getElementById('eb2Drop'),input=document.getElementById('eb2File');
 if(!drop||!input)return;
 if(!drop.__ebClickBound){
  drop.__ebClickBound=true;
  drop.addEventListener('click',function(e){if(e.target.closest('.eb2-remove'))return;input.click()});
  drop.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}});
  drop.setAttribute('role','button');drop.setAttribute('tabindex','0');
  input.addEventListener('change',function(){merge(input,input.files)});
  drop.addEventListener('dragover',function(e){e.preventDefault();drop.classList.add('drag')});
  drop.addEventListener('dragleave',function(){drop.classList.remove('drag')});
  drop.addEventListener('drop',function(e){
   e.preventDefault();drop.classList.remove('drag');
   var fs=e.dataTransfer&&e.dataTransfer.files;if(!fs||!fs.length)return;
   merge(input,fs);input.dispatchEvent(new Event('change',{bubbles:true}));
  });
 }
 if(!input.__ebHotfixInitialised){input.__ebHotfixInitialised=true;input.__ebHotfixFiles=Array.from(input.files||[])}
}
function boot(){bind()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
var last=0;new MutationObserver(function(){var n=Date.now();if(n-last<150)return;last=n;bind()}).observe(document.body,{childList:true,subtree:true});
})();
