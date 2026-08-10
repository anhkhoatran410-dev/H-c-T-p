/* STUDY TH: render AI học tập replies as readable Markdown/math instead of raw markers. */
(function(){
  if(window.__studyAiFormatFinal)return;
  window.__studyAiFormatFinal=true;

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]});
  }
  function inline(value){
    var s=escapeHtml(value);
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/__([^_]+)__/g,'<strong>$1</strong>');
    s=s.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    s=s.replace(/\$\$([^$]+)\$\$/g,'<span class="ai-math ai-math-block">$1</span>');
    s=s.replace(/\$([^$\n]+)\$/g,'<span class="ai-math">$1</span>');
    return s;
  }
  function renderMarkdown(text){
    var lines=String(text??'').replace(/\r/g,'').split('\n'),html=[],inList=false;
    function endList(){if(inList){html.push('</ul>');inList=false}}
    lines.forEach(function(line){
      var raw=line.trim();
      if(!raw){endList();html.push('<div class="ai-spacer"></div>');return}
      if(/^---+$/.test(raw)||/^\*\*\*+$/.test(raw)){endList();html.push('<hr>');return}
      var m=raw.match(/^###\s+(.+)$/);if(m){endList();html.push('<h4>'+inline(m[1])+'</h4>');return}
      m=raw.match(/^##\s+(.+)$/);if(m){endList();html.push('<h3>'+inline(m[1])+'</h3>');return}
      m=raw.match(/^#\s+(.+)$/);if(m){endList();html.push('<h3>'+inline(m[1])+'</h3>');return}
      m=raw.match(/^(?:[-*]|•)\s+(.+)$/);if(m){if(!inList){html.push('<ul>');inList=true}html.push('<li>'+inline(m[1])+'</li>');return}
      m=raw.match(/^\d+[.)]\s+(.+)$/);if(m){endList();html.push('<div class="ai-numbered"><b>'+escapeHtml(raw.match(/^\d+/)[0])+'.</b> '+inline(m[1])+'</div>');return}
      endList();html.push('<p>'+inline(raw)+'</p>');
    });
    endList();
    return html.join('');
  }
  function format(){
    var box=document.getElementById('studyAiMessages');
    if(!box)return;
    box.querySelectorAll('.study-ai-msg.bot:not([data-ai-formatted])').forEach(function(node){
      if(node.hasAttribute('data-thinking'))return;
      var text=node.textContent||'';
      if(!text.trim())return;
      node.innerHTML=renderMarkdown(text);
      node.dataset.aiFormatted='1';
    });
  }
  function install(){
    if(!document.getElementById('study-ai-format-final-style')){
      var style=document.createElement('style');style.id='study-ai-format-final-style';style.textContent=''
        +'.study-ai-msg.bot{line-height:1.7;overflow-wrap:anywhere;word-break:break-word;white-space:normal}'
        +'.study-ai-msg.bot p{margin:0 0 10px}.study-ai-msg.bot p:last-child{margin-bottom:0}'
        +'.study-ai-msg.bot h3{margin:8px 0 10px;font-size:1.05em}.study-ai-msg.bot h4{margin:8px 0 8px;font-size:1em}'
        +'.study-ai-msg.bot ul{margin:6px 0 10px;padding-left:22px}.study-ai-msg.bot li{margin:4px 0}'
        +'.study-ai-msg.bot hr{border:0;border-top:1px solid rgba(90,100,150,.18);margin:12px 0}'
        +'.study-ai-msg.bot code{padding:2px 6px;border-radius:6px;background:rgba(90,100,150,.1);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}'
        +'.study-ai-msg.bot .ai-math{font-family:Georgia,"Times New Roman",serif;font-style:italic;letter-spacing:.01em}'
        +'.study-ai-msg.bot .ai-math-block{display:block;text-align:center;margin:8px 0;font-size:1.08em}'
        +'.study-ai-msg.bot .ai-spacer{height:4px}.study-ai-msg.bot .ai-numbered{margin:5px 0}'
      ;document.head.appendChild(style);
    }
    format();
    var root=document.getElementById('studyAiMessages');
    if(root&&!root.__aiFormatObserver){root.__aiFormatObserver=new MutationObserver(function(){format()});root.__aiFormatObserver.observe(root,{childList:true,subtree:true});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(install,0)});else install();
  window.addEventListener('load',function(){setTimeout(install,0)});
  var tries=0,t=setInterval(function(){install();if(++tries>40)clearInterval(t)},250);
})();
