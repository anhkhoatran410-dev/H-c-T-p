/* STUDY TH — readable AI Markdown with real KaTeX mathematics. */
(function(){
  if(window.__studyAiFormatFinalV3)return;
  window.__studyAiFormatFinalV3=true;

  function esc(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}

  /* Never convert LaTeX to plain Unicode here. KaTeX needs the original syntax. */
  function inline(v){
    var src=String(v??''), stash=[];
    var protectedText=src.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,function(m){
      var id='\uE000'+stash.length+'\uE001';
      stash.push(m);
      return id;
    });
    var s=esc(protectedText)
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/__([^_]+)__/g,'<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    stash.forEach(function(m,i){s=s.split('\uE000'+i+'\uE001').join(m)});
    return s;
  }

  function isSep(x){return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(x)}

  function table(lines,i){
    if(i+1>=lines.length||lines[i].indexOf('|')<0||!isSep(lines[i+1]))return null;
    var split=function(x){x=x.trim().replace(/^\|/,'').replace(/\|$/,'');return x.split('|').map(function(v){return v.trim()})};
    var h=split(lines[i]),rows=[],j=i+2;
    while(j<lines.length&&lines[j].trim().indexOf('|')>=0&&!isSep(lines[j].trim())){rows.push(split(lines[j]));j++}
    var html='<div class="ai-table-wrap"><table class="ai-table"><thead><tr>'+h.map(function(c){return '<th>'+inline(c)+'</th>'}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+h.map(function(_,k){return '<td>'+inline(r[k]||'')+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>';
    return {html:html,next:j};
  }

  function standaloneMath(raw){
    var m=raw.match(/^\$([^$\n]+)\$$/);
    if(m)return '<div class="ai-math-block">$$'+m[1]+'$$</div>';
    if(/^\$\$[\s\S]+\$\$$/.test(raw))return '<div class="ai-math-block">'+raw+'</div>';
    if(/^\\\[[\s\S]+\\\]$/.test(raw))return '<div class="ai-math-block">'+raw+'</div>';
    return null;
  }

  function md(text){
    var lines=String(text??'').replace(/\r/g,'').split('\n'),out=[],list=false;
    function end(){if(list){out.push('</ul>');list=false}}
    for(var i=0;i<lines.length;i++){
      var raw=lines[i].trim(),m;
      if(!raw){end();out.push('<div class="ai-spacer"></div>');continue}
      var sm=standaloneMath(raw);
      if(sm){end();out.push(sm);continue}
      var tb=table(lines,i);
      if(tb){end();out.push(tb.html);i=tb.next-1;continue}
      if(/^---+$/.test(raw)||/^\*\*\*+$/.test(raw)){end();out.push('<hr>');continue}
      m=raw.match(/^###\s+(.+)$/);if(m){end();out.push('<h4>'+inline(m[1])+'</h4>');continue}
      m=raw.match(/^##\s+(.+)$/);if(m){end();out.push('<h3>'+inline(m[1])+'</h3>');continue}
      m=raw.match(/^#\s+(.+)$/);if(m){end();out.push('<h3>'+inline(m[1])+'</h3>');continue}
      m=raw.match(/^(?:[-*]|•)\s+(.+)$/);if(m){if(!list){out.push('<ul>');list=true}out.push('<li>'+inline(m[1])+'</li>');continue}
      m=raw.match(/^\d+[.)]\s+(.+)$/);if(m){end();out.push('<div class="ai-numbered"><b>'+raw.match(/^\d+/)[0]+'.</b> '+inline(m[1])+'</div>');continue}
      end();out.push('<p>'+inline(raw)+'</p>');
    }
    end();return out.join('');
  }

  function install(){
    if(!document.getElementById('study-ai-format-final-style')){
      var s=document.createElement('style');s.id='study-ai-format-final-style';
      s.textContent='.study-ai-msg.bot{line-height:1.75;overflow-wrap:anywhere;word-break:break-word;white-space:normal}.study-ai-msg.bot p{margin:0 0 11px}.study-ai-msg.bot h3{margin:10px 0 7px}.study-ai-msg.bot h4{margin:8px 0}.study-ai-msg.bot ul{padding-left:22px}.study-ai-msg.bot hr{border:0;border-top:1px solid rgba(90,100,150,.18);margin:14px 0}.study-ai-msg.bot code{padding:2px 6px;border-radius:6px;background:rgba(90,100,150,.1)}.study-ai-msg.bot .ai-spacer{height:4px}.study-ai-msg.bot .ai-numbered{margin:6px 0}.ai-math-block{display:block;overflow-x:auto;padding:8px 4px;margin:8px 0 12px;text-align:center}.ai-math-block .katex-display{margin:0}.ai-table-wrap{overflow-x:auto;margin:8px 0 12px}.ai-table{width:100%;border-collapse:collapse;font-size:.95em}.ai-table th,.ai-table td{padding:8px 10px;border:1px solid rgba(90,100,150,.18);text-align:left}.ai-table th{font-weight:800;background:rgba(90,100,150,.07)}';
      document.head.appendChild(s);
    }
    var box=document.getElementById('studyAiMessages');
    if(!box)return;
    box.querySelectorAll('.study-ai-msg.bot:not([data-ai-format-v3])').forEach(function(n){
      if(n.hasAttribute('data-thinking'))return;
      var t=n.textContent||'';if(!t.trim())return;
      n.innerHTML=md(t);n.dataset.aiFormatV3='1';
      if(typeof window.renderMathInElement==='function')setTimeout(function(){try{window.renderMathInElement(n,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,strict:false,trust:false})}catch(e){}},0);
    });
    if(!box.__aiFormatV3Obs){
      box.__aiFormatV3Obs=new MutationObserver(function(){install()});
      box.__aiFormatV3Obs.observe(box,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0)});else install();
  window.addEventListener('load',function(){setTimeout(install,100)});
  window.addEventListener('study-app-loaded',function(){setTimeout(install,0)});
  var t=setInterval(install,500);setTimeout(function(){clearInterval(t)},30000);
})();
