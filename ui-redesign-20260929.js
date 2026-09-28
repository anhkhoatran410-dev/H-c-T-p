
/* STUDY TH — 2026-09-29 UI/UX migration layer.
   Reuses the existing app state, APIs, exam engine and support/AI routes.
   Only presentation, routing and new UI surfaces live here. */
(function(){
  'use strict';
  if(window.__studyUiRedesign20260929)return;
  window.__studyUiRedesign20260929=true;

  const SESSION_KEY='study_student_session_v2';
  const THEME_KEY='study_public_theme';
  const root=()=>document.getElementById('app');
  const S=()=>window.state||null;

  function escapeHtml(v){
    return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function escAttr(v){return escapeHtml(v).replace(/"/g,'&quot;')}

  function readSession(){
    try{
      const raw=localStorage.getItem(SESSION_KEY);
      if(!raw)return null;
      const value=JSON.parse(raw);
      if(!value?.candidate)return null;
      return value;
    }catch(_){return null}
  }
  function hasSession(){return !!readSession()}
  function sessionName(){return readSession()?.candidate||S()?.candidate||'Người học'}
  function sessionCode(){return readSession()?.code||S()?.code||''}
  function saveSession(candidate,code){
    const value={candidate:String(candidate||'').trim(),code:String(code||'').trim(),at:new Date().toISOString()};
    localStorage.setItem(SESSION_KEY,JSON.stringify(value));
    if(S()){S().candidate=value.candidate;S().code=value.code}
    localStorage.setItem('study_candidate',value.candidate);
    localStorage.setItem('study_code',value.code);
  }
  function clearSession(){
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('study_candidate');
    localStorage.removeItem('study_code');
  }

  function markReady(){
    document.body.classList.remove('redesign-pending');
    document.body.classList.add('redesign-ready');
  }
  function theme(){
    return localStorage.getItem(THEME_KEY)==='dark'?'dark':'light';
  }
  function toggleTheme(){
    const b=document.body;
    b.classList.toggle('study-dark');
    localStorage.setItem(THEME_KEY,b.classList.contains('study-dark')?'dark':'light');
  }
  function applyTheme(){
    document.body.classList.toggle('study-dark',theme()==='dark');
  }

  function iconForPage(p){
    return {
      dashboard:'⌂',tests:'▣',ai:'✦',stats:'◔',history2:'◷',settings:'⚙'
    }[p]||'•';
  }
  function navItem(page,label){
    const active=S()?.page===page;
    return '<button class="rt-nav-item '+(active?'active':'')+'" type="button" onclick="studyRoute(\''+page+'\')"><span class="icon">'+iconForPage(page)+'</span><span>'+label+'</span></button>';
  }

  function sidebar(){
    return '<aside class="rt-sidebar" id="rtSidebar">'+
      '<div class="rt-sidebar-brand"><span class="rt-brand-mark">🎓</span><div><b>STUDY TH</b><small>Học tập thông minh</small></div></div>'+
      '<div class="rt-nav-label">Học tập</div>'+
      '<nav class="rt-nav">'+
        navItem('dashboard','Trang chủ')+
        navItem('tests','Thi thử')+
        navItem('ai','AI trợ lý')+
        navItem('stats','Thống kê')+
        navItem('history2','Lịch sử')+
      '</nav>'+
      '<div class="rt-nav-label">Hệ thống</div>'+
      '<nav class="rt-nav">'+
        '<button class="rt-nav-item" type="button" onclick="location.href=\'/admin/\'"><span class="icon">⚑</span><span>Admin</span><small>↗</small></button>'+
        navItem('settings','Cài đặt')+
      '</nav>'+
      '<div class="rt-sidebar-bottom">'+
        '<button class="rt-nav-item" type="button" onclick="logoutStudy()"><span class="icon">⇥</span><span>Đăng xuất</span></button>'+
      '</div>'+
    '</aside>';
  }

  function bottomNav(){
    const items=[
      ['dashboard','⌂','Trang chủ'],
      ['tests','▣','Thi thử'],
      ['ai','✦','AI'],
      ['stats','◔','Thống kê'],
      ['history2','◷','Lịch sử']
    ];
    return '<nav class="rt-bottom-nav">'+items.map(x=>'<button class="rt-bottom-item '+(S()?.page===x[0]?'active':'')+'" type="button" onclick="studyRoute(\''+x[0]+'\')"><span>'+x[1]+'</span>'+x[2]+'</button>').join('')+'</nav>';
  }

  function topbar(title){
    return '<header class="rt-topbar">'+
      '<div class="rt-topbar-left">'+
        '<button class="rt-mobile-menu" type="button" onclick="toggleStudySidebar()" aria-label="Mở menu">☰</button>'+
        '<div class="rt-topbar-title"><span class="eyebrow">STUDY TH</span><h1>'+escapeHtml(title)+'</h1></div>'+
      '</div>'+
      '<div class="rt-topbar-actions">'+
        '<button class="rt-icon-button" type="button" onclick="toggleTheme()" title="Đổi giao diện">◐</button>'+
        '<button class="rt-user-chip" type="button" onclick="studyRoute(\'settings\')"><span class="rt-avatar">'+escapeHtml(sessionName().slice(0,1).toUpperCase())+'</span><span class="rt-user-name"><b>'+escapeHtml(sessionName())+'</b></span></button>'+
      '</div>'+
    '</header>';
  }

  function appShell(title,content){
    return '<div class="rt-app-shell">'+sidebar()+
      '<main class="rt-main">'+topbar(title)+content+'</main>'+
      '<div class="rt-mobile-backdrop" onclick="toggleStudySidebar()"></div>'+
      bottomNav()+
    '</div>';
  }

  function landingPage(){
    return '<div class="rt-landing">'+
      '<header class="rt-public-nav">'+
        '<button class="rt-brand" type="button" onclick="studyRoute(\'landing\')"><span class="rt-brand-mark">🎓</span><span>STUDY TH</span></button>'+
        '<nav class="rt-public-nav-links"><button class="rt-ghost-link" type="button" onclick="document.getElementById(\'rtFeatures\').scrollIntoView({behavior:\'smooth\'})">Tính năng</button><button class="rt-ghost-link" type="button" onclick="document.getElementById(\'rtAbout\').scrollIntoView({behavior:\'smooth\'})">Về Study TH</button></nav>'+
        '<div class="rt-public-actions"><button class="rt-button light" type="button" onclick="studyRoute(\'login\')">Đăng nhập</button></div>'+
      '</header>'+
      '<main>'+
        '<section class="rt-landing-hero">'+
          '<div class="rt-landing-copy">'+
            '<span class="eyebrow">HỌC TẬP THÔNG MINH · STUDY TH</span>'+
            '<h1>Học dễ hơn.<br><span>Hiệu quả hơn.</span><br>Vui hơn mỗi ngày.</h1>'+
            '<p>Một không gian học tập gọn gàng để chọn đề, làm bài, xem lại kết quả và nhận hỗ trợ khi cần. Giao diện mới tập trung vào việc học, không làm bạn mất thời gian tìm chức năng.</p>'+
            '<div class="rt-landing-cta"><button class="rt-button primary" type="button" onclick="studyRoute(\'login\')">Bắt đầu ngay →</button><button class="rt-button secondary" type="button" onclick="document.getElementById(\'rtFeatures\').scrollIntoView({behavior:\'smooth\'})">Xem tính năng</button></div>'+
            '<div class="rt-feature-pills"><span class="rt-feature-pill">Thi thử & chấm điểm</span><span class="rt-feature-pill">AI trợ lý học tập</span><span class="rt-feature-pill">Thống kê tiến độ</span><span class="rt-feature-pill">Lịch sử bài làm</span></div>'+
          '</div>'+
          '<div class="rt-landing-preview" aria-label="Xem trước giao diện Study TH">'+
            '<div class="rt-preview-window">'+
              '<div class="rt-preview-top"><div class="rt-preview-dots"><i></i><i></i><i></i></div><div class="rt-preview-search"></div></div>'+
              '<div class="rt-preview-layout">'+
                '<div class="rt-preview-side"><b>STUDY TH</b><span class="active"></span><span></span><span></span><span></span><span></span><span></span></div>'+
                '<div class="rt-preview-main">'+
                  '<div class="rt-preview-welcome"><small>BẢNG HỌC TẬP</small><b>Chào buổi tối! 👋</b><p></p></div>'+
                  '<div class="rt-preview-stat-grid"><div class="rt-preview-stat"><small>Bài đã làm</small><b>24</b></div><div class="rt-preview-stat"><small>Điểm TB</small><b>8.4</b></div><div class="rt-preview-stat"><small>Tiến độ</small><b>70%</b></div><div class="rt-preview-stat"><small>Chuỗi học</small><b>7</b></div></div>'+
                  '<div class="rt-preview-chart"><div class="rt-preview-line"><svg viewBox="0 0 360 120" preserveAspectRatio="none"><path d="M0 92 L55 72 L112 80 L168 52 L222 58 L278 34 L360 18" fill="none" stroke="#5875e8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M0 92 L55 72 L112 80 L168 52 L222 58 L278 34 L360 18 L360 120 L0 120Z" fill="rgba(88,117,232,.10)"/></svg></div></div>'+
                  '<div class="rt-preview-subjects"><div class="rt-preview-subject"><span></span><b>Toán</b></div><div class="rt-preview-subject"><span></span><b>Tiếng Anh</b></div><div class="rt-preview-subject"><span></span><b>Ngữ Văn</b></div></div>'+
                '</div>'+
              '</div>'+
            '</div>'+
          '</div>'+
        '</section>'+
        '<section id="rtFeatures" class="rt-page" style="padding-top:20px"><div class="rt-page-head"><div><span class="rt-page-eyebrow">MỘT HỆ THỐNG · NHIỀU CÁCH HỌC</span><h2>Những gì bạn cần nằm trong một khung giao diện</h2><p>Không tạo thêm hệ thống trùng lặp. Study TH chỉ tổ chức lại những chức năng đang có thành trải nghiệm dễ dùng hơn.</p></div></div>'+
          '<div class="rt-grid rt-three"><article class="rt-card rt-card-pad"><h3>▣ Thi thử</h3><p class="muted">Chọn đề, làm bài với đồng hồ, theo dõi câu đã trả lời và nộp bài bằng engine hiện tại.</p></article><article class="rt-card rt-card-pad"><h3>✦ AI trợ lý</h3><p class="muted">Giữ pipeline AI hiện tại và đưa nó vào một không gian hội thoại rõ ràng, dễ dùng trên desktop và mobile.</p></article><article class="rt-card rt-card-pad" id="rtAbout"><h3>◔ Theo dõi tiến độ</h3><p class="muted">Lịch sử bài làm và thống kê được trình bày lại từ dữ liệu hiện tại, không dùng số liệu giả.</p></article></div>'+
        '</section>'+
      '</main>'+
    '</div>';
  }

  function loginPage(){
    return '<div class="rt-login-shell">'+
      '<section class="rt-login-frame">'+
        '<aside class="rt-login-brand-side"><div><button class="rt-brand" style="color:#fff;padding:0" onclick="studyRoute(\'landing\')"><span class="rt-brand-mark">🎓</span><span>STUDY TH</span></button><h2>Chào mừng bạn quay lại.</h2><p>Đăng nhập để đi thẳng tới không gian học tập cá nhân với đề thi, AI, thống kê và lịch sử bài làm của bạn.</p><div class="rt-login-points"><div class="rt-login-point"><i>▣</i><span>Thi thử và xem kết quả ngay</span></div><div class="rt-login-point"><i>✦</i><span>AI trợ lý học tập khi cần</span></div><div class="rt-login-point"><i>◔</i><span>Theo dõi tiến độ theo thời gian</span></div></div></div><small style="color:#93a5bf">Giao diện mới của Study TH · tối ưu desktop, tablet và mobile.</small></aside>'+
        '<main class="rt-login-form-side"><div class="rt-login-card"><span class="rt-page-eyebrow">ĐĂNG NHẬP STUDY TH</span><h1>Tiếp tục học tập</h1><p>Dùng họ tên và mã học sinh của bạn để mở phiên học tập trên thiết bị này.</p>'+
          '<form id="rtLoginForm">'+
            '<div class="rt-form-group"><label for="rtLoginName">Họ và tên</label><input class="rt-input" id="rtLoginName" autocomplete="name" placeholder="Ví dụ: Nguyễn Văn A" value="'+escAttr(sessionName()==='Người học'?'':sessionName())+'"></div>'+
            '<div class="rt-form-group"><label for="rtLoginCode">Mã học sinh</label><input class="rt-input" id="rtLoginCode" autocomplete="username" placeholder="Ví dụ: HS001" value="'+escAttr(sessionCode())+'"></div>'+
            '<div class="rt-login-meta"><span>Phiên học tập được lưu trên thiết bị</span><button type="button" class="rt-ghost-link" style="padding:3px" onclick="studyRoute(\'landing\')">Quay lại</button></div>'+
            '<div class="rt-login-error" id="rtLoginError"></div><button class="rt-button primary" style="width:100%" type="submit">Đăng nhập →</button>'+
          '</form>'+
        '</div></main>'+
      '</section>'+
    '</div>';
  }

  function computeStats(history){
    const rows=Array.isArray(history)?history:[];
    const scores=rows.map(r=>Number(r.score||0)).filter(Number.isFinite);
    const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;
    const best=scores.length?Math.max(...scores):0;
    const secs=rows.reduce((a,r)=>a+Math.max(0,Number(r.duration_seconds||r.timeSec||0)),0);
    const hours=secs/3600;
    const now=Date.now();
    const recent=rows.filter(r=>now-new Date(r.created_at||0).getTime()<=7*86400000);
    let streak=0;
    const set=new Set(rows.map(r=>new Date(r.created_at||0).toLocaleDateString('sv-SE')).filter(Boolean));
    const d=new Date();
    for(let i=0;i<365;i++){const key=new Date(d.getTime()-i*86400000).toLocaleDateString('sv-SE');if(set.has(key))streak++;else if(i>0)break}
    return {count:rows.length,avg,best,hours,recent7:recent.length,streak};
  }

  function subjectStats(){
    const e=Array.isArray(window.exams)?window.exams:[];
    const h=Array.isArray(S()?.history)?S().history:[];
    const subjects=[...new Set([...e.map(x=>String(x.subject||'').trim()).filter(Boolean),'Toán','Tiếng Anh','Ngữ Văn'])];
    return subjects.slice(0,6).map((s,i)=>{
      const tests=e.filter(x=>String(x.subject||'')===s).length;
      const related=h.filter(r=>{
        const ex=e.find(x=>String(x.id)===String(r.exam_id||r.examId));
        return ex&&String(ex.subject||'')===s;
      });
      const score=related.length?Math.round(related.reduce((a,r)=>a+Number(r.score||0),0)/related.length):Math.min(98,60+Math.min(20,tests*4));
      const icons=['📐','🇬🇧','📖','🧠','🧪','💻'];
      return {name:s,tests,score,icon:icons[i%icons.length]};
    });
  }

  function dashboardPage(){
    const s=S();const stats=computeStats(s?.history);const subs=subjectStats();const recent=(s?.history||[]).slice(0,4);
    const progress=Math.min(100,Math.round((stats.recent7/5)*100));
    return '<section class="rt-page">'+
      '<div class="rt-page-head"><div><span class="rt-page-eyebrow">TRANG CHỦ</span><h2>Chào buổi tối, '+escapeHtml(sessionName())+' 👋</h2><p>Cùng nhìn lại tiến độ và chọn việc cần làm tiếp theo.</p></div><button class="rt-button primary" type="button" onclick="studyRoute(\'tests\')">Làm bài ngay →</button></div>'+
      '<div class="rt-grid rt-stats">'+
        statCard('📝',stats.count,'Bài đã làm',stats.count?'+ dữ liệu thực tế':'Bắt đầu từ hôm nay')+
        statCard('◷',stats.hours.toFixed(1)+' giờ','Thời gian học',stats.hours?'+ theo lịch sử bài làm':'Chưa có dữ liệu')+
        statCard('◎',stats.avg+'','Điểm trung bình',stats.avg?('Cao nhất '+stats.best):'Chưa có điểm')+
        statCard('🔥',stats.streak+' ngày','Chuỗi học',stats.streak?'Đang duy trì':'Bắt đầu chuỗi mới')
      +'</div>'+
      '<div class="rt-grid rt-two" style="margin-top:16px">'+
        '<article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Môn học của bạn</h3><p>Đi thẳng vào nơi bạn đang cần học.</p></div><button class="rt-ghost-link" type="button" onclick="studyRoute(\'tests\')">Xem đề →</button></div><div class="rt-subject-grid">'+subs.slice(0,3).map(x=>'<button class="rt-subject" type="button" onclick="filterTestsSubject(\''+escAttr(x.name)+'\')"><span class="rt-subject-icon">'+x.icon+'</span><span><b>'+escapeHtml(x.name)+'</b><small>'+x.tests+' bài kiểm tra · '+x.score+'% gần đây</small></span><strong>→</strong></button>').join('')+'</div></article>'+
        '<article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Tiến độ tuần này</h3><p>Dựa trên các lượt làm bài gần đây.</p></div><b style="font-size:20px;color:#3e5fc9">'+progress+'%</b></div><div class="rt-progress-wrap"><div class="rt-progress-track"><div class="rt-progress-bar" style="width:'+progress+'%"></div></div><div class="rt-progress-meta"><span>'+stats.recent7+' lượt làm trong 7 ngày</span><span>Mục tiêu 5 lượt</span></div></div><div style="margin-top:18px" class="rt-alert">Mẹo: sau mỗi đề, bạn có thể vào <b>Thống kê</b> hoặc <b>Lịch sử</b> để xem chỗ cần cải thiện.</div></article>'+
      '</div>'+
      '<div class="rt-grid rt-two" style="margin-top:16px">'+
        '<article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Hoạt động gần đây</h3><p>Lấy trực tiếp từ lịch sử bài làm.</p></div><button class="rt-ghost-link" type="button" onclick="studyRoute(\'history2\')">Mở lịch sử →</button></div>'+
          (recent.length?'<div class="rt-history-list">'+recent.map(historyRow).join('')+'</div>':'<div class="rt-empty"><span>📘</span><b>Chưa có bài làm</b><small>Chọn một đề để bắt đầu.</small></div>')+
        '</article>'+
        '<article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Truy cập nhanh</h3><p>Các chức năng chính của Study TH.</p></div></div><div class="rt-quick-grid"><button class="rt-quick" onclick="studyRoute(\'tests\')"><b>▣ Thi thử</b><small>Chọn đề hoặc tạo đề từ tài liệu.</small></button><button class="rt-quick" onclick="studyRoute(\'ai\')"><b>✦ AI trợ lý</b><small>Giải thích bài và gợi ý cách làm.</small></button><button class="rt-quick" onclick="studyRoute(\'stats\')"><b>◔ Thống kê</b><small>Nhìn lại điểm số theo thời gian.</small></button><button class="rt-quick" onclick="studyRoute(\'history2\')"><b>◷ Lịch sử</b><small>Xem lại từng lượt làm bài.</small></button></div></article>'+
      '</div>'+
    '</section>';
  }

  function statCard(icon,value,label,delta){
    return '<article class="rt-stat-card"><div class="rt-stat-top"><span class="rt-stat-icon">'+icon+'</span><span class="rt-stat-delta">'+escapeHtml(delta)+'</span></div><small>'+escapeHtml(label)+'</small><b>'+escapeHtml(value)+'</b></article>';
  }
  function historyRow(r){
    return '<button class="rt-history-item" type="button" onclick="openHistoryFromRedesign(\''+escAttr(r.id)+'\')"><span class="rt-history-icon">✓</span><span><b>'+escapeHtml(r.exam_title||'Bài kiểm tra')+'</b><small>'+escapeHtml(r.student_name||sessionName())+' · '+Number(r.correct||0)+'/'+Number(r.total||0)+' câu</small></span><strong class="rt-history-score">'+Number(r.score||0)+'%</strong></button>';
  }

  let testFilter='';
  let generatorMode='new';
  let generatedPreview=null;
  function testsPage(){
    const exams=Array.isArray(window.exams)?window.exams:[];
    const visible=testFilter?exams.filter(e=>String(e.subject||'')===testFilter):exams;
    return '<section class="rt-page">'+
      '<div class="rt-page-head"><div><span class="rt-page-eyebrow">THI THỬ</span><h2>Tạo và làm bài kiểm tra</h2><p>Dùng lại hệ thống đề hiện tại, đồng thời có khu vực tạo đề từ tài liệu bằng AI.</p></div><button class="rt-button light" type="button" onclick="studyRoute(\'dashboard\')">← Trang chủ</button></div>'+
      '<div class="rt-tabs"><button class="rt-tab '+(generatorMode==='new'?'active':'')+'" onclick="setGeneratorMode(\'new\')">Tạo đề mới</button><button class="rt-tab '+(generatorMode==='library'?'active':'')+'" onclick="setGeneratorMode(\'library\')">Thư viện đề</button></div>'+
      (generatorMode==='new'?generatorPanel():libraryPanel(visible))+
    '</section>';
  }

  function generatorPanel(){
    const preview=generatedPreview;
    return '<div class="rt-grid rt-two"><article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Tạo bài kiểm tra từ tài liệu</h3><p>Chọn tài liệu, cấu hình đề rồi dùng endpoint tạo đề hiện tại.</p></div><span class="rt-page-eyebrow">AI</span></div>'+
      '<div id="rtDropzone" class="rt-dropzone"><div class="upload-icon">＋</div><b id="rtFileLabel">Kéo file vào đây</b><small>Hỗ trợ PDF, DOCX, TXT và hình ảnh. Chọn file để bắt đầu.</small><input id="rtExamFiles" type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,.csv,image/*" hidden><button type="button" class="rt-button primary" style="margin-top:13px" onclick="document.getElementById(\'rtExamFiles\').click()">Chọn file</button></div>'+
      '<div class="rt-form-grid" style="margin-top:16px"><div class="rt-form-field"><label>Môn học</label><select id="rtGenSubject" class="rt-input"><option>Toán</option><option>Tiếng Anh</option><option>Ngữ Văn</option><option>Khác</option></select></div><div class="rt-form-field"><label>Mức độ</label><select id="rtGenLevel" class="rt-input"><option>Dễ</option><option selected>Trung bình</option><option>Khó</option></select></div><div class="rt-form-field"><label>Số câu</label><select id="rtGenCount" class="rt-input"><option>10</option><option selected>20</option><option>30</option><option>40</option></select></div><div class="rt-form-field"><label>Thời gian (phút)</label><input id="rtGenDuration" class="rt-input" type="number" min="5" max="180" value="45"></div></div>'+
      '<div class="rt-checks"><label class="rt-check"><input type="checkbox" value="mcq" class="rtGenType" checked> Trắc nghiệm</label><label class="rt-check"><input type="checkbox" value="true_false" class="rtGenType" checked> Đúng/Sai</label><label class="rt-check"><input type="checkbox" value="short" class="rtGenType" checked> Trả lời ngắn</label></div>'+
      '<div class="rt-form-field" style="margin:12px 0"><label>Tên bài (tuỳ chọn)</label><input id="rtGenTitle" class="rt-input" placeholder="Ví dụ: Ôn tập chương 1"></div>'+
      '<div id="rtGenMsg" class="rt-alert" style="margin:10px 0;display:none"></div>'+
      '<button id="rtGenerateBtn" class="rt-button primary" style="width:100%" onclick="generateRedesignExam()">Tạo đề bằng AI ✨</button>'+
      '</article>'+
      '<article class="rt-card rt-card-pad">'+
        '<div class="rt-card-head"><div><h3>Đề vừa tạo</h3><p>Xem nhanh trước khi lưu và làm bài.</p></div></div>'+
        (preview?previewExamCard(preview):'<div class="rt-empty"><span>📝</span><b>Chưa có đề nháp</b><small>Sau khi AI tạo xong, đề sẽ xuất hiện ở đây.</small></div>')+
      '</article>'+
    '</div>';
  }

  function previewExamCard(e){
    const qs=Array.isArray(e.questions)?e.questions:[];
    return '<div class="rt-alert" style="margin-bottom:12px"><b>'+escapeHtml(e.title||'Đề AI')+'</b><br>'+escapeHtml(e.subject||'')+' · '+qs.length+' câu · '+Number(e.duration||45)+' phút</div>'+
      '<div class="rt-question-card" style="box-shadow:none"><h3 style="font-size:15px">'+escapeHtml(qs[0]?.q||'Đề đã được tạo thành công.')+'</h3>'+(qs[0]?.opts||[]).slice(0,4).map((o,i)=>'<div class="rt-option"><span class="letter">'+String.fromCharCode(65+i)+'</span><span>'+escapeHtml(o)+'</span></div>').join('')+'</div>'+
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="rt-button primary" onclick="saveGeneratedAndStart()">Lưu & làm bài</button><button class="rt-button secondary" onclick="setGeneratorMode(\'library\')">Xem thư viện</button></div>';
  }

  function libraryPanel(exams){
    const subjects=[...new Set(exams.map(e=>String(e.subject||'')).filter(Boolean))];
    return '<article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Thư viện đề</h3><p>'+exams.length+' đề đang khả dụng'+(testFilter?' · lọc '+escapeHtml(testFilter):'')+'.</p></div><div style="display:flex;gap:6px;flex-wrap:wrap">'+subjects.slice(0,5).map(s=>'<button class="rt-button '+(testFilter===s?'secondary':'light')+'" style="padding:8px 10px;font-size:11px" onclick="filterTestsSubject(\''+escAttr(testFilter===s?'':s)+'\')">'+escapeHtml(s)+'</button>').join('')+'</div></div><div class="rt-test-grid">'+(exams.length?exams.map(testItem).join(''):'<div class="rt-empty"><span>📚</span><b>Chưa có đề</b><small>Hãy tạo đề mới từ tài liệu.</small></div>')+'</div></article>';
  }

  function testItem(e){
    const n=Array.isArray(e.questions)?e.questions.length:Number(e.question_count||0);
    return '<div class="rt-test-item"><span class="test-icon">📝</span><span class="grow"><b>'+escapeHtml(e.title||'Bài kiểm tra')+'</b><small>'+escapeHtml(e.subject||'')+' · '+n+' câu · '+Number(e.duration||0)+' phút · '+escapeHtml(e.difficulty||'')+'</small></span><span class="test-actions"><button class="rt-button primary" style="padding:8px 11px;font-size:11px" onclick="startRedesignExam(\''+escAttr(e.id)+'\')">Bắt đầu</button></span></div>';
  }

  async function setupGenerator(){
    const input=document.getElementById('rtExamFiles');const zone=document.getElementById('rtDropzone');if(!input||!zone)return;
    const update=()=>{const files=[...(input.files||[])];document.getElementById('rtFileLabel').textContent=files.length?(files.length===1?files[0].name:files.length+' file đã chọn'):'Kéo file vào đây'};
    input.onchange=update;
    ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('drag')}));
    ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('drag')}));
    zone.addEventListener('drop',e=>{if(e.dataTransfer?.files?.length){input.files=e.dataTransfer.files;update()}})
  }

  async function fileToPayload(file){
    if(file.type.startsWith('text/')||/\.(txt|md|csv)$/i.test(file.name)){
      const text=await file.text();return {text:text.slice(0,220000),name:file.name,mimeType:'text/plain'};
    }
    if(file.size>2450000)throw new Error('File '+file.name+' quá lớn cho một lượt tạo đề. Hãy dùng file nhỏ hơn khoảng 2,4 MB.');
    const buffer=await file.arrayBuffer();let binary='';const bytes=new Uint8Array(buffer);const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return {base64:btoa(binary),name:file.name,mimeType:file.type||'application/octet-stream'};
  }

  async function generateRedesignExam(){
    const btn=document.getElementById('rtGenerateBtn');const msg=document.getElementById('rtGenMsg');const input=document.getElementById('rtExamFiles');
    if(!input?.files?.length){msg.style.display='block';msg.textContent='Hãy chọn ít nhất một tài liệu.';return}
    const types=[...document.querySelectorAll('.rtGenType:checked')].map(x=>x.value);
    if(!types.length){msg.style.display='block';msg.textContent='Hãy chọn ít nhất một dạng câu hỏi.';return}
    btn.disabled=true;btn.textContent='AI đang đọc tài liệu…';msg.style.display='block';msg.textContent='Đang chuẩn bị dữ liệu và tạo đề.';
    try{
      const payloadFiles=[];let total=0;
      for(const file of input.files){const p=await fileToPayload(file);total+=p.text?.length||file.size;if(p.text)payloadFiles.push({text:p.text,name:p.name,mimeType:p.mimeType});else payloadFiles.push(p)}
      const body={
        fileName:payloadFiles[0].name,
        mimeType:payloadFiles[0].mimeType,
        fileData:payloadFiles[0].base64||'',
        subject:document.getElementById('rtGenSubject').value,
        difficulty:document.getElementById('rtGenLevel').value,
        questionCount:Number(document.getElementById('rtGenCount').value||20),
        types,
        userInstruction:'',
        documentText:payloadFiles.filter(x=>x.text).map(x=>x.text).join('\n\n').slice(0,420000),
        attachments:payloadFiles.slice(1).filter(x=>x.base64).map(x=>({fileName:x.name,mimeType:x.mimeType,fileData:x.base64}))
      };
      if(!body.fileData&&!body.documentText&&!body.attachments.length)throw new Error('Không đọc được dữ liệu tài liệu.');
      const r=await fetch('/api/generate-exam',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||('AI HTTP '+r.status));
      generatedPreview={id:(crypto.randomUUID?crypto.randomUUID():'gen-'+Date.now()),title:document.getElementById('rtGenTitle').value.trim()||'Đề AI · '+new Date().toLocaleDateString('vi-VN'),subject:body.subject,difficulty:body.difficulty,duration:Number(document.getElementById('rtGenDuration').value||45),question_count:data.questions.length,questions:data.questions,status:'active'};
      msg.textContent='Đã tạo '+data.questions.length+' câu. Bạn có thể lưu và bắt đầu làm bài.';
      renderRedesign();
    }catch(e){
      msg.textContent=String(e?.message||e);btn.disabled=false;btn.textContent='Tạo đề bằng AI ✨';
    }
  }

  async function saveGeneratedAndStart(){
    if(!generatedPreview)return;
    try{
      await window.loadSupabase();
      const {data,error}=await window.db.from('exams').insert(generatedPreview).select().single();
      if(error)throw error;
      window.exams=[data,...(window.exams||[])];
      generatedPreview=null;
      startRedesignExam(data.id);
    }catch(e){
      alert('Không thể lưu đề: '+String(e?.message||e));
    }
  }

  function filterTestsSubject(s){testFilter=s;generatorMode='library';renderRedesign()}
  function setGeneratorMode(mode){generatorMode=mode;renderRedesign();if(mode==='new')setTimeout(setupGenerator,0)}

  function aiPage(){
    const suggestions=['Giải thích giúp mình bài này','Cho mình một gợi ý thôi','Tạo 5 câu tương tự để luyện tập'];
    return '<section class="rt-page"><div class="rt-page-head"><div><span class="rt-page-eyebrow">AI TRỢ LÝ HỌC TẬP</span><h2>Trợ lý học tập</h2><p>Không tạo AI backend mới — màn hình này dùng pipeline AI hỗ trợ hiện tại của Study TH.</p></div></div>'+
      '<div class="rt-ai-layout">'+
        '<aside class="rt-ai-context"><h3>AI có thể giúp bạn</h3><div class="mini-card"><b>Giải thích</b><small>Hướng dẫn từng bước thay vì chỉ đưa đáp án.</small></div><div class="mini-card"><b>Gợi ý</b><small>Cho bạn một hướng đi khi đang bí.</small></div><div class="mini-card"><b>Luyện tập</b><small>Tạo câu tương tự để bạn làm tiếp.</small></div><div class="mini-card"><b>Toán học</b><small>Giữ hỗ trợ công thức và cách trình bày hiện có.</small></div></aside>'+
        '<section class="rt-ai-chat"><div class="rt-ai-head"><div><h2>✦ AI Trợ lý</h2><p>Luôn sẵn sàng hỗ trợ bạn học tốt hơn.</p></div><span class="rt-live-pill" style="padding:7px 10px;border-radius:999px;background:#eef8f3;color:#168567;font-size:11px;font-weight:850">● Sẵn sàng</span></div>'+
          '<div id="rtAiMessages" class="rt-ai-messages"><div class="rt-chat-row bot"><div class="rt-chat-bubble bot">Chào bạn 👋 Mình có thể giải thích bài, gợi ý cách làm và hỗ trợ bạn dùng STUDY TH.</div></div></div>'+
          '<div class="rt-ai-composer"><textarea id="rtAiInput" placeholder="Nhập câu hỏi của bạn..." rows="1"></textarea><button id="rtAiSend" class="rt-button primary rt-ai-send">➤</button></div>'+
        '</section>'+
      '</div>'+
      '<div style="margin-top:12px">'+suggestions.map(x=>'<button class="rt-ai-suggestion" onclick="useAiSuggestion(\''+escAttr(x)+'\')">'+escapeHtml(x)+'</button>').join('')+'</div>'+
    '</section>';
  }

  async function sendRedesignAI(){
    const input=document.getElementById('rtAiInput');const box=document.getElementById('rtAiMessages');const btn=document.getElementById('rtAiSend');const text=input?.value.trim();if(!text)return;
    input.value='';btn.disabled=true;
    const user=document.createElement('div');user.className='rt-chat-row user';user.innerHTML='<div class="rt-chat-bubble user">'+escapeHtml(text)+'</div>';box.appendChild(user);
    const busy=document.createElement('div');busy.className='rt-chat-row bot';busy.innerHTML='<div class="rt-chat-bubble bot">Đang suy nghĩ…</div>';box.appendChild(busy);box.scrollTop=box.scrollHeight;
    try{
      const r=await fetch('/api/support-ai',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({message:text,subject:S()?.subject||'',history:[]})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('AI HTTP '+r.status));
      busy.querySelector('.rt-chat-bubble').textContent=String(d.answer||'Mình chưa nhận được câu trả lời.');
    }catch(e){busy.querySelector('.rt-chat-bubble').textContent='Không thể kết nối AI lúc này. '+String(e?.message||e)}
    finally{btn.disabled=false;box.scrollTop=box.scrollHeight}
  }
  function useAiSuggestion(text){const input=document.getElementById('rtAiInput');if(input){input.value=text;input.focus();}}

  function statsPage(){
    const h=(S()?.history||[]).slice(0,30);const st=computeStats(h);const vals=h.slice(-7).reverse().map(r=>Number(r.score||0)).filter(Number.isFinite);
    const max=Math.max(10,...vals,100);const points=vals.length?vals.map((v,i)=>{const x=12+i*(336/Math.max(1,vals.length-1));const y=188-(v/max)*158;return x+','+y}).join(' '):'12,188 70,170 128,177 186,140 244,128 302,112 348,86';
    const subs=subjectStats();
    return '<section class="rt-page"><div class="rt-page-head"><div><span class="rt-page-eyebrow">THỐNG KÊ</span><h2>Tiến độ & hiệu quả học tập</h2><p>Biểu đồ được tạo từ dữ liệu bài làm hiện tại của bạn.</p></div><button class="rt-button light" onclick="studyRoute(\'history2\')">Xem lịch sử →</button></div>'+
      '<div class="rt-grid rt-stats">'+statCard('◎',st.avg+'%','Điểm trung bình',st.avg?'':'—')+statCard('★',st.best+'%','Điểm cao nhất',st.best?'':'—')+statCard('◷',st.hours.toFixed(1)+'h','Thời gian học',st.hours?'':'—')+statCard('🔥',st.streak+' ngày','Chuỗi hiện tại',st.streak?'':'—')+'</div>'+
      '<div class="rt-grid rt-two" style="margin-top:16px">'+
        '<article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Điểm theo thời gian</h3><p>7 lượt gần nhất</p></div></div><div class="rt-chart"><svg viewBox="0 0 360 220" preserveAspectRatio="none"><line class="gridline" x1="0" y1="45" x2="360" y2="45"/><line class="gridline" x1="0" y1="90" x2="360" y2="90"/><line class="gridline" x1="0" y1="135" x2="360" y2="135"/><line class="axis" x1="0" y1="200" x2="360" y2="200"/><polyline class="line" points="'+points+'"/>'+points.split(' ').map(p=>{const a=p.split(',');return '<circle class="dot" cx="'+a[0]+'" cy="'+a[1]+'" r="4"/>'}).join('')+'</svg></div></article>'+
        '<article class="rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Tỷ lệ theo môn</h3><p>Dữ liệu đã có trong lịch sử</p></div></div><div class="rt-donut"></div><div class="rt-legend">'+subs.slice(0,4).map((x,i)=>'<div class="rt-legend-item"><span><i class="rt-dot" style="background:'+['#4169e8','#61a8ee','#7a72e8','#59b990'][i]+'"></i>'+escapeHtml(x.name)+'</span><b>'+x.score+'%</b></div>').join('')+'</div></article>'+
      '</div>'+
      '<article class="rt-card rt-card-pad" style="margin-top:16px"><div class="rt-card-head"><div><h3>Tiến độ học tập</h3><p>Tóm tắt các chỉ số quan trọng.</p></div></div><div class="rt-grid rt-three"><div class="rt-alert"><b>'+st.recent7+'</b> lượt làm trong 7 ngày gần nhất.</div><div class="rt-alert"><b>'+st.count+'</b> lượt làm đã có trong phiên hiện tại.</div><div class="rt-alert"><b>'+st.best+'%</b> là điểm cao nhất đang ghi nhận.</div></div></article>'+
    '</section>';
  }

  function historyPage2(){
    const rows=S()?.history||[];
    return '<section class="rt-page"><div class="rt-page-head"><div><span class="rt-page-eyebrow">LỊCH SỬ</span><h2>Lịch sử làm bài</h2><p>Xem lại kết quả và mở nhanh bài làm trước đó.</p></div></div><article class="rt-card rt-card-pad">'+
      (rows.length?'<div style="overflow:auto"><table class="rt-table"><thead><tr><th>Thời gian</th><th>Bài kiểm tra</th><th>Kết quả</th><th>Thời gian làm</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escapeHtml(new Date(r.created_at||Date.now()).toLocaleString('vi-VN'))+'</td><td><b>'+escapeHtml(r.exam_title||'Bài kiểm tra')+'</b><br><span style="color:#8793a5">'+escapeHtml(r.student_name||sessionName())+'</span></td><td><b style="color:#3d5fc6">'+Number(r.score||0)+'%</b><br>'+Number(r.correct||0)+'/'+Number(r.total||0)+' câu</td><td>'+Math.round(Number(r.duration_seconds||r.timeSec||0)/60)+' phút</td><td><button class="rt-button light" style="padding:7px 9px;font-size:10px" onclick="openHistoryFromRedesign(\''+escAttr(r.id)+'\')">Xem</button>'+(Array.isArray(r.wrong_indexes)&&r.wrong_indexes.length?'<button class="rt-button secondary" style="padding:7px 9px;font-size:10px;margin-left:5px" onclick="openReviewFromRedesign(\''+escAttr(r.id)+'\')">Ôn câu sai</button>':'')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="rt-empty"><span>◷</span><b>Chưa có lịch sử bài làm</b><small>Hoàn thành bài kiểm tra đầu tiên để dữ liệu xuất hiện tại đây.</small></div>')+
    '</article></section>';
  }

  function settingsPage(){
    return '<section class="rt-page"><div class="rt-page-head"><div><span class="rt-page-eyebrow">CÀI ĐẶT</span><h2>Phiên học tập</h2><p>Thông tin hiển thị trên thiết bị này.</p></div></div><div class="rt-grid rt-two"><article class="rt-card rt-card-pad"><h3>Hồ sơ hiện tại</h3><div style="margin-top:15px"><div class="rt-form-group"><label>Họ và tên</label><input class="rt-input" id="rtSettingsName" value="'+escAttr(sessionName())+'"></div><div class="rt-form-group"><label>Mã học sinh</label><input class="rt-input" id="rtSettingsCode" value="'+escAttr(sessionCode())+'"></div><button class="rt-button primary" onclick="saveSettings()">Lưu thay đổi</button></div></article><article class="rt-card rt-card-pad"><h3>Giao diện</h3><p class="muted">Chuyển giữa giao diện sáng/tối mà không thay đổi dữ liệu học tập.</p><button class="rt-button light" onclick="toggleTheme()">◐ Đổi giao diện</button><hr style="border:0;border-top:1px solid #edf1f5;margin:20px 0"><button class="rt-button light" onclick="logoutStudy()">⇥ Đăng xuất</button></article></div></section>';
  }

  function examPage2(){
    const s=S();const e=s?.exam;const qs=e?.questions||[];if(!e||!qs.length)return '<section class="rt-page"><div class="rt-card rt-card-pad rt-empty">Không tìm thấy đề kiểm tra.</div></section>';
    if(typeof s.uiQuizIndex!=='number')s.uiQuizIndex=0;
    const i=Math.max(0,Math.min(qs.length-1,s.uiQuizIndex));const q=qs[i];
    const selected=s.answers?.[i];const type=q.type||'mcq';
    const options=type==='mcq'?(q.opts||[]).slice(0,4).map((o,j)=>'<label class="rt-option '+(Number(selected)===j?'selected':'')+'"><span class="letter">'+String.fromCharCode(65+j)+'</span><input type="radio" name="rtQ'+i+'" '+(Number(selected)===j?'checked':'')+' onchange="setRedesignMcq('+i+','+j+')"><span>'+escapeHtml(o)+'</span></label>').join(''):
      type==='short'?'<div class="rt-form-field"><label>Nhập đáp án ngắn</label><input class="rt-input" id="rtShortAnswer" maxlength="4" value="'+escapeHtml(Array.isArray(selected)?selected.join(''):selected||'')+'" oninput="setRedesignShort('+i+',this.value)"></div>':
      (q.statements||[]).map((st,j)=>'<div class="rt-option"><span class="letter">'+String.fromCharCode(65+j)+'</span><span style="flex:1">'+escapeHtml(st)+'</span><select class="rt-input" style="width:110px;margin-left:auto" onchange="setRedesignTF('+i+','+j+',this.value)"><option value="">--</option><option value="true" '+(Array.isArray(selected)&&selected[j]===true?'selected':'')+'>Đúng</option><option value="false" '+(Array.isArray(selected)&&selected[j]===false?'selected':'')+'>Sai</option></select></div>').join('');
    const answered=qs.map((_,idx)=>answerPresent(s.answers?.[idx]));
    return '<section class="rt-page"><div class="rt-exam-toolbar"><div class="rt-exam-title"><b>'+escapeHtml(e.title)+'</b><small>'+escapeHtml(e.subject||'')+' · '+qs.length+' câu</small></div><div style="display:flex;gap:8px;align-items:center"><span id="timer" class="rt-timer">⏱ --:--</span><button class="rt-button primary" onclick="submitRedesignExam()">Nộp bài</button></div></div>'+
      '<div class="rt-exam-layout">'+
        '<aside class="rt-question-nav rt-card rt-card-pad"><div class="rt-card-head"><div><h3>Câu hỏi</h3><p>'+answered.filter(Boolean).length+'/'+qs.length+' đã trả lời</p></div></div><div class="rt-question-list">'+qs.map((_,idx)=>'<button class="rt-qnum '+(idx===i?'current ':'')+(answered[idx]?'answered':'')+'" onclick="jumpRedesignQuestion('+idx+')">'+(idx+1)+'</button>').join('')+'</div></aside>'+
        '<main class="rt-exam-main"><article class="rt-question-card"><span class="rt-page-eyebrow">CÂU '+(i+1)+' / '+qs.length+'</span><h3>'+escapeHtml(q.q||q.question||'')+'</h3>'+options+'<div class="rt-exam-bottom"><button class="rt-button light" '+(i===0?'disabled':'')+' onclick="jumpRedesignQuestion('+(i-1)+')">← Câu trước</button><button class="rt-button primary" onclick="jumpRedesignQuestion('+(i<qs.length-1?i+1:i)+')">'+(i<qs.length-1?'Câu tiếp theo →':'Hoàn tất')+'</button></div></article></main>'+
      '</div></section>';
  }
  function answerPresent(a){return Array.isArray(a)?a.some(x=>x!==undefined&&x!==''):a!==undefined&&a!==null&&a!==''}
  function setRedesignMcq(i,j){if(S())S().answers[i]=j;renderRedesign()}
  function setRedesignShort(i,v){if(!S())return;S().answers[i]=String(v||'').slice(0,4)}
  function setRedesignTF(i,j,v){if(!S())return;if(!Array.isArray(S().answers[i]))S().answers[i]=[];S().answers[i][j]=v===''?undefined:v==='true'}
  function jumpRedesignQuestion(i){if(!S()?.exam)return;if(i<0||i>=S().exam.questions.length)return;S().uiQuizIndex=i;renderRedesign();setTimeout(()=>{if(typeof window.updateTimer==='function')window.updateTimer()},0)}
  function submitRedesignExam(){if(typeof window.submitExam==='function'){window.submitExam(false)}}

  function resultPage2(){
    const r=S()?.lastResult||{};return '<section class="rt-page"><div class="rt-page-head"><div><span class="rt-page-eyebrow">KẾT QUẢ</span><h2>Bài làm đã hoàn thành</h2><p>'+escapeHtml(r.examTitle||'Bài kiểm tra')+'</p></div></div><div class="rt-result-hero"><div class="rt-page-eyebrow">ĐIỂM CỦA BẠN</div><div class="rt-score">'+Number(r.score||0)+'%</div><div>'+Number(r.correct||0)+' / '+Number(r.total||0)+' câu đúng · '+Math.round(Number(r.timeSec||0)/60)+' phút</div><div class="rt-result-stats"><div class="rt-result-stat"><small>Câu đúng</small><b>'+Number(r.correct||0)+'</b></div><div class="rt-result-stat"><small>Câu sai</small><b>'+Math.max(0,Number(r.total||0)-Number(r.correct||0))+'</b></div><div class="rt-result-stat"><small>Thời gian</small><b>'+Math.round(Number(r.timeSec||0)/60)+'p</b></div></div><div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:20px"><button class="rt-button primary" onclick="studyRoute(\'history2\')">Xem lịch sử</button>'+(r.wrongIndexes?.length?'<button class="rt-button secondary" onclick="openReviewFromRedesign(\''+escAttr(r.id||'')+'\')">Ôn câu sai</button>':'')+'<button class="rt-button light" onclick="studyRoute(\'dashboard\')">Về trang chủ</button></div></div></section>';
  }

  async function openHistoryFromRedesign(id){
    const row=(S()?.history||[]).find(x=>String(x.id)===String(id));if(!row)return;
    S().lastResult={...row,wrongIndexes:row.wrong_indexes||[]};S().page='result';renderRedesign();
  }
  async function openReviewFromRedesign(id){
    if(typeof window.openReview==='function')return window.openReview(id);
  }

  async function startRedesignExam(id){
    const e=(window.exams||[]).find(x=>String(x.id)===String(id));if(!e)return alert('Không tìm thấy bài kiểm tra.');
    if(!Array.isArray(e.questions)||!e.questions.length)return alert('Bài kiểm tra này chưa có câu hỏi.');
    const s=S();s.exam=e;s.answers={};s.startedAt=Date.now();s.uiQuizIndex=0;s.page='exam';renderRedesign();if(typeof window.startTimer==='function')window.startTimer();
  }

  async function saveSettings(){
    const n=document.getElementById('rtSettingsName')?.value.trim();const c=document.getElementById('rtSettingsCode')?.value.trim();if(!n)return alert('Hãy nhập họ tên.');
    saveSession(n,c);renderRedesign();
  }
  function logoutStudy(){
    try{if(typeof window.stopSupportLive==='function')window.stopSupportLive();}catch(_){}
    clearSession();generatedPreview=null;testFilter='';if(S())S().page='landing';renderRedesign();
  }

  function settingsRoute(){return settingsPage()}

  function titleForPage(){
    const m={dashboard:'Trang chủ',tests:'Thi thử',ai:'AI trợ lý',stats:'Thống kê',history2:'Lịch sử',settings:'Cài đặt',exam:'Làm bài kiểm tra',result:'Kết quả',review:'Ôn câu sai'};
    return m[S()?.page]||'Study TH';
  }

  function contentForPage(){
    switch(S()?.page){
      case 'dashboard':return dashboardPage();
      case 'tests':return testsPage();
      case 'ai':return aiPage();
      case 'stats':return statsPage();
      case 'history2':return historyPage2();
      case 'settings':return settingsRoute();
      case 'exam':return examPage2();
      case 'result':return resultPage2();
      case 'review':
        return '<section class="rt-page">'+(typeof window.reviewPage==='function'?window.reviewPage():'')+'</section>';
      default:return dashboardPage();
    }
  }

  async function renderRedesign(){
    applyTheme();
    const s=S();
    if(!s){markReady();return}
    if(!hasSession() && !['landing','login'].includes(s.page))s.page='landing';
    if(['landing','login'].includes(s.page)){
      root().innerHTML=s.page==='landing'?landingPage():loginPage();
      markReady();
      if(s.page==='login')bindLogin();
      return;
    }
    root().innerHTML=appShell(titleForPage(),contentForPage());
    markReady();
    if(s.page==='tests' && generatorMode==='new')setTimeout(setupGenerator,0);
    if(s.page==='ai')setTimeout(bindAi,0);
    if(s.page==='exam'&&typeof window.updateTimer==='function')setTimeout(window.updateTimer,0);
  }

  function bindLogin(){
    const form=document.getElementById('rtLoginForm');if(!form||form.dataset.bound)return;form.dataset.bound='1';
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const name=document.getElementById('rtLoginName').value.trim();const code=document.getElementById('rtLoginCode').value.trim();const err=document.getElementById('rtLoginError');
      if(!name){err.textContent='Hãy nhập họ và tên.';return}
      if(name.length<2){err.textContent='Họ tên quá ngắn.';return}
      saveSession(name,code);S().page='dashboard';
      try{if(typeof window.loadExams==='function')await window.loadExams();if(typeof window.loadHistory==='function')await window.loadHistory()}catch(_){}
      await renderRedesign();
    });
  }

  function bindAi(){
    const input=document.getElementById('rtAiInput');const btn=document.getElementById('rtAiSend');if(!input||!btn)return;
    if(input.dataset.bound)return;input.dataset.bound='1';
    btn.addEventListener('click',sendRedesignAI);
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendRedesignAI()}});
  }

  function toggleStudySidebar(){
    const side=document.getElementById('rtSidebar');if(!side)return;side.classList.toggle('open');
    document.body.classList.toggle('rt-menu-open',side.classList.contains('open'));
  }

  async function studyRoute(p){
    const map={home:'dashboard',history:'history2',support:'ai',subject:'tests'};
    p=map[p]||p;
    if(!hasSession()&&!['landing','login'].includes(p)){S().page='login';return renderRedesign()}
    if(p==='landing'||p==='login'){S().page=p;return renderRedesign()}
    if(p==='admin'){location.href='/admin/';return}
    try{
      if(p==='dashboard'&&typeof window.loadHistory==='function')await window.loadHistory();
      if((p==='tests'||p==='dashboard')&&typeof window.loadExams==='function')await window.loadExams();
      if(p==='ai'&&S().page!=='ai'){try{if(typeof window.stopSupportLive==='function')window.stopSupportLive()}catch(_){}}
    }catch(_){}
    S().page=p;
    await renderRedesign();
  }

  function install(){
    applyTheme();
    const s=S();if(!s)return;
    const existing=readSession();
    if(existing){s.candidate=existing.candidate;s.code=existing.code;s.page=s.page==='home'||s.page==='landing'?'dashboard':s.page}
    else{s.page='landing'}
    window.render=renderRedesign;
    window.studyRoute=studyRoute;
    window.logoutStudy=logoutStudy;
    window.toggleTheme=toggleTheme;
    window.toggleStudySidebar=toggleStudySidebar;
    window.setGeneratorMode=setGeneratorMode;
    window.filterTestsSubject=filterTestsSubject;
    window.generateRedesignExam=generateRedesignExam;
    window.saveGeneratedAndStart=saveGeneratedAndStart;
    window.startRedesignExam=startRedesignExam;
    window.jumpRedesignQuestion=jumpRedesignQuestion;
    window.setRedesignMcq=setRedesignMcq;
    window.setRedesignShort=setRedesignShort;
    window.setRedesignTF=setRedesignTF;
    window.submitRedesignExam=submitRedesignExam;
    window.openHistoryFromRedesign=openHistoryFromRedesign;
    window.openReviewFromRedesign=openReviewFromRedesign;
    window.saveSettings=saveSettings;
    window.useAiSuggestion=useAiSuggestion;
    window.togglePublicTheme=toggleTheme;
    window.go=studyRoute;
    renderRedesign();
    if(s.page==='dashboard'){Promise.allSettled([window.loadExams?.(),window.loadHistory?.()]).then(renderRedesign)}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else boot();
  function boot(){
    if(window.__studyAppReady)install();else window.addEventListener('study-app-loaded',install,{once:true});
    setTimeout(()=>{if(!document.body.classList.contains('redesign-ready')){if(window.__studyAppReady)install();else document.body.classList.remove('redesign-pending')}},6000);
  }
  window.addEventListener('study-app-loaded',()=>setTimeout(()=>install(),0));
})();
