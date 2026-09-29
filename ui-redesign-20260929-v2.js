
(function(){
'use strict';
if(window.__studyUiV2)return; window.__studyUiV2=true;
var KEY='study_student_session_v3';

function S(){return window.state||null}
function A(){return document.getElementById('app')}
function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function session(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&v.candidate)return v;var legacy=localStorage.getItem('study_candidate');if(legacy)return {candidate:legacy,code:localStorage.getItem('study_code')||'',legacy:true};return null}catch(_){return null}}
function has(){return !!session()}
function user(){return session()?.candidate||S()?.candidate||localStorage.getItem('study_candidate')||'Người học'}
function code(){return session()?.code||S()?.code||localStorage.getItem('study_code')||''}
function storeUser(n,c){var v={candidate:n,code:c,at:new Date().toISOString()};localStorage.setItem(KEY,JSON.stringify(v));localStorage.setItem('study_candidate',n);localStorage.setItem('study_code',c);if(S()){S().candidate=n;S().code=c}}

function stats(){
 var h=Array.isArray(S()?.history)?S().history:[], scores=h.map(function(x){return Number(x.score||0)}).filter(Number.isFinite);
 var avg=scores.length?Math.round(scores.reduce(function(a,b){return a+b},0)/scores.length):0;
 var best=scores.length?Math.max.apply(Math,scores):0;
 var secs=h.reduce(function(a,x){return a+Number(x.duration_seconds||x.timeSec||0)},0);
 var days={};h.forEach(function(x){if(x.created_at)days[new Date(x.created_at).toLocaleDateString('sv-VN')]=1});
 var streak=0,d=new Date();for(var i=0;i<365;i++){var k=new Date(d.getTime()-i*86400000).toLocaleDateString('sv-VN');if(days[k])streak++;else if(i)break}
 var recent7=h.filter(function(x){return x.created_at&&Date.now()-new Date(x.created_at).getTime()<=7*86400000}).length;
 return {h:h,scores:scores,avg:avg,best:best,hours:secs/3600,streak:streak,recent7:recent7}
}
function subjects(){
 var ex=Array.isArray(window.exams)?window.exams:[],names=[];
 ex.forEach(function(e){var s=String(e.subject||'').trim();if(s&&!names.includes(s))names.push(s)});
 ['Toán','Tiếng Anh','Ngữ Văn'].forEach(function(s){if(!names.includes(s))names.push(s)});
 var icons={'Toán':'📐','Tiếng Anh':'🇬🇧','Ngữ Văn':'📖','Vật lý':'⚛️','Hóa học':'🧪','Sinh học':'🧬'};
 return names.slice(0,6).map(function(s){return {name:s,icon:icons[s]||'📚',count:ex.filter(function(e){return String(e.subject||'')===s}).length}});
}
function pageTitle(){var p=S()?.page;return {home:'Trang chủ',subject:'Học tập',exam:'Làm bài kiểm tra',result:'Kết quả',history:'Lịch sử',review:'Ôn câu sai',support:'Hỗ trợ',ai:'AI trợ lý',stats:'Thống kê',achievements:'Thành tích',settings:'Cài đặt',tests:'Thi thử'}[p]||'Học tập'}

function loginHtml(){
 return '<main class="rt-login-shell"><section class="rt-login-frame"><aside class="rt-login-brand-side"><button class="rt-brand rt-login-brand" onclick="studentUiV2(\'landing\')"><span class="rt-brand-mark">🎓</span><span>STUDY TH</span></button><div><span class="rt-page-eyebrow">STUDY TH</span><h1>Chào mừng bạn quay lại.</h1><p>Một không gian học tập được tổ chức gọn gàng để bạn học, làm bài và theo dõi tiến độ.</p><div class="rt-login-points"><span>✓ Thi thử và luyện tập</span><span>✓ AI trợ lý học tập</span><span>✓ Lịch sử và thống kê</span></div></div></aside><section class="rt-login-form-side"><form class="rt-login-card" id="studentLoginFormV2"><span class="rt-page-eyebrow">ĐĂNG NHẬP</span><h2>Tiếp tục học tập</h2><p>Nhập thông tin để vào trang học tập cá nhân.</p><div class="rt-form-group"><label>Họ và tên</label><input class="rt-input" id="v2LoginName" placeholder="Ví dụ: Nguyễn Văn A" value="'+esc(user()==='Người học'?'':user())+'"></div><div class="rt-form-group"><label>Mã học sinh <span class="muted">(không bắt buộc)</span></label><input class="rt-input" id="v2LoginCode" placeholder="HS001" value="'+esc(code())+'"></div><div id="v2LoginError" class="login-error"></div><button class="rt-button primary" style="width:100%" type="submit">Đăng nhập →</button><button class="rt-ghost-link" style="width:100%;margin-top:8px" type="button" onclick="studentUiV2(\'landing\')">← Trang chủ</button></form></section></section></main>'
}
function landingHtml(){
 return '<main class="rt-public-page"><header class="rt-public-header"><button class="rt-brand" onclick="studentUiV2(\'landing\')"><span class="rt-brand-mark">🎓</span><span>STUDY TH</span></button><button class="rt-button primary" onclick="studentUiV2(\'login\')">Đăng nhập →</button></header><section class="rt-public-hero"><div class="rt-public-copy"><span class="rt-page-eyebrow">HỌC TẬP THÔNG MINH · STUDY TH</span><h1>Học dễ hơn.<br><span>Hiệu quả hơn.</span><br>Vui hơn mỗi ngày.</h1><p>Một hệ thống học tập hiện đại giúp bạn làm bài, xem lại kết quả và nhận hỗ trợ khi cần — trên máy tính, máy tính bảng và điện thoại.</p><div class="rt-landing-cta"><button class="rt-button primary" onclick="studentUiV2(\'login\')">Bắt đầu ngay →</button><button class="rt-button secondary" onclick="studentUiV2(\'login\')">Đăng nhập</button></div></div><div class="rt-public-preview"><div class="rt-public-preview-top"><b>STUDY TH</b><span>● Sẵn sàng</span></div><div class="rt-public-preview-card"><small>BẢNG HỌC TẬP</small><b>Không gian học tập cá nhân</b><div class="rt-preview-lines"><i></i><i></i><i></i></div></div><div class="rt-public-preview-grid"><span>📚<b>Thi thử</b></span><span>🤖<b>AI trợ lý</b></span><span>📊<b>Thống kê</b></span><span>🕘<b>Lịch sử</b></span></div></div></section></main>'
}

