/* STUDY TH — AI math stability patch.
   Prevents the AI answer from briefly rendering correctly and then falling back to raw LaTeX.
   Uses the raw response kept by public-system-final and wraps bare LaTeX/math runs for KaTeX.
*/
(function(){
  if(window.__studyAiMathStability)return;
  window.__studyAiMathStability=true;

  var CMD=/\\(?:frac|dfrac|tfrac|sqrt|sin|cos|tan|cot|arcsin|arccos|arctan|ln|log|exp|infty|leq|geq|neq|approx|equiv|times|cdot|div|pm|mp|rightarrow|to|Rightarrow|leftrightarrow|int|sum|prod|partial|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|Omega|text|mathrm)\b/;

  function hasDelim(s){return /\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(s)}
  function looksMath(s){return CMD.test(s)||/\b[a-zA-Z]\s*(?:\^|_|=)\s*[a-zA-Z0-9\\{]/.test(s)||/[a-zA-Z0-9}\)]\s*\^\s*(?:\d+|\{)/.test(s)}

  function wrapBareMath(raw){
    var text=String(raw||'');
    if(hasDelim(text))return text;
    return text.split(/(\s+)/).map(function(part){
      if(!part||/^\s+$/.test(part)||!looksMath(part))return part;
      var tail='';
      var m=part.match(/([.,;:!?]+)$/);
      if(m){tail=m[1];part=part.slice(0,-tail.length)}
      if(!part||hasDelim(part))return part+tail;
      return '\\('+part+'\\)'+tail;
    }).join('');
  }

  function renderNode(node){
    if(!node||node.hasAttribute('data-thinking'))return;
    var raw=node.dataset.studyAiRaw||'';
    if(!raw.trim())return;
    /* If the final renderer already produced KaTeX, never touch it. */
    if(node.querySelector('.katex'))return;
    var decorated=wrapBareMath(raw);
    if(decorated===raw && !looksMath(raw))return;
    node.innerHTML='<p>'+decorated.replace(/\r/g,'').replace(/\n+/g,'</p><p>')+'</p>';
    node.dataset.aiMathStable='1';
    if(typeof window.renderMathInElement==='function'){
      try{window.renderMathInElement(node,{delimiters:[
        {left:'$$',right:'$$',display:true},
        {left:'\\[',right:'\\]',display:true},
        {left:'\\(',right:'\\)',display:false},
        {left:'$',right:'$',display:false}
      ],throwOnError:false,strict:false,trust:false});}catch(e){console.warn('AI math stability:',e)}
    }
  }

  function scan(){
    var box=document.getElementById('studyAiMessages');
    if(!box)return;
    box.querySelectorAll('.study-ai-msg.bot').forEach(renderNode);
  }

  function boot(){
    scan();
    var box=document.getElementById('studyAiMessages');
    if(box&&!box.__studyAiMathStableObs){
      box.__studyAiMathStableObs=new MutationObserver(function(){
        clearTimeout(box.__studyAiMathStableTimer);
        box.__studyAiMathStableTimer=setTimeout(scan,40);
      });
      box.__studyAiMathStableObs.observe(box,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
  window.addEventListener('load',function(){setTimeout(boot,100)});
  setInterval(scan,700);
})();
