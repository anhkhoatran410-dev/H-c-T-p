/* STUDY TH — robust final mathematics renderer for generated exams + review pages.
   Renders both delimited LaTeX (\(...\), \[...\], $$...$$, $...$) and common bare TeX fallbacks.
   This renderer intentionally works directly on text nodes so it is not dependent on the
   exact HTML produced by renderQuestion(). */
(function(){
  if(window.__studyMathRenderFinalBootedV2)return;
  window.__studyMathRenderFinalBootedV2=true;

  var KATEX='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/';
  var loading=null;

  function load(){
    if(window.katex && window.renderMathInElement)return Promise.resolve();
    if(loading)return loading;
    loading=new Promise(function(resolve){
      if(!document.querySelector('link[data-study-katex-v2]')){
        var css=document.createElement('link');
        css.rel='stylesheet';
        css.href=KATEX+'katex.min.css';
        css.dataset.studyKatexV2='1';
        document.head.appendChild(css);
      }
      function loadAuto(){
        if(window.renderMathInElement){resolve();return;}
        var ar=document.createElement('script');
        ar.src=KATEX+'contrib/auto-render.min.js';
        ar.onload=resolve;
        ar.onerror=resolve;
        document.head.appendChild(ar);
      }
      if(window.katex){loadAuto();return;}
      var js=document.createElement('script');
      js.src=KATEX+'katex.min.js';
      js.onload=loadAuto;
      js.onerror=resolve;
      document.head.appendChild(js);
    });
    return loading;
  }

  function barePretty(s){
    return String(s||'')
      .replace(/\\left|\\right/g,'')
      .replace(/\\infty|\\infinity/g,'∞')
      .replace(/\\leq|\\le/g,'≤')
      .replace(/\\geq|\\ge/g,'≥')
      .replace(/\\neq|\\ne/g,'≠')
      .replace(/\\approx/g,'≈')
      .replace(/\\equiv/g,'≡')
      .replace(/\\times/g,'×')
      .replace(/\\cdot/g,'·')
      .replace(/\\div/g,'÷')
      .replace(/\\pm/g,'±')
      .replace(/\\rightarrow|\\to/g,'→')
      .replace(/\\Rightarrow/g,'⇒')
      .replace(/\\leftrightarrow/g,'↔')
      .replace(/\\int/g,'∫')
      .replace(/\\sum/g,'Σ')
      .replace(/\\prod/g,'∏')
      .replace(/\\partial/g,'∂')
      .replace(/\\pi/g,'π')
      .replace(/\\theta/g,'θ')
      .replace(/\\alpha/g,'α')
      .replace(/\\beta/g,'β')
      .replace(/\\gamma/g,'γ')
      .replace(/\\delta/g,'δ')
      .replace(/\\Delta/g,'Δ')
      .replace(/\\lambda/g,'λ')
      .replace(/\\mu/g,'μ')
      .replace(/\\sigma/g,'σ')
      .replace(/\\omega/g,'ω')
      .replace(/\\Omega/g,'Ω')
      .replace(/\\text\{([^{}]*)\}/g,'$1')
      .replace(/\\mathrm\{([^{}]*)\}/g,'$1')
      .replace(/\\,/g,' ')
      .replace(/\\;/g,' ')
      .replace(/\\!/g,'')
      .replace(/\\quad/g,'  ')
      .replace(/\^\{2\}|\^2/g,'²')
      .replace(/\^\{3\}|\^3/g,'³')
      .replace(/\^\{n\}|\^n/g,'ⁿ')
      .replace(/_\{([0-9]+)\}/g,'_$1')
      .replace(/_([0-9])/g,function(_,n){return String.fromCharCode(0x2080+Number(n))});
  }

  function hasTeX(s){return /\\(?:frac|dfrac|sqrt|infty|leq|geq|neq|approx|equiv|times|cdot|div|pm|rightarrow|Rightarrow|leftrightarrow|int|sum|prod|partial|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|Omega|text|mathrm)|\^\{?[23n]\}?/.test(String(s||''))}

  function ignored(node){
    var p=node.parentElement;
    if(!p)return true;
    if(p.closest('.katex,.study-math-rendered,[data-study-math-rendered]'))return true;
    return /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|PRE|CODE)$/i.test(p.tagName);
  }

  function renderDelimitedNode(node){
    var text=node.nodeValue||'';
    if(!text.trim() || ignored(node))return false;

    var re=/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$([^$\n]+)\$/g;
    var m,last=0,found=false,frag=document.createDocumentFragment();
    while((m=re.exec(text))){
      found=true;
      if(m.index>last)frag.appendChild(document.createTextNode(text.slice(last,m.index)));
      var tex=m[1]!=null?m[1]:m[2]!=null?m[2]:m[3]!=null?m[3]:m[4];
      var display=m[1]!=null||m[2]!=null;
      var span=document.createElement('span');
      span.className='study-math-rendered';
      span.setAttribute('data-study-math-rendered','1');
      try{
        if(window.katex){
          window.katex.render(tex,span,{displayMode:display,throwOnError:false,strict:false,trust:false});
        }else{
          span.textContent=tex;
        }
      }catch(e){span.textContent=tex}
      frag.appendChild(span);
      last=re.lastIndex;
    }
    if(!found)return false;
    if(last<text.length)frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag,node);
    return true;
  }

  function renderBareNode(node){
    var text=node.nodeValue||'';
    if(!hasTeX(text)||ignored(node))return false;
    var pretty=barePretty(text);
    if(pretty===text)return false;
    var span=document.createElement('span');
    span.className='study-math-rendered study-math-bare';
    span.setAttribute('data-study-math-rendered','1');
    span.textContent=pretty;
    node.parentNode.replaceChild(span,node);
    return true;
  }

  function renderRoot(root){
    if(!root)return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    var nodes=[],n;
    while((n=walker.nextNode()))nodes.push(n);
    nodes.forEach(function(node){
      if(ignored(node))return;
      if(renderDelimitedNode(node))return;
      renderBareNode(node);
    });
  }

  function render(){
    var root=document.getElementById('app')||document.body;
    renderRoot(root);
    load().then(function(){
      /* A second pass is intentional: KaTeX may finish loading after the app has rendered. */
      renderRoot(root);
      if(window.renderMathInElement){
        try{
          window.renderMathInElement(root,{
            delimiters:[
              {left:'$$',right:'$$',display:true},
              {left:'\\[',right:'\\]',display:true},
              {left:'\\(',right:'\\)',display:false},
              {left:'$',right:'$',display:false}
            ],
            throwOnError:false,
            strict:false,
            trust:false
          });
        }catch(e){console.warn('Study KaTeX auto-render:',e)}
      }
    });
  }

  var style=document.createElement('style');
  style.textContent='.study-math-rendered{display:inline-block;vertical-align:middle}.study-math-rendered .katex{font-size:1.08em}.study-math-rendered .katex-display{margin:.45em 0}.study-math-bare{font-family:KaTeX_Main,"Times New Roman",serif}.q .study-math-rendered .katex,.option .study-math-rendered .katex,.attempt-question .study-math-rendered .katex,.attempt-detail .study-math-rendered .katex{font-size:1.08em}.katex-display{overflow-x:auto;overflow-y:hidden;padding:2px 0}';
  document.head.appendChild(style);

  function boot(){
    render();
    var root=document.getElementById('app')||document.body;
    if(!root.__studyMathFinalObsV2){
      root.__studyMathFinalObsV2=new MutationObserver(function(){
        clearTimeout(root.__studyMathFinalTimerV2);
        root.__studyMathFinalTimerV2=setTimeout(render,50);
      });
      root.__studyMathFinalObsV2.observe(root,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
  window.addEventListener('load',function(){setTimeout(boot,100)});
})();
