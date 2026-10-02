(function(){
'use strict';
if(window.__studyFlashcardUxRepair)return;window.__studyFlashcardUxRepair=true;
const SUPABASE_URL=(window.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co').replace(/\/$/,'');
const SUPABASE_KEY=window.SUPABASE_KEY||'sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
function style(){
 if(document.getElementById('study-flashcard-ux-repair-style'))return;
 const s=document.createElement('style');s.id='study-flashcard-ux-repair-style';
 s.textContent=[
 '.fx-learning-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:10px!important}',
 '.fx-learning-coming{display:grid!important;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:18px!important;align-items:start}',
 '.fx-learning-coming>.fx-learning-main{grid-column:1;grid-row:1}',
 '.fx-learning-coming>.fx-learning-side{grid-column:2;grid-row:1}',
 '.fx-learning-coming>#studyFlashLibraryRepair{grid-column:1/-1;grid-row:2;margin-top:0}',
 '.fx-learning-actions .fx-btn{width:100%;justify-content:center}',
 '.fx-library-section{margin-top:18px}',
 '.fx-library-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:0 2px 10px}',
 '.fx-library-head h3{margin:4px 0 0}',
 '.fx-library-head small{color:#7a879a}',
 '.fx-flash-library .fx-card{border-color:#dce4f2}',
 '.fx-flash-row{background:linear-gradient(135deg,#fbfdff 0%,#f2f5ff 100%)!important}',
 '.fx-flash-row>span:first-child{width:44px;height:44px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(145deg,#e7edff,#f6f8ff);font-size:24px}',
 '.fx-flashcard-card,.fx-content button[data-flip-card]:first-child{position:relative!important;overflow:hidden!important;min-height:360px!important;border:1px solid #cfd8ff!important;border-radius:28px!important;background:linear-gradient(145deg,#eef0ff 0%,#f9fbff 50%,#f0f4ff 100%)!important;color:#1c2a59!important;box-shadow:0 18px 40px rgba(47,72,150,.10)!important;transition:transform .18s ease,box-shadow .18s ease,background .2s ease!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:34px 28px!important;cursor:pointer!important;touch-action:manipulation!important}',
 '.fx-flashcard-card:hover,.fx-content button[data-flip-card]:first-child:hover{transform:translateY(-2px);box-shadow:0 24px 50px rgba(47,72,150,.16)!important}',
 '.fx-content .fx-flashcard-card.is-back{background:linear-gradient(145deg,#f5f8ff 0%,#edf5ff 100%)!important;border-color:#b9cff8!important}',
 '.fx-flashcard-card:active,.fx-content button[data-flip-card]:first-child:active{transform:scale(.992)}',
 '.fx-flashcard-card>small,.fx-content button[data-flip-card]:first-child>small{font-size:12px!important;letter-spacing:2px!important;font-weight:800!important;color:#5870c9!important;margin:0!important}',
 '.fx-flashcard-card>div,.fx-content button[data-flip-card]:first-child>div{font-size:42px!important;line-height:1.18!important;font-weight:800!important;margin:22px 0 8px!important;color:#17275c!important}',
 '.fx-flashcard-card .muted,.fx-content button[data-flip-card]:first-child .muted{font-size:20px!important;line-height:1.5!important;color:#73809a!important}',
 '.fx-flashcard-card .muted:last-child,.fx-content button[data-flip-card]:first-child .muted:last-child{font-size:15px!important;margin-top:28px!important;color:#6c7890!important}',
 '.fx-flash-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}',
 '.fx-flash-meta span{display:inline-flex;align-items:center;padding:8px 14px;border-radius:999px;background:#eef2ff;color:#4558b7;font-weight:800}',
 '.fx-flash-meta b{font-size:13px;color:#64718a}',
 '.fx-flash-actions,.fx-flash-nav{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}',
 '.fx-flash-actions{margin-top:14px}',
 '.fx-flash-repair-actions{display:flex;justify-content:center;margin-top:14px}',
 '.fx-flash-nav{margin-top:10px}',
 '.fx-flash-dots{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:16px}',
 '.fx-flash-dots i{width:11px;height:11px;border-radius:50%;background:#d9e1f1;display:block;transition:transform .15s ease,background .15s ease}',
 '.fx-flash-dots i.active{background:#5d66e8;transform:scale(1.15)}',
 '@media(max-width:700px){.fx-learning-coming{grid-template-columns:1fr!important}.fx-learning-coming>.fx-learning-main{grid-column:1!important;grid-row:1!important}.fx-learning-coming>#studyFlashLibraryRepair{grid-column:1!important;grid-row:2!important}.fx-learning-coming>.fx-learning-side{grid-column:1!important;grid-row:3!important}.fx-learning-actions{grid-template-columns:1fr}.fx-library-head{align-items:flex-start;flex-direction:column}.fx-flashcard-card,.fx-content button[data-flip-card]:first-child{min-height:330px!important;padding:28px 20px!important}.fx-flashcard-card>div,.fx-content button[data-flip-card]:first-child>div{font-size:34px!important}.fx-flashcard-card .muted,.fx-content button[data-flip-card]:first-child .muted{font-size:17px!important}}'
 ].join('');
 document.head.appendChild(s);
}
async function getFlashcards(){
 try{
  const r=await fetch(SUPABASE_URL+'/rest/v1/exams?select=id,title,subject,difficulty,duration,question_count,flashcard_only,status,created_at&status=eq.active&flashcard_only=eq.true&order=created_at.desc&limit=100',{method:'GET',cache:'no-store',headers:{Accept:'application/json',apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});
  const d=await r.json().catch(()=>[]);
  return r.ok&&Array.isArray(d)?d:[];
 }catch(_){return []}
}
async function openFlashcard(id){
 try{
  const r=await fetch(SUPABASE_URL+'/rest/v1/exams?select=*&id=eq.'+encodeURIComponent(id)+'&status=eq.active&flashcard_only=eq.true&limit=1',{method:'GET',cache:'no-store',headers:{Accept:'application/json',apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});
  const d=await r.json().catch(()=>[]);
  const e=Array.isArray(d)?d[0]:null;
  if(!e||!Array.isArray(e.questions)||!e.questions.length){alert('Bộ Flashcard này chưa có dữ liệu thẻ.');return}
  if(!window.state)return;
  window.state.flashcardExam=e;window.state.flashIndex=0;window.state.flashFlipped=false;window.state.page='flashcard';
  (window.__studyThFinalRender||window.render||function(){})();
 }catch(err){alert(String(err&&err.message||err||'Không mở được Flashcard.'))}
}
async function repairTests(){
 const root=document.getElementById('app');if(!root||!root.querySelector('.fx-test-count'))return;
 if(root.querySelector('#studyFlashLibraryRepair')||root.dataset.flashRepairBusy==='1')return;
 root.dataset.flashRepairBusy='1';
 const cards=await getFlashcards();
 const rows=root.querySelectorAll('[data-exam]');
 // Correct visible counts even when the main library intentionally stores lightweight metadata.
 const examRows=root.querySelectorAll('[data-exam]');
 for(const b of examRows){const row=b.closest('.fx-exam-row');if(!row)continue;const small=row.querySelector('small');if(!small)continue;if(/·\s*0\s*câu\s*·/.test(small.textContent)){
  try{
   const rr=await fetch(SUPABASE_URL+'/rest/v1/exams?select=question_count&id=eq.'+encodeURIComponent(b.getAttribute('data-exam'))+'&limit=1',{method:'GET',cache:'no-store',headers:{Accept:'application/json',apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});const dd=await rr.json().catch(()=>[]);const n=Array.isArray(dd)&&dd[0]?Number(dd[0].question_count||0):0;if(n)small.textContent=small.textContent.replace(/·\s*0\s*câu\s*·/,'· '+n+' câu ·');
  }catch(_){}
 }}
 if(!cards.length){root.dataset.flashRepairBusy='0';return;}
 const section=document.createElement('section');section.id='studyFlashLibraryRepair';section.className='fx-library-section fx-flash-library';
 section.innerHTML='<div class="fx-library-head"><div><span class="fx-eyebrow">FLASHCARD</span><h3>'+cards.length+' bộ Flashcard</h3></div><button type="button" class="fx-link-btn" data-flash-repair-learning>Vào Học tập →</button></div><article class="fx-card fx-pad"><div class="fx-exams">'+cards.map(function(e){return '<div class="fx-exam-row fx-flash-row"><span>📚</span><div><b>'+esc0(e.title||'Flashcard')+'</b><small>'+esc0(e.subject||'')+' · '+Number(e.question_count||0)+' thẻ · '+esc0(e.difficulty||'')+'</small></div><button type="button" class="fx-btn fx-primary" data-flash-repair="'+esc0(e.id)+'">Học ngay</button></div>'}).join('')+'</div></article>';
 const host=root.querySelector('#fxExamList')?.closest('.fx-card')?.parentElement||root.querySelector('.fx-content')||root;
 host.appendChild(section);
 section.querySelectorAll('[data-flash-repair]').forEach(b=>b.onclick=function(e){e.preventDefault();e.stopPropagation();openFlashcard(b.getAttribute('data-flash-repair'))});
 section.querySelector('[data-flash-repair-learning]')?.addEventListener('click',function(){window.studentGoV2?window.studentGoV2('learning'):window.go&&window.go('learning')});
 root.dataset.flashRepairBusy='0';
}
function esc0(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c})}
function repairLearning(){
 const root=document.getElementById('app');if(!root)return;
 const card=root.querySelector('.fx-learning-main');if(!card)return;
 const coming=root.querySelector('.fx-learning-coming');
 let saved=root.querySelector('#studyFlashLibraryRepair');
 if(!saved&&coming&&coming.nextElementSibling?.matches('.fx-card.fx-pad')&&coming.nextElementSibling.querySelector('[data-flashcard]')){saved=coming.nextElementSibling;saved.id='studyFlashLibraryRepair'}
 if(coming&&saved&&saved.parentElement!==coming)coming.appendChild(saved);
 const row=root.querySelector('.fx-exam-row [data-flashcard]')?.closest('.fx-exam-row');
 const primary=card.querySelector('.fx-learning-actions .fx-primary');const secondary=card.querySelector('.fx-learning-actions .fx-secondary');
 if(row&&primary){const src=row.querySelector('[data-flashcard]');primary.removeAttribute('data-nav');primary.onclick=function(e){e.preventDefault();e.stopPropagation();src.click()};primary.textContent='Học Flashcard →'}
 if(secondary){secondary.setAttribute('data-nav','tests');secondary.onclick=function(e){e.preventDefault();e.stopPropagation();window.studentGoV2?window.studentGoV2('tests'):window.go&&window.go('tests')};secondary.textContent='Xem bài kiểm tra →'}
}
function repairFlashInteractions(){
 document.addEventListener('click',function(e){
  const flip=e.target.closest&&e.target.closest('[data-flip-card]');
  if(flip){e.preventDefault();e.stopImmediatePropagation();if(window.state){window.state.flashFlipped=!window.state.flashFlipped;(window.__studyThFinalRender||window.render||function(){})();}return}
 },true);
}
function repairFlashcardPage(){
 const root=document.getElementById('app');if(!root)return;
 const card=root.querySelector('button[data-flip-card]');if(!card)return;
 if(!root.querySelector('[data-flip-extra]')){
  const wrap=document.createElement('div');wrap.setAttribute('data-flip-extra','1');wrap.className='fx-flash-repair-actions';
  const b=document.createElement('button');b.type='button';b.className='fx-btn fx-secondary';b.setAttribute('data-flip-card','repair');b.textContent='↻ Lật thẻ';
  wrap.appendChild(b);card.parentElement?.insertBefore(wrap,card.nextElementSibling||null);
 }
}
function run(){style();repairLearning();repairFlashcardPage();const p=new MutationObserver(function(){repairLearning();repairFlashcardPage();const r=document.getElementById('app');if(r&&r.querySelector('.fx-test-count'))repairTests()});const root=document.getElementById('app');if(root)p.observe(root,{childList:true,subtree:true});repairTests();repairFlashInteractions()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();