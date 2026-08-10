/* STUDY TH — single owner for AI answer rendering.
   IMPORTANT: this file never rewrites a message after KaTeX has rendered it.
   That prevents the "looks correct for ~2 seconds, then raw LaTeX returns" race.
*/
(function(){
  if(window.__studyAiRendererV1)return;
  window.__studyAiRendererV1=true;

  var KATEX_CSS='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/katex.min.css';
  var KATEX_JS='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/katex.min.js';
  var AUTORENDER_JS='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/contrib/auto-render.min.js';
  var ready=null;
  var CMD=/\\(?:frac|dfrac|tfrac|sqrt|sin|cos|tan|cot|arcsin|arccos|arctan|ln|log|exp|infty|leq|geq|neq|approx|equiv|times|cdot|div|pm|mp|rightarrow|to|Rightarrow|leftrightarrow|int|sum|prod|partial|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|Omega|text|mathrm)\b/;

  function loadKatex(){
    if(typeof window.renderMathInElement==='function')return Promise.resolve(true);
    if(ready)return ready;
    ready=new Promise(function(resolve){
      if(!document.querySelector('link[data-study-ai-katex]')){
        var css=document.createElement('link');css.rel='stylesheet';css.href=KATEX_CSS;
        css.integrity='sha384-KfwFj/Q/jGrY4ijtfzWyW5NXzT5irvfnTq6aRnH2xPvLzLdi1XyVr7w4l2uwTq0V';
        css.crossOrigin='anonymous';css.dataset.studyAiKatex='1';document.head.appendChild(css);
      }
      function auto(){
        if(typeof window.renderMathInElement==='function'){resolve(true);return;}
        var a=document.createElement('script');a.src=AUTORENDER_JS;a.defer=true;
        a.integrity='sha384-bjyGPfbij8/NDKJhSGZNP/khQVgtHUE5exjm4Ydllo42FwIgYsdLO2lXGmRBf5Mz';
        a.crossOrigin='anonymous';a.onload=function(){resolve(typeof window.renderMathInElement==='function')};a.onerror=function(){resolve(false)};document.head.appendChild(a);
      }
      if(window.katex){auto();return;}
      var s=document.createElement('script');s.src=KATEX_JS;s.defer=true;
      s.integrity='sha384-OE4SMRr5gMJQzKSD08J46vKsKgY8NxVtO1LW+/q3NJ0WHsGsdN4oebgEjwwWuyvG';
      s.crossOrigin='anonymous';s.onload=auto;s.onerror=function(){resolve(false)};document.head.appendChild(s);
    });
    return ready;
  }

  function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}

  function normalizeBareMath(text){
    var s=String(text??'');
    if(/\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(s))return s;
    return s.split('\n').map(function(line){
      if(!CMD.test(line))return line;
      /* Existing AI answers sometimes put a bare formula after a colon. */
      var m=line.match(/^(.*?:\s*)(\\(?:frac|dfrac|tfrac|sqrt)[\s\S]+)$/);
      if(m)return m[1]+'\\('+m[2]+'\\)';
      if(/^\s*\\(?:frac|dfrac|tfrac|sqrt|int|sum|prod)/.test(line))return '\\('+line.trim()+'\\)';
      return line;
    }).join('\n');
  }

  function inline(raw){
    var src=normalizeBareMath(raw),stash=[];
    var protectedText=src.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,function(m){
      var key='\uE000'+stash.length+'\uE001';stash.push(m);return key;
    });
    var out=esc(protectedText)
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/__([^_]+)__/g,'<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    stash.forEach(function(m,i){out=out.split('\uE000'+i+'\uE001').join(m)});
    return out;
  }

  function markdown(text){
    var lines=String(text??'').replace(/\r/g,'').split('\n'),out=[],list=false;
    function endList(){if(list){out.push('</ul>');list=false}}
    for(var i=0;i<lines.length;i++){
      var raw=lines[i].trim(),m;
      if(!raw){endList();out.push('<div class="ai-spacer"></div>');continue}
      if(/^```/.test(raw)){endList();out.push('<pre><code>'+esc(raw.replace(/^```[a-zA-Z]*\s*/,''))+'</code></pre>');continue}
      if(/^---+$/.test(raw)||/^\*\*\*+$/.test(raw)){endList();out.push('<hr>');continue}
      m=raw.match(/^###\s+(.+)$/);if(m){endList();out.push('<h4>'+inline(m[1])+'</h4>');continue}
      m=raw.match(/^##\s+(.+)$/);if(m){endList();out.push('<h3>'+inline(m[1])+'</h3>');continue}
      m=raw.match(/^#\s+(.+)$/);if(m){endList();out.push('<h3>'+inline(m[1])+'</h3>');continue}
      m=raw.match(/^(?:[-*]|•)\s+(.+)$/);if(m){if(!list){out.push('<ul>');list=true}out.push('<li>'+inline(m[1])+'</li>');continue}
      m=raw.match(/^\d+[.)]\s+(.+)$/);if(m){endList();out.push('<div class="ai-numbered"><b>'+m[0].match(/^\d+/)[0]+'.</b> '+inline(m[1])+'</div>');continue}
      endList();out.push('<p>'+inline(raw)+'</p>');
    }
    endList();return out.join('');
  }

  function style(){
    if(document.getElementById('study-ai-renderer-style'))return;
    var s=document.createElement('style');s.id='study-ai-renderer-style';s.textContent=
      '.study-ai-msg.bot{line-height:1.75;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.study-ai-msg.bot p{margin:0 0 11px}.study-ai-msg.bot p:last-child{margin-bottom:0}.study-ai-msg.bot h3{margin:10px 0 7px}.study-ai-msg.bot h4{margin:8px 0 6px}.study-ai-msg.bot ul{padding-left:22px;margin:6px 0 10px}.study-ai-msg.bot li{margin:3px 0}.study-ai-msg.bot hr{border:0;border-top:1px solid rgba(90,100,150,.18);margin:12px 0}.study-ai-msg.bot code{padding:2px 6px;border-radius:6px;background:rgba(90,100,150,.08)}.study-ai-msg.bot pre{overflow:auto;padding:10px;border-radius:10px;background:rgba(90,100,150,.08)}.study-ai-msg.bot .ai-spacer{height:4px}.study-ai-msg.bot .ai-numbered{margin:6px 0}.study-ai-msg.bot .katex{font-size:1.08em}.study-ai-msg.bot .katex-display{margin:.7em 0;overflow-x:auto;overflow-y:hidden}';
    document.head.appendChild(s);
  }

  function renderOne(node){
    if(!node||node.hasAttribute('data-thinking')||node.dataset.aiRendered==='1')return;
    var raw=node.dataset.aiRaw;
    if(raw==null||!String(raw).trim())raw=node.textContent||'';
    raw=String(raw);
    if(!raw.trim())return;
    /* Raw source is immutable. Every later pass reads this value, never textContent. */
    node.dataset.aiRaw=raw;
    node.innerHTML=markdown(raw);
    node.dataset.aiRendered='1';
    loadKatex().then(function(ok){
      if(!ok||node.dataset.aiRendered!=='1'||!document.documentElement.contains(node))return;
      try{window.renderMathInElement(node,{delimiters:[
        {left:'$$',right:'$$',display:true},
        {left:'\\[',right:'\\]',display:true},
        {left:'\\(',right:'\\)',display:false},
        {left:'$',right:'$',display:false}
      ],throwOnError:false,strict:false,trust:false})}catch(e){console.warn('STUDY AI KaTeX:',e)}
    });
  }

  function scan(root){
    (root||document).querySelectorAll?.('.study-ai-msg.bot:not([data-ai-rendered="1"])').forEach(renderOne);
  }

  function boot(){
    style();scan(document);
    var root=document.getElementById('app')||document.body;
    if(root.__studyAiRendererObserver)return;
    root.__studyAiRendererObserver=new MutationObserver(function(records){
      records.forEach(function(r){Array.from(r.addedNodes||[]).forEach(function(n){
        if(n.nodeType!==1)return;
        if(n.matches?.('.study-ai-msg.bot'))renderOne(n);
        scan(n);
      })});
    });
    root.__studyAiRendererObserver.observe(root,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
})();
