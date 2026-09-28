
(function(){
'use strict';
if(window.__studyUserSidebarUpdate20260929)return;
window.__studyUserSidebarUpdate20260929=true;
const SESSION_KEY='study_student_session_v3';
function S(){return window.state||null}
function A(){return document.getElementById('app')}
function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function sess(){try{var x=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');return x&&x.candidate?x:null}catch(_){return null}}
function has(){return !!sess()}
function name(){return sess()?.candidate||S()?.candidate||localStorage.getItem('study_candidate')||''}
function code(){return sess()?.code||S()?.code||localStorage.getItem('study_code')||''}
function save(n,c){var x={candidate:String(n||'').trim(),code:String(c||'').trim(),at:new Date().toISOString()};localStorage.setItem(SESSION_KEY,JSON.stringify(x));localStorage.setItem('study_candidate',x.candidate);localStorage.setItem('study_code',x.code);if(S()){S().candidate=x.candidate;S().code=x.code}}
function clear(){localStorage.removeItem(SESSION_KEY);localStorage.removeItem('study_candidate');localStorage.removeItem('study_code')}
function ready(){document.body.classList.remove('redesign-pending');document.body.classList.add('redesign-ready')}
function landing(){
return '<main class="rt-public-page"><header class="rt-public-header"><button class="rt-brand" type="button" onclick="studentUi(\'landing\')"><span class="rt-brand-mark">🎓</span><span>STUDY TH</span></button><button class="rt-button primary" type="button" onclick="studentUi(\'login\')">Đăng nhập →</button></header><section class="rt-public-hero"><div class="rt-public-copy"><span class="rt-page-eyebrow">HỌC TẬP THÔNG MINH · STUDY TH</span><h1>Học dễ hơn.<br><span>Hiệu quả hơn.</span><br>Vui hơn mỗi ngày.</h1><p>Một không gian học tập gọn gàng để làm bài, theo dõi kết quả, xem lịch sử và nhận hỗ trợ khi cần.</p><div class="rt-landing-cta"><button class="rt-button primary" type="button" onclick="studentUi(\'login\')">Bắt đầu học →</button><button class="rt-button secondary" type="button" onclick="studentUi(\'login\')">Đăng nhập</button></div></div><div class="rt-public-preview"><div class="rt-public-preview-top"><b>STUDY TH</b><span>● Sẵn sàng</span></div><div class="rt-public-preview-card"><small>BẢNG HỌC TẬP</small><b>Không gian học tập của bạn</b><div class="rt-preview-lines"><i></i><i></i><i></i></div></div><div class="rt-public-preview-grid"><span>📚<b>Thi thử</b></span><span>🤖<b>AI trợ lý</b></span><span>📊<b>Thống kê</b></span><span>🕘<b>Lịch sử</b></span></div></div></section></main>';
}
function login(){
return '<main class="rt-login-shell"><section class="rt-login-frame"><aside class="rt-login-brand-side"><button class="rt-brand rt-login-brand" type="button" onclick="studentUi(\'landing\')"><span class="rt-brand-mark">🎓</span><span>STUDY TH</span></button><div><span class="rt-page-eyebrow">STUDY TH</span><h1>Chào mừng bạn quay lại.</h1><p>Đăng nhập để vào không gian học tập cá nhân và sử dụng các chức năng hiện có của STUDY TH.</p><div class="rt-login-points"><span>✓ Làm bài kiểm tra</span><span>✓ Xem lịch sử bài làm</span><span>✓ Nhận hỗ trợ học tập</span></div></div></aside><section class="rt-login-form-side"><form class="rt-login-card" id="studentLoginForm"><span class="rt-page-eyebrow">ĐĂNG NHẬP</span><h2>Tiếp tục học tập</h2><p>Nhập thông tin của bạn để vào giao diện học tập.</p><div class="rt-form-group"><label for="studentLoginName">Họ và tên</label><input class="rt-input" id="studentLoginName" autocomplete="name" placeholder="Ví dụ: Nguyễn Văn A" value="'+esc(name())+'"></div><div class="rt-form-group"><label for="studentLoginCode">Mã học sinh <span class="muted">(không bắt buộc)</span></label><input class="rt-input" id="studentLoginCode" autocomplete="username" placeholder="HS001" value="'+esc(code())+'"></div><div id="studentLoginError" class="login-error"></div><button class="rt-button primary" style="width:100%" type="submit">Đăng nhập →</button><button class="rt-ghost-link" style="width:100%;margin-top:8px" type="button" onclick="studentUi(\'landing\')">← Quay lại trang chủ</button></form></section></section></main>';
}
function active(p){return S()?.page===p?'active':''}
function sidebar(){
return '<aside class="student-sidebar" id="studentSidebar"><div class="student-sidebar-top"><button class="student-brand" type="button" onclick="studentGo(\'home\')"><span class="student-brand-orb">🎓</span><span class="student-brand-text"><b>STUDY</b><small>User Center</small></span></button><button class="student-theme-btn" type="button" onclick="toggleStudentTheme()">◐</button></div><div class="student-profile"><span class="student-online-dot"></span><div><b>'+esc(name())+'</b><small>'+esc(code()||'Phiên học tập')+'</small></div></div><nav class="student-nav"><button class="student-nav-item '+active('home')+'" onclick="studentGo(\'home\')">⌂ <span>Trang chủ</span></button><button class="student-nav-item" onclick="studentGo(\'tests\')">📝 <span>Thi thử</span></button><button class="student-nav-item '+active('history')+'" onclick="studentGo(\'history\')">🕘 <span>Lịch sử</span></button><button class="student-nav-item '+active('support')+'" onclick="studentGo(\'support\')">💬 <span>Hỗ trợ</span></button><button class="student-nav-item '+active('ai')+'" onclick="studentGo(\'ai\')">🤖 <span>AI trợ lý</span></button></nav><div class="student-sidebar-bottom"><button class="student-nav-item" onclick="location.href=\'/admin/\'">⚑ <span>Admin</span><small>↗</small></button><button class="student-nav-item danger" onclick="studentLogout()">⇥ <span>Đăng xuất</span></button></div></aside>';
}
function topbar(){
var titles={home:'Trang chủ',subject:'Bài kiểm tra',exam:'Làm bài kiểm tra',result:'Kết quả',history:'Lịch sử làm bài',review:'Ôn câu sai',support:'Hỗ trợ trực tiếp',ai:'AI trợ lý'};
return '<header class="student-topbar"><div class="student-top-left"><button class="student-mobile-menu" onclick="toggleStudentSidebar()">☰</button><div><span class="rt-page-eyebrow">STUDY TH</span><h1>'+esc(titles[S()?.page]||'Học tập')+'</h1></div></div><div class="student-top-actions"><button class="student-top-icon" onclick="toggleStudentTheme()">◐</button><span class="student-user-chip"><i>'+esc((name()||'U').slice(0,1).toUpperCase())+'</i><b>'+esc(name()||'Người học')+'</b></span></div></header>';
}
function content(){
var s=S();if(!s)return '';
if(s.page==='tests'){s.page='home';var h=typeof window.page==='function'?window.page():'';s.page='tests';return h+'<div class="student-route-note">Bấm một môn học để chọn bài kiểm tra.</div>'}
if(s.page==='ai'){s.page='support';var a=typeof window.page==='function'?window.page():'';s.page='ai';return a}
return typeof window.page==='function'?window.page():'';
}
async function render(){
var s=S(),root=A();if(!s||!root)return;
if(!has()){if(s.page!=='login'&&s.page!=='landing')s.page='landing';root.innerHTML=s.page==='login'?login():landing();ready();bindLogin();return}
if(s.page==='landing'||s.page==='login')s.page='home';
root.innerHTML='<div class="student-app-shell">'+sidebar()+'<main class="student-workspace">'+topbar()+'<section class="student-workspace-content">'+content()+'</section></main><div class="student-sidebar-backdrop" onclick="toggleStudentSidebar()"></div></div>';
ready();
if(s.page==='support'&&typeof window.startSupportLive==='function'){try{await window.startSupportLive()}catch(_){}}
if(s.page==='ai'){setTimeout(function(){if(typeof window.openSupportAI==='function')window.openSupportAI()},80)}
if(s.page==='exam'&&typeof window.updateTimer==='function')setTimeout(window.updateTimer,0);
}
function bindLogin(){
var f=document.getElementById('studentLoginForm');if(!f||f.dataset.bound)return;f.dataset.bound='1';
f.addEventListener('submit',async function(e){e.preventDefault();var n=document.getElementById('studentLoginName')?.value.trim(),c=document.getElementById('studentLoginCode')?.value.trim(),m=document.getElementById('studentLoginError');if(!n){if(m)m.textContent='Hãy nhập họ và tên.';return}save(n,c);S().page='home';try{if(typeof window.loadExams==='function')await window.loadExams();if(typeof window.loadHistory==='function')await window.loadHistory()}catch(_){}await render()});
}
function toggleStudentSidebar(){var x=document.getElementById('studentSidebar');if(!x)return;x.classList.toggle('open');document.body.classList.toggle('student-menu-open',x.classList.contains('open'))}
function closeMenu(){var x=document.getElementById('studentSidebar');if(x)x.classList.remove('open');document.body.classList.remove('student-menu-open')}
function toggleStudentTheme(){var d=!document.body.classList.contains('study-dark');document.body.classList.toggle('study-dark',d);localStorage.setItem('study_public_theme',d?'dark':'light')}
async function go(p){
var s=S();if(!s)return;
if(p==='tests'){s.page='home';await render();setTimeout(function(){document.getElementById('home-subjects')?.scrollIntoView({behavior:'smooth',block:'start'})},80)}
else if(p==='ai'){s.page='ai';await render()}
else{s.page=p;if(p==='history'&&typeof window.loadHistory==='function')try{await window.loadHistory()}catch(_){}if(p==='home'&&typeof window.loadExams==='function')try{await window.loadExams()}catch(_){}await render()}
closeMenu();
}
function logout(){try{if(typeof window.stopSupportLive==='function')window.stopSupportLive()}catch(_){}clear();if(S())S().page='landing';render()}
async function ui(p){if(!S())return;if(p==='login'||p==='landing'){S().page=p;return render()}return go(p)}
function install(){
if(!S())return;
document.body.classList.toggle('study-dark',localStorage.getItem('study_public_theme')==='dark');
window.studentUi=ui;window.studentGo=go;window.studentLogout=logout;window.toggleStudentSidebar=toggleStudentSidebar;window.toggleStudentTheme=toggleStudentTheme;window.render=render;
if(!has())S().page=(S().page==='login'?'login':'landing');else{S().candidate=name();S().code=code();if(S().page==='landing'||S().page==='login')S().page='home'}
render();
}
function boot(){
if(window.__studyAppReady)install();else window.addEventListener('study-app-loaded',function(){setTimeout(install,0)},{once:false});
[200,700,1500,3000].forEach(function(ms){setTimeout(function(){if(window.state)install()},ms)});
window.addEventListener('load',function(){setTimeout(function(){if(window.state)install()},300)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();