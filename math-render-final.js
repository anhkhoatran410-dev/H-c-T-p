/* STUDY TH — final global mathematics renderer. */
(function(){
  if(window.__studyMathRenderFinalBooted)return;
  window.__studyMathRenderFinalBooted=true;
  var KATEX='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/';
  var loading=null;
  function load(){
    if(window.renderMathInElement)return Promise.resolve();
    if(loading)return loading;
    loading=new Promise(function(resolve){
      if(!document.querySelector('link[data-study-katex]')){var css=document.createElement('link');css.rel='stylesheet';css.href=KATEX+'katex.min.css';css.dataset.studyKatex='1';document.head.appendChild(css)}
      var js=document.createElement('script');js.src=KATEX+'katex.min.js';js.onload=function(){var ar=document.createElement('script');ar.src=KATEX+'contrib/auto-render.min.js';ar.onload=resolve;ar.onerror=resolve;document.head.appendChild(ar)};js.onerror=resolve;document.head.appendChild(js);
    });return loading;
  }
  function group(s,i){if(s[i]!=='{')return null;var d=0;for(var j=i;j<s.length;j++){if(s[j]==='{')d++;else if(s[j]==='}'&&!--d)return {v:s.slice(i+1,j),e:j+1}}return null}
  function fractions(s){var out='',i=0;while(i<s.length){var m=s.slice(i).match(/^\\(?:dfrac|frac)\s*/);if(m){var a=group(s,i+m[0].length);if(a){var b=group(s,a.e);if(b){out+='\\('+String.raw`\\frac{${a.v}}{${b.v}}`+'\\)';i=b.e;continue}}}m=s.slice(i).match(/^\\sqrt\s*/);if(m){var g=group(s,i+m[0].length);if(g){out+='\\('+String.raw`\\sqrt{${g.v}}`+'\\)';i=g.e;continue}}out+=s[i++] }return out}
  function pretty(s){return fractions(String(s||'')).replace(/\\left|\\right/g,'').replace(/\\infty|\\infinity/g,'∞').replace(/\\leq|\\le/g,'≤').replace(/\\geq|\\ge/g,'≥').replace(/\\neq|\\ne/g,'≠').replace(/\\approx/g,'≈').replace(/\\equiv/g,'≡').replace(/\\times/g,'×').replace(/\\cdot/g,'·').replace(/\\div/g,'÷').replace(/\\pm/g,'±').replace(/\\rightarrow|\\to/g,'→').replace(/\\Rightarrow/g,'⇒').replace(/\\leftrightarrow/g,'↔').replace(/\\int/g,'∫').replace(/\\sum/g,'Σ').replace(/\\prod/g,'∏').replace(/\\partial/g,'∂').replace(/\\pi/g,'π').replace(/\\theta/g,'θ').replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ').replace(/\\delta/g,'δ').replace(/\\Delta/g,'Δ').replace(/\\lambda/g,'λ').replace(/\\mu/g,'μ').replace(/\\sigma/g,'σ').replace(/\\omega/g,'ω').replace(/\\Omega/g,'Ω').replace(/\\text\{([^{}]*)\}/g,'$1').replace(/\\mathrm\{([^{}]*)\}/g,'$1').replace(/\\,/g,' ').replace(/\\;/g,' ').replace(/\\!/g,'').replace(/\\quad/g,'  ').replace(/\^\{2\}|\^2/g,'²').replace(/\^\{3\}|\^3/g,'³').replace(/\^\{n\}|\^n/g,'ⁿ').replace(/_\{([0-9]+)\}/g,'_$1').replace(/_([0-9])/g,function(_,n){return String.fromCharCode(0x2080+Number(n))})}
  function hasMathDelimiters(t){return /\$[^$\n]+\$|\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(t)}
  function skip(n){var p=n.parentElement;return !p||/^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|PRE|CODE)$/i.test(p.tagName)||p.closest('.katex,[data-study-math]')}
  function normalize(root){var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),a=[],n;while(n=w.nextNode())a.push(n);a.forEach(function(x){if(skip(x))return;var t=x.nodeValue||'';if(!t.trim()||hasMathDelimiters(t)||!/\\(?:frac|dfrac|sqrt|infty|leq|geq|neq|approx|equiv|times|cdot|div|pm|rightarrow|Rightarrow|leftrightarrow|int|sum|prod|partial|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|Omega|text|mathrm)|\^\{?[23n]\}?/.test(t))return;var p=pretty(t);if(p!==t){var s=document.createElement('span');s.setAttribute('data-study-math','1');s.className='study-math-text';s.textContent=p;x.parentNode.replaceChild(s,x)}})}
  function render(){var root=document.getElementById('app')||document.body;normalize(root);load().then(function(){if(window.renderMathInElement){try{window.renderMathInElement(root,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,strict:false,trust:false})}catch(e){console.warn('KaTeX:',e)}}})}
  function boot(){render();var root=document.getElementById('app')||document.body;if(!root.__studyMathFinalObs){root.__studyMathFinalObs=new MutationObserver(function(){clearTimeout(root.__studyMathFinalTimer);root.__studyMathFinalTimer=setTimeout(render,80)});root.__studyMathFinalObs.observe(root,{childList:true,subtree:true)}}}
  var style=document.createElement('style');style.textContent='.study-math-text{font-family:KaTeX_Main,"Times New Roman",serif}.katex{font-size:1.07em}.katex-display{margin:.55em 0}.q .katex,.option .katex,.attempt-question .katex,.attempt-detail .katex{font-size:1.08em}.katex .base{line-height:1.25}.katex-display{overflow-x:auto;overflow-y:hidden;padding:2px 0}';document.head.appendChild(style);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});window.addEventListener('load',function(){setTimeout(boot,100)});
})();
