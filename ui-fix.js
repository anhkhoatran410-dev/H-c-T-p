/* Public runtime fix: robust Enter-to-send + one scroll owner + stable chat position. */
(function(){
  var list=null, stick=true, mo=null, ro=null;
  function sync(){
    var open=!!document.querySelector('.support-shell');
    document.body.classList.toggle('study-support-open',open);
    var next=document.getElementById('supportMessages');
    if(!next)return;
    if(next!==list){
      if(mo)mo.disconnect();if(ro)ro.disconnect();
      list=next;stick=true;
      list.addEventListener('scroll',function(){stick=list.scrollHeight-list.scrollTop-list.clientHeight<80},{passive:true});
      mo=new MutationObserver(function(){if(stick)scroll(false)});mo.observe(list,{childList:true,subtree:true,characterData:true});
      if(window.ResizeObserver){ro=new ResizeObserver(function(){if(stick)scroll(false)});ro.observe(list)}
    }
    if(stick)scroll(true);
  }
  function scroll(force){if(!list||(!force&&!stick))return;requestAnimationFrame(function(){if(list)list.scrollTop=list.scrollHeight})}
  document.addEventListener('keydown',function(e){
    var t=e.target;
    if(!t||t.id!=='supportInput'||e.key!=='Enter'||e.shiftKey||e.isComposing)return;
    e.preventDefault();
    if(typeof sendSupport==='function')sendSupport();
  },true);
  var root=document.getElementById('app');
  if(root)new MutationObserver(sync).observe(root,{childList:true,subtree:true});
  window.addEventListener('study-app-loaded',function(){setTimeout(sync,0);setTimeout(sync,120);setTimeout(sync,400)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
})();
