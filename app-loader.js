(function () {
  var APP_URL = "/app.js?v=20260930-5&cache=" + Date.now();

  function showError(message) {
    var app = document.getElementById("app");
    if (!app) return;
    app.innerHTML = '<main class="container"><div class="card"><h1>🎓 Study</h1><p class="danger-text">' + message + '</p><button class="btn" type="button" id="app-loader-retry">↻ Tải lại</button></div></main>';
    var retry = document.getElementById("app-loader-retry");
    if (retry) retry.addEventListener("click", function () { location.reload(); });
  }

  function patchBrokenRenderQuestion(source) {
    var safe = [
      'function renderQuestion(q,i){',
      '  var type=q.type||"mcq";',
      '  if(type==="true_false"){',
      '    var html="<div class=\\"q\\"><b>Câu "+(i+1)+". "+esc(q.q||"")+"</b>";',
      '    (q.statements||[]).forEach(function(s,j){',
      '      html+="<div class=\\"option\\"><span>"+String.fromCharCode(97+j)+". "+esc(s)+"</span>";',
      '      html+="<label><input type=\\"radio\\" name=\\"q"+i+"_"+j+"\\" onchange=\\"setTF("+i+","+j+",true)\\"> Đúng</label>";',
      '      html+="<label><input type=\\"radio\\" name=\\"q"+i+"_"+j+"\\" onchange=\\"setTF("+i+","+j+",false)\\"> Sai</label></div>";',
      '    });',
      '    return html+"</div>";',
      '  }',
      '  if(type==="short"){',
      '    var shortHtml="<div class=\\"q\\"><b>Câu "+(i+1)+". "+esc(q.q||"")+"</b><div style=\\"display:flex;gap:6px;margin-top:10px\\">";',
      '    for(var j=0;j<4;j++){',
      '      var value=(state.answers[i]&&state.answers[i][j])||"";',
      '      shortHtml+="<input maxlength=\\"1\\" inputmode=\\"text\\" style=\\"width:48px;text-align:center\\" oninput=\\"setShort("+i+","+j+",this.value)\\" value=\\""+esc(value)+"\\">";',
      '    }',
      '    return shortHtml+"</div></div>";',
      '  }',
      '  var out="<div class=\\"q\\"><b>Câu "+(i+1)+". "+esc(q.q||"")+"</b>";',
      '  (q.opts||[]).slice(0,4).forEach(function(o,j){',
      '    out+="<label class=\\"option\\"><input type=\\"radio\\" name=\\"q"+i+"\\" onchange=\\"state.answers["+i+"]=\"+j+"\\"> "+String.fromCharCode(65+j)+". "+esc(o)+"</label>";',
      '  });',
      '  return out+"</div>";',
      '}',
      'function setTF'
    ].join("\n");

    var pattern = /function renderQuestion\(q,i\)\{[\s\S]*?\}\nfunction setTF/;
    if (pattern.test(source)) return source.replace(pattern, safe);
    return source;
  }

  function bridgeRuntime(source) {
    source = source.replace(/(?:async\s+)?function render\(\)\{const app=document\.getElementById\("app"\);/, 'function render(){if(window.__studyThFinalUi||window.__studyThFinalUiPending)return;const app=document.getElementById("app");');
    return source + '\n;window.state=state;window.exams=exams;window.db=db;window.__studyLoadSupabase=loadSupabase;window.loadSupabase=async function(){var value=await window.__studyLoadSupabase();window.db=db;return value;};window.loadExams=async function(){var value=await loadExams();window.exams=exams;return value;};window.loadHistory=loadHistory;window.loadSupportAccounts=loadSupportAccounts;window.startSupportLive=startSupportLive;window.stopSupportLive=stopSupportLive;window.__studyAppReady=true;if(window.__studyThFinalUi&&window.__studyThFinalRender){window.render=window.__studyThFinalRender;window.__studyThFinalRender();}';
  }

  fetch(APP_URL, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("Không tải được app.js (HTTP " + response.status + ")");
      return response.text();
    })
    .then(function (source) {
      var patched = patchBrokenRenderQuestion(source);
      patched = bridgeRuntime(patched);
      try {
        // Final UI must be installed before the legacy runtime is evaluated.
        // Otherwise the global render declaration in app.js and legacy
        // enhancement listeners can take ownership of #app again.
        function waitForFinalUi(){
          return new Promise(function(resolve){
            if(window.__studyThFinalUi && typeof window.__studyThFinalRender==='function'){
              resolve();
              return;
            }
            var done=false;
            function finish(){
              if(done)return;
              done=true;
              window.removeEventListener('study-final-ui-ready',finish);
              resolve();
            }
            window.addEventListener('study-final-ui-ready',finish,{once:true});
            setTimeout(finish,10000);
          });
        }

        Promise.resolve(waitForFinalUi()).then(function(){
          (0, eval)(patched);

          // app.js has now created its global legacy render binding. Replace
          // it after eval with a stable accessor so later legacy scripts cannot
          // assign another renderer and overwrite the final interface.
          if(window.__studyThFinalRender){
            try{
              Object.defineProperty(window,'render',{
                configurable:true,
                get:function(){return window.__studyThFinalRender;},
                set:function(fn){window.__studyLegacyRenderBlocked=!!fn;}
              });
            }catch(_lockError){}
            window.dispatchEvent(new Event("study-app-loaded"));
            setTimeout(function(){
              if(window.__studyThFinalRender){
                try{window.__studyThFinalRender()}catch(_renderError){}
              }
            },0);
          }else{
            window.dispatchEvent(new Event("study-app-loaded"));
          }
        }).catch(function(error){
          console.error("Study app final UI handoff error:", error);
          showError("Không thể khởi động giao diện. Hãy tải lại trang.");
        });
      } catch (error) {
        console.error("Study app syntax/runtime error:", error);
        showError("Không thể khởi động ứng dụng. Lỗi JavaScript đã được chặn để trang không bị treo.");
      }
    })
    .catch(function (error) {
      console.error("Study app loader error:", error);
      showError("Không tải được hệ thống. Hãy thử tải lại trang.");
    });
})();
