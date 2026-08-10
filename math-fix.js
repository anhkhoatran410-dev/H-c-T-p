/* Lightweight math typography for generated questions without requiring a renderer. */
(function(){
  function pretty(s){return String(s??'').replace(/\\infty|\\infinity/g,'∞').replace(/\\leq|\\le/g,'≤').replace(/\\geq|\\ge/g,'≥').replace(/\\neq|\\ne/g,'≠').replace(/\\approx/g,'≈').replace(/\\times/g,'×').replace(/\\cdot/g,'·').replace(/\\div/g,'÷').replace(/\\pm/g,'±').replace(/\\rightarrow|\\to/g,'→').replace(/\\pi/g,'π').replace(/\\theta/g,'θ').replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ').replace(/\\Delta/g,'Δ').replace(/\\sum/g,'Σ').replace(/\\sqrt\{([^{}]+)\}/g,'√($1)').replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g,'($1)/($2)').replace(/\^2/g,'²').replace(/\^3/g,'³').replace(/\^n/g,'ⁿ').replace(/_([0-9])/g,function(_,n){return String.fromCharCode(0x2080+Number(n))}).trim()}
  function patch(){
    if(typeof window.renderQuestion!=='function'||window.__mathFixInstalled)return;
    window.__mathFixInstalled=true;var original=window.renderQuestion;
    window.renderQuestion=function(q,i){var x=JSON.parse(JSON.stringify(q||{}));['q','answer','explanation'].forEach(function(k){if(typeof x[k]==='string')x[k]=pretty(x[k])});if(Array.isArray(x.opts))x.opts=x.opts.map(pretty);if(Array.isArray(x.statements))x.statements=x.statements.map(pretty);return original(x,i)};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch);else patch();
  window.addEventListener('study-app-loaded',function(){setTimeout(patch,0)});
})();
