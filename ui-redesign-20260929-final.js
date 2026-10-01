/* STUDY TH — FINAL USER EXPERIENCE */
(function(){
  'use strict';

  if (window.__studyThFinalUi) return;
  window.__studyThFinalUi = true;

  const SESSION_KEY = 'study_student_session_v4';
  let studentUser = null;
  let learnerExams = [];
  let learnerFlashcards = [];
  let learnerLastSyncAt = 0;
  let learnerSyncState = 'Đang đồng bộ';

  function state(){ return window.state || null; }
  function root(){ return document.getElementById('app'); }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"]/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }
  async function restoreStudentSession(){
    try{
      const existing=getSession();
      if(existing?.preview && existing?.candidate){
        studentUser={id:'preview',full_name:existing.candidate,student_code:'',preview:true};
        return true;
      }
      if(!existing?.candidate || !existing?.code) {
        studentUser=null;
        return false;
      }
      const db=window.loadSupabase?await window.loadSupabase():null;
      if(!db) return false;
      const {data,error}=await db.rpc('lookup_student_login',{
        p_name:existing.candidate,
        p_code:existing.code
      });
      if(error || !data?.ok || !data?.user){
        studentUser=null;
        clearSession();
        return false;
      }
      studentUser=data.user;
      saveSession(data.user.full_name||existing.candidate,data.user.student_code||existing.code);
      return true;
    }catch(e){
      console.warn('[STUDY student session]',e);
      studentUser=null;
      return false;
    }
  }
  function getSession(){
    try{
      const v = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if(v && v.candidate) return v;
      
    }catch(_){}
    return null;
  }
  function loggedIn(){
    return !!studentUser;
  }
  function userName(){ return getSession()?.candidate || state()?.candidate || localStorage.getItem('study_candidate') || 'Người học'; }
  function userCode(){ return getSession()?.code || state()?.code || localStorage.getItem('study_code') || ''; }
  function saveSession(name, code, preview=false){
    const v = {candidate:name, code:code || '', preview:!!preview, auth:true, at:new Date().toISOString()};
    localStorage.setItem(SESSION_KEY, JSON.stringify(v));
    localStorage.setItem('study_candidate', name);
    localStorage.setItem('study_code', code || '');
    if(state()){ state().candidate=name; state().code=code || ''; }
  }
  function clearSession(){
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('study_candidate');
    localStorage.removeItem('study_code');
  }
  function exams(){
    if (Array.isArray(learnerExams) && learnerExams.length) return learnerExams;
    return Array.isArray(window.exams) ? window.exams : [];
  }

  // The final learner UI owns its own exam list instead of depending on the
  // legacy app-loader bridge. This guarantees the dashboard and Thi thử page
  // see the same active exams that the public server endpoint exposes.
  async function refreshLearnerExams(){
    const normalize=function(rows){
      return (Array.isArray(rows)?rows:[])
        .filter(function(e){return e && e.flashcard_only!==true && String(e.status||'active')==='active';})
        .map(function(e){return Object.assign({},e,{questions:Array.isArray(e.questions)?e.questions:[]});});
    };
    let lastError=null;

    // Primary path: read the public Supabase table directly. The student app
    // must not depend on an Admin-only route or on server-side service keys.
    try{
      const base=(window.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co').replace(/\/$/,'');
      const key=window.SUPABASE_KEY||'sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
      const r=await fetch(base+'/rest/v1/exams?select=id,title,subject,difficulty,duration,question_count,flashcard_only,status,open_at,close_at,created_at&status=eq.active&order=created_at.desc&limit=200',{
        method:'GET',cache:'no-store',
        headers:{'Accept':'application/json','apikey':key,'Authorization':'Bearer '+key}
      });
      const d=await r.json().catch(function(){return [];});
      if(!r.ok || !Array.isArray(d)) throw new Error('Supabase HTTP '+r.status);
      learnerExams=normalize(d);
      try{window.exams=learnerExams;}catch(_){}
      learnerLastSyncAt=Date.now();
      learnerSyncState='Đã đồng bộ';
      return learnerExams;
    }catch(e){ lastError=e; }

    // Secondary path: same-origin public endpoint.
    try{
      const r=await fetch('/api/admin-tools?route=public-exams',{method:'GET',credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}});
      const d=await r.json().catch(function(){return {};});
      if(!r.ok || !Array.isArray(d.exams)) throw new Error(d?.error || ('HTTP '+r.status));
      learnerExams=normalize(d.exams);
      try{window.exams=learnerExams;}catch(_){}
      learnerLastSyncAt=Date.now();
      learnerSyncState='Đã đồng bộ';
      return learnerExams;
    }catch(e){ lastError=lastError||e; }

    // Tertiary path: let the legacy loader try its own direct Supabase path.
    try{
      if(typeof window.loadExams==='function'){
        const rows=await window.loadExams();
        if(Array.isArray(rows) && rows.length){
          learnerExams=normalize(rows);
          try{window.exams=learnerExams;}catch(_){}
          learnerLastSyncAt=Date.now();
          learnerSyncState='Đã đồng bộ';
          return learnerExams;
        }
      }
    }catch(e){ lastError=lastError||e; }

    // Never recurse through exams() here: when both arrays are empty that
    // previously created a recursion loop and left the page apparently frozen.
    learnerSyncState='Chưa đồng bộ được';
    if(lastError) console.warn('[STUDY learner exams]',lastError);
    return Array.isArray(learnerExams)?learnerExams:[];
  }
  async function refreshLearnerFlashcards(){
    try{
      const url=(window.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co')+'/rest/v1/exams?select=id,title,subject,difficulty,duration,question_count,flashcard_only,status,created_at&status=eq.active&flashcard_only=eq.true&order=created_at.desc&limit=100';
      const key=window.SUPABASE_KEY||'sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
      const r=await fetch(url,{method:'GET',cache:'no-store',headers:{'Accept':'application/json','apikey':key,'Authorization':'Bearer '+key}});
      const d=await r.json().catch(()=>[]);
      if(!r.ok||!Array.isArray(d))throw new Error('Không tải được Flashcard.');
      learnerFlashcards=d.map(function(e){return Object.assign({},e,{questions:[]})});
      learnerLastSyncAt=Date.now(); learnerSyncState='Đã đồng bộ';
      return learnerFlashcards;
    }catch(e){ return Array.isArray(learnerFlashcards)?learnerFlashcards:[]; }
  }
  function history(){
    const h = state()?.history;
    return Array.isArray(h) ? h : [];
  }
  function metrics(){
    const h = history();
    const scores = h.map(x=>Number(x.score||0)).filter(Number.isFinite);
    const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    const best = scores.length ? Math.max.apply(Math,scores) : 0;
    const seconds = h.reduce((a,x)=>a+Number(x.duration_seconds||x.timeSec||0),0);
    const active = {};
    const week = h.filter(x=>x.created_at && Date.now()-new Date(x.created_at).getTime() <= 7*86400000);
    week.forEach(x=>active[new Date(x.created_at).toLocaleDateString('sv-VN')] = 1);
    return {
      total:h.length, avg, best, hours:seconds/3600,
      week:week.length, activeDays:Object.keys(active).length,
      streak:calcStreak(h)
    };
  }
  function calcStreak(h){
    const days={};
    h.forEach(x=>{ if(x.created_at) days[new Date(x.created_at).toLocaleDateString('sv-VN')]=1; });
    let n=0, d=new Date();
    for(let i=0;i<365;i++){
      const k=new Date(d.getTime()-i*86400000).toLocaleDateString('sv-VN');
      if(days[k]) n++; else if(i) break;
    }
    return n;
  }
  function subjects(){
    const map = new Map();
    exams().forEach(e=>{
      const s=String(e.subject||'').trim();
      if(s) map.set(s,(map.get(s)||0)+1);
    });
    ['Toán','Tiếng Anh','Ngữ Văn'].forEach(s=>{ if(!map.has(s)) map.set(s,0); });
    const icon={Toán:'📐','Tiếng Anh':'🇬🇧','Ngữ Văn':'📖','Vật lý':'⚛️','Hóa học':'🧪','Sinh học':'🧬'};
    return Array.from(map.entries()).slice(0,6).map(([name,count])=>({name,count,icon:icon[name]||'📚'}));
  }

  function publicHome(){
    return `
      <div class="fx-public">
        <header class="fx-public-bar">
          <div class="fx-brand"><span>🎓</span><b>STUDY TH</b></div>
          <button class="fx-btn fx-primary" data-action="login">Đăng nhập →</button>
        </header>
        <section class="fx-public-hero">
          <div class="fx-public-copy">
            <span class="fx-eyebrow">HỌC TẬP THÔNG MINH · STUDY TH</span>
            <h1>Học dễ hơn.<br><span>Hiệu quả hơn.</span><br>Vui hơn mỗi ngày.</h1>
            <p>Một không gian học tập riêng cho việc học, làm bài, theo dõi tiến độ và nhận hỗ trợ khi cần.</p>
            <div class="fx-cta"><button class="fx-btn fx-primary" data-action="login">Bắt đầu ngay →</button><button class="fx-btn fx-secondary" data-action="login">Đăng nhập</button></div>
          </div>
          <div class="fx-preview">
            <div class="fx-preview-head"><b>BẢNG HỌC TẬP</b><span>● Sẵn sàng</span></div>
            <strong>Không gian học tập của bạn</strong>
            <div class="fx-preview-stat"><i></i><i></i><i></i></div>
            <div class="fx-preview-grid"><div>📝<b>Thi thử</b></div><div>🤖<b>AI trợ lý</b></div><div>📊<b>Thống kê</b></div><div>🕘<b>Lịch sử</b></div></div>
          </div>
        </section>
      </div>`;
  }

  function loginPage(){
    return `
      <div class="fx-login">
        <div class="fx-login-side">
          <div class="fx-brand"><span>🎓</span><b>STUDY TH</b></div>
          <span class="fx-eyebrow">KHU VỰC NGƯỜI DÙNG</span>
          <h1>Chào mừng bạn quay lại.</h1>
          <p>Đăng nhập bằng tài khoản thật để dữ liệu học tập được gắn với hồ sơ của bạn.</p>
          <div class="fx-login-points"><div>✓ Tài khoản riêng</div><div>✓ Lưu tiến độ & lịch sử</div><div>✓ Admin có thể quản lý tài khoản</div></div>
        </div>
        <div class="fx-login-panel">
          <div class="fx-login-tabs"><button type="button" class="fx-link fx-auth-tab active" data-auth-mode="login">Đăng nhập</button><button type="button" class="fx-link fx-auth-tab" data-auth-mode="register">Đăng ký</button></div>
          <form class="fx-login-form" id="fxLoginForm">
            <span class="fx-eyebrow" id="fxAuthEyebrow">ĐĂNG NHẬP</span>
            <h2 id="fxAuthTitle">Tiếp tục học tập</h2>
            <p id="fxAuthDesc">Nhập họ tên và mã học sinh để tiếp tục.</p>
            <label id="fxNameWrap">Họ và tên<input id="fxName" autocomplete="name" placeholder="Ví dụ: Nguyễn Văn A"></label>
            <label id="fxCodeWrap">Mã học sinh<input id="fxCode" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="numeric" placeholder="Ví dụ: 483217"></label>
            <label id="fxEmailWrap">Email<input id="fxEmail" type="email" autocomplete="email" placeholder="ban@example.com"></label>
            <label id="fxPasswordWrap">Mật khẩu<input id="fxPassword" type="password" autocomplete="new-password" minlength="8" placeholder="Ít nhất 8 ký tự"></label>
            <div id="fxLoginError" class="fx-error"></div>
            <button class="fx-btn fx-primary fx-wide" type="submit" id="fxAuthSubmit">Đăng nhập →</button>
            <div class="fx-register-box" id="fxRegisterBox">
              <div><b>Chưa có tài khoản?</b><small>Đăng ký bằng email để tạo hồ sơ học tập riêng và lưu tên cùng mã học sinh.</small></div>
              <button class="fx-register-btn" type="button" data-auth-mode="register">Đăng ký ngay →</button>
            </div>
            <button class="fx-link" type="button" data-action="public">← Quay lại trang chủ</button>
          </form>
        </div>
      </div>`;
  }

  const NAV = [
    ['home','⌂','Trang chủ'],
    ['learning','📖','Học tập'],
    ['tests','📝','Thi thử'],
    ['ai','🤖','AI trợ lý'],
    ['history','🕘','Lịch sử'],
    ['stats','📊','Thống kê'],
    ['achievements','🏆','Thành tích'],
    ['support','💬','Hỗ trợ'],
    ['settings','⚙','Cài đặt']
  ];

  function ensureSyncBarStyle(){
    if(document.getElementById('fx-sync-bar-style'))return;
    const s=document.createElement('style');s.id='fx-sync-bar-style';
    s.textContent='.fx-sync-bar{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:10px 12px;border:1px solid #dbe4f2;border-radius:14px;background:#f8fbff}.fx-sync-dot{width:9px;height:9px;border-radius:50%;background:#35b878;flex:none}.fx-sync-bar>div{min-width:0;flex:1}.fx-sync-bar b{display:block;font-size:12px}.fx-sync-bar small{display:block;color:#718096;font-size:10px;margin-top:2px}.fx-sync-bar button{border:1px solid #d7e0ef;background:#fff;border-radius:10px;padding:7px 9px;font:inherit;font-size:10px;cursor:pointer;white-space:nowrap}';
    document.head.appendChild(s);
  }
  function shell(content){
    const p=state()?.page || 'home';
    const renderNav=(items)=>items.map(([k,ic,label])=>`<button class="fx-nav-item ${p===k?'active':''}" data-nav="${k}"><span>${ic}</span><b>${label}</b></button>`).join('');
    const primaryNav=renderNav(NAV.slice(0,7));
    const systemNav=renderNav(NAV.slice(7));
    return `
      <div class="fx-app">
        <aside class="fx-sidebar" id="fxSidebar">
          <div class="fx-sidebar-head">
            <button class="fx-side-brand" data-nav="home"><span>🎓</span><div><b>STUDY TH</b><small>User Center</small></div></button>
            <button class="fx-theme" data-action="theme">◐</button>
          </div>
          <div class="fx-profile-mini"><i>${esc((userName()||'U').slice(0,1).toUpperCase())}</i><div><b>${esc(userName())}</b><small>${esc(userCode()||'Phiên học tập')}</small></div><em>●</em></div>
          <div class="fx-nav-label">HỌC TẬP</div>
          <nav class="fx-nav">${primaryNav}</nav>
          <div class="fx-nav-label">HỆ THỐNG</div>
          <nav class="fx-nav">${systemNav}<button class="fx-nav-item" data-action="admin"><span>⚑</span><b>Admin</b><small>↗</small></button></nav>
          <div class="fx-side-bottom"><button class="fx-nav-item fx-danger" data-action="logout"><span>⇥</span><b>Đăng xuất</b></button></div>
        </aside>
        <div class="fx-menu-backdrop" data-action="menu-close" aria-hidden="true"></div>
        <main class="fx-main">
          <header class="fx-top">
            <div class="fx-top-left">
              <button class="fx-menu" data-action="menu">☰</button>
              <div><span class="fx-kicker">STUDY TH</span><h1>${pageTitle()}</h1></div>
            </div>
            <div class="fx-top-search"><span>⌕</span><input id="fxSearch" placeholder="Tìm kiếm chủ đề, bài kiểm tra..."><div id="fxSearchResults" class="fx-search-results"></div></div>
            <div class="fx-top-right"><button class="fx-top-icon" data-action="theme">◐</button><button class="fx-user" data-action="profile"><i>${esc((userName()||'U').slice(0,1).toUpperCase())}</i><b>${esc(userName())}</b></button></div>
          </header>
          <section class="fx-content">${content}</section>
        </main>
      </div>`;
  }

  function pageTitle(){
    const p=state()?.page;
    return {home:'Trang chủ',learning:'Học tập',tests:'Thi thử',ai:'AI trợ lý',history:'Lịch sử',stats:'Thống kê',achievements:'Thành tích',support:'Hỗ trợ',settings:'Cài đặt',subject:'Bài kiểm tra',exam:'Làm bài kiểm tra',result:'Kết quả',review:'Ôn câu sai'}[p] || 'Học tập';
  }

  function dashboard(){
    const m=metrics(), ex=exams(), subs=subjects(), weekPct=Math.min(100,Math.round(m.week/5*100));
    return `
      <div class="fx-page-head">
        <div><span class="fx-eyebrow">TỔNG QUAN</span><h2>Chào buổi tối, ${esc(userName())}! 👋</h2><p>Có gì hôm nay, mình cùng nhìn lại và tiếp tục học nhé.</p></div>
        <div class="fx-head-actions"><button class="fx-btn fx-secondary" data-nav="learning">Học tập</button><button class="fx-btn fx-primary" data-nav="tests">Làm bài →</button></div>
      </div>
      <div class="fx-stats">
        ${statCard('📝',m.total,'Bài đã làm',m.total? 'Đã cập nhật':'Bắt đầu mới')}
        ${statCard('◷',m.hours.toFixed(1)+'h','Thời gian học',m.hours? 'Theo lịch sử':'—')}
        ${statCard('◎',m.avg+'%','Điểm trung bình',m.best?'Cao nhất '+m.best+'%':'Chưa có điểm')}
        ${statCard('🔥',m.streak+' ngày','Chuỗi học tập',m.streak?'Đang duy trì':'Bắt đầu chuỗi')}
      </div>
      <section class="fx-section">
        <div class="fx-section-head"><div><span>MÔN HỌC</span><h3>Môn bạn đang học</h3></div><small>${ex.length} đề đang có</small></div>
        <div class="fx-subjects">
          ${subs.slice(0,4).map((s,i)=>`<button class="fx-subject fx-s${i}" data-subject="${esc(s.name)}"><span>${s.icon}</span><div><b>${esc(s.name)}</b><small>${s.count} bài kiểm tra</small></div><strong>→</strong></button>`).join('')}
        </div>
      </section>
      <div class="fx-dashboard-grid">
        <article class="fx-card fx-week">
          <div class="fx-card-head"><div><span class="fx-eyebrow">TIẾN ĐỘ TUẦN NÀY</span><h3>Giữ nhịp học đều</h3><p>${m.week} lượt làm · ${m.activeDays} ngày có hoạt động trong 7 ngày qua.</p></div><strong>${weekPct}%</strong></div>
          <div class="fx-week-meta"><div><small>Mục tiêu</small><b>5 lượt</b></div><div><small>Đã đạt</small><b>${m.week}</b></div><div><small>Còn lại</small><b>${Math.max(0,5-m.week)}</b></div></div>
          <div class="fx-bar"><i style="width:${weekPct}%"></i></div>
        </article>
        <article class="fx-card">
          <div class="fx-card-head"><div><span class="fx-eyebrow">ĐIỂM SỐ</span><h3>Xu hướng gần đây</h3><p>Điểm của các lượt làm gần nhất.</p></div></div>
          <div class="fx-trend">${m.total ? history().slice(-7).map(x=>`<i style="height:${Math.max(12,Math.min(100,Number(x.score||0)))}%"></i>`).join('') : '<span>Chưa có dữ liệu</span>'}</div>
        </article>
      </div>
      <div class="fx-dashboard-grid fx-lower">
        <article class="fx-card">
          <div class="fx-card-head"><div><span class="fx-eyebrow">HOẠT ĐỘNG</span><h3>Gần đây</h3><p>Những gì bạn vừa hoàn thành.</p></div><button class="fx-link-btn" data-nav="history">Xem lịch sử →</button></div>
          ${m.total ? '<div class="fx-activity">'+history().slice(0,4).map(r=>`<div><span>✓</span><p><b>${esc(r.exam_title||'Bài kiểm tra')}</b><small>${Number(r.correct||0)}/${Number(r.total||0)} câu · ${new Date(r.created_at||Date.now()).toLocaleDateString('vi-VN')}</small></p><strong>${Number(r.score||0)}%</strong></div>`).join('')+'</div>' : '<div class="fx-empty"><span>📘</span><b>Chưa có hoạt động</b><small>Hoàn thành bài đầu tiên để bắt đầu.</small></div>'}
        </article>
        <article class="fx-card">
          <div class="fx-card-head"><div><span class="fx-eyebrow">TỔNG HỢP</span><h3>Thông tin học tập</h3><p>Những chỉ số bạn có thể xem nhanh.</p></div></div>
          <div class="fx-summary"><div><span>Điểm cao nhất</span><b>${m.best}%</b></div><div><span>Ngày học liên tiếp</span><b>${m.streak}</b></div><div><span>Hoạt động tuần</span><b>${m.activeDays}/7</b></div><div><span>Đề đang có</span><b>${ex.length}</b></div></div>
        </article>
      </div>`;
  }

  function statCard(icon,value,label,note){
    return `<article class="fx-card fx-stat"><span>${icon}</span><div><b>${esc(value)}</b><small>${esc(label)}</small><em>${esc(note)}</em></div></article>`;
  }

  function learning(){
    const cards=Array.isArray(learnerFlashcards)?learnerFlashcards:[];
    return `
      <div class="fx-page-head">
        <div><span class="fx-eyebrow">HỌC TẬP</span><h2>Không gian học tập</h2><p>Flashcard do Admin tạo sẽ được đồng bộ trực tiếp và xuất hiện tại đây.</p></div>
      ${syncStatusHtml()}
      </div>
      <section class="fx-learning-coming">
        <article class="fx-card fx-learning-main">
          <div class="fx-learning-icon">📚</div>
          <span class="fx-eyebrow">FLASHCARD</span>
          <h3>${cards.length} bộ Flashcard đang có</h3>
          <p>Flashcard là nội dung học riêng và không bị tính vào số bài Thi thử.</p>
          <div class="fx-learning-actions"><button class="fx-btn fx-primary" data-nav="tests">Vào Thi thử →</button><button class="fx-btn fx-secondary" data-nav="ai">Hỏi AI trợ lý</button></div>
        </article>
        <article class="fx-card fx-learning-side">
          <span class="fx-eyebrow">TIẾN ĐỘ</span><h3>Tiến độ của bạn</h3>
          <div class="fx-learning-stat"><b>${metrics().total}</b><span>lượt làm bài</span></div>
          <div class="fx-learning-stat"><b>${metrics().avg}%</b><span>điểm trung bình</span></div>
          <div class="fx-learning-stat"><b>${metrics().streak}</b><span>ngày liên tiếp</span></div>
          <button class="fx-link-btn" data-nav="stats">Xem thống kê →</button>
        </article>
      </section>
      <article class="fx-card fx-pad" style="margin-top:18px">
        <div class="fx-card-head"><div><span class="fx-eyebrow">BỘ TỪ VỰNG</span><h3>Flashcard đã tạo</h3><p>Dữ liệu mới tạo ở Admin sẽ xuất hiện sau khi đồng bộ.</p></div></div>
        <div class="fx-exams">
          ${cards.length?cards.map(function(e){return '<div class="fx-exam-row"><span>📚</span><div><b>'+esc(e.title||'Flashcard')+'</b><small>'+esc(e.subject||'')+' · '+Number(e.question_count||0)+' thẻ · '+esc(e.difficulty||'')+'</small></div><button class="fx-btn fx-primary" data-flashcard="'+esc(e.id)+'">Học ngay</button></div>';}).join(''):'<div class="fx-empty"><span>📚</span><b>Chưa có Flashcard</b><small>Khi Admin tạo bộ mới, bộ đó sẽ xuất hiện ở đây.</small></div>'}
        </div>
      </article>`;
  }
  function syncStatusHtml(){
    const t=learnerLastSyncAt?new Date(learnerLastSyncAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
    const testsCount=Array.isArray(learnerExams)?learnerExams.length:0;
    const flashCount=Array.isArray(learnerFlashcards)?learnerFlashcards.length:0;
    return '<div class="fx-sync-bar"><span class="fx-sync-dot"></span><div><b>'+esc(learnerSyncState)+'</b><small>Cập nhật lúc '+esc(t)+' · '+testsCount+' bài kiểm tra · '+flashCount+' Flashcard</small></div><button type="button" data-action="refresh-data">↻ Cập nhật</button></div>';
  }
  function tests(){
    const list=exams();
    const activeSubjects=Array.from(new Set(list.map(e=>String(e.subject||'').trim()).filter(Boolean)));
    const filterSubjects=activeSubjects.length?activeSubjects:['Toán','Tiếng Anh','Ngữ Văn'];
    return `
      <div class="fx-page-head">
        <div>
          <span class="fx-eyebrow">THI THỬ</span>
          <h2>Thư viện bài kiểm tra</h2>
          <p>Chọn môn, xem nhanh số câu, thời gian và mức độ rồi bắt đầu làm bài.</p>
        </div>
        <div class="fx-test-count"><b>${list.length}</b><span>đề đang có</span></div>
      </div>
      ${syncStatusHtml()}
      <div class="fx-filters"><button class="active" data-filter="">Tất cả</button>${filterSubjects.map(s=>`<button data-filter="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <article class="fx-card fx-pad">
        <div id="fxExamList" class="fx-exams">
          ${list.length?list.map(examRow).join(''):'<div class="fx-empty"><span>📝</span><b>Chưa có bài kiểm tra</b><small>Admin chưa phát hành đề nào cho người học.</small></div>'}
        </div>
      </article>`;
  }
  function examRow(e){
    const n=Array.isArray(e.questions)?e.questions.length:Number(e.question_count||0);
    return `<div class="fx-exam-row" data-subject="${esc(e.subject||'')}"><span>📝</span><div><b>${esc(e.title||'Bài kiểm tra')}</b><small>${esc(e.subject||'')} · ${n} câu · ${Number(e.duration||0)} phút · ${esc(e.difficulty||'')}</small></div><button class="fx-btn fx-primary" data-exam="${esc(e.id)}">Bắt đầu</button></div>`;
  }

  function ai(){
    return `<div class="fx-page-head"><div><span class="fx-eyebrow">AI TRỢ LÝ</span><h2>Học cùng trợ lý</h2><p>Hỏi bài, nhờ giải thích hoặc xin gợi ý từng bước.</p></div></div>
      <article class="fx-card fx-ai"><div class="fx-ai-head"><div><b>🤖 AI trợ lý học tập</b><small>Luôn sẵn sàng hỗ trợ.</small></div><span>● Sẵn sàng</span></div><div id="fxAiMsgs" class="fx-ai-msgs"><div class="fx-msg bot">Chào bạn 👋 Gửi câu hỏi hoặc bài tập, mình sẽ hỗ trợ từng bước.</div></div><form id="fxAiForm" class="fx-ai-compose"><textarea id="fxAiInput" placeholder="Nhập câu hỏi của bạn..." rows="2"></textarea><button class="fx-btn fx-primary" type="submit">➤</button></form></article>`;
  }

  function historyPage(){
    const h=history();
    return `<div class="fx-page-head"><div><span class="fx-eyebrow">LỊCH SỬ</span><h2>Lịch sử của tôi</h2><p>Các lượt làm bài đã lưu trên phiên học tập này.</p></div><button class="fx-btn fx-secondary" data-nav="stats">Xem thống kê →</button></div>
    <article class="fx-card fx-pad">${h.length?'<div class="fx-table-wrap"><table class="fx-table"><thead><tr><th>Thời gian</th><th>Bài kiểm tra</th><th>Kết quả</th><th>Thời lượng</th></tr></thead><tbody>'+h.map(r=>`<tr><td>${esc(new Date(r.created_at||Date.now()).toLocaleString('vi-VN'))}</td><td>${esc(r.exam_title||'Bài kiểm tra')}</td><td><b>${Number(r.score||0)}%</b> · ${Number(r.correct||0)}/${Number(r.total||0)}</td><td>${Math.round(Number(r.duration_seconds||r.timeSec||0)/60)} phút</td></tr>`).join('')+'</tbody></table></div>':'<div class="fx-empty"><span>🕘</span><b>Chưa có lượt làm bài</b><small>Sau khi hoàn thành đề, lịch sử sẽ xuất hiện ở đây.</small></div>'}</article>`;
  }

  function statsPage(){
    const m=metrics(), h=history().slice(-7);
    return `<div class="fx-page-head"><div><span class="fx-eyebrow">THỐNG KÊ</span><h2>Theo dõi tiến bộ</h2><p>Nhìn nhanh vào điểm số và nhịp học hiện tại.</p></div></div>
      <div class="fx-stats">${statCard('◎',m.avg+'%','Điểm trung bình','Từ lịch sử hiện có')}${statCard('★',m.best+'%','Điểm cao nhất','Mốc tốt nhất')}${statCard('◷',m.hours.toFixed(1)+'h','Thời gian học','Từ các lượt làm')}${statCard('🔥',m.streak,'Ngày liên tiếp','Chuỗi học tập')}</div>
      <div class="fx-dashboard-grid"><article class="fx-card fx-pad"><div class="fx-card-head"><div><h3>Điểm theo thời gian</h3><p>7 lượt gần nhất</p></div></div><div class="fx-linechart">${h.length?h.map((x,i)=>`<i style="left:${i*14+2}%;height:${Math.max(8,Math.min(100,Number(x.score||0)))}%"></i>`).join(''):'<span>Chưa có dữ liệu</span>'}</div></article>
      <article class="fx-card fx-pad"><div class="fx-card-head"><div><h3>Nhịp học tuần này</h3><p>${m.week} lượt · ${m.activeDays} ngày hoạt động</p></div></div><div class="fx-big-progress"><b>${Math.min(100,Math.round(m.week/5*100))}%</b><div class="fx-bar"><i style="width:${Math.min(100,Math.round(m.week/5*100))}%"></i></div></div></article></div>`;
  }

  function achievements(){
    const m=metrics();
    const defs=[['🌱','Bài đầu tiên',m.total>=1],['📚','Chăm chỉ',m.total>=5],['⭐','Điểm tốt',m.best>=80],['🔥','Giữ nhịp',m.streak>=3],['🏆','Xuất sắc',m.best>=90]];
    return `<div class="fx-page-head"><div><span class="fx-eyebrow">THÀNH TÍCH</span><h2>Các mốc đã đạt</h2><p>Thành tích được tính từ dữ liệu học tập hiện tại.</p></div></div><div class="fx-achievements">${defs.map(x=>`<article class="fx-card fx-ach ${x[2]?'':'locked'}"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]?'Đã đạt':'Chưa đạt'}</small></article>`).join('')}</div>`;
  }

  function settings(){
    return `<div class="fx-page-head"><div><span class="fx-eyebrow">CÀI ĐẶT</span><h2>Hồ sơ cá nhân</h2><p>Cập nhật thông tin hiển thị và giao diện.</p></div></div><div class="fx-settings">
      <article class="fx-card fx-pad"><div class="fx-card-head"><div><h3>Thông tin học tập</h3><p>Mã học sinh được hệ thống cấp tự động và không thể tự đổi.</p></div></div><div class="fx-form-grid"><label>Họ và tên<input id="fxSetName" value="${esc(userName())}"></label><label>Mã học sinh<input id="fxSetCode" value="${esc(userCode())}" readonly></label></div><button class="fx-btn fx-primary" data-action="save-profile">Lưu thay đổi</button></article>
      <article class="fx-card fx-pad"><div class="fx-card-head"><div><h3>Giao diện</h3><p>Chuyển giữa sáng và tối.</p></div></div><button class="fx-btn fx-secondary" data-action="theme">◐ Đổi giao diện</button></article></div>`;
  }

  function supportPage(){
    const s=state()||{};
    const accounts=Array.isArray(s.supportAccounts)?s.supportAccounts:[];
    const msgs=Array.isArray(s.messages)?s.messages:[];
    const current=accounts.find(a=>String(a.id)===String(s.supportAccountId))||accounts[0]||{};
    return `
      <div class="fx-page-head fx-support-page-head">
        <div>
          <span class="fx-eyebrow">HỖ TRỢ TRỰC TIẾP</span>
          <h2>Trung tâm hỗ trợ</h2>
          <p>Chọn đúng kênh rồi gửi câu hỏi. Tin nhắn được cập nhật theo thời gian thực.</p>
        </div>
        <button class="fx-btn fx-secondary" data-action="open-ai-support">🤖 Hỏi AI</button>
      </div>

      <section class="fx-support-shell" aria-label="Trung tâm hỗ trợ">
        <aside class="fx-support-channels">
          <div class="fx-support-label">KÊNH HỖ TRỢ</div>
          <div class="fx-support-account-list">
            ${accounts.length ? accounts.map(a=>`
              <button type="button" class="fx-support-account ${String(a.id)===String(current.id)?'active':''}" data-support-account="${esc(a.id)}">
                <span>${esc(a.avatar||'💬')}</span>
                <div>
                  <b>${esc(a.name||'Hỗ trợ')}</b>
                  <small>${esc(a.description||'Kênh hỗ trợ')}</small>
                </div>
                <i>›</i>
              </button>`).join('') : '<div class="fx-support-empty">Chưa có kênh hỗ trợ.</div>'}
          </div>
        </aside>

        <section class="fx-support-chat">
          <header class="fx-support-chat-head">
            <div class="fx-support-chat-identity">
              <span>${esc(current.avatar||'💬')}</span>
              <div>
                <b>${esc(current.name||'Hỗ trợ chung')}</b>
                <small><i></i> Đang hoạt động</small>
              </div>
            </div>
            <button type="button" class="fx-top-icon" data-action="refresh-support" aria-label="Làm mới">↻</button>
          </header>

          <div class="fx-support-messages" id="fxSupportMessages">
            ${msgs.length ? msgs.map(m=>`
              <div class="fx-support-msg ${m.sender==='user'?'user':m.sender==='admin'?'admin':'bot'}">
                <div class="fx-support-bubble">
                  <small>${esc(m.sender_name||(m.sender==='admin'?'Hỗ trợ':m.sender==='bot'?'Bot':'Bạn'))}</small>
                  <p>${esc(m.message||'')}</p>
                  <time>${m.created_at?esc(new Date(m.created_at).toLocaleString('vi-VN')):''}</time>
                </div>
              </div>`).join('') : `
                <div class="fx-support-empty-big">
                  <span>💬</span>
                  <b>Bắt đầu cuộc trò chuyện</b>
                  <small>Gửi câu hỏi hoặc mô tả vấn đề của bạn bên dưới.</small>
                </div>`}
          </div>

          <form id="fxSupportForm" class="fx-support-composer">
            <textarea id="fxSupportInput" rows="1" placeholder="Nhập câu hỏi hoặc vấn đề bạn cần hỗ trợ..."></textarea>
            <button class="fx-btn fx-primary" type="submit">Gửi</button>
          </form>
        </section>
      </section>`;
  }
  function flashcardPage(){
    const e=state().flashcardExam;
    const qs=Array.isArray(e?.questions)?e.questions.filter(function(q){return q&&String(q.front||q.term||'').trim()&&String(q.back||q.definition||q.answer||'').trim()}):[];
    const idx=Math.max(0,Math.min(qs.length-1,Number(state().flashIndex||0)));
    const q=qs[idx], flipped=!!state().flashFlipped;
    if(!q)return '<div class="fx-empty"><b>Không có dữ liệu Flashcard.</b><button class="fx-btn fx-secondary" data-nav="learning">Quay lại</button></div>';
    return '<div class="fx-page-head"><div><span class="fx-eyebrow">FLASHCARD</span><h2>'+esc(e.title||'Flashcard')+'</h2><p>'+String(idx+1)+'/'+String(qs.length)+' thẻ</p></div><button class="fx-btn fx-secondary" data-nav="learning">← Thoát</button></div>'
      +'<article class="fx-card fx-pad"><div style="display:grid;gap:18px;max-width:760px;margin:0 auto">'
      +'<button type="button" data-flip-card style="min-height:300px;border:1px solid #dce3ef;border-radius:28px;background:#fff;padding:32px;text-align:center;cursor:pointer">'
      +'<small>'+(flipped?'NGHĨA':'TỪ / CỤM TỪ')+'</small><div style="font-size:34px;font-weight:800;margin:28px 0 14px">'+esc(flipped?(q.back||q.definition||q.answer):(q.front||q.term))+'</div>'
      +(!flipped&&q.phonetic?'<div class="muted">'+esc(q.phonetic)+'</div>':'')
      +(flipped&&q.example?'<div class="muted">'+esc(q.example)+'</div>':'')
      +'<div class="muted" style="margin-top:24px">Chạm vào thẻ để lật</div></button>'
      +'<div style="display:flex;justify-content:center;gap:10px"><button class="fx-btn fx-secondary" data-flash-prev '+(idx<=0?'disabled':'')+'>← Trước</button><button class="fx-btn fx-primary" data-flash-next '+(idx>=qs.length-1?'disabled':'')+'>Tiếp →</button></div>'
      +'</div></article>';
  }
  function content(){
    switch(state()?.page){
      case 'home': return dashboard();
      case 'learning': return learning();
      case 'tests': return tests();
      case 'ai': return ai();
      case 'history': return historyPage();
      case 'stats': return statsPage();
      case 'achievements': return achievements();
      case 'settings': return settings();
      case 'support': return supportPage();
      case 'flashcard': return flashcardPage();
      case 'subject':
      case 'exam':
      case 'result':
      case 'review':
        return typeof window.page==='function' ? window.page() : '<div class="fx-empty"><b>Chức năng đang tải...</b></div>';
      default: return dashboard();
    }
  }

  function renderFinal(){
    if(!state() || !root()) return;
    if(!loggedIn()){
      if(state().page!=='login') state().page='login';
      root().innerHTML = loginPage();
      bindPublic();
      return;
    }
    if(state().page==='public'||state().page==='login') state().page='home';
    root().innerHTML=shell(content());
    bindShell();
  }

  function bindPublic(){
    root().querySelectorAll('[data-action="login"]').forEach(b=>b.onclick=()=>{state().page='login';renderFinal();});
    root().querySelectorAll('[data-action="public"]').forEach(b=>b.onclick=()=>{state().page='login';renderFinal();});
    root().querySelectorAll('[data-auth-mode]').forEach(b=>b.onclick=()=>setAuthMode(b.dataset.authMode));
    root().querySelector('#fxLoginForm')?.addEventListener('submit',submitAuth);
    setAuthMode('login');
  }
  function setAuthMode(mode){
    const register=mode==='register';
    root().querySelectorAll('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));

    const codeWrap=root().querySelector('#fxCodeWrap');
    const emailWrap=root().querySelector('#fxEmailWrap');
    const passwordWrap=root().querySelector('#fxPasswordWrap');
    const title=root().querySelector('#fxAuthTitle');
    const desc=root().querySelector('#fxAuthDesc');
    const eyebrow=root().querySelector('#fxAuthEyebrow');
    const submit=root().querySelector('#fxAuthSubmit');
    const password=root().querySelector('#fxPassword');
    const code=root().querySelector('#fxCode');
    const email=root().querySelector('#fxEmail');
    const registerBox=root().querySelector('#fxRegisterBox');

    if(codeWrap)codeWrap.style.display=register?'none':'grid';
    if(emailWrap)emailWrap.style.display=register?'grid':'none';
    if(passwordWrap)passwordWrap.style.display=register?'grid':'none';

    if(title)title.textContent=register?'Tạo tài khoản học tập':'Tiếp tục học tập';
    if(desc)desc.textContent=register
      ?'Chỉ cần họ tên, email và mật khẩu. Hệ thống sẽ tự cấp cho bạn một mã học sinh ngẫu nhiên sau khi tạo tài khoản.'
      :'Chỉ cần họ tên và mã học sinh để đăng nhập.';
    if(eyebrow)eyebrow.textContent=register?'ĐĂNG KÝ':'ĐĂNG NHẬP';
    if(submit)submit.textContent=register?'Tạo tài khoản →':'Đăng nhập →';

    if(code){
      code.required=!register;
      code.value=register?'':code.value;
      code.autocomplete='off';
      code.inputMode='numeric';
    }
    if(email){
      email.required=register;
      email.autocomplete=register?'email':'off';
    }
    if(password){
      password.required=register;
      password.autocomplete=register?'new-password':'off';
    }
    if(registerBox)registerBox.style.display=register?'none':'flex';
  }

  function registrationSuccess(code,email){
    const panel=root().querySelector('.fx-login-panel');
    if(!panel)return;
    panel.innerHTML=`
      <section class="fx-register-success">
        <span class="fx-eyebrow">ĐĂNG KÝ THÀNH CÔNG</span>
        <div class="fx-register-success-icon">✓</div>
        <h2>Đây là mã học sinh của bạn</h2>
        <p>Hệ thống đã tự tạo mã riêng cho tài khoản. Lưu mã này để lần sau đăng nhập bằng <b>họ tên + mã học sinh</b>.</p>
        <div class="fx-student-code-card">
          <small>MÃ HỌC SINH</small>
          <strong id="fxCreatedStudentCode">${esc(code)}</strong>
          <button type="button" id="fxCopyStudentCode">Sao chép mã</button>
        </div>
        <div class="fx-register-email-note">Email xác nhận đã được gửi tới tài khoản của bạn. Hãy xác minh email rồi quay lại STUDY TH để đăng nhập.</div>
        <div class="fx-success-actions">
          <button class="fx-btn fx-primary fx-wide" type="button" id="fxGoLogin">Đăng nhập bằng mã này →</button>
          <button class="fx-link" type="button" id="fxRegisterAgain">Tạo tài khoản khác</button>
        </div>
      </section>`;
    panel.querySelector('#fxCopyStudentCode')?.addEventListener('click',async()=>{
      try{
        await navigator.clipboard.writeText(String(code));
      }catch(_){}
      const b=panel.querySelector('#fxCopyStudentCode');
      if(b){b.textContent='Đã sao chép ✓';setTimeout(()=>{if(b)b.textContent='Sao chép mã'},1200);}
    });
    panel.querySelector('#fxGoLogin')?.addEventListener('click',()=>{
      panel.innerHTML=loginPage().match(/<div class="fx-login-panel">([\s\S]*)<\/div>\s*<\/div>\s*$/)?.[1]||'';
      renderFinal();
    });
    panel.querySelector('#fxRegisterAgain')?.addEventListener('click',()=>{
      renderFinal();
      setTimeout(()=>setAuthMode('register'),0);
    });
  }

  async function submitAuth(e){
    e.preventDefault();
    const err=root().querySelector('#fxLoginError');
    const btn=root().querySelector('#fxAuthSubmit');
    const register=root().querySelector('[data-auth-mode].active')?.dataset.authMode==='register';
    const n=root().querySelector('#fxName')?.value.trim()||'';
    const c=root().querySelector('#fxCode')?.value.trim()||'';
    const email=root().querySelector('#fxEmail')?.value.trim()||'';
    const password=root().querySelector('#fxPassword')?.value||'';

    err.textContent='';
    err.className='fx-error';

    if(!n){err.textContent='Hãy nhập họ và tên.';return;}
    if(!register && !c){err.textContent='Hãy nhập mã học sinh hoặc mã dự phòng kiểm tra.';return;}
    if(!register && !/^\d{6}$/.test(c) && !/^\d{8}$/.test(c)){err.textContent='Mã học sinh gồm 6 chữ số; mã dự phòng kiểm tra gồm 8 chữ số.';return;}
    if(register && !email){err.textContent='Hãy nhập email để tạo tài khoản.';return;}
    if(register && password.length<8){err.textContent='Mật khẩu đăng ký phải có ít nhất 8 ký tự.';return;}

    btn.disabled=true;
    btn.textContent=register?'Đang tạo tài khoản...':'Đang đăng nhập...';

    try{
      if(register){
        const db=window.loadSupabase?await window.loadSupabase():null;
        if(!db?.auth)throw new Error('Hệ thống tài khoản chưa sẵn sàng.');

        const {data,error}=await db.auth.signUp({
          email,
          password,
          options:{
            data:{full_name:n},
            emailRedirectTo:'https://hoc-va-choi.vercel.app/?email_confirmed=1'
          }
        });
        if(error)throw error;
        if(!data?.user?.id)throw new Error('Không nhận được mã tài khoản sau khi đăng ký.');

        let generatedCode='';
        for(let attempt=0;attempt<5 && !generatedCode;attempt++){
          const {data:codeData,error:codeError}=await db.rpc('get_registration_code',{
            p_user_id:null,
            p_email:email
          });
          if(codeError)throw codeError;
          generatedCode=String(codeData||'').trim();
          if(!generatedCode)await new Promise(r=>setTimeout(r,150));
        }
        if(!/^\d{6}$/.test(generatedCode)){
          throw new Error('Tạo tài khoản xong nhưng chưa lấy được mã học sinh. Vui lòng thử lại.');
        }

        // Do not create a local logged-in session before email verification.
        clearSession();
        if(data?.session){
          studentUser=data.user;
          saveSession(n,generatedCode);
          if(state()){
            state().page='home';
            state().candidate=n;
            state().code=generatedCode;
          }
          try{await window.loadExams?.();}catch(_){}
          try{await window.loadHistory?.();}catch(_){}
          renderFinal();
          setTimeout(()=>openProfile(),120);
        }else{
          registrationSuccess(generatedCode,email);
        }
        return;
      }

      const db=window.loadSupabase?await window.loadSupabase():null;
      if(!db)throw new Error('Hệ thống tài khoản chưa sẵn sàng.');

      // 8-digit global preview code: intentionally does not impersonate a real account.
      // It only opens the app in preview/test mode with the supplied display name.
      if(/^\d{8}$/.test(c)){
        const {data:previewOk,error:previewError}=await db.rpc('validate_preview_access',{p_code:c});
        if(previewError)throw previewError;
        if(!previewOk)throw new Error('Mã dự phòng kiểm tra không đúng.');
        studentUser={id:'preview',full_name:n,student_code:'',preview:true};
        saveSession(n,'',true);
        if(state()){
          state().page='home';
          state().candidate=n;
          state().code='';
          state().preview=true;
        }
        try{await window.loadExams?.();}catch(_){}
        try{await window.loadHistory?.();}catch(_){}
        renderFinal();
        return;
      }

      const {data,error}=await db.rpc('lookup_student_login',{
        p_name:n,
        p_code:c
      });
      if(error)throw error;
      if(!data?.ok){
        const reason=String(data?.reason||'');
        if(reason==='unconfirmed')throw new Error('Tài khoản chưa xác minh email. Hãy mở email xác nhận trước khi đăng nhập.');
        if(reason==='ambiguous')throw new Error('Có nhiều tài khoản trùng họ tên và mã học sinh. Hãy nhờ Admin kiểm tra lại.');
        throw new Error('Họ tên hoặc mã học sinh không đúng.');
      }

      studentUser=data.user;
      saveSession(data.user.full_name||n,data.user.student_code||c,false);
      if(state()){
        state().page='home';
        state().candidate=data.user.full_name||n;
        state().code=data.user.student_code||c;
      }
      // Always hydrate from the same public endpoint used by the learner dashboard.
      // loadExams() is a legacy path and can leave window.exams empty even though
      // the Admin list already contains active tests.
      try{await window.loadExams?.();}catch(_){}
      try{await refreshLearnerExams();}catch(_){}
      try{await refreshLearnerFlashcards();}catch(_){}
      try{await window.loadHistory?.();}catch(_){}
      renderFinal();
    }catch(e){
      err.className='fx-error';
      err.textContent=e?.message||'Không thể xác thực tài khoản.';
    }finally{
      btn.disabled=false;
      setAuthMode(register?'register':'login');
    }
  }

  function bindShell(){
    ensureSyncBarStyle();
    root().querySelectorAll('[data-nav]').forEach(b=>b.onclick=async()=>{
      const target=b.getAttribute('data-nav');
      closeMenu();
      await go(target);
    });
    root().querySelectorAll('[data-action="menu"]').forEach(b=>b.onclick=toggleMenu);
    root().querySelectorAll('[data-action="menu-close"]').forEach(b=>b.onclick=closeMenu);
    root().querySelectorAll('[data-action="theme"]').forEach(b=>b.onclick=toggleTheme);
    root().querySelectorAll('[data-action="profile"]').forEach(b=>b.onclick=openProfile);
    root().querySelectorAll('[data-action="logout"]').forEach(b=>b.onclick=logout);
    root().querySelectorAll('[data-action="refresh-data"]').forEach(b=>b.onclick=async(e)=>{
      e.preventDefault();
      const btn=e.currentTarget;
      if(btn.dataset.busy==='1')return;
      btn.dataset.busy='1';
      const oldText=btn.textContent;
      btn.textContent='Đang cập nhật…';
      try{
        await refreshLearnerExams();
        await refreshLearnerFlashcards();
      }finally{
        btn.dataset.busy='0';
        renderFinal();
      }
    });
    root().querySelectorAll('[data-action="admin"]').forEach(b=>b.onclick=()=>{location.href='/admin/';});
    root().querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{state().subject=b.getAttribute('data-subject');go('tests');});
    root().querySelectorAll('[data-exam]').forEach(b=>b.onclick=(e)=>{e.preventDefault();e.stopPropagation();startExamById(b.getAttribute('data-exam'))});
    root().querySelectorAll('[data-flashcard]').forEach(b=>b.onclick=async(e)=>{e.preventDefault();e.stopPropagation();await startFlashcardById(b.getAttribute('data-flashcard'))});
    root().querySelector('[data-flip-card]')?.addEventListener('click',()=>{state().flashFlipped=!state().flashFlipped;renderFinal()});
    root().querySelector('[data-flash-prev]')?.addEventListener('click',()=>{state().flashIndex=Math.max(0,Number(state().flashIndex||0)-1);state().flashFlipped=false;renderFinal()});
    root().querySelector('[data-flash-next]')?.addEventListener('click',()=>{state().flashIndex=Math.min(Number(state().flashcardExam?.questions?.length||1)-1,Number(state().flashIndex||0)+1);state().flashFlipped=false;renderFinal()});
    root().querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{
      root().querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      const v=b.getAttribute('data-filter')||'';
      root().querySelectorAll('.fx-exam-row').forEach(x=>x.hidden=!!v && x.dataset.subject!==v);
    });
    const f=root().querySelector('#fxSearch');
    if(f){f.oninput=search;f.onkeydown=e=>{if(e.key==='Enter'){const q=f.value.trim();if(q){const hit=exams().find(x=>(String(x.title||'')+' '+String(x.subject||'')).toLowerCase().includes(q.toLowerCase()));if(hit)startExamById(hit.id);}}};}
    root().querySelector('[data-action="choose-file"]')?.addEventListener('click',()=>root().querySelector('#fxFile')?.click());
    root().querySelector('#fxFile')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f){const l=root().querySelector('.fx-upload b');if(l)l.textContent=f.name;}});
    root().querySelector('[data-action="generate"]')?.addEventListener('click',generate);
    root().querySelector('#fxAiForm')?.addEventListener('submit',sendAi);
    root().querySelector('[data-action="save-profile"]')?.addEventListener('click',saveProfile);
    root().querySelector('[data-action="open-ai-support"]')?.addEventListener('click',()=>window.openSupportAI?.());
    root().querySelector('[data-action="refresh-support"]')?.addEventListener('click',async()=>{try{await window.startSupportLive?.()}catch(_){}renderFinal()});
    root().querySelectorAll('[data-support-account]').forEach(b=>b.addEventListener('click',()=>switchSupport(b.dataset.supportAccount)));
    root().querySelector('#fxSupportForm')?.addEventListener('submit',sendSupport);
    const sm=root().querySelector('#fxSupportMessages'); if(sm) sm.scrollTop=sm.scrollHeight;
  }

  let learnerSyncTimer=null;
  function startLearnerAutoSync(){
    if(learnerSyncTimer)return;
    learnerSyncTimer=setInterval(async function(){
      if(document.hidden)return;
      try{await refreshLearnerExams();await refreshLearnerFlashcards();if(state()?.page==='home'||state()?.page==='learning'||state()?.page==='tests')renderFinal();}catch(_){}
    },30000);
    window.addEventListener('focus',async function(){try{await refreshLearnerExams();await refreshLearnerFlashcards();if(state()?.page==='home'||state()?.page==='learning'||state()?.page==='tests')renderFinal();}catch(_){}},{passive:true});
  }
  async function go(p){
    if(!state()) return;
    if(p==='home'||p==='tests'||p==='subject'||p==='learning'){try{await refreshLearnerExams();}catch(_){}}
    if(p==='home'||p==='learning'){try{await refreshLearnerFlashcards();}catch(_){}}
    if(p==='history'||p==='stats'||p==='achievements'){try{if(window.loadHistory)await window.loadHistory();}catch(_){}}
    state().page=p;
    renderFinal();
    if(p==='support' && window.startSupportLive){try{await window.startSupportLive();renderFinal();}catch(_){}}
  }
  function toggleMenu(){
    root().querySelector('#fxSidebar')?.classList.toggle('open');
    document.body.classList.toggle('fx-menu-open');
  }
  function closeMenu(){root().querySelector('#fxSidebar')?.classList.remove('open');document.body.classList.remove('fx-menu-open');}
  function toggleTheme(){
    document.body.classList.toggle('fx-dark');
    localStorage.setItem('study_final_theme',document.body.classList.contains('fx-dark')?'dark':'light');
  }
  function applyTheme(){document.body.classList.toggle('fx-dark',localStorage.getItem('study_final_theme')==='dark');}
  async function logout(){
    studentUser=null;
    clearSession();
    try{
      const db=window.loadSupabase?await window.loadSupabase():null;
      if(db?.auth)await db.auth.signOut();
    }catch(_){}
    if(state())state().page='login';
    renderFinal();
  }
  function openProfile(){
    if(root().querySelector('.fx-profile-modal')) return;
    const m=metrics(), wrap=document.createElement('div');wrap.className='fx-profile-modal';
    wrap.innerHTML=`<section class="fx-profile-card"><div class="fx-profile-head"><i>${esc((userName()||'U').slice(0,1).toUpperCase())}</i><div><b>${esc(userName())}</b><small>Hồ sơ học tập</small></div><button data-close>×</button></div><div class="fx-profile-code"><small>MÃ HỌC SINH CỦA BẠN</small><strong>${esc(userCode()||'Chưa có')}</strong><span>Dùng mã này cùng họ tên để đăng nhập lần sau.</span><button type="button" data-copy-code>Sao chép mã</button></div><div class="fx-profile-body"><div><span>Họ và tên</span><b>${esc(userName())}</b></div><div><span>Bài đã làm</span><b>${m.total}</b></div><div><span>Điểm trung bình</span><b>${m.avg}%</b></div><div><span>Điểm cao nhất</span><b>${m.best}%</b></div></div><div class="fx-profile-actions"><button class="fx-btn fx-secondary" data-settings>Chỉnh hồ sơ</button><button class="fx-btn fx-primary" data-close>Đóng</button></div></section>`;
    wrap.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>wrap.remove());
    wrap.querySelector('[data-settings]')?.addEventListener('click',()=>{wrap.remove();go('settings');});
    wrap.querySelector('[data-copy-code]')?.addEventListener('click',async()=>{
      const code=String(userCode()||'');
      try{await navigator.clipboard.writeText(code);}catch(_){}
      const b=wrap.querySelector('[data-copy-code]');
      if(b){b.textContent='Đã sao chép ✓';setTimeout(()=>{if(b)b.textContent='Sao chép mã'},1200);}
    });
    wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
    document.body.appendChild(wrap);
  }
  function saveProfile(){
    const n=root().querySelector('#fxSetName')?.value.trim()||'';
    if(!n) return;
    saveSession(n,userCode());
    renderFinal();
  }
  function search(){
    const input=root().querySelector('#fxSearch'),box=root().querySelector('#fxSearchResults');if(!input||!box)return;
    const q=input.value.trim().toLowerCase();
    if(!q){box.classList.remove('open');box.innerHTML='';return;}
    const rows=exams().filter(e=>(String(e.title||'')+' '+String(e.subject||'')+' '+String(e.difficulty||'')).toLowerCase().includes(q)).slice(0,7);
    box.innerHTML=rows.length?rows.map(e=>`<button data-qexam="${esc(e.id)}"><span>📝</span><div><b>${esc(e.title||'Bài kiểm tra')}</b><small>${esc(e.subject||'')}</small></div></button>`).join(''):'<div class="fx-search-empty">Không tìm thấy bài kiểm tra phù hợp.</div>';
    box.classList.add('open');
    box.querySelectorAll('[data-qexam]').forEach(b=>b.onclick=()=>startExamById(b.getAttribute('data-qexam')));
  }
  async function startFlashcardById(id){
    if(!state())return;
    let e=learnerFlashcards.find(x=>String(x.id)===String(id));
    if(!e)return;
    try{
      const url=(window.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co')+'/rest/v1/exams?select=*&id=eq.'+encodeURIComponent(e.id)+'&status=eq.active&flashcard_only=eq.true&limit=1';
      const key=window.SUPABASE_KEY||'sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
      const r=await fetch(url,{method:'GET',cache:'no-store',headers:{'Accept':'application/json','apikey':key,'Authorization':'Bearer '+key}});
      const rows=await r.json().catch(()=>[]);
      if(r.ok&&Array.isArray(rows)&&rows[0])e=rows[0];
    }catch(_){}
    if(!Array.isArray(e.questions)||!e.questions.length){alert('Bộ Flashcard này chưa có dữ liệu thẻ.');return;}
    state().flashcardExam=e;state().flashIndex=0;state().flashFlipped=false;state().page='flashcard';renderFinal();
  }
  async function startExamById(id){
    if(!state())return;
    let e=exams().find(x=>String(x.id)===String(id));
    if(!e)return;

    // The library intentionally loads lightweight metadata only. Fetch the
    // question payload only after the learner actually opens a test.
    if(!Array.isArray(e.questions)||!e.questions.length){
      try{
        const url=window.SUPABASE_URL||'https://mlqaeginqsgqacdqdzbm.supabase.co';
        const key=window.SUPABASE_KEY||'sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi';
        const r=await fetch(url+"/rest/v1/exams?select=*&id=eq."+encodeURIComponent(e.id)+"&status=eq.active&limit=1",{
          method:'GET',
          cache:'no-store',
          headers:{'Accept':'application/json','apikey':key,'Authorization':'Bearer '+key}
        });
        const rows=await r.json().catch(()=>[]);
        if(r.ok&&Array.isArray(rows)&&rows[0])e=rows[0];
      }catch(_){}
    }
    if(!Array.isArray(e.questions)||!e.questions.length){
      try{
        if(window.loadSupabase){
          const db=await window.loadSupabase();
          const r=await db.from('exams').select('*').eq('id',e.id).eq('status','active').maybeSingle();
          if(!r.error&&r.data)e=r.data;
        }
      }catch(_){}
    }
    if(!Array.isArray(e.questions)||!e.questions.length){
      alert('Đề này chưa có dữ liệu câu hỏi để mở.');
      return;
    }
    state().exam=e;
    state().answers={};
    state().startedAt=Date.now();
    state().page='exam';
    renderFinal();
    setTimeout(()=>{try{window.startTimer?.()}catch(_){}},50);
  }
  async function switchSupport(id){
    if(!state())return;
    state().supportAccountId=id;state().thread=null;state().messages=[];
    try{await window.startSupportLive?.()}catch(_){}
    renderFinal();
  }
  async function sendSupport(e){
    e.preventDefault();
    const input=root().querySelector('#fxSupportInput'), text=input?.value.trim();
    if(!text)return;
    const btn=e.submitter; if(btn)btn.disabled=true;
    try{
      if(typeof window.sendSupportMessage!=='function')throw new Error('Hệ thống hỗ trợ chưa sẵn sàng.');
      await window.sendSupportMessage({message:text});
      input.value='';
      try{await window.refreshPublicChat?.()}catch(_){}
      try{if(window.startSupportLive)await window.startSupportLive()}catch(_){}
      renderFinal();
    }catch(err){alert(String(err?.message||err||'Không gửi được tin nhắn.'))}
    finally{if(btn)btn.disabled=false}
  }
  async function generate(){
    const file=root().querySelector('#fxFile')?.files?.[0],msg=root().querySelector('#fxGenMsg'),btn=root().querySelector('[data-action="generate"]');
    if(!file){msg.textContent='Hãy chọn một tài liệu trước.';return;}
    if(file.size>2450000){msg.textContent='File quá lớn. Hãy dùng file nhỏ hơn khoảng 2,4 MB.';return;}
    msg.textContent='Đang tạo đề…';btn.disabled=true;
    try{
      let text='',data='';
      if(/^text\//.test(file.type)||/\.(txt|md|csv)$/i.test(file.name)) text=await file.text();
      else {const arr=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<arr.length;i+=0x8000)raw+=String.fromCharCode.apply(null,arr.subarray(i,i+0x8000));data=btoa(raw);}
      const payload={fileName:file.name,mimeType:file.type||'application/octet-stream',fileData:data,documentText:text.slice(0,300000),subject:root().querySelector('#fxSubject').value,difficulty:root().querySelector('#fxLevel').value,questionCount:Number(root().querySelector('#fxCount').value)};
      const r=await fetch('/api/generate-exam',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
      if(!Array.isArray(d.questions)||!d.questions.length)throw new Error('AI chưa tạo được câu hỏi.');
      msg.textContent='Đã tạo '+d.questions.length+' câu. Đang cập nhật thư viện…';
      try{if(window.loadExams)await window.loadExams();}catch(_){}
      renderFinal();
    }catch(e){msg.textContent='Không tạo được đề: '+(e.message||e);}
    finally{btn.disabled=false;}
  }
  async function sendAi(e){
    e.preventDefault();
    const input=root().querySelector('#fxAiInput'),box=root().querySelector('#fxAiMsgs'),q=input?.value.trim();if(!q)return;input.value='';
    const u=document.createElement('div');u.className='fx-msg user';u.textContent=q;box.appendChild(u);
    const b=document.createElement('div');b.className='fx-msg bot';b.textContent='Đang suy nghĩ…';box.appendChild(b);box.scrollTop=box.scrollHeight;
    try{
      const r=await fetch('/api/support-ai',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q,subject:state()?.subject||'',history:[]})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
      b.textContent=String(d.answer||'Mình chưa nhận được câu trả lời.');
    }catch(err){b.textContent='Không thể kết nối AI lúc này. '+(err.message||'');}
    box.scrollTop=box.scrollHeight;
  }

  async function boot(){
    // Render the final auth shell immediately. The data/runtime loader may still
    // be fetching app.js; waiting for it here caused a permanent blank screen on
    // slow mobile connections.
    document.documentElement.classList.add('fx-final-booting');
    if(!window.state){
      window.state={page:'login',candidate:'',code:'',history:[],exam:null,answers:[],messages:[],supportAccountId:null};
    }
    state().page='login';
    renderFinal();
    document.body.classList.remove('redesign-pending');
    document.documentElement.classList.remove('fx-final-booting');

    // Public exam metadata is safe to read before login. Prime the learner
    // cache so the dashboard never renders a false "0 đề" while data exists.
    try{await refreshLearnerExams();}catch(_){}
    try{await refreshLearnerFlashcards();}catch(_){}

    // Reconcile with the real server-side student session after the runtime becomes ready.
    if(window.loadSupabase){
      try{
        if(await restoreStudentSession()){
          state().candidate=userName();
          state().code=userCode();
          state().page='home';
          try{await window.loadExams?.();}catch(_){}
          try{await refreshLearnerExams();}catch(_){}
          try{await refreshLearnerFlashcards();}catch(_){}
          try{await window.loadHistory?.();}catch(_){}
          renderFinal();
        }
      }catch(_){}
    }else{
      window.addEventListener('study-app-loaded', async function(){
        try{
          if(await restoreStudentSession()){
            state().candidate=userName();
            state().code=userCode();
            state().page='home';
            try{await window.loadExams?.();}catch(_){}
            try{await refreshLearnerExams();}catch(_){}
            try{await refreshLearnerFlashcards();}catch(_){}
            try{await window.loadHistory?.();}catch(_){}
            renderFinal();
          }
        }catch(_){}
      }, {once:true});
    }
  }

  // Final UI is the sole owner of window.render. Legacy enhancement scripts may
  // still run after the async app loader finishes; keep their assignments from
  // replacing the new renderer and causing the login -> legacy navbar jump.
  window.__studyThFinalRender = renderFinal;
  try{ window.dispatchEvent(new Event('study-final-ui-ready')); }catch(_){}
  try{
    Object.defineProperty(window,'render',{
      configurable:true,
      get:function(){return window.__studyThFinalRender;},
      set:function(fn){
        window.__studyLegacyRenderAttempt=fn;
        if(window.__studyThFinalRender) window.__studyLegacyRenderBlocked=true;
      }
    });
  }catch(_){ window.render=renderFinal; }
  window.render=renderFinal;
  window.go=go;
  window.studentGoV2=go;
  window.studentUiV2=function(p){if(state()){state().page=p;renderFinal();}};
  boot();
  ensureSyncBarStyle(); startLearnerAutoSync();
})();