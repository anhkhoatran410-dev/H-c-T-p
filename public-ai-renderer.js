/* STUDY TH — AI chat renderer V2. */
(function(){
  if(window.__studyAiRendererV2)return;
  window.__studyAiRendererV2=true;
  var BASE='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/';
  var ready=null;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
  function loadKatex(){
    if(typeof window.renderMathInElement==='function')return Promise.resolve(true);
    if(ready)return ready;
    ready=new Promise(function(resolve){
      if(!document.querySelector('link[data-study-ai-katex-v2]')){var css=document.createElement('link');css.rel='stylesheet';css.href=BASE+'katex.min.css';css.dataset.studyAiKatexV2='1';document.head.appendChild(css)}
      function auto(){if(typeof window.renderMathInElement==='function'){resolve(true);return}var a=document.createElement('script');a.src=BASE+'contrib/auto-render.min.js';a.onload=function(){resolve(typeof window.renderMathInElement==='function')};a.onerror=function(){resolve(false)};document.head.appendChild(a)}
      if(window.katex){auto();return}
      var js=document.createElement('script');js.src=BASE+'katex.min.js';js.onload=auto;js.onerror=function(){resolve(false)};document.head.appendChild(js);
    });
    return ready;
  }
  function inline(raw){
    var src=String(raw==null?'':raw),stash=[];
    var p=src.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,function(m){var k='\uE000'+stash.length+'\uE001';stash.push(m);return k});
    var out=esc(p).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    stash.forEach(function(m,i){out=out.split('\uE000'+i+'\uE001').join(m)});return out;
  }
  function md(text){
    var lines=String(text==null?'':text).replace(/\r/g,'').split('\n'),out=[],list=false;
    function end(){if(list){out.push('</ul>');list=false}}
    lines.forEach(function(raw0){var raw=raw0.trim(),m;if(!raw){end();return}if(/^```/.test(raw)){end();out.push('<pre><code>'+esc(raw.replace(/^```[\w-]*\s*/,''))+'</code></pre>');return}if(/^---+$/.test(raw)){end();out.push('<hr>');return}m=raw.match(/^#{1,3}\s+(.+)$/);if(m){end();out.push('<h3>'+inline(m[1])+'</h3>');return}m=raw.match(/^(?:[-*]|•)\s+(.+)$/);if(m){if(!list){out.push('<ul>');list=true}out.push('<li>'+inline(m[1])+'</li>');return}m=raw.match(/^\d+[.)]\s+(.+)$/);if(m){end();out.push('<div class="ai-numbered"><b>'+m[0].match(/^\d+/)[0]+'.</b> '+inline(m[1])+'</div>');return}end();out.push('<p>'+inline(raw)+'</p>')});end();return out.join('')
  }
  function style(){if(document.getElementById('study-ai-renderer-v2-style'))return;var s=document.createElement('style');s.id='study-ai-renderer-v2-style';s.textContent='.study-ai-msg.bot{line-height:1.72;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.study-ai-msg.bot p{margin:0 0 10px}.study-ai-msg.bot h3{margin:10px 0 7px}.study-ai-msg.bot ul{padding-left:22px;margin:5px 0 10px}.study-ai-msg.bot li{margin:3px 0}.study-ai-msg.bot .ai-numbered{margin:5px 0}.study-ai-msg.bot .katex{font-size:1.08em}.study-ai-msg.bot .katex-display{margin:.65em 0;overflow-x:auto}';document.head.appendChild(s)}
  function renderOne(node,raw){if(!node||node.hasAttribute('data-thinking'))return;raw=raw!=null?String(raw):String(node.dataset.aiRaw!=null?node.dataset.aiRaw:node.textContent||'');if(!raw.trim())return;node.dataset.aiRaw=raw;node.dataset.aiRendered='html';node.innerHTML=md(raw);loadKatex().then(function(ok){if(ok&&document.documentElement.contains(node)&&typeof window.renderMathInElement==='function'){try{window.renderMathInElement(node,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,strict:false,trust:false});node.dataset.aiMathRendered='1'}catch(e){console.warn('AI KaTeX',e)}}})}
  function scan(root){var a=[];if(root&&root.matches&&root.matches('.study-ai-msg.bot'))a.push(root);if(root&&root.querySelectorAll)root.querySelectorAll('.study-ai-msg.bot').forEach(function(n){a.push(n)});a.forEach(function(n){if(n.dataset.aiRendered!=='html')renderOne(n)})}
  window.renderStudyAiMessage=function(node,raw){style();renderOne(node,raw)};
  function boot(){style();scan(document);if(document.body.__studyAiRendererV2Observer)return;document.body.__studyAiRendererV2Observer=new MutationObserver(function(rs){rs.forEach(function(r){Array.from(r.addedNodes||[]).forEach(function(n){if(n.nodeType===1)scan(n)})})});document.body.__studyAiRendererV2Observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
})();
