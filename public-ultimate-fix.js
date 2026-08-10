/* STUDY TH: ultimate public chat + AI reliability/rendering fix. Loaded LAST. */
(function(){
  if(window.__studyUltimatePublicFix)return;
  window.__studyUltimatePublicFix=true;

  function stateOf(){return window.state||window.studyState||null}
  function escHtml(v){return String(v??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}

  /* ---------- AI STUDY: readable Vietnamese + math ---------- */
  function mathText(value){
    var s=String(value??'');
    s=s.replace(/\\left/g,'').replace(/\\right/g,'');
    s=s.replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g,'($1)/($2)');
    s=s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g,'($1)/($2)');
    s=s.replace(/\\sqrt\{([^{}]+)\}/g,'√($1)');
    s=s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g,'$1√($2)');
    s=s.replace(/\\int/g,'∫').replace(/\\sum/g,'Σ').replace(/\\prod/g,'∏');
    s=s.replace(/\\infty|\\infinity/g,'∞').replace(/\\leq|\\le/g,'≤').replace(/\\geq|\\ge/g,'≥');
    s=s.replace(/\\neq|\\ne/g,'≠').replace(/\\approx/g,'≈').replace(/\\equiv/g,'≡');
    s=s.replace(/\\times/g,'×').replace(/\\cdot/g,'·').replace(/\\div/g,'÷').replace(/\\pm/g,'±');
    s=s.replace(/\\rightarrow|\\to/g,'→').replace(/\\Rightarrow/g,'⇒').replace(/\\leftrightarrow/g,'↔');
    s=s.replace(/\\pi/g,'π').replace(/\\theta/g,'θ').replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ').replace(/\\delta/g,'δ').replace(/\\Delta/g,'Δ');
    s=s.replace(/\\lambda/g,'λ').replace(/\\mu/g,'μ').replace(/\\sigma/g,'σ').replace(/\\omega/g,'ω');
    s=s.replace(/\^\{2\}/g,'²').replace(/\^2/g,'²').replace(/\^\{3\}/g,'³').replace(/\^3/g,'³').replace(/\^\{n\}/g,'ⁿ').replace(/\^n/g,'ⁿ');
    s=s.replace(/_\{([0-9]+)\}/g,'_$1').replace(/_([0-9])/g,function(_,n){return String.fromCharCode(0x2080+Number(n))});
    s=s.replace(/\\,/g,' ').replace(/\\;/g,' ').replace(/\\!/g,'').replace(/\\quad/g,'  ');
    s=s.replace(/\\text\{([^{}]+)\}/g,'$1').replace(/\\mathrm\{([^{}]+)\}/g,'$1');
    return s;
  }
  function inline(v){
    var s=escHtml(mathText(v));
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/__([^_]+)__/g,'<strong>$1</strong>');
    s=s.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    s=s.replace(/\$\$([^$]+)\$\$/g,'<span class="ai-math ai-math-block">$1</span>');
    s=s.replace(/\$([^$\n]+)\$/g,'<span class="ai-math">$1</span>');
    return s;
  }
  function markdown(text){
    var lines=String(text??'').replace(/\r/g,'').split('\n'),out=[],list=false;
    function end(){if(list){out.push('</ul>');list=false}}
    lines.forEach(function(line){
      var raw=line.trim();
      if(!raw){end();out.push('<div class="ai-spacer"></div>');return}
      if(/^```/.test(raw)){return}
      if(/^---+$/.test(raw)||/^\*\*\*+$/.test(raw)){end();out.push('<hr>');return}
      var m=raw.match(/^###\s*(.+)$/);if(m){end();out.push('<h4>'+inline(m[1])+'</h4>');return}
      m=raw.match(/^##\s*(.+)$/);if(m){end();out.push('<h3>'+inline(m[1])+'</h3>');return}
      m=raw.match(/^#\s*(.+)$/);if(m){end();out.push('<h3>'+inline(m[1])+'</h3>');return}
      m=raw.match(/^(?:[-*]|•)\s+(.+)$/);if(m){if(!list){out.push('<ul>');list=true}out.push('<li>'+inline(m[1])+'</li>');return}
      m=raw.match(/^\d+[.)]\s+(.+)$/);if(m){end();out.push('<div class="ai-numbered"><b>'+raw.match(/^\d+/)[0]+'.</b> '+inline(m[1])+'</div>');return}
      end();out.push('<p>'+inline(raw)+'</p>');
    });
    end();return out.join('');
  }
  function formatAi(){
    var box=document.getElementById('studyAiMessages');if(!box)return;
    box.querySelectorAll('.study-ai-msg.bot:not([data-ai-final])').forEach(function(node){
      if(node.hasAttribute('data-thinking'))return;
      var text=node.textContent||'';if(!text.trim())return;
      node.innerHTML=markdown(text);node.dataset.aiFinal='1';
    });
  }
  function aiStyle(){
    if(document.getElementById('study-ai-ultimate-style'))return;
    var s=document.createElement('style');s.id='study-ai-ultimate-style';s.textContent=
      '.study-ai-msg.bot{line-height:1.72;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.study-ai-msg.bot p{margin:0 0 9px}.study-ai-msg.bot p:last-child{margin-bottom:0}.study-ai-msg.bot h3{margin:9px 0 7px;font-size:1.06em}.study-ai-msg.bot h4{margin:8px 0 6px}.study-ai-msg.bot ul{margin:5px 0 9px;padding-left:22px}.study-ai-msg.bot li{margin:3px 0}.study-ai-msg.bot hr{border:0;border-top:1px solid rgba(90,100,150,.18);margin:12px 0}.study-ai-msg.bot code{padding:2px 6px;border-radius:6px;background:rgba(90,100,150,.1);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.study-ai-msg.bot .ai-math{font-family:Georgia,"Times New Roman",serif;font-style:italic;letter-spacing:.01em}.study-ai-msg.bot .ai-math-block{display:block;text-align:center;margin:8px 0;font-size:1.1em}.study-ai-msg.bot .ai-spacer{height:3px}.study-ai-msg.bot .ai-numbered{margin:5px 0}';document.head.appendChild(s);
  }

  /* ---------- AI modal: one submit path, Enter sends, Shift+Enter newline ---------- */
  function installAi(){
    var form=document.getElementById('studyAiForm'),ta=form?.querySelector('textarea');if(!form||!ta)return;
    if(form.dataset.ultimateBound!=='1'){
      form.dataset.ultimateBound='1';
      form.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation()},true);
      ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();form.requestSubmit()}},true);
    }
    formatAi();aiStyle();
    var box=document.getElementById('studyAiMessages');if(box&&!box.__ultimateObserver){box.__ultimateObserver=new MutationObserver(function(){formatAi()});box.__ultimateObserver.observe(box,{childList:true,subtree:true})}
  }

  /* ---------- Public support: hard double-send lock + clean DOM ---------- */
  var sending=false,lastSendKey='',lastSendAt=0;
  function dedupeSupportDom(){
    var list=document.querySelector('.support-message-list');if(!list)return;
    var seen=new Set();
    Array.from(list.children).forEach(function(row){
      var bubble=row.querySelector('.support-bubble')||row.querySelector('.bubble');if(!bubble)return;
      var text=(bubble.querySelector('div')?.textContent||bubble.textContent||'').replace(/\s+/g,' ').trim();
      var stamp=(bubble.querySelector('small')?.textContent||'').trim();
      var cls=String(bubble.className||'');
      var key=cls+'|'+text+'|'+stamp;
      if(text&&seen.has(key)){row.remove();return}seen.add(key);
    });
  }
  function installSupport(){
    var input=document.getElementById('supportInput');if(!input)return;
    if(input.dataset.ultimateBound!=='1'){
      input.dataset.ultimateBound='1';
      input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();var form=input.closest('form');if(form)form.requestSubmit();else if(typeof window.sendSupport==='function')window.sendSupport()}},true);
    }
    var form=input.closest('form');
    if(form&&!form.dataset.ultimateBound){form.dataset.ultimateBound='1';form.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();var text=input.value.trim();if(!text||sending)return;var key=text;var now=Date.now();if(key===lastSendKey&&now-lastSendAt<1200)return;lastSendKey=key;lastSendAt=now;sending=true;Promise.resolve(window.sendSupportMessage?.({message:text})).then(function(){input.value=''}).catch(function(err){alert('Không gửi được tin nhắn: '+(err?.message||err))}).finally(function(){sending=false})},true)}
    dedupeSupportDom();
  }

  /* Replace the final send function with a single-flight version. */
  function wrapSendSupport(){
    var fn=window.sendSupportMessage;if(typeof fn!=='function'||fn.__ultimatePublicSend)return;
    var wrapped=async function(payload){
      var msg=String(payload?.message||'').trim(),key=msg+'|'+String(payload?.sticker||'');
      var now=Date.now();
      if(sending)return;
      if(key&&key===lastSendKey&&now-lastSendAt<1200)return;
      sending=true;lastSendKey=key;lastSendAt=now;
      try{return await fn(payload)}finally{sending=false;setTimeout(dedupeSupportDom,30);setTimeout(dedupeSupportDom,180)}
    };
    wrapped.__ultimatePublicSend=true;window.sendSupportMessage=wrapped;
  }

  function boot(){
    aiStyle();installAi();installSupport();wrapSendSupport();dedupeSupportDom();
    var root=document.getElementById('app');if(root&&!root.__ultimatePublicObserver){root.__ultimatePublicObserver=new MutationObserver(function(){installAi();installSupport();wrapSendSupport();dedupeSupportDom()});root.__ultimatePublicObserver.observe(root,{childList:true,subtree:true})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
  window.addEventListener('load',function(){setTimeout(boot,100)});
  setInterval(boot,1000);
})();
