/* STUDY TH — single final public renderer/chat runtime.
   Owns AI Markdown, KaTeX math, support composer and support dedupe.
*/
(function(){
  if(window.__studyPublicSystemFinal)return;
  window.__studyPublicSystemFinal=true;
  var KATEX='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/';
  var katexReady=null;

  function loadKatex(){
    if(window.renderMathInElement)return Promise.resolve();
    if(katexReady)return katexReady;
    katexReady=new Promise(function(resolve){
      if(!document.querySelector('link[data-study-katex-final]')){
        var css=document.createElement('link');css.rel='stylesheet';css.href=KATEX+'katex.min.css';css.dataset.studyKatexFinal='1';document.head.appendChild(css);
      }
      if(window.katex && !window.renderMathInElement){
        var ar=document.createElement('script');ar.src=KATEX+'contrib/auto-render.min.js';ar.onload=resolve;ar.onerror=resolve;document.head.appendChild(ar);return;
      }
      var js=document.createElement('script');js.src=KATEX+'katex.min.js';js.onload=function(){
        var ar=document.createElement('script');ar.src=KATEX+'contrib/auto-render.min.js';ar.onload=resolve;ar.onerror=resolve;document.head.appendChild(ar);
      };js.onerror=resolve;document.head.appendChild(js);
    });
    return katexReady;
  }

  function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}

  function markdownInline(raw){
    var s=String(raw??''),stash=[];
    s=s.replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,function(_,a,b,c,d){
      var v=a!=null?'$$'+a+'$$':b!=null?'$'+b+'$':c!=null?'\\('+c+'\\)':'\\['+d+'\\]';
      var key='STUDYMATHTOKEN'+stash.length+'END';stash.push(v);return key;
    });
    s=esc(s);
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/__([^_]+)__/g,'<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    stash.forEach(function(v,i){s=s.replace('STUDYMATHTOKEN'+i+'END',v)});
    return s;
  }

  function markdown(text){
    var lines=String(text??'').replace(/\r/g,'').split('\n'),out=[],list=false;
    function end(){if(list){out.push('</ul>');list=false}}
    for(var i=0;i<lines.length;i++){
      var x=lines[i].trim(),m;
      if(!x){end();out.push('<div class="ai-spacer"></div>');continue}
      if(/^```/.test(x)){end();out.push('<pre><code>'+esc(x.replace(/^```[a-zA-Z]*\s*/,''))+'</code></pre>');continue}
      if(/^---+$/.test(x)||/^\*\*\*+$/.test(x)){end();out.push('<hr>');continue}
      m=x.match(/^###\s*(.+)$/);if(m){end();out.push('<h4>'+markdownInline(m[1])+'</h4>');continue}
      m=x.match(/^##\s*(.+)$/);if(m){end();out.push('<h3>'+markdownInline(m[1])+'</h3>');continue}
      m=x.match(/^#\s*(.+)$/);if(m){end();out.push('<h3>'+markdownInline(m[1])+'</h3>');continue}
      m=x.match(/^(?:[-*]|•)\s+(.+)$/);if(m){if(!list){out.push('<ul>');list=true}out.push('<li>'+markdownInline(m[1])+'</li>');continue}
      m=x.match(/^\d+[.)]\s+(.+)$/);if(m){end();out.push('<div class="ai-numbered"><b>'+m[0].match(/^\d+/)[0]+'.</b> '+markdownInline(m[1])+'</div>');continue}
      end();out.push('<p>'+markdownInline(x)+'</p>');
    }
    end();return out.join('');
  }

  function style(){
    if(document.getElementById('study-public-system-final-style'))return;
    var s=document.createElement('style');s.id='study-public-system-final-style';s.textContent=
      '.study-ai-msg.bot{line-height:1.72;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.study-ai-msg.bot p{margin:0 0 10px}.study-ai-msg.bot h3{margin:12px 0 7px}.study-ai-msg.bot h4{margin:10px 0 6px}.study-ai-msg.bot ul{padding-left:24px;margin:6px 0 10px}.study-ai-msg.bot li{margin:3px 0}.study-ai-msg.bot hr{border:0;border-top:1px solid rgba(90,100,150,.18);margin:14px 0}.study-ai-msg.bot pre{overflow:auto;padding:10px;border-radius:10px;background:rgba(90,100,150,.08)}.study-ai-msg.bot code{padding:2px 5px;border-radius:5px;background:rgba(90,100,150,.08)}.study-ai-msg.bot .katex{font-size:1.08em}.study-ai-msg.bot .katex-display{margin:.6em 0}.ai-spacer{height:4px}.ai-numbered{margin:6px 0}' +
      '.support-message-list .support-bubble,.support-message-list .bubble{overflow-wrap:anywhere}.support-message-list .katex{font-size:1.05em}';
    document.head.appendChild(s);
  }

  function formatAi(){
    var box=document.getElementById('studyAiMessages');if(!box)return;
    box.querySelectorAll('.study-ai-msg.bot:not([data-system-ai-final])').forEach(function(n){
      if(n.hasAttribute('data-thinking'))return;
      var t=n.textContent||'';if(!t.trim())return;
      n.dataset.studyAiRaw=t;
      n.innerHTML=markdown(t);
      n.dataset.systemAiFinal='1';
    });
  }

  function renderMath(){
    var root=document.getElementById('app')||document.body;
    return loadKatex().then(function(){
      if(!window.renderMathInElement)return;
      try{window.renderMathInElement(root,{delimiters:[
        {left:'$$',right:'$$',display:true},
        {left:'$',right:'$',display:false},
        {left:'\\(',right:'\\)',display:false},
        {left:'\\[',right:'\\]',display:true}
      ],throwOnError:false,strict:false});}catch(e){console.warn('Study KaTeX:',e)}
    });
  }

  function dedupeSupport(){
    var list=document.querySelector('.support-message-list');if(!list)return;
    var seen=new Set();Array.from(list.children).forEach(function(row){
      var b=row.querySelector('.support-bubble,.bubble');if(!b)return;
      var text=(b.querySelector('div')?.textContent||b.textContent||'').replace(/\s+/g,' ').trim();
      var tm=(b.querySelector('small')?.textContent||'').trim();var key=String(b.className)+'|'+text+'|'+tm;
      if(text&&seen.has(key))row.remove();else if(text)seen.add(key);
    });
  }

  var sending=false,lastKey='',lastAt=0;
  function installSupport(){
    var input=document.getElementById('supportInput');if(!input)return;
    var form=input.closest('form');
    if(form&&!form.dataset.studyFinalBound){
      form.dataset.studyFinalBound='1';
      form.addEventListener('submit',function(e){
        e.preventDefault();e.stopImmediatePropagation();
        var text=input.value.trim();if(!text||sending)return;
        var now=Date.now();if(text===lastKey&&now-lastAt<1200)return;
        lastKey=text;lastAt=now;sending=true;
        Promise.resolve(window.sendSupportMessage?.({message:text})).then(function(){input.value=''}).catch(function(err){console.error(err)}).finally(function(){sending=false;dedupeSupport()});
      },true);
    }
    if(!input.dataset.studyFinalKey){
      input.dataset.studyFinalKey='1';
      input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();if(form)form.requestSubmit()}},true);
    }
  }

  function boot(){
    style();formatAi();installSupport();dedupeSupport();renderMath();
    var root=document.getElementById('app')||document.body;
    if(!root.__studySystemFinalObs){
      root.__studySystemFinalObs=new MutationObserver(function(){
        clearTimeout(root.__studySystemFinalTimer);
        root.__studySystemFinalTimer=setTimeout(function(){formatAi();installSupport();dedupeSupport();renderMath()},30);
      });root.__studySystemFinalObs.observe(root,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
  window.addEventListener('load',function(){setTimeout(boot,100)});
  setInterval(function(){formatAi();installSupport();dedupeSupport();renderMath()},1500);
})();