function sidebar(){
 var p=S()?.page||'home';
 function item(key,ico,label,extra){return '<button class="student-nav-item-v2 '+(p===key?'active':'')+'" onclick="studentGoV2(\''+key+'\')"><span class="ico">'+ico+'</span><span>'+label+'</span>'+(extra||'')+'</button>'}
 return '<aside class="student-sidebar-v2" id="studentSidebarV2"><button class="student-brand-v2" onclick="studentGoV2(\'home\')"><span class="mark">🎓</span><span><b>STUDY TH</b><small>User Center</small></span></button><button class="student-theme-v2" onclick="toggleV2Theme()">◐</button><div class="student-profile-v2"><span class="online"></span><div><b>'+esc(user())+'</b><small>'+(esc(code())||'Phiên học tập')+'</small></div></div><div class="student-nav-title-v2">Học tập</div><nav class="student-nav-v2">'+item('home','⌂','Trang chủ')+item('learning','📖','Học tập')+item('tests','📝','Thi thử')+item('ai','🤖','AI trợ lý')+item('history','🕘','Lịch sử')+item('stats','📊','Thống kê')+item('achievements','🏆','Thành tích')+'</nav><div class="student-nav-title-v2">Hệ thống</div><nav class="student-nav-v2">'+item('support','💬','Hỗ trợ')+item('settings','⚙','Cài đặt')+'<button class="student-nav-item-v2" onclick="location.href=\'/admin/\'"><span class="ico">⚑</span><span>Admin</span><small>↗</small></button></nav><div class="student-bottom-v2"><button class="student-nav-item-v2 danger" onclick="logoutV2()"><span class="ico">⇥</span><span>Đăng xuất</span></button></div></aside>'
}
function topbar(){
 return '<header class="student-topbar-v2"><div class="student-top-left-v2"><button class="student-mobile-v2" onclick="toggleStudentSidebarV2()">☰</button><div class="student-title-v2"><span class="kicker">STUDY TH</span><h1>'+pageTitle()+'</h1></div></div><div class="student-top-search-v2"><span>⌕</span><input id="v2GlobalSearch" placeholder="Tìm kiếm chủ đề, bài kiểm tra..." oninput="filterV2Search(this.value)"></div><div class="student-top-actions-v2"><button class="student-top-icon-v2" onclick="toggleV2Theme()">◐</button><span class="student-user-v2"><i>'+esc((user()||'U').slice(0,1).toUpperCase())+'</i><b>'+esc(user())+'</b></span></div></header>'
}
function shell(c){return '<div class="student-app-v2">'+sidebar()+'<main class="student-main-v2">'+topbar()+'<section class="student-content-v2">'+c+'</section></main></div>'}

