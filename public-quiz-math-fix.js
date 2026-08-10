/* STUDY TH — force KaTeX after quiz/study-mode renders. */
(function(){
  if(window.__studyQuizMathFix)return;
  window.__studyQuizMathFix=true;

  function loadAndRender(root){
    root=root||document.getElementById('app')||document.body;
    const run=function(){
      if(typeof window.renderMathInElement!=='function')return;
      try{
        window.renderMathInElement(root,{delimiters:[
          {left:'$$',right:'$$',display:true},
          {left:'\\[',right:'\\]',display:true},
          {left:'\\(',right:'\\)',display:false},
          {left:'$',right:'$',display:false}
        ],throwOnError:false,strict:false,trust:false});
      }catch(e){console.warn('Study quiz KaTeX:',e)}
    };
    if(typeof window.renderMathInElement==='function')run();
    else if(typeof window.katexReady==='function')Promise.resolve(window.katexReady()).then(run).catch(run);
    else setTimeout(run,250);
  }

  function normalizeDollarMath(root){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];let n;
    while((n=walker.nextNode())){
      if(n.parentElement?.closest('script,style,textarea,input,code,.katex'))continue;
      if(/\$[^$\n]+\$/.test(n.nodeValue||''))nodes.push(n);
    }
    nodes.forEach(node=>{
      node.nodeValue=String(node.nodeValue||'').replace(/\$([^$\n]+)\$/g,'\\($1\\)');
    });
  }

  function refresh(){
    const root=document.getElementById('app')||document.body;
    normalizeDollarMath(root.querySelector('.study-mode-page,.study-quiz-section,.attempt-detail')||root);
    loadAndRender(root);
  }

  function boot(){
    const oldRender=window.render;
    if(typeof oldRender==='function'&&!oldRender.__studyQuizMathFix){
      const wrapped=async function(){
        const r=oldRender.apply(this,arguments);
        if(r&&typeof r.then==='function')await r;
        setTimeout(refresh,0);
        return r;
      };
      wrapped.__studyQuizMathFix=true;
      window.render=wrapped;
    }
    refresh();
    const root=document.getElementById('app')||document.body;
    if(!root.__studyQuizMathObs){
      root.__studyQuizMathObs=new MutationObserver(function(){clearTimeout(root.__studyQuizMathTimer);root.__studyQuizMathTimer=setTimeout(refresh,60)});
      root.__studyQuizMathObs.observe(root,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,150));else setTimeout(boot,150);
  window.addEventListener('study-app-loaded',()=>setTimeout(boot,100));
})();
