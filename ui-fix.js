/* Public runtime fix: robust Enter-to-send + one scroll owner + readable wrong-answer review. */
(function(){
  var list=null,stick=true,mo=null,ro=null;
  function sync(){
    var open=!!document.querySelector('.support-shell');
    document.body.classList.toggle('study-support-open',open);
    var next=document.getElementById('supportMessages');
    if(!next)return;
    if(next!==list){if(mo)mo.disconnect();if(ro)ro.disconnect();list=next;stick=true;list.addEventListener('scroll',function(){stick=list.scrollHeight-list.scrollTop-list.clientHeight<80},{passive:true});mo=new MutationObserver(function(){if(stick)scroll(false)});mo.observe(list,{childList:true,subtree:true,characterData:true});if(window.ResizeObserver){ro=new ResizeObserver(function(){if(stick)scroll(false)});ro.observe(list)}}
    if(stick)scroll(true);
  }
  function scroll(force){if(!list||(!force&&!stick))return;requestAnimationFrame(function(){if(list)list.scrollTop=list.scrollHeight})}
  function installReview(){
    window.reviewPage=function(){
      var x=state.review;if(!x||!x.items.length)return '<main class="container"><div class="card"><h2>🎉 Không còn câu sai</h2><button class="btn" onclick="go(\'history\')">Quay lại</button></div></main>';
      var item=x.items[x.cursor],q=item.question,content='';
      if(q.type==='mcq')content=(q.opts||[]).map(function(o,j){return '<label class="option"><input type="radio" name="reviewQ" onchange="state.reviewChoice='+j+'"> '+String.fromCharCode(65+j)+'. '+esc(o)+'</label>'}).join('');
      else if(q.type==='short')content='<input id="reviewShort" maxlength="4" placeholder="Nhập đáp án">';
      else content=(q.statements||[]).map(function(s,j){return '<div class="option"><b>'+String.fromCharCode(97+j)+'.</b> '+esc(s)+' <select onchange="setReviewTF('+j+',this.value)"><option value="">--</option><option value="true">Đúng</option><option value="false">Sai</option></select></div>'}).join('');
      return '<main class="container review-modern"><div class="card review-head"><div><span class="eyebrow">ÔN TẬP CÁ NHÂN</span><h1>🧠 Ôn lại câu sai</h1><p class="muted">Câu '+(x.cursor+1)+' / '+x.items.length+' · Làm lại để nhớ lâu hơn.</p></div><div class="review-progress"><b>'+Math.round((x.cursor/x.items.length)*100)+'%</b><small>tiến độ</small></div></div><div class="card review-question"><div class="review-label">CÂU HỎI</div><h2>'+esc(q.q||'')+'</h2><div>'+content+'</div><div class="review-actions"><button class="btn" onclick="checkReview()">Kiểm tra</button><button class="btn secondary" onclick="go(\'history\')">Thoát</button></div><div id="reviewMsg"></div></div></main>';
    };
    window.checkReview=async function(){
      var x=state.review,item=x.items[x.cursor],q=item.question,ok=false;
      if(q.type==='mcq')ok=Number(state.reviewChoice)===Number(q.a);else if(q.type==='short')ok=document.getElementById('reviewShort')?.value.trim().toLowerCase()===String(q.answer||'').trim().toLowerCase();else ok=(q.answers||[]).every(function(v,j){return state.reviewTF?.[j]===v});
      var msg=document.getElementById('reviewMsg');if(!msg)return;
      var correct='';if(q.type==='mcq')correct=String.fromCharCode(65+Number(q.a||0))+'. '+String(q.opts?.[Number(q.a||0)]||'');else if(q.type==='short')correct=String(q.answer||'');else correct=(q.answers||[]).map(function(v,j){return String.fromCharCode(97+j)+'. '+(v?'Đúng':'Sai')}).join(' · ');
      msg.innerHTML=ok?'<div class="review-result good"><div class="review-result-icon">✓</div><div><b>Chính xác!</b><p>'+esc(q.explanation||'Bạn đã nắm đúng ý chính.')+'</p></div></div>':'<div class="review-result bad"><div class="review-result-icon">!</div><div><b>Chưa đúng — xem lại điểm mấu chốt</b><p>'+esc(q.explanation||'Hãy đọc lại dữ kiện và thử lại.')+'</p><div class="review-answer"><span>Đáp án đúng</span><b>'+esc(correct)+'</b></div></div></div>';
      if(ok){try{await loadSupabase();var next=[...(item.attempt.reviewed_indexes||[]),item.index].filter(function(v,i,a){return a.indexOf(v)===i});await db.from('user_attempts').update({reviewed_indexes:next}).eq('id',item.attempt.id)}catch(e){}setTimeout(function(){x.cursor++;state.reviewChoice=null;state.reviewTF=[];state.page=x.cursor<x.items.length?'review':'history';render()},900)}
    };
  }
  document.addEventListener('keydown',function(e){var t=e.target;if(!t||t.id!=='supportInput'||e.key!=='Enter'||e.shiftKey||e.isComposing)return;e.preventDefault();if(typeof sendSupport==='function')sendSupport()},true);
  var root=document.getElementById('app');if(root)new MutationObserver(sync).observe(root,{childList:true,subtree:true});
  window.addEventListener('study-app-loaded',function(){installReview();setTimeout(sync,0);setTimeout(sync,120);setTimeout(sync,400)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){installReview();sync()});else{installReview();sync()}
})();