function dashboard(){
 var st=stats(),h=st.h||[],ex=Array.isArray(window.exams)?window.exams:[],sub=subjects();
 var weekly=h.filter(function(x){return x.created_at&&Date.now()-new Date(x.created_at).getTime()<=7*86400000});
 var activeDays={};weekly.forEach(function(x){activeDays[new Date(x.created_at).toLocaleDateString('sv-VN')]=1});
 var dayCount=Object.keys(activeDays).length;
 var goal=5,pct=Math.min(100,Math.round(weekly.length/goal*100));
 var recentScores=st.scores.slice(-7);
 var subjectData=sub.slice(0,4).map(function(x){
   var rs=h.filter(function(r){var z=ex.find(function(q){return String(q.id)===String(r.exam_id||r.examId)});return z&&String(z.subject||'')===x.name});
   var score=rs.length?Math.round(rs.reduce(function(a,r){return a+Number(r.score||0)},0)/rs.length):null;
   return {name:x.name,icon:x.icon,count:rs.length,score:score};
 });
 return '<div class="v2-dashboard-head"><div><span class="rt-page-eyebrow">TỔNG QUAN</span><h2>Chào buổi tối, '+esc(user())+'! 👋</h2><p>Có gì hôm nay, mình cùng nhìn lại và tiếp tục học nhé.</p></div><div class="v2-dashboard-head-actions"><button class="rt-button secondary" onclick="studentGoV2(\\'learning\\')">Học tập</button><button class="rt-button primary" onclick="studentGoV2(\\'tests\\')">Làm bài →</button></div></div>'+
 '<div class="v2-grid v2-stats">'+
 '<article class="v2-card v2-stat"><span class="v2-stat-icon">📝</span><b>'+h.length+'</b><small>Bài đã làm</small><em>'+(h.length?'+ Cập nhật mới':'Bắt đầu hôm nay')+'</em></article>'+
 '<article class="v2-card v2-stat"><span class="v2-stat-icon">◷</span><b>'+st.hours.toFixed(1)+'h</b><small>Thời gian học</small><em>'+(st.hours?'+ Theo lịch sử':'—')+'</em></article>'+
 '<article class="v2-card v2-stat"><span class="v2-stat-icon">◎</span><b>'+st.avg+'%</b><small>Điểm trung bình</small><em>'+(st.best?'Cao nhất '+st.best+'%':'Chưa có điểm')+'</em></article>'+
 '<article class="v2-card v2-stat"><span class="v2-stat-icon">🔥</span><b>'+st.streak+' ngày</b><small>Chuỗi học tập</small><em>'+(st.streak?'Đang duy trì':'Bắt đầu chuỗi')+'</em></article></div>'+
 '<section class="v2-section"><div class="v2-section-head"><div><span>MÔN HỌC</span><h3>Môn bạn đang học</h3></div><span>'+ex.length+' bài kiểm tra đang có</span></div><div class="v2-subject-ref-grid">'+subjectData.map(function(x,i){var palettes=['mint','blue','purple','orange'];return '<button class="v2-subject-ref '+palettes[i%palettes.length]+'" onclick="chooseSubjectV2(\\''+esc(x.name)+'\\')"><span class="subject-ref-icon">'+x.icon+'</span><span class="subject-ref-copy"><b>'+esc(x.name)+'</b><small>'+(x.count||0)+' lượt đã làm'+(x.score==null?'':' · '+x.score+'% TB')+'</small></span><strong>→</strong></button>'}).join('')+'</div></section>'+
 '<div class="v2-dashboard-main-grid"><article class="v2-card v2-card pad v2-progress-card"><div class="v2-card-head"><div><span class="rt-page-eyebrow">TIẾN ĐỘ TUẦN NÀY</span><h3>Giữ nhịp học đều</h3><p>'+weekly.length+' lượt làm · '+dayCount+' ngày có hoạt động trong 7 ngày qua.</p></div><b class="v2-progress-percent">'+pct+'%</b></div><div class="v2-week-stats"><div><span>Mục tiêu</span><b>'+goal+' lượt</b></div><div><span>Đã đạt</span><b>'+weekly.length+' lượt</b></div><div><span>Còn lại</span><b>'+Math.max(0,goal-weekly.length)+' lượt</b></div></div><div class="v2-progress"><span style="width:'+pct+'%"></span></div></article>'+
 '<article class="v2-card v2-card pad"><div class="v2-card-head"><div><span class="rt-page-eyebrow">ĐIỂM SỐ</span><h3>Xu hướng gần đây</h3><p>'+ (recentScores.length? '7 lượt có điểm gần nhất':'Hoàn thành bài để bắt đầu có dữ liệu') +'</p></div></div><div class="v2-mini-trend">'+(recentScores.length?recentScores.map(function(v){return '<i style="height:'+Math.max(10,Math.min(100,Number(v)))+'%"></i>'}).join(''):'<span class="v2-empty-inline">Chưa có dữ liệu</span>')+'</div></article></div>'+
 '<div class="v2-dashboard-bottom-grid"><article class="v2-card v2-card pad"><div class="v2-card-head"><div><span class="rt-page-eyebrow">HOẠT ĐỘNG</span><h3>Gần đây</h3><p>Những gì bạn vừa hoàn thành.</p></div><button class="home-text-btn" onclick="studentGoV2(\\'history\\')">Xem lịch sử →</button></div>'+(h.length?'<div class="v2-history-list">'+h.slice(0,4).map(function(r){return '<div class="v2-history-row v2-history-row-static"><span class="icon">✓</span><span><b>'+esc(r.exam_title||'Bài kiểm tra')+'</b><small>'+Number(r.correct||0)+'/'+Number(r.total||0)+' câu · '+new Date(r.created_at||Date.now()).toLocaleDateString('vi-VN')+'</small></span><strong>'+Number(r.score||0)+'%</strong></div>'}).join('')+'</div>':'<div class="v2-empty"><span>📘</span><b>Chưa có hoạt động</b><small>Hoàn thành bài đầu tiên để bắt đầu.</small></div>')+'</article>'+
 '<article class="v2-card v2-card pad"><div class="v2-card-head"><div><span class="rt-page-eyebrow">MỤC TIÊU</span><h3>Tập trung hôm nay</h3><p>Một vài con số để bạn dễ theo dõi.</p></div></div><div class="v2-goal-list"><div><span>Điểm cao nhất</span><b>'+st.best+'%</b></div><div><span>Ngày học liên tiếp</span><b>'+st.streak+' ngày</b></div><div><span>Ngày hoạt động tuần</span><b>'+dayCount+'/7</b></div><div><span>Đề đang có</span><b>'+ex.length+'</b></div></div></article></div>';
}
function learningPage(){
 var ex=Array.isArray(window.exams)?window.exams:[],sub=subjects();
 return '<div class="v2-page-head"><div><span class="rt-page-eyebrow">HỌC TẬP</span><h2>Học theo cách của bạn</h2><p>Chọn môn đang học hoặc tạo một bộ câu hỏi từ tài liệu của bạn.</p></div></div><div class="v2-grid v2-learning-layout"><article class="v2-card v2-card pad"><div class="v2-card-head"><div><h3>Chọn môn học</h3><p>Mở nhanh danh sách đề của từng môn.</p></div></div><div class="v2-subject-grid">'+sub.map(function(x){return '<button class="v2-subject" onclick="chooseSubjectV2(\''+esc(x.name)+'\')"><span class="icon">'+x.icon+'</span><span class="grow"><b>'+esc(x.name)+'</b><small>'+x.count+' bài kiểm tra</small></span><strong>→</strong></button>'}).join('')+'</div></article><article class="v2-card v2-card pad"><div class="v2-card-head"><div><h3>✨ Tạo đề từ tài liệu</h3><p>Giao diện mới cho luồng tạo đề hiện có.</p></div></div><div id="v2Drop" class="v2-file-drop"><div class="up">＋</div><b id="v2FileLabel">Kéo file vào đây</b><small>PDF, DOCX, TXT, hình ảnh...</small><input id="v2File" type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv,image/*" hidden><button class="rt-button primary" style="margin-top:11px" onclick="document.getElementById(\'v2File\').click()">Chọn file</button></div><div class="v2-form-grid"><div class="v2-field"><label>Môn học</label><select id="v2Subject"><option>Toán</option><option>Tiếng Anh</option><option>Ngữ Văn</option></select></div><div class="v2-field"><label>Mức độ</label><select id="v2Level"><option>Dễ</option><option selected>Trung bình</option><option>Khó</option></select></div><div class="v2-field"><label>Số câu</label><select id="v2Count"><option>10</option><option selected>20</option><option>30</option></select></div><div class="v2-field"><label>Thời gian</label><input id="v2Duration" type="number" value="45" min="5"></div></div><div class="v2-checks"><label class="v2-check"><input class="v2Type" type="checkbox" value="mcq" checked> Trắc nghiệm</label><label class="v2-check"><input class="v2Type" type="checkbox" value="true_false" checked> Đúng/Sai</label><label class="v2-check"><input class="v2Type" type="checkbox" value="short" checked> Trả lời ngắn</label></div><div id="v2GenMsg" class="v2-route-note" style="margin-top:8px;display:none"></div><button class="rt-button primary" style="width:100%;margin-top:8px" onclick="generateExamV2()">Tạo đề bằng AI ✨</button></article></div><div class="v2-section"><div class="v2-section-head"><div><span>THƯ VIỆN</span><h3>'+ex.length+' đề đang có</h3></div><span>Bắt đầu ngay</span></div><div id="v2Library" class="v2-exam-list">'+ex.slice(0,12).map(examItem).join('')+'</div></div>'
}
function examItem(e){
 var n=Array.isArray(e.questions)?e.questions.length:Number(e.question_count||0);
 return '<div class="v2-exam-item"><span class="icon">📝</span><span class="grow"><b>'+esc(e.title||'Bài kiểm tra')+'</b><small>'+esc(e.subject||'')+' · '+n+' câu · '+Number(e.duration||0)+' phút · '+esc(e.difficulty||'')+'</small></span><button class="rt-button primary" style="padding:8px 11px;font-size:10px" onclick="startExam(\''+esc(e.id)+'\')">Bắt đầu</button></div>'
}
function testsPage(){
 var list=(window.exams||[]).filter(function(e){return !filter||String(e.subject||'')===filter});
 return '<div class="v2-page-head"><div><span class="rt-page-eyebrow">THI THỬ</span><h2>Thư viện bài kiểm tra</h2><p>Tìm đề theo môn, tìm kiếm nhanh và bắt đầu làm bài bằng engine hiện tại.</p></div></div><div class="v2-filter"><button class="'+(!filter?'active':'')+'" onclick="setV2Filter(\'\')">Tất cả</button>'+subjects().map(function(x){return '<button class="'+(filter===x.name?'active':'')+'" onclick="setV2Filter(\''+esc(x.name)+'\')">'+esc(x.name)+'</button>'}).join('')+'</div><article class="v2-card v2-card pad"><div id="v2TestsList" class="v2-exam-list">'+(list.length?list.map(examItem).join(''):'<div class="v2-empty"><span>📝</span><b>Chưa có đề phù hợp</b><small>Thử bộ lọc khác hoặc chọn một môn.</small></div>')+'</div></article>'
}
var filter='';
function setV2Filter(v){filter=v;renderV2()}
function filterV2Search(q){
 var nodes=document.querySelectorAll('#v2TestsList .v2-exam-item,#v2Library .v2-exam-item');
 var s=String(q||'').toLowerCase().trim();
 nodes.forEach(function(n){n.style.display=!s||n.textContent.toLowerCase().includes(s)?'flex':'none'})
}
function aiPage(){
 return '<div class="v2-page-head"><div><span class="rt-page-eyebrow">AI TRỢ LÝ</span><h2>Học cùng trợ lý</h2><p>Giao diện chat mới, dùng API AI hỗ trợ hiện tại của STUDY TH.</p></div></div><section class="v2-card v2-ai"><aside class="v2-ai-side"><h3>AI có thể giúp</h3><div class="v2-ai-tip"><b>💡 Giải thích</b><small>Đi từng bước và nói rõ vì sao.</small></div><div class="v2-ai-tip"><b>🧭 Gợi ý</b><small>Cho hướng giải khi bạn bị kẹt.</small></div><div class="v2-ai-tip"><b>📝 Luyện tập</b><small>Tạo câu tương tự để làm tiếp.</small></div></aside><section class="v2-ai-chat"><div class="v2-ai-head"><div><b>🤖 AI trợ lý học tập</b><small>Luôn sẵn sàng hỗ trợ bạn.</small></div><span style="padding:6px 9px;border-radius:99px;background:#eef8f3;color:#188969;font-size:9px;font-weight:900">● Sẵn sàng</span></div><div class="v2-ai-messages" id="v2AiMessages"><div class="v2-msg bot"><div class="v2-bubble bot">Chào bạn 👋 Bạn có thể gửi bài tập, hỏi khái niệm hoặc nhờ mình gợi ý cách làm.</div></div></div><div class="v2-ai-compose"><textarea id="v2AiInput" placeholder="Nhập câu hỏi của bạn..." rows="2"></textarea><button class="rt-button primary v2-ai-send" onclick="sendAiV2()">➤</button></div></section></section>'
}
async function sendAiV2(){
 var input=document.getElementById('v2AiInput'),box=document.getElementById('v2AiMessages');if(!input||!box)return;var q=input.value.trim();if(!q)return;input.value='';
 var u=document.createElement('div');u.className='v2-msg user';u.innerHTML='<div class="v2-bubble user">'+esc(q)+'</div>';box.appendChild(u);
 var b=document.createElement('div');b.className='v2-msg bot';b.innerHTML='<div class="v2-bubble bot">Đang suy nghĩ…</div>';box.appendChild(b);box.scrollTop=box.scrollHeight;
 try{var r=await fetch('/api/support-ai',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({message:q,subject:S()?.subject||'',history:[]})});var d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||('AI HTTP '+r.status));b.querySelector('.v2-bubble').textContent=String(d.answer||'Mình chưa nhận được câu trả lời.')}catch(e){b.querySelector('.v2-bubble').textContent='Không thể kết nối AI lúc này. '+String(e.message||e)}box.scrollTop=box.scrollHeight
}
function historyV2(){
 var st=stats(),rows=st.h;
 return '<div class="v2-page-head"><div><span class="rt-page-eyebrow">LỊCH SỬ</span><h2>Lịch sử của tôi</h2><p>'+((S()?.historyNeedsNewSession)?'Phiên mới chưa được liên kết với dữ liệu trước đợt nâng cấp bảo mật.':'Các lượt làm bài được lưu theo phiên thiết bị.')+'</p></div><button class="rt-button secondary" onclick="studentGoV2(\'stats\')">Xem thống kê →</button></div><article class="v2-card v2-card pad">'+(rows.length?'<div style="overflow:auto"><table class="v2-table"><thead><tr><th>Thời gian</th><th>Bài kiểm tra</th><th>Kết quả</th><th>Thời gian</th><th></th></tr></thead><tbody>'+rows.map(function(r){return '<tr><td>'+esc(new Date(r.created_at||Date.now()).toLocaleString('vi-VN'))+'</td><td><b>'+esc(r.exam_title||'Bài kiểm tra')+'</b></td><td><b>'+Number(r.score||0)+'%</b><br>'+Number(r.correct||0)+'/'+Number(r.total||0)+' câu</td><td>'+Math.round(Number(r.duration_seconds||r.timeSec||0)/60)+' phút</td><td><button class="rt-button light" style="padding:7px 9px;font-size:9px" onclick="openHistory(\''+esc(r.id)+'\')">Xem</button></td></tr>'}).join('')+'</tbody></table></div>':'<div class="v2-empty"><span>🕘</span><b>Chưa có lượt làm bài</b><small>Sau khi hoàn thành đề, kết quả sẽ xuất hiện ở đây.</small></div>')+'</article>'
}
function statsV2(){
 var st=stats(),vals=st.scores.slice(0,7).reverse(),pts=vals.map(function(v,i){var x=10+(i*(340/Math.max(1,vals.length-1))),y=192-(v/100)*160;return x+','+y}).join(' '),subs=subjects(),ex=Array.isArray(window.exams)?window.exams:[];
 var rows=subs.slice(0,4).map(function(x,i){var rs=st.h.filter(function(r){var e=ex.find(function(z){return String(z.id)===String(r.exam_id||r.examId)});return e&&String(e.subject||'')===x.name});var sc=rs.length?Math.round(rs.reduce(function(a,r){return a+Number(r.score||0)},0)/rs.length):null;return {name:x.name,score:sc,color:['#4169e8','#61a8ee','#7a72e8','#59b990'][i]};});
 var known=rows.filter(function(x){return x.score!=null});var total=known.reduce(function(a,x){return a+x.score},0)||1;var cursor=0;var parts=known.map(function(x){var next=cursor+x.score/total*100,s=x.color+' '+cursor.toFixed(1)+'% '+next.toFixed(1)+'%';cursor=next;return s;});var grad=parts.length?'conic-gradient('+parts.join(',')+')':'#e9eef5';
 return '<div class="v2-page-head"><div><span class="rt-page-eyebrow">THỐNG KÊ</span><h2>Theo dõi tiến bộ</h2><p>Biểu đồ chỉ sử dụng dữ liệu bài làm hiện có.</p></div><button class="rt-button light" onclick="studentGoV2(\'history\')">Lịch sử →</button></div><div class="v2-grid v2-stats">'+
 '<article class="v2-card v2-stat"><div class="v2-stat-icon">◎</div><b>'+st.avg+'%</b><small>Điểm trung bình</small></article><article class="v2-card v2-stat"><div class="v2-stat-icon">★</div><b>'+st.best+'%</b><small>Điểm cao nhất</small></article><article class="v2-card v2-stat"><div class="v2-stat-icon">◷</div><b>'+st.hours.toFixed(1)+'h</b><small>Thời gian học</small></article><article class="v2-card v2-stat"><div class="v2-stat-icon">🔥</div><b>'+st.streak+'</b><small>Ngày liên tiếp</small></article></div><div class="v2-grid v2-two" style="margin-top:14px"><article class="v2-card v2-card pad"><div class="v2-card-head"><div><h3>Điểm trung bình theo thời gian</h3><p>7 lượt gần nhất</p></div></div><div class="v2-chart"><svg viewBox="0 0 360 220" preserveAspectRatio="none"><line class="grid" x1="0" y1="40" x2="360" y2="40"/><line class="grid" x1="0" y1="80" x2="360" y2="80"/><line class="grid" x1="0" y1="120" x2="360" y2="120"/><line class="grid" x1="0" y1="160" x2="360" y2="160"/>'+(pts?'<polyline class="line" points="'+pts+'"/>'+pts.split(' ').map(function(p){var a=p.split(',');return '<circle class="dot" cx="'+a[0]+'" cy="'+a[1]+'" r="4"/>'}).join(''):'')+'</svg>'+(!pts?'<div class="v2-empty" style="min-height:0;margin-top:-20px">Chưa có đủ dữ liệu để vẽ biểu đồ.</div>':'')+'</div></article><article class="v2-card v2-card pad"><div class="v2-card-head"><div><h3>Tỷ lệ theo môn</h3><p>Hiển thị khi đã có điểm.</p></div></div><div class="v2-donut" style="background:'+grad+'"></div><div class="v2-legend">'+subs.slice(0,4).map(function(x){return '<div class="v2-legend-row"><span><i class="v2-legend-dot" style="background:#4169e8"></i>'+esc(x.name)+'</span><b>—</b></div>'}).join('')+'</div></article></div>'
}
function achievementsV2(){
 var st=stats(),defs=[['🌱','Bài đầu tiên','Hoàn thành 1 bài kiểm tra',st.h.length>=1],['📚','Chăm chỉ','Hoàn thành 5 bài kiểm tra',st.h.length>=5],['⭐','Điểm tốt','Đạt ít nhất 80% ở một bài',st.best>=80],['🔥','Giữ nhịp','Học liên tiếp 3 ngày',st.streak>=3],['🏆','Xuất sắc','Đạt ít nhất 90% ở một bài',st.best>=90],['🎯','Mục tiêu tuần','Có 5 lượt làm trong 7 ngày',st.recent7>=5]];
 return '<div class="v2-page-head"><div><span class="rt-page-eyebrow">THÀNH TÍCH</span><h2>Các mốc bạn đã đạt</h2><p>Thành tích được tính từ lịch sử học tập thực tế.</p></div></div><div class="v2-achievements">'+defs.map(function(a){return '<article class="v2-achievement '+(a[3]?'':'locked')+'"><span class="badge">'+a[0]+'</span><b>'+a[1]+'</b><small>'+a[2]+'</small></article>'}).join('')+'</div>'
}
function settingsV2(){
 return '<div class="v2-page-head"><div><span class="rt-page-eyebrow">CÀI ĐẶT</span><h2>Thông tin học tập</h2><p>Quản lý thông tin phiên học tập trên thiết bị này.</p></div></div><div class="v2-settings-grid"><article class="v2-card v2-card pad"><div class="v2-card-head"><div><h3>Hồ sơ</h3><p>Cập nhật tên hiển thị và mã học sinh.</p></div></div><div class="v2-form-grid"><div class="v2-field"><label>Họ và tên</label><input id="v2SetName" value="'+esc(user())+'"></div><div class="v2-field"><label>Mã học sinh</label><input id="v2SetCode" value="'+esc(code())+'"></div></div><button class="rt-button primary" style="margin-top:13px" onclick="saveSettingsV2()">Lưu thay đổi</button></article><article class="v2-card v2-card pad"><div class="v2-card-head"><div><h3>Tuỳ chọn</h3><p>Thiết lập giao diện và phiên sử dụng.</p></div></div><div class="v2-toggle-row"><div><b>Giao diện</b><small>Chuyển sáng/tối</small></div><button class="rt-button light" onclick="toggleV2Theme()">◐ Đổi giao diện</button></div><div class="v2-toggle-row"><div><b>Đăng xuất</b><small>Xoá phiên học tập trên thiết bị</small></div><button class="rt-button light" onclick="logoutV2()">⇥ Đăng xuất</button></div></article></div>'
}
function content(){
 var p=S()?.page;
 if(p==='home')return dashboard();
 if(p==='learning')return learningPage();
 if(p==='tests')return testsPage();
 if(p==='ai')return aiPage();
 if(p==='stats')return statsV2();
 if(p==='history')return historyV2();
 if(p==='achievements')return achievementsV2();
 if(p==='settings')return settingsV2();
 if(p==='subject'||p==='exam'||p==='result'||p==='review'||p==='support')return typeof window.page==='function'?window.page():'';
 return dashboard();
}
function renderV2(){
 var s=S(),root=A();if(!s||!root)return;
 if(!has()){root.innerHTML=s.page==='login'?loginHtml():landingHtml();document.body.classList.remove('study-dark');ready();bindLogin();return}
 if(s.page==='landing'||s.page==='login')s.page='home';
 root.innerHTML=shell(content());applyTheme();ready();
}
function ready(){document.body.classList.remove('redesign-pending');document.body.classList.add('redesign-ready')}
function bindLogin(){
 var f=document.getElementById('studentLoginFormV2');if(!f||f.dataset.bound)return;f.dataset.bound='1';
 f.addEventListener('submit',async function(e){e.preventDefault();var n=document.getElementById('v2LoginName')?.value.trim(),c=document.getElementById('v2LoginCode')?.value.trim(),m=document.getElementById('v2LoginError');if(!n){m.textContent='Hãy nhập họ và tên.';return}storeUser(n,c);S().candidate=n;S().code=c;S().page='home';try{if(window.loadExams)await window.loadExams();if(window.loadHistory)await window.loadHistory()}catch(_){}renderV2()})
}
async function studentGoV2(p){
 if(!S())return;
 if(p==='learning'||p==='tests'){if(window.loadExams)try{await window.loadExams()}catch(_){}}
 if(p==='history'&&window.loadHistory)try{await window.loadHistory()}catch(_){}
 if(p==='ai'||p==='support'){try{if(window.stopSupportLive)window.stopSupportLive()}catch(_){}}
 S().page=p;renderV2();closeSidebar();
 if(p==='support'&&window.startSupportLive)try{await window.startSupportLive();renderV2()}catch(_){}
}
async function studentUiV2(p){if(!S())return;if(p==='login'||p==='landing'){S().page=p;renderV2();return}studentGoV2(p)}
function chooseSubjectV2(s){if(S()){S().subject=s;S().page='subject';renderV2()}}
function toggleStudentSidebarV2(){var x=document.getElementById('studentSidebarV2');if(!x)return;x.classList.toggle('open');document.body.classList.toggle('student-menu-open-v2',x.classList.contains('open'))}
function closeSidebar(){var x=document.getElementById('studentSidebarV2');if(x)x.classList.remove('open');document.body.classList.remove('student-menu-open-v2')}
function toggleV2Theme(){var d=!document.body.classList.contains('study-dark');document.body.classList.toggle('study-dark',d);localStorage.setItem('study_public_theme',d?'dark':'light')}
function applyTheme(){document.body.classList.toggle('study-dark',localStorage.getItem('study_public_theme')==='dark')}
function logoutV2(){try{if(window.stopSupportLive)window.stopSupportLive()}catch(_){}localStorage.removeItem(KEY);localStorage.removeItem('study_candidate');localStorage.removeItem('study_code');if(S())S().page='landing';renderV2()}
function saveSettingsV2(){var n=document.getElementById('v2SetName')?.value.trim(),c=document.getElementById('v2SetCode')?.value.trim();if(!n)return alert('Hãy nhập họ tên.');storeUser(n,c);renderV2()}
async function generateExamV2(){
 var file=document.getElementById('v2File')?.files?.[0],msg=document.getElementById('v2GenMsg'),btn=document.querySelector('.v2-form-grid')?.parentElement?.querySelector('.rt-button.primary');if(!file){msg.style.display='block';msg.textContent='Hãy chọn một tài liệu trước.';return}
 var types=Array.from(document.querySelectorAll('.v2Type:checked')).map(function(x){return x.value});if(!types.length){msg.style.display='block';msg.textContent='Chọn ít nhất một dạng câu hỏi.';return}
 if(file.size>2450000){msg.style.display='block';msg.textContent='File quá lớn. Hãy dùng file nhỏ hơn khoảng 2,4 MB.';return}
 try{
  btn.disabled=true;btn.textContent='AI đang đọc tài liệu…';msg.style.display='block';msg.textContent='Đang tạo đề…';
  var b='',text='';if(/^(text\/)/.test(file.type)||/\.(txt|md|csv)$/i.test(file.name))text=await file.text();else{var ar=await file.arrayBuffer(),bytes=new Uint8Array(ar),chunk=0x8000;for(var i=0;i<bytes.length;i+=chunk)b+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+chunk,bytes.length)));b=btoa(b)}
  var payload={fileName:file.name,mimeType:file.type||'application/octet-stream',fileData:b,documentText:text.slice(0,300000),subject:document.getElementById('v2Subject').value,difficulty:document.getElementById('v2Level').value,questionCount:Number(document.getElementById('v2Count').value),types:types};
  var r=await fetch('/api/generate-exam',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
  if(!Array.isArray(d.questions)||!d.questions.length)throw new Error('AI chưa tạo được câu hỏi từ tài liệu này.');
  if(window.loadSupabase)await window.loadSupabase();
  var exam={title:'Đề tạo từ '+file.name,subject:payload.subject,difficulty:payload.difficulty,duration:Number(document.getElementById('v2Duration').value||45),question_count:d.questions.length,questions:d.questions,status:'active'};
  var ins=window.db?await window.db.from('exams').insert(exam).select().single():null;
  if(!ins||ins.error)throw new Error(ins?.error?.message||'Không lưu được đề vào thư viện.');
  if(Array.isArray(window.exams))window.exams=[ins.data].concat(window.exams);
  msg.textContent='Đã tạo và lưu '+Number(d.questions.length)+' câu vào thư viện.';
  renderV2();
 }catch(e){msg.textContent='Không tạo được đề: '+String(e.message||e)}finally{if(btn){btn.disabled=false;btn.textContent='Tạo đề bằng AI ✨'}}
}
function startRepaint(){
 window.render=renderV2;window.go=studentGoV2;renderV2();
 [250,700,1500,3000].forEach(function(ms){setTimeout(function(){if(S())renderV2()},ms)});
}
function boot(){
 var started=false;
 function kick(){if(started)return;if(window.state){started=true;startRepaint();}}
 if(window.__studyAppReady)kick();else window.addEventListener('study-app-loaded',kick,{once:false});
 [50,150,300,600,1000,1600,2500,4000].forEach(function(ms){setTimeout(kick,ms)});
 window.addEventListener('load',function(){setTimeout(kick,100)});
}
window.studentUiV2=studentUiV2;window.studentGoV2=studentGoV2;window.toggleStudentSidebarV2=toggleStudentSidebarV2;window.toggleV2Theme=toggleV2Theme;window.logoutV2=logoutV2;window.saveSettingsV2=saveSettingsV2;window.chooseSubjectV2=chooseSubjectV2;window.generateExamV2=generateExamV2;window.setV2Filter=setV2Filter;window.filterV2Search=filterV2Search;window.render=renderV2;window.go=studentGoV2;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();