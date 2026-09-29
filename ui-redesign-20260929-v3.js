/* STUDY TH UI v3 — working global search + profile panel */
(function(){
'use strict';
if(window.__studyUiV3)return;window.__studyUiV3=true;
function S(){return window.state||null}
function A(){return document.getElementById('app')}
function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function sess(){try{return JSON.parse(localStorage.getItem('study_student_session_v3')||'null')}catch(_){return null}}
function user(){return sess()?.candidate||S()?.candidate||localStorage.getItem('study_candidate')||'Người học'}
function code(){return sess()?.code||S()?.code||localStorage.getItem('study_code')||'Chưa có mã'}
function getStats(){var h=Array.isArray(S()?.history)?S().history:[],scores=h.map(function(x){return Number(x.score||0)}).filter(Number.isFinite);return {count:h.length,avg:scores.length?Math.round(scores.reduce(function(a,b){return a+b},0)/scores.length):0,best:scores.length?Math.max.apply(Math,scores):0}}
function allExams(){return Array.isArray(window.exams)?window.exams:[]}

function profileModal(){
 var st=getStats(),el=document.createElement('div');el.className='v3-profile-overlay';el.id='v3ProfileOverlay';
 el.innerHTML='<section class="v3-profile-card" role="dialog" aria-modal="true" aria-label="Hồ sơ cá nhân"><header class="v3-profile-head"><span class="v3-profile-avatar">'+esc((user()||'U').slice(0,1).toUpperCase())+'</span><div><b>'+esc(user())+'</b><small>Hồ sơ học tập cá nhân</small></div><button class="v3-profile-close" onclick="closeStudentProfile()">×</button></header><div class="v3-profile-body"><div class="v3-profile-row"><span>Họ và tên</span><b>'+esc(user())+'</b></div><div class="v3-profile-row"><span>Mã học sinh</span><b>'+esc(code())+'</b></div><div class="v3-profile-row"><span>Bài đã làm</span><b>'+st.count+'</b></div><div class="v3-profile-row"><span>Điểm trung bình</span><b>'+st.avg+'%</b></div><div class="v3-profile-row"><span>Điểm cao nhất</span><b>'+st.best+'%</b></div><div class="v3-profile-row"><span>Trạng thái</span><b style="color:#25a67f">● Đang hoạt động</b></div></div><div class="v3-profile-actions"><button class="rt-button secondary" onclick="studentGoV2(\'settings\');closeStudentProfile()">Chỉnh hồ sơ</button><button class="rt-button light" onclick="closeStudentProfile()">Đóng</button></div></section>';
 el.addEventListener('click',function(e){if(e.target===el)closeStudentProfile()});
 document.body.appendChild(el);
}
function openStudentProfile(){closeStudentProfile();profileModal()}
function closeStudentProfile(){var x=document.getElementById('v3ProfileOverlay');if(x)x.remove()}

function searchResults(q){
 q=String(q||'').trim().toLowerCase();if(!q)return [];
 var out=[],seen={};
 allExams().forEach(function(e){
   var hay=(String(e.title||'')+' '+String(e.subject||'')+' '+String(e.difficulty||'')).toLowerCase();
   if(hay.includes(q)&&!seen['e'+e.id]){seen['e'+e.id]=1;out.push({kind:'exam',ico:'📝',title:e.title||'Bài kiểm tra',meta:String(e.subject||'')+' · '+(Array.isArray(e.questions)?e.questions.length:(e.question_count||0))+' câu',exam:e})}
 });
 [['home','⌂','Trang chủ','Tổng quan học tập'],['learning','📖','Học tập','Chọn môn và tạo đề'],['tests','📝','Thi thử','Thư viện bài kiểm tra'],['ai','🤖','AI trợ lý','Giải đáp và gợi ý'],['history','🕘','Lịch sử','Các lượt làm bài'],['stats','📊','Thống kê','Theo dõi tiến bộ'],['achievements','🏆','Thành tích','Các mốc đã đạt'],['support','💬','Hỗ trợ','Liên hệ hỗ trợ'],['settings','⚙','Cài đặt','Hồ sơ và tuỳ chọn']].forEach(function(x){if((x[2]+' '+x[3]).toLowerCase().includes(q))out.push({kind:'page',ico:x[1],title:x[2],meta:x[3],page:x[0]})});
 return out.slice(0,8)
}
function renderSearch(){
 var input=document.getElementById('v2GlobalSearch');if(!input)return;
 var holder=input.parentElement,res=document.getElementById('v3SearchResults');
 if(!res){res=document.createElement('div');res.id='v3SearchResults';res.className='v3-search-results';holder.appendChild(res)}
 var q=input.value,rows=searchResults(q);
 if(!q.trim()){res.classList.remove('open');res.innerHTML='';return}
 res.innerHTML=rows.length?rows.map(function(x,i){return '<button class="v3-search-result" data-result="'+i+'"><span class="ico">'+x.ico+'</span><span><b>'+esc(x.title)+'</b><small>'+esc(x.meta)+'</small></span></button>'}).join(''):'<div class="v3-search-empty">Không tìm thấy nội dung phù hợp.</div>';
 res.classList.add('open');
 res.querySelectorAll('.v3-search-result').forEach(function(b,i){b.onclick=function(){var x=rows[i];if(x.kind==='exam'){if(typeof window.startPractice==='function'){window.startPractice(x.exam)}else if(typeof window.startExam==='function'){window.startExam(x.exam.id)}else{S().page='tests';window.render();setTimeout(function(){document.getElementById('v3SearchResults')?.classList.remove('open')},0)}}else{studentGoV2(x.page)}input.value='';res.classList.remove('open')}})
}
function enhanceSearch(){
 var input=document.getElementById('v2GlobalSearch');if(!input||input.dataset.v3)return;
 input.dataset.v3='1';input.removeAttribute('oninput');input.addEventListener('input',renderSearch);input.addEventListener('keydown',function(e){if(e.key==='Escape'){input.value='';renderSearch()}if(e.key==='Enter'){var first=document.querySelector('#v3SearchResults .v3-search-result');if(first)first.click()}});
 document.addEventListener('click',function(e){var box=document.getElementById('v3SearchResults');if(box&&box.classList.contains('open')&&!input.parentElement.contains(e.target))box.classList.remove('open')},{capture:true});
}
function enhanceProfile(){
 var old=document.querySelector('.student-user-v2');if(!old||old.dataset.v3)return;
 old.dataset.v3='1';var b=document.createElement('button');b.type='button';b.className='v3-profile-trigger';b.innerHTML=old.innerHTML;b.title='Hồ sơ cá nhân';b.onclick=openStudentProfile;old.replaceWith(b)
}
function patchRender(){
 if(window.__studyV3RenderPatched)return;
 var tries=0;
 function patch(){
   if(typeof window.render!=='function'){if(++tries<20)setTimeout(patch,100);return}
   var old=window.render;window.render=async function(){var r=await old.apply(this,arguments);setTimeout(function(){enhanceSearch();enhanceProfile()},0);return r};
   window.__studyV3RenderPatched=true;enhanceSearch();enhanceProfile();
 }
 patch();
}
window.openStudentProfile=openStudentProfile;window.closeStudentProfile=closeStudentProfile;
function boot(){patchRender();setTimeout(function(){enhanceSearch();enhanceProfile()},250);setTimeout(function(){enhanceSearch();enhanceProfile()},900);setTimeout(function(){enhanceSearch();enhanceProfile()},1800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()
})();