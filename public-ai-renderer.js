/* STUDY TH — AI chat renderer V3: Markdown + KaTeX + safe math visualizations. */
(function(){
  if(window.__studyAiRendererV6)return;
  window.__studyAiRendererV6=true;
  var BASE='https://cdn.jsdelivr.net/npm/katex@0.18.0/dist/';
  var ready=null;

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};
    });
  }

  function loadKatex(){
    if(typeof window.renderMathInElement==='function')return Promise.resolve(true);
    if(ready)return ready;
    ready=new Promise(function(resolve){
      if(!document.querySelector('link[data-study-ai-katex-v3]')){
        var css=document.createElement('link');css.rel='stylesheet';
        css.href=BASE+'katex.min.css';css.dataset.studyAiKatexV3='1';
        document.head.appendChild(css);
      }
      function auto(){
        if(typeof window.renderMathInElement==='function'){resolve(true);return;}
        var a=document.createElement('script');a.src=BASE+'contrib/auto-render.min.js';
        a.onload=function(){resolve(typeof window.renderMathInElement==='function')};
        a.onerror=function(){resolve(false)};document.head.appendChild(a);
      }
      if(window.katex){auto();return;}
      var js=document.createElement('script');js.src=BASE+'katex.min.js';
      js.onload=auto;js.onerror=function(){resolve(false)};document.head.appendChild(js);
    });
    return ready;
  }

  function inline(raw){
    var src=String(raw==null?'':raw)
      .replace(/\[object\s*Object\]/gi,'≥')
      .replace(/\[objectObject\]/gi,'≥'),stash=[];
    var p=src.replace(/(\x60[^\x60]+\x60|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,function(m){
      var k='\uE000'+stash.length+'\uE001';stash.push(m);return k;
    });
    var out=esc(p)
      .replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/__([^_]+)__/g,'<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    stash.forEach(function(m,i){out=out.split('\uE000'+i+'\uE001').join(m)});
    return out;
  }

  function number(v,fallback){
    var n=Number(v);return Number.isFinite(n)?n:fallback;
  }

  function nicePi(n){
    if(!Number.isFinite(n)||Math.abs(n)<1e-9)return '0';
    var q=n/Math.PI,a=Math.round(q*2)/2;
    if(Math.abs(q-a)>0.015)return Number(n.toFixed(2)).toString();
    var sign=a<0?'-':'',x=Math.abs(a);
    if(Math.abs(x-1)<1e-9)return sign+'π';
    if(Math.abs(x-.5)<1e-9)return sign+'π/2';
    if(Math.abs(x-1.5)<1e-9)return sign+'3π/2';
    if(Number.isInteger(x))return sign+x+'π';
    return sign+Math.round(x*2)+'π/2';
  }

  function parseEquation(eq){
    var s=String(eq||'').trim().replace(/^y\s*=\s*/i,'').replace(/\s+/g,'');
    s=s.replace(/\\(sin|cos|tan)/gi,'$1').replace(/×/g,'*').replace(/−/g,'-');
    var m=s.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?sin\(\s*([+-]?(?:\d+(?:\.\d+)?)?)?\*?x(?:([+-]\d+(?:\.\d+)?))?\)([+-]\d+(?:\.\d+)?)?$/i);
    if(m)return function(x){
      var A=m[1]===''||m[1]==='+'||m[1]===undefined?1:(m[1]==='-'?-1:Number(m[1]));
      var B=m[2]?Number(m[2]):1,C=m[3]?Number(m[3]):0,D=m[4]?Number(m[4]):0;
      return A*Math.sin(B*x+C)+D;
    };
    m=s.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?cos\(\s*([+-]?(?:\d+(?:\.\d+)?)?)?\*?x(?:([+-]\d+(?:\.\d+)?))?\)([+-]\d+(?:\.\d+)?)?$/i);
    if(m)return function(x){
      var A=m[1]===''||m[1]==='+'||m[1]===undefined?1:(m[1]==='-'?-1:Number(m[1]));
      var B=m[2]?Number(m[2]):1,C=m[3]?Number(m[3]):0,D=m[4]?Number(m[4]):0;
      return A*Math.cos(B*x+C)+D;
    };
    m=s.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?tan\(\s*([+-]?(?:\d+(?:\.\d+)?)?)?\*?x(?:([+-]\d+(?:\.\d+)?))?\)([+-]\d+(?:\.\d+)?)?$/i);
    if(m)return function(x){
      var A=m[1]===''||m[1]==='+'||m[1]===undefined?1:(m[1]==='-'?-1:Number(m[1]));
      var B=m[2]?Number(m[2]):1,C=m[3]?Number(m[3]):0,D=m[4]?Number(m[4]):0;
      var t=Math.tan(B*x+C);return Number.isFinite(t)&&Math.abs(t)<1e4?A*t+D:NaN;
    };
    m=s.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?x\^2([+-]\d+(?:\.\d+)?)\*?x?([+-]\d+(?:\.\d+)?)?$/i);
    if(m)return function(x){
      return (m[1]?Number(m[1]):1)*x*x+(m[2]?Number(m[2]):0)*x+(m[3]?Number(m[3]):0);
    };
    m=s.match(/^([+-]?(?:\d+(?:\.\d+)?)?)\*?x([+-]\d+(?:\.\d+)?)?$/i);
    if(m)return function(x){
      var A=(m[1]===''||m[1]==='+'||m[1]===undefined)?1:(m[1]==='-'?-1:Number(m[1]));
      return A*x+(m[2]?Number(m[2]):0);
    };
    if(/^sin\(x\)$/i.test(s)||/^sinx$/i.test(s))return function(x){return Math.sin(x)};
    if(/^cos\(x\)$/i.test(s)||/^cosx$/i.test(s))return function(x){return Math.cos(x)};
    return null;
  }

  function graphSpecFromRaw(raw,node){
    var text=String(raw||'');
    var m=text.match(/\x60\x60\x60study-graph\s*\n([\s\S]*?)\n\x60\x60\x60/i);
    if(m){
      try{return {spec:JSON.parse(m[1]),rawBlock:m[0],explicit:true};}
      catch(e){return {spec:null,rawBlock:m[0],explicit:true};}
    }
    var q=String(node&&node.dataset&&node.dataset.studyQuery||'');
    var all=q+' '+text;
    if(!/(đồ thị|vẽ|biểu diễn|plot|graph|coordinate|trục tọa độ)/i.test(all))return null;
    if(/\bsin\b|\\sin/i.test(all))return {explicit:false,spec:{type:'function',title:'Đồ thị y = sin(x)',xMin:-2*Math.PI,xMax:2*Math.PI,yMin:-1.5,yMax:1.5,xLabel:'x',yLabel:'y',functions:[{equation:'y = sin(x)',label:'y = sin(x)'}],points:[{x:0,y:0,label:'O'},{x:Math.PI/2,y:1,label:'A'},{x:Math.PI,y:0,label:'B'},{x:3*Math.PI/2,y:-1,label:'C'}],annotations:[{x:Math.PI/2,y:1,text:'Cực đại y = 1',dx:28,dy:-34},{x:Math.PI,y:0,text:'Qua trục tại π',dx:28,dy:-34},{x:3*Math.PI/2,y:-1,text:'Cực tiểu y = −1',dx:28,dy:34}]}};
    if(/\bcos\b|\\cos/i.test(all))return {explicit:false,spec:{type:'function',title:'Đồ thị y = cos(x)',xMin:-2*Math.PI,xMax:2*Math.PI,yMin:-1.5,yMax:1.5,xLabel:'x',yLabel:'y',functions:[{equation:'y = cos(x)',label:'y = cos(x)'}],points:[{x:0,y:1,label:'A'}],annotations:[{x:0,y:1,text:'Cực đại y = 1',dx:28,dy:-34},{x:Math.PI,y:-1,text:'Cực tiểu y = −1',dx:28,dy:34}]}};
    var eq=(text.match(/y\s*=\s*[^\n;,]+/i)||[])[0];
    if(eq)return {explicit:false,spec:{type:'function',title:eq,xMin:-10,xMax:10,xLabel:'x',yLabel:'y',functions:[{equation:eq,label:eq}]}};
    return null;
  }

  function buildGraph(spec){
    if(!spec||typeof spec!=='object')return null;
    var type=String(spec.type||'function').toLowerCase();
    if(type==='geometry')return buildGeometry(spec);
    if(type==='diagram')return buildDiagram(spec);
    if(type!=='function'&&type!=='cartesian'&&type!=='chart')return null;
    var W=760,H=440,L=64,R=22,T=52,B=54;
    var fs=Array.isArray(spec.functions)?spec.functions:[];if(!fs.length&&spec.equation)fs=[{equation:spec.equation,label:spec.equation}];
    var parsed=fs.slice(0,4).map(function(f){
      var eq=typeof f==='string'?f:f&&f.equation;
      return {equation:String(eq||''),label:String((f&&f.label)||eq||''),fn:parseEquation(eq)};
    }).filter(function(x){return !!x.fn});
    var points=Array.isArray(spec.points)?spec.points.slice(0,40).filter(function(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))}):[];
    var annotations=Array.isArray(spec.annotations)?spec.annotations.slice(0,20).filter(function(a){return a&&Number.isFinite(Number(a.x))&&Number.isFinite(Number(a.y))&&a.text}):[];
    var xmin=number(spec.xMin,parsed.some(function(f){return /sin|cos|tan/i.test(f.equation)})?-2*Math.PI:-10);
    var xmax=number(spec.xMax,parsed.some(function(f){return /sin|cos|tan/i.test(f.equation)})?2*Math.PI:10);
    if(!(xmax>xmin))return null;
    var ymin=Number.isFinite(Number(spec.yMin))?Number(spec.yMin):NaN,ymax=Number.isFinite(Number(spec.yMax))?Number(spec.yMax):NaN;
    if(!Number.isFinite(ymin)||!Number.isFinite(ymax)){
      var lo=Infinity,hi=-Infinity;
      parsed.forEach(function(f){for(var i=0;i<=260;i++){var x=xmin+(xmax-xmin)*i/260,y=f.fn(x);if(Number.isFinite(y)&&Math.abs(y)<1e6){lo=Math.min(lo,y);hi=Math.max(hi,y)}}});
      points.forEach(function(p){lo=Math.min(lo,Number(p.y));hi=Math.max(hi,Number(p.y))});
      if(!Number.isFinite(lo)||!Number.isFinite(hi)){lo=-1;hi=1}
      var pad=Math.max(.5,(hi-lo)*.12);ymin=lo-pad;ymax=hi+pad;
    }
    if(!(ymax>ymin))return null;
    function X(x){return L+(x-xmin)/(xmax-xmin)*(W-L-R)}
    function Y(y){return T+(ymax-y)/(ymax-ymin)*(H-T-B)}
    var g=[],i,xt=8,yt=6;
    for(i=0;i<=xt;i++){var x=xmin+(xmax-xmin)*i/xt,px=X(x);g.push('<line x1="'+px.toFixed(2)+'" y1="'+T+'" x2="'+px.toFixed(2)+'" y2="'+(H-B)+'" class="gline"/><text x="'+px.toFixed(2)+'" y="'+(H-B+22)+'" text-anchor="middle" class="tick">'+esc(nicePi(x))+'</text>')}
    for(i=0;i<=yt;i++){var y=ymin+(ymax-ymin)*i/yt,py=Y(y);g.push('<line x1="'+L+'" y1="'+py.toFixed(2)+'" x2="'+(W-R)+'" y2="'+py.toFixed(2)+'" class="gline"/><text x="'+(L-10)+'" y="'+(py+4).toFixed(2)+'" text-anchor="end" class="tick">'+esc(Number(y.toFixed(2)).toString())+'</text>')}
    var axes=[];
    if(xmin<=0&&xmax>=0)axes.push('<line x1="'+X(0).toFixed(2)+'" y1="'+T+'" x2="'+X(0).toFixed(2)+'" y2="'+(H-B)+'" class="axis"/>');
    if(ymin<=0&&ymax>=0)axes.push('<line x1="'+L+'" y1="'+Y(0).toFixed(2)+'" x2="'+(W-R)+'" y2="'+Y(0).toFixed(2)+'" class="axis"/>');
    axes.push('<text x="'+(W-R-4)+'" y="'+(H-B-8)+'" class="axisLabel">'+esc(spec.xLabel||'x')+'</text>');
    axes.push('<text x="'+(L+8)+'" y="'+(T+16)+'" class="axisLabel">'+esc(spec.yLabel||'y')+'</text>');
    var paths=[];
    parsed.forEach(function(f,fi){
      var d='',last=false;
      for(i=0;i<=500;i++){var x=xmin+(xmax-xmin)*i/500,y=f.fn(x);if(!Number.isFinite(y)||Math.abs(y)>1e6){last=false;continue}var px=X(x),py=Y(y);d+=(last?'L':'M')+px.toFixed(2)+' '+py.toFixed(2)+' ';last=true}
      paths.push('<path d="'+d.trim()+'" class="fline f'+fi+'"/>');
    });
    var pointSvg=points.map(function(p){var px=X(Number(p.x)),py=Y(Number(p.y)),label=String(p.label||p.name||('('+Number(p.x).toFixed(2)+','+Number(p.y).toFixed(2)+')'));return '<circle cx="'+px.toFixed(2)+'" cy="'+py.toFixed(2)+'" r="4.5" class="point"/><text x="'+(px+8).toFixed(2)+'" y="'+(py-8).toFixed(2)+'" class="pointLabel">'+esc(label)+'</text>'}).join('');
    var annotationSvg=annotations.map(function(a){var px=X(Number(a.x)),py=Y(Number(a.y)),dx=number(a.dx,28),dy=number(a.dy,-34),tx=px+dx,ty=py+dy;return '<line x1="'+px.toFixed(2)+'" y1="'+py.toFixed(2)+'" x2="'+tx.toFixed(2)+'" y2="'+ty.toFixed(2)+'" class="annotationLine"/><rect x="'+(tx-5).toFixed(2)+'" y="'+(ty-16).toFixed(2)+'" width="'+Math.max(70,String(a.text).length*7+14)+'" height="24" rx="7" class="annotationBox"/><text x="'+(tx+2).toFixed(2)+'" y="'+(ty).toFixed(2)+'" class="annotationText">'+esc(a.text)+'</text>'}).join('');
    var legend=parsed.map(function(f,fi){return '<span class="legendItem"><i class="legendDot f'+fi+'"></i>'+esc(f.label||f.equation)+'</span>'}).join('');
    var title=String(spec.title||'Đồ thị');
    return '<div class="study-visual-card"><div class="study-visual-title">'+esc(title)+'</div>'+(spec.caption?'<div class="study-visual-caption">'+esc(spec.caption)+'</div>':'')+'<svg class="study-graph-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(title)+'">'+g.join('')+axes.join('')+paths.join('')+pointSvg+annotationSvg+'</svg>'+(legend?'<div class="study-visual-legend">'+legend+'</div>':'')+'</div>';
  }

  function buildDiagram(spec){
    var W=760,H=420,L=40,R=40,T=60,B=40;
    var nodes=Array.isArray(spec.nodes)?spec.nodes.slice(0,30):[], by={};
    nodes.forEach(function(n){if(n&&n.id)by[String(n.id)]=n});
    function X(v){return L+Math.max(0,Math.min(1,Number(v)))*(W-L-R)}
    function Y(v){return T+Math.max(0,Math.min(1,Number(v)))*(H-T-B)}
    var parts=['<defs><marker id="studyArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="currentColor"/></marker></defs>'];
    (Array.isArray(spec.arrows)?spec.arrows:[]).slice(0,50).forEach(function(a){
      var n1=by[String(a&&a[0])],n2=by[String(a&&a[1])];if(!n1||!n2)return;
      parts.push('<line x1="'+X(n1.x).toFixed(2)+'" y1="'+Y(n1.y).toFixed(2)+'" x2="'+X(n2.x).toFixed(2)+'" y2="'+Y(n2.y).toFixed(2)+'" class="diagramArrow" marker-end="url(#studyArrow)"/>');
    });
    nodes.forEach(function(n){
      if(!n||!n.id)return;
      var x=X(n.x),y=Y(n.y),label=String(n.label||n.id),w=Math.max(92,Math.min(220,label.length*7+28));
      parts.push('<rect x="'+(x-w/2).toFixed(2)+'" y="'+(y-22).toFixed(2)+'" width="'+w.toFixed(2)+'" height="44" rx="12" class="diagramNode"/><text x="'+x.toFixed(2)+'" y="'+(y+4).toFixed(2)+'" text-anchor="middle" class="diagramText">'+esc(label)+'</text>');
    });
    (Array.isArray(spec.annotations)?spec.annotations:[]).slice(0,20).forEach(function(a){
      var n=a&&a.node?by[String(a.node)]:null;if(!n||!a.text)return;
      var x=X(n.x),y=Y(n.y),tx=x+number(a.dx,0)+28,ty=y+number(a.dy,-36);
      parts.push('<text x="'+tx.toFixed(2)+'" y="'+ty.toFixed(2)+'" class="annotationText">'+esc(a.text)+'</text>');
    });
    return '<div class="study-visual-card"><div class="study-visual-title">'+esc(spec.title||'Sơ đồ minh họa')+'</div>'+(spec.caption?'<div class="study-visual-caption">'+esc(spec.caption)+'</div>':'')+'<svg class="study-graph-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(spec.title||'Sơ đồ minh họa')+'">'+parts.join('')+'</svg></div>';
  }

  function buildGeometry(spec){
    var W=760,H=440,L=64,R=22,T=52,B=54,pts=Array.isArray(spec.points)?spec.points.slice(0,60):[],by={};
    pts.forEach(function(p){if(p&&p.name)by[String(p.name)]=p});
    var xs=pts.map(function(p){return Number(p.x)}).filter(Number.isFinite),ys=pts.map(function(p){return Number(p.y)}).filter(Number.isFinite);
    if(!xs.length||!ys.length)return null;
    var xmin=Math.min.apply(null,xs),xmax=Math.max.apply(null,xs),ymin=Math.min.apply(null,ys),ymax=Math.max.apply(null,ys);
    var dx=Math.max(1,(xmax-xmin)*.18),dy=Math.max(1,(ymax-ymin)*.18);xmin-=dx;xmax+=dx;ymin-=dy;ymax+=dy;
    function X(x){return L+(x-xmin)/(xmax-xmin)*(W-L-R)} function Y(y){return T+(ymax-y)/(ymax-ymin)*(H-T-B)}
    var parts=[];
    var circles=Array.isArray(spec.circles)?spec.circles.slice(0,30):[];
    var polygons=Array.isArray(spec.polygons)?spec.polygons.slice(0,30):[];
    var annotations=Array.isArray(spec.annotations)?spec.annotations.slice(0,20).filter(function(a){return a&&a.text}):[];
    polygons.forEach(function(poly){var ids=Array.isArray(poly)?poly.map(String):[],coords=ids.map(function(id){return by[id]}).filter(Boolean);if(coords.length<3)return;var d=coords.map(function(p,i){return (i?'L':'M')+X(Number(p.x)).toFixed(2)+' '+Y(Number(p.y)).toFixed(2)}).join(' ')+' Z';parts.push('<path d="'+d+'" class="geoPoly"/>')});
        (Array.isArray(spec.segments)?spec.segments:[]).slice(0,80).forEach(function(s){var a=by[String(s&&s[0])],b=by[String(s&&s[1])];if(!a||!b)return;parts.push('<line x1="'+X(Number(a.x)).toFixed(2)+'" y1="'+Y(Number(a.y)).toFixed(2)+'" x2="'+X(Number(b.x)).toFixed(2)+'" y2="'+Y(Number(b.y)).toFixed(2)+'" class="geoLine"/>')}); 
    circles.forEach(function(c){if(!Number.isFinite(Number(c.cx))||!Number.isFinite(Number(c.cy))||!Number.isFinite(Number(c.r)))return;var rx=Math.abs(Number(c.r)),cx=X(Number(c.cx)),cy=Y(Number(c.cy)),sx=Math.abs(X(Number(c.cx+rx))-X(Number(c.cx)));parts.push('<circle cx="'+cx.toFixed(2)+'" cy="'+cy.toFixed(2)+'" r="'+Math.max(3,sx).toFixed(2)+'" class="geoCircle"/>')});
    pts.forEach(function(p){if(!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))return;var px=X(Number(p.x)),py=Y(Number(p.y));parts.push('<circle cx="'+px.toFixed(2)+'" cy="'+py.toFixed(2)+'" r="4.5" class="point"/><text x="'+(px+8).toFixed(2)+'" y="'+(py-8).toFixed(2)+'" class="pointLabel">'+esc(p.name||'')+'</text>')});
    annotations.forEach(function(a){var target=a.point&&by[String(a.point)]?by[String(a.point)]:null;if(!target&&Number.isFinite(Number(a.x))&&Number.isFinite(Number(a.y)))target={x:Number(a.x),y:Number(a.y)};if(!target)return;var px=X(Number(target.x)),py=Y(Number(target.y)),dx=number(a.dx,28),dy=number(a.dy,-34),tx=px+dx,ty=py+dy;parts.push('<line x1="'+px.toFixed(2)+'" y1="'+py.toFixed(2)+'" x2="'+tx.toFixed(2)+'" y2="'+ty.toFixed(2)+'" class="annotationLine"/><rect x="'+(tx-5).toFixed(2)+'" y="'+(ty-16).toFixed(2)+'" width="'+Math.max(70,String(a.text).length*7+14)+'" height="24" rx="7" class="annotationBox"/><text x="'+(tx+2).toFixed(2)+'" y="'+ty.toFixed(2)+'" class="annotationText">'+esc(a.text)+'</text>')});
    return '<div class="study-visual-card"><div class="study-visual-title">'+esc(spec.title||'Hình minh họa')+'</div>'+(spec.caption?'<div class="study-visual-caption">'+esc(spec.caption)+'</div>':'')+'<svg class="study-graph-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(spec.title||'Hình minh họa')+'">'+parts.join('')+'</svg></div>';
  }

  function isSep(x){return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(x)}
  function table(lines,i){
    if(i+1>=lines.length||lines[i].indexOf('|')<0||!isSep(lines[i+1]))return null;
    var split=function(x){x=x.trim().replace(/^\|/,'').replace(/\|$/,'');return x.split('|').map(function(v){return v.trim()})};
    var h=split(lines[i]),rows=[],j=i+2;
    while(j<lines.length&&lines[j].trim().indexOf('|')>=0&&!isSep(lines[j].trim())){rows.push(split(lines[j]));j++}
    return {html:'<div class="ai-table-wrap"><table class="ai-table"><thead><tr>'+h.map(function(c){return '<th>'+inline(c)+'</th>'}).join('')+'</tr></thead><tbody>'+rows.map(function(r){return '<tr>'+h.map(function(_,k){return '<td>'+inline(r[k]||'')+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>',next:j};
  }

  function md(text,node){
    var visual=graphSpecFromRaw(text,node),src=String(text==null?'':text).replace(/\r/g,''),visualHtml='';
    src=src.replace(/^[ \\t]*(?:---+|\.)[ \\t]+(?=(?:#{1,3}[ \\t]+|\\d+[.)][ \\t]+))/gm,'');
    if(visual){if(visual.explicit&&visual.rawBlock)src=src.replace(visual.rawBlock,'');if(visual.spec)visualHtml=buildGraph(visual.spec)||''}

    // Keep display-math delimiters together. The previous renderer split \\[ ... \\]
    // across separate <p> elements, making KaTeX/fallback rendering impossible.
    var lines=src.split('\\n'),out=[],list=false,visualInjected=false;
    function end(){if(list){out.push('</ul>');list=false}}
    function pushDisplayMath(tex){
      var raw='\\\\['+String(tex||'').trim()+'\\\\]';
      out.push('<div class="ai-math-block" data-study-math-block="1">'+raw+'</div>');
    }
    for(var i=0;i<lines.length;i++){
      var raw=lines[i].trim(),m;
      if(!raw){end();continue}

      // \\[ ... \\] blocks that span multiple lines.
      if(raw==='\\\\['){
        end();
        var mathLines=[],j=i+1;
        while(j<lines.length&&lines[j].trim()!=='\\\\]'){mathLines.push(lines[j]);j++}
        if(j<lines.length){pushDisplayMath(mathLines.join('\\n'));i=j;continue}
      }
      // $$ ... $$ blocks that span multiple lines.
      if(raw==='$$'){
        end();
        var dollarLines=[],k=i+1;
        while(k<lines.length&&lines[k].trim()!=='$$'){dollarLines.push(lines[k]);k++}
        if(k<lines.length){out.push('<div class="ai-math-block" data-study-math-block="1">$$'+dollarLines.join('\\n')+'$$</div>');i=k;continue}
      }

      if(/^\\$\\$[\\s\\S]+\\$\\$$/.test(raw)||/^\\\\\[[\\s\\S]+\\\\\]$/.test(raw)||/^\\([^\\n]*\\)$/.test(raw)){
        end();out.push('<div class="ai-math-block" data-study-math-block="1">'+raw+'</div>');continue;
      }
      if(/^\\x60\\x60\\x60/.test(raw)){
        end();
        var block=[],j2=i+1;
        while(j2<lines.length&&!/^\\x60\\x60\\x60/.test(lines[j2].trim())){block.push(lines[j2]);j2++}
        i=j2;
        out.push('<pre><code>'+esc(block.join('\\n'))+'</code></pre>');continue;
      }
      if(/^---+$/.test(raw)){end();out.push('<hr>');continue}
      m=raw.match(/^#{1,3}\\s+(.+)$/);if(m){end();out.push('<h3>'+inline(m[1])+'</h3>');continue}
      m=raw.match(/^(?:[-*]|•)\\s+(.+)$/);if(m){if(!list){out.push('<ul>');list=true}out.push('<li>'+inline(m[1])+'</li>');continue}
      m=raw.match(/^\\.?\\s*(\\d+)[.)]\\s+(.+)$/);if(m){end();out.push('<div class="ai-numbered"><b>'+m[1]+'.</b> '+inline(m[2])+'</div>');continue}
      end();out.push('<p>'+inline(raw)+'</p>');
      if(visualHtml&&!visualInjected){out.push(visualHtml);visualInjected=true}
    }
    end();return visualInjected?out.join(''):visualHtml+out.join('');
  }

  function style(){
    if(document.getElementById('study-ai-renderer-v4-style'))return;
    var s=document.createElement('style');s.id='study-ai-renderer-v4-style';
    s.textContent='.study-math-fallback{display:inline-block;font-family:Cambria,Georgia,serif;font-size:1.05em;vertical-align:middle}.study-math-block{display:block;text-align:center;margin:8px 0}.study-math-frac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;line-height:1.05;margin:0 2px}.study-math-num{padding:0 3px;border-bottom:1px solid currentColor}.study-math-den{padding:0 3px}.study-math-sqrt{display:inline-flex;align-items:center}.study-math-sqrt>span{border-top:1px solid currentColor;margin-left:1px;padding:0 2px}.study-math-fallback sup,.study-math-fallback sub{font-size:.72em;line-height:0}'+
'.study-ai-msg.bot{line-height:1.72;white-space:normal;overflow-wrap:anywhere;word-break:break-word}.study-ai-msg.bot p{margin:0 0 10px}.study-ai-msg.bot h3{margin:10px 0 7px}.study-ai-msg.bot ul{padding-left:22px;margin:5px 0 10px}.study-ai-msg.bot li{margin:3px 0}.study-ai-msg.bot .ai-numbered{margin:5px 0}.study-ai-msg.bot .katex{font-size:1.08em}.study-case-row{display:block;padding:2px 0}.study-cases{display:inline-block;vertical-align:middle;border-left:2px solid currentColor;padding:2px 0 2px 14px;margin-right:6px}.study-cases-tail{display:inline-block;vertical-align:middle}.ai-math-block{display:block;text-align:center;overflow-x:auto;padding:8px 4px;margin:10px 0 14px;line-height:1.8}.study-ai-msg.bot .katex-display{margin:.65em 0;overflow-x:auto}.study-visual-card{margin:12px 0 16px;padding:12px 10px;border:1px solid rgba(90,100,150,.18);border-radius:16px;background:rgba(90,100,150,.035);overflow:hidden}.study-visual-title{font-weight:800;text-align:center;margin:0 0 6px}.study-visual-caption{font-size:13px;opacity:.78;text-align:center;margin:0 8px 8px;line-height:1.5}.study-graph-svg{display:block;width:100%;height:auto;max-height:520px}.study-graph-svg .gline{stroke:currentColor;opacity:.12;stroke-width:1}.study-graph-svg .axis{stroke:currentColor;opacity:.72;stroke-width:1.8}.study-graph-svg .tick{font:12px system-ui,sans-serif;fill:currentColor;opacity:.68}.study-graph-svg .axisLabel{font:700 14px system-ui,sans-serif;fill:currentColor}.study-graph-svg .fline{fill:none;stroke-width:3}.study-graph-svg .f0{stroke:#2563eb}.study-graph-svg .f1{stroke:#dc2626}.study-graph-svg .f2{stroke:#16a34a}.study-graph-svg .f3{stroke:#a855f7}.study-graph-svg .point{fill:currentColor}.study-graph-svg .geoLine{stroke:currentColor;stroke-width:2;fill:none}.study-graph-svg .geoCircle{stroke:currentColor;stroke-width:2;fill:none}.study-graph-svg .geoPoly{fill:currentColor;opacity:.05;stroke:currentColor;stroke-width:2}.study-graph-svg .diagramArrow{stroke:currentColor;stroke-width:2;fill:none;opacity:.7}.study-graph-svg .diagramNode{fill:var(--study-visual-bg,#fff);stroke:currentColor;stroke-width:1.5}.study-graph-svg .diagramText{font:700 12px system-ui,sans-serif;fill:currentColor}.study-graph-svg .pointLabel{font:700 12px system-ui,sans-serif;fill:currentColor}.study-graph-svg .annotationLine{stroke:currentColor;stroke-width:1.2;opacity:.55}.study-graph-svg .annotationBox{fill:var(--study-visual-bg,#fff);stroke:currentColor;stroke-width:1;opacity:.94}.study-graph-svg .annotationText{font:700 11px system-ui,sans-serif;fill:currentColor}.study-visual-legend{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:4px}.legendItem{display:inline-flex;align-items:center;gap:5px}.legendDot{width:9px;height:9px;border-radius:50%;display:inline-block}.legendDot.f0{background:#2563eb}.legendDot.f1{background:#dc2626}.legendDot.f2{background:#16a34a}.legendDot.f3{background:#a855f7}';
    document.head.appendChild(s);
  }

  function fallbackMathHtml(math){
    var s=String(math||'').trim();
    // Common malformed model output should never leak into the student UI.
    s=s.replace(/\[object\s*Object\]/gi,'≥').replace(/\[objectObject\]/gi,'≥');
    s=s.replace(/\\left\s*|\\right\s*/g,'');

    // Simple "cases" fallback for equality conditions.
    var cm=s.match(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/i);
    if(cm){
      var rows=cm[1].split(/\\\\/).map(function(row){return String(row||'').trim()}).filter(Boolean);
      var inner=rows.map(function(row){return '<div class="study-case-row">'+fallbackMathHtml(row)+'</div>'}).join('');
      var rest=s.replace(cm[0],'');
      var restHtml=rest.trim()?fallbackMathHtml(rest):'';
      return '<span class="study-cases">'+inner+'</span>'+(restHtml?'<span class="study-cases-tail"> '+restHtml+'</span>':'');
    }

    var stash=[];
    var HOLD_OPEN=String.fromCharCode(0xE000),HOLD_CLOSE=String.fromCharCode(0xE001);
    function hold(html){
      var k=HOLD_OPEN+stash.length+HOLD_CLOSE;
      stash.push(html);
      return k;
    }

    for(var pass=0;pass<6;pass++){
      var before=s;
      s=s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,function(_,a,b){
        return hold('<span class="study-math-frac"><span class="study-math-num">'+esc(a)+'</span><span class="study-math-den">'+esc(b)+'</span></span>');
      });
      s=s.replace(/\\dfrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,function(_,a,b){
        return hold('<span class="study-math-frac"><span class="study-math-num">'+esc(a)+'</span><span class="study-math-den">'+esc(b)+'</span></span>');
      });
      s=s.replace(/\\sqrt\s*\{([^{}]*)\}/g,function(_,a){
        return hold('<span class="study-math-sqrt">√<span>'+esc(a)+'</span></span>');
      });
      if(s===before)break;
    }

    s=esc(s)
      .replace(/\\geq?/g,'≥').replace(/\\leq?/g,'≤').replace(/\\neq?/g,'≠')
      .replace(/\\iff\b/g,'⟺').replace(/\\Longleftrightarrow/g,'⟺').replace(/\\Leftrightarrow/g,'⇔')
      .replace(/\\cdot/g,'·').replace(/\\times/g,'×').replace(/\\pm/g,'±').replace(/\\mp/g,'∓')
      .replace(/\\infty/g,'∞').replace(/\\forall/g,'∀').replace(/\\exists/g,'∃')
      .replace(/\\in\b/g,'∈').replace(/\\notin\b/g,'∉')
      .replace(/\\Rightarrow|\\Longrightarrow/g,'⇒').replace(/\\rightarrow|\\to/g,'→')
      .replace(/\\leftarrow/g,'←').replace(/\\leftrightarrow/g,'↔')
      .replace(/\\approx/g,'≈').replace(/\\equiv/g,'≡')
      .replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ').replace(/\\delta/g,'δ')
      .replace(/\\theta/g,'θ').replace(/\\lambda/g,'λ').replace(/\\mu/g,'μ').replace(/\\pi/g,'π')
      .replace(/\\rho/g,'ρ').replace(/\\sigma/g,'σ').replace(/\\tau/g,'τ').replace(/\\phi/g,'φ').replace(/\\omega/g,'ω')
      .replace(/\\text\{([^{}]*)\}/g,'$1').replace(/\\mathrm\{([^{}]*)\}/g,'$1')
      .replace(/\\,/g,' ').replace(/\\;/g,' ').replace(/\\!/g,'').replace(/\\quad/g,'  ')
      .replace(/\\/g,' ')
      .replace(/\\begin\{[^{}]+\}/g,'').replace(/\\end\{[^{}]+\}/g,'')
      .replace(/\\([A-Za-z]+)/g,'$1')
      .replace(/\^\{([^{}]+)\}/g,'<sup>$1</sup>').replace(/\^([A-Za-z0-9]+)/g,'<sup>$1</sup>')
      .replace(/_\{([^{}]+)\}/g,'<sub>$1</sub>').replace(/_([A-Za-z0-9]+)/g,'<sub>$1</sub>');

    stash.forEach(function(v,i){s=s.split(HOLD_OPEN+i+HOLD_CLOSE).join(v)});
    return s;
  }

  function applyFallbackMath(root){
    if(!root)return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],n;
    while((n=walker.nextNode()))nodes.push(n);
    nodes.forEach(function(t){
      var raw=t.nodeValue||'';
      if(!/\$\$|\\\[|\\\(|\\frac|\\dfrac|\\sqrt|\\begin\{cases\}|\\iff|\\(?:ge|le|neq|cdot|times|pm|infty|alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|tau|phi|omega)\b/.test(raw))return;
      var out='',last=0,rx=/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$([^$\n]+)\$/g,m;
      while((m=rx.exec(raw))){
        out+=esc(raw.slice(last,m.index));
        var math=m[1]!=null?m[1]:(m[2]!=null?m[2]:(m[3]!=null?m[3]:m[4]));
        out+='<span class="study-math-fallback'+((m[1]!=null||m[2]!=null)?' study-math-block':'')+'">'+fallbackMathHtml(math)+'</span>';
        last=rx.lastIndex;
      }
      out+=esc(raw.slice(last));
      if(out!==esc(raw)){
        var wrap=document.createElement('span');wrap.innerHTML=out;
        t.parentNode.replaceChild(wrap,t);
      }
    });
  }

  function renderOne(node,raw){
    if(!node||node.hasAttribute('data-thinking'))return;
    raw=raw!=null?String(raw):String(node.dataset.aiRaw!=null?node.dataset.aiRaw:node.textContent||'');
    if(!raw.trim())return;
    raw=raw.replace(/\\[object\\s*Object\\]/gi,'≥').replace(/\\[objectObject\\]/gi,'≥');
    // Repair common AI markdown glitches such as a rule marker immediately before a heading.
    raw=raw.replace(/^\\s*-{3,}\\s+(?=#+\\s)/gm,'');
    node.dataset.aiRaw=raw;node.dataset.aiRendered='html';node.innerHTML=md(raw,node);
    // Always render a local math fallback immediately. KaTeX is an enhancement, not a dependency.
    try{applyFallbackMath(node)}catch(_e){}
    loadKatex().then(function(ok){
      if(ok&&document.documentElement.contains(node)&&typeof window.renderMathInElement==='function'){
        try{
          window.renderMathInElement(node,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,strict:false,trust:false});
          node.dataset.aiMathRendered='1';
          return;
        }catch(e){console.warn('AI KaTeX',e)}
      }
      applyFallbackMath(node);
      node.dataset.aiMathRendered='fallback';
    });
  }

  function scan(root){
    var a=[];if(root&&root.matches&&root.matches('.study-ai-msg.bot'))a.push(root);
    if(root&&root.querySelectorAll)root.querySelectorAll('.study-ai-msg.bot').forEach(function(n){a.push(n)});
    a.forEach(function(n){if(n.dataset.aiRendered!=='html')renderOne(n)});
  }
  window.renderStudyAiMessage=function(node,raw){style();renderOne(node,raw)};
  function boot(){
    style();scan(document);
    if(document.body.__studyAiRendererV3Observer)return;
    document.body.__studyAiRendererV3Observer=new MutationObserver(function(rs){rs.forEach(function(r){Array.from(r.addedNodes||[]).forEach(function(n){if(n.nodeType===1)scan(n)})})});
    document.body.__studyAiRendererV3Observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('study-app-loaded',function(){setTimeout(boot,0)});
})();