/* STUDY TH — student AI solver: camera/file input + fast/deep routing. */
(function(){
  if(window.__studyStudentSolverInstalled===19)return;window.__studyStudentSolverInstalled=19;

  const MAX_IMAGE_BYTES=12*1024*1024;
  const MAX_IMAGE_EDGE=1100;
  const MAX_IMAGE_DATA_CHARS=900000;
  const FAST_SOLVER_TIMEOUT_MS=40000;
  const DEEP_SOLVER_TIMEOUT_MS=42000;
  const CAMERA_RESTORE_KEY='study_ai_restore_after_camera';

  function openImageViewer(src,alt='Ảnh đề bài'){
    if(!src)return;
    let viewer=document.querySelector('[data-study-image-viewer]');
    if(!viewer){
      viewer=document.createElement('div');
      viewer.dataset.studyImageViewer='1';
      viewer.innerHTML='<button type="button" aria-label="Đóng ảnh" data-close>×</button><div data-image-wrap><img alt=""></div>';
      viewer.style.cssText='position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;cursor:zoom-out';
      const wrap=viewer.querySelector('[data-image-wrap]');wrap.style.cssText='max-width:100%;max-height:100%;display:flex;align-items:center;justify-content:center;cursor:default';
      const img=viewer.querySelector('img');img.style.cssText='max-width:100%;max-height:calc(100dvh - 56px);object-fit:contain;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.5)';
      viewer.querySelector('[data-close]').style.cssText='position:absolute;top:max(12px,env(safe-area-inset-top));right:14px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:30px;line-height:1;cursor:pointer;z-index:2';
      viewer.addEventListener('click',e=>{if(e.target===viewer||e.target.closest('[data-close]'))viewer.remove()});document.body.appendChild(viewer);
    }
    const img=viewer.querySelector('img');img.src=src;img.alt=alt;viewer.style.display='flex';
  }

  function addSentImage(messageBubble,img){
    if(!img||!messageBubble)return;
    const textNodes=[...messageBubble.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    textNodes.forEach(n=>{const span=document.createElement('span');span.className='study-ai-user-text';span.textContent=n.textContent.trim();n.replaceWith(span)});
    messageBubble.style.background='transparent';messageBubble.style.padding='0';messageBubble.style.boxShadow='none';messageBubble.style.alignItems='flex-end';
    const wrap=document.createElement('div');wrap.className='study-ai-image-in-message';
    const thumb=document.createElement('img');thumb.src=img;thumb.alt='Ảnh đề bài đã gửi';thumb.loading='lazy';
    const hint=document.createElement('span');hint.textContent='Nhấn để xem ảnh';
    thumb.addEventListener('click',()=>openImageViewer(img,thumb.alt));wrap.appendChild(thumb);wrap.appendChild(hint);messageBubble.appendChild(wrap);
  }

  function localGraphReply(text){
    var s=String(text||'').toLowerCase();
    if(!/(đồ thị|hình dung|vẽ|biểu diễn|graph|plot)/i.test(s))return null;
    var kind=null;
    if(/\bsin\s*\(?\s*x\s*\)?/.test(s))kind='sin';
    else if(/\bcos\s*\(?\s*x\s*\)?/.test(s))kind='cos';
    else if(/\btan\s*\(?\s*x\s*\)?/.test(s))kind='tan';
    if(!kind)return null;
    var fn='y = '+kind+'(x)';
    var spec;
    if(kind==='sin')spec={type:'function',title:'Đồ thị y = sin(x)',caption:'Rê chuột lên đường cong hoặc điểm đánh dấu để xem tọa độ.',xMin:-2*Math.PI,xMax:2*Math.PI,yMin:-1.5,yMax:1.5,xLabel:'x',yLabel:'y',functions:[{equation:fn,label:fn}],points:[{x:0,y:0,label:'O'},{x:Math.PI/2,y:1,label:'A'},{x:Math.PI,y:0,label:'B'},{x:3*Math.PI/2,y:-1,label:'C'}],annotations:[{x:Math.PI/2,y:1,text:'Cực đại',dx:28,dy:-34},{x:3*Math.PI/2,y:-1,text:'Cực tiểu',dx:28,dy:34}]};
    else if(kind==='cos')spec={type:'function',title:'Đồ thị y = cos(x)',caption:'Rê chuột để xem tọa độ.',xMin:-2*Math.PI,xMax:2*Math.PI,yMin:-1.5,yMax:1.5,xLabel:'x',yLabel:'y',functions:[{equation:fn,label:fn}],points:[{x:0,y:1,label:'A'},{x:Math.PI,y:-1,label:'B'}],annotations:[{x:0,y:1,text:'Cực đại',dx:28,dy:-34},{x:Math.PI,y:-1,text:'Cực tiểu',dx:28,dy:34}]};
    else spec={type:'function',title:'Đồ thị y = tan(x)',caption:'Rê chuột lên nhánh đồ thị để xem tọa độ.',xMin:-Math.PI,xMax:Math.PI,yMin:-5,yMax:5,xLabel:'x',yLabel:'y',functions:[{equation:fn,label:fn}],points:[{x:0,y:0,label:'O'}],annotations:[{x:0,y:0,text:'Giao trục',dx:28,dy:-34}]};
    return 'Mình dựng ngay đồ thị '+fn+'.\n\n```study-graph\n'+JSON.stringify(spec,null,2)+'\n```';
  }
  function addComposerTools(){
    const modal=document.getElementById('study-ai-support');if(!modal)return;
    const form=modal.querySelector('#studyAiForm');if(!form)return;
    const ta=form.querySelector('textarea');if(!ta)return;
    if(!form.querySelector('[data-study-photo]')){
      const tools=document.createElement('div');tools.className='study-ai-tools';tools.style.cssText='display:flex;gap:8px;margin:8px 0 0;align-items:center;flex-wrap:wrap';
      tools.innerHTML='<button type="button" class="theme-chip" data-study-photo>Chụp đề</button><button type="button" class="theme-chip" data-study-file>Chọn ảnh</button><label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-study-deep> Kiểm tra kỹ</label><input type="file" data-study-image-input accept="image/*" capture="environment" hidden>';
      form.insertBefore(tools,ta);
      tools.querySelector('[data-study-photo]').onclick=()=>{try{sessionStorage.setItem(CAMERA_RESTORE_KEY,'1')}catch(_e){};const i=tools.querySelector('[data-study-image-input]');i.setAttribute('capture','environment');i.click()};
      tools.querySelector('[data-study-file]').onclick=e=>{e.preventDefault();e.stopPropagation();const i=tools.querySelector('[data-study-image-input]');i.removeAttribute('capture');i.click()};
      tools.querySelector('[data-study-image-input]').addEventListener('click',e=>e.stopPropagation());
      tools.querySelector('[data-study-image-input]').addEventListener('change',e=>{e.preventDefault();e.stopPropagation();const file=e.target.files?.[0];if(file)preview(file,modal);e.target.value='';try{sessionStorage.removeItem(CAMERA_RESTORE_KEY)}catch(_e){};requestAnimationFrame(()=>modal.classList.remove('hidden'))});
    }
    if(!form.dataset.studyBound){
      form.dataset.studyBound='1';
      const submitQuestion=async function(e){
        if(e){e.preventDefault?.();e.stopImmediatePropagation?.();}
        e.preventDefault();e.stopImmediatePropagation();if(form.dataset.studyBusy==='1')return;
        const text=ta.value.trim(),img=form.__studyImageData||'';if(!text&&!img)return;
        const box=modal.querySelector('#studyAiMessages');if(!box)return;
        const userText=text||'Giải bài trong ảnh này.',deep=!!form.querySelector('[data-study-deep]')?.checked;
        const localFastReply=(()=>{const s=userText.trim().toLowerCase().replace(/[!?.,]+$/g,'');if(/^(hi|hello|hey|chào|chao|xin chào|xin chao|alo|hí|helo)$/.test(s))return 'Chào bạn 👋 Mình đang sẵn sàng hỗ trợ học tập. Bạn gửi bài hoặc câu hỏi mình sẽ xử lý ngay.';if(/^(cảm ơn|cam on|thanks|thank you)$/.test(s))return 'Không có gì 👌 Gửi bài tiếp theo khi cần nhé.';return null})();
        // Each new question is independent by default. Only carry a tiny context window
        // when the student clearly asks a follow-up, otherwise old/unrelated chats must never
        // contaminate a fresh VMO/math solve.
        const followUp=/^(?:tiếp(?: tục)?|lam|làm tiếp|giải tiếp|tiếp phần|phần trên|bước trên|bước này|đoạn này|dòng này|chỗ này|vì sao(?: lại)?|tại sao(?: lại)?|giải thích(?: thêm)?|suy ra sao|suy ra như thế nào|từ đó|kết quả trên|đáp án trên|cách trên|cách đó|nó là gì|ý này|ý trên|that|this|continue|why|how so|explain)\\b/i.test(userText.trim()) || /^(?:vậy|thế|sao|rồi sao|còn|tiếp|hả|\?\?\?)[?.!]*$/i.test(userText.trim());
        const history=followUp
          ? [...box.querySelectorAll('.study-ai-msg:not([data-study-thinking])')]
              .map(x=>({role:x.classList.contains('user')?'user':'assistant',message:x.textContent.trim().slice(0,2800)}))
              .filter(x=>x.message).slice(-4)
          : [];
        const userMsg=document.createElement('div');userMsg.className='study-ai-msg user';userMsg.textContent=userText+(img?' · ảnh':'');if(img)addSentImage(userMsg,img);box.appendChild(userMsg);
        if(localFastReply&&!img){
          const msg=document.createElement('div');msg.className='study-ai-msg bot';msg.textContent=localFastReply;msg.dataset.studyQuery=userText;box.appendChild(msg);box.scrollTop=box.scrollHeight;ta.value='';form.dataset.studyBusy='0';return;
        }
        const localGraph=localGraphReply(userText);
        const graphOnly=/^\s*(?:tôi\s+muốn\s+)?(?:hãy\s+)?(?:hình\s+dung|vẽ|biểu\s+diễn|tạo|cho\s+mình\s+)?(?:đồ\s+thị|graph|plot)\s*[:,\-]?\s*(?:y\s*=\s*)?(?:sin|cos|tan)\s*\(?x\)?\s*[.!?]*\s*$/i.test(userText);
        const looksCompound=/\n/.test(userText)||/(?:^|\n|[.;])\s*(?:\d+[.)]|[-•])\s*/.test(userText);
        if(localGraph&&graphOnly&&!looksCompound&&!img){
          const msg=document.createElement('div');msg.className='study-ai-msg bot';msg.dataset.studyQuery=userText;msg.textContent=localGraph;box.appendChild(msg);
          if(window.renderStudyAiMessage){try{window.renderStudyAiMessage(msg,localGraph)}catch(_e){}}
          box.scrollTop=box.scrollHeight;ta.value='';form.dataset.studyBusy='0';return;
        }
        const thinking=document.createElement('div');thinking.className='study-ai-msg bot study-ai-thinking';thinking.dataset.studyThinking='1';thinking.setAttribute('aria-label','Đang xử lý');thinking.innerHTML='<span></span><span></span><span></span><span class="study-ai-thinking-label">Đang giải bài…</span>';box.appendChild(thinking);box.scrollTop=box.scrollHeight;ta.value='';form.dataset.studyBusy='1';
        const progressTimer=setTimeout(()=>{if(form.dataset.studyBusy==='1'&&thinking.isConnected){const label=thinking.querySelector('.study-ai-thinking-label');if(label)label.textContent=deep?'Đang kiểm tra lời giải và các bước quan trọng…':'Đang xử lý…';}},7000);
        const submit=form.querySelector('[data-study-send]');if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');submit.setAttribute('aria-label','Gửi');submit.textContent='Gửi'}
        let backgroundDeep=false;
        try{
          const subject=(window.state&&window.state.subject)||'',message=userText+(deep?'\nHãy tự kiểm tra kỹ các bước và kết quả, tìm cách giải từ bản chất, và trình bày đầy đủ đến kết luận; không bỏ qua phần chứng minh quan trọng.':'\nHãy giải nhanh nhưng đủ bước cần thiết, tập trung vào dữ kiện, cách làm và kết quả; tránh lan man.');
          const payload=JSON.stringify({message,subject,history,imageDataUrl:img,deep});
          backgroundDeep=deep||/\b(?:vmo|imo|aime|olympiad|olympic|vmop|vòng chọn đội|đội tuyển)\b/i.test(userText);
          let d={};

          const stageText=(stage,p={})=>{
            const label=thinking.querySelector('.study-ai-thinking-label');if(!label)return;
            const map={
              connected:'Đã kết nối bộ giải…',
              cache_hit:'⚡ Đã tìm thấy lời giải đã lưu.',
              cache_miss:'🔎 Đang xử lý bài mới…',
              queued:'🕐 Bài đã vào hàng đợi, chờ bộ giải…',
              worker_started:'🧠 Worker đã nhận bài…',
              solver_started:p.tier==='deep'?'🧠 Đang giải theo chế độ Deep / VMO…':p.tier==='hard'?'🧠 Đang giải bài nâng cao…':'⚡ Đang xử lý…',
              experts_started:'🧠 Đang chạy các chuyên gia song song…',
              experts_done:'🔎 Đã nhận các hướng giải, đang đối chiếu…',
              review_started:'🧪 Đang kiểm tra và hoàn thiện lời giải…',
              review_skipped:'✅ Kết quả đã qua điều kiện kiểm chứng, bỏ qua review nặng.',
              review_done:'✅ Đã kiểm tra xong, chuẩn bị hiển thị lời giải.',
              review_fallback:'⚡ Review quá lâu, dùng lời giải tốt nhất đã có.',
              retry_queued:'🔁 Đang xếp lại job để thử lại…',
              audit_started:'🔬 Đang kiểm chứng bước quan trọng…',
              audit_done:'✅ Kiểm chứng hoàn tất.',
              verification_started:'🔍 Đang kiểm tra bằng công cụ…',
              verification_done:'✅ Kiểm tra công cụ hoàn tất.',
              completed:'✅ Hoàn tất.'
            };
            label.textContent=map[String(stage)]||'Đang xử lý…';
          };

          if(backgroundDeep){
            const idem=globalThis.crypto?.randomUUID?.()||('job-'+Date.now()+'-'+Math.random().toString(36).slice(2));
            const jr=await fetch('/api/solve-job',{
              method:'POST',
              headers:{'Content-Type':'application/json','Accept':'application/json','X-Idempotency-Key':idem},
              body:payload,credentials:'same-origin',cache:'no-store'
            });
            const jd=await jr.json().catch(()=>({}));
            if(!jr.ok)throw Object.assign(new Error(String(jd.error||'Không tạo được job Deep.')),{status:jr.status,code:jd.code});
            const jobId=String(jd.jobId||'');
            if(!jobId)throw new Error('Backend không trả job ID.');
            stageText('queued');
            const maxWait=15*60*1000,queueMaxWait=3*60*1000,startedAt=Date.now();let pollDelay=1500,pollErrors=0,workerSeen=false;
            while(Date.now()-startedAt<maxWait){
              try{
                const sr=await fetch('/api/solve-job-status?id='+encodeURIComponent(jobId),{
                  method:'GET',headers:{'Accept':'application/json'},credentials:'same-origin',cache:'no-store'
                });
                const sd=await sr.json().catch(()=>({}));
                if(!sr.ok)throw Object.assign(new Error(String(sd.error||'Không đọc được trạng thái job.')),{status:sr.status,code:sd.code});
                pollErrors=0;
                if(sd.status==='running'||sd.stage==='worker_started'||sd.stage==='solver_started')workerSeen=true;
                if(sd.stage)stageText(String(sd.stage),sd.stageDetail||{});
                if(sd.status==='done'){
                  d=sd.result||{};
                  break;
                }
                if(sd.status==='failed'){
                  const err=new Error(String(sd.error||'Bài Deep chưa hoàn tất.'));
                  err.deepJob=true;err.jobId=jobId;
                  throw err;
                }
                if(!workerSeen&&Date.now()-startedAt>=queueMaxWait){
                  throw new Error('Hàng đợi Deep chưa có worker nhận bài sau 3 phút. Vui lòng thử lại.');
                }
              }catch(netErr){
                pollErrors++;
                if(pollErrors>=6)throw netErr;
                await new Promise(resolve=>setTimeout(resolve,Math.min(5000,pollDelay*2)));
              }
              await new Promise(resolve=>setTimeout(resolve,pollDelay));
              pollDelay=Math.min(5000,pollDelay+250);
            }
            if(!d.answer){
              const err=new Error('Bài Deep đang xử lý quá lâu. Bạn có thể thử lại bằng nút Thử lại.');
              err.deepJob=true;err.jobTimeout=true;
              throw err;
            }
          }else{
            const maxAttempts=2;
            let lastErr=null;
            for(let attempt=0;attempt<maxAttempts;attempt++){
              const controller=new AbortController();
              let idleTimer=null;
              const armIdle=()=>{
                clearTimeout(idleTimer);
                idleTimer=setTimeout(()=>controller.abort(),FAST_SOLVER_TIMEOUT_MS);
              };
              try{
                const r=await fetch('/api/solve?stream=1',{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:payload,credentials:'same-origin',cache:'no-store',signal:controller.signal});
                const contentType=String(r.headers.get('content-type')||'').toLowerCase();
                if(contentType.includes('text/event-stream')&&r.body){
                  const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',streamDone=false;
                  stageText('connected');
                  armIdle();
                  while(!streamDone){
                    const part=await reader.read();
                    if(part.done)break;
                    armIdle();
                    buffer+=decoder.decode(part.value,{stream:true});
                    const events=buffer.split(/\n\n/);buffer=events.pop()||'';
                    for(const block of events){
                      let event='message',data='';
                      for(const line of block.split(/\n/)){
                        if(line.startsWith('event:'))event=line.slice(6).trim();
                        else if(line.startsWith('data:'))data+=line.slice(5).trim();
                      }
                      if(!data)continue;
                      let obj={};try{obj=JSON.parse(data)}catch{continue}
                      if(event==='stage')stageText(String(obj.stage||''),obj);
                      else if(event==='result'){
                        const st=Number(obj.status||200),payloadData=obj.data||{};
                        if(st>=400)throw Object.assign(new Error(String(payloadData.error||'Solver error')),{status:st,code:payloadData.code,retryable:payloadData.retryable});
                        d=payloadData;streamDone=true;break;
                      }else if(event==='error'){
                        throw new Error(String(obj.message||'AI backend error'));
                      }
                    }
                  }
                  clearTimeout(idleTimer);
                  if(!streamDone&&d?.answer==null)throw Object.assign(new Error('Kết nối với Solver kết thúc trước khi nhận kết quả.'),{status:502,code:'STREAM_ENDED_EARLY',retryable:true});
                }else{
                  d=await r.json().catch(()=>({}));
                }
                if(r.ok&&d?.answer)break;
                lastErr=Object.assign(new Error(String(d.error||('Solver HTTP '+r.status))),{status:Number(d.status)||r.status,providerStatus:d.providerStatus,code:d.code,retryable:d.retryable});
                const retryable=r.status===408||r.status===409||r.status===425||r.status===429||r.status===502||r.status===503||r.status===504;
                if(!retryable||attempt===maxAttempts-1)throw lastErr;
                await new Promise(resolve=>setTimeout(resolve,900*(attempt+1)));
              }catch(fetchErr){
                clearTimeout(idleTimer);
                if(fetchErr?.name==='AbortError'){
                  const timeoutErr=Object.assign(new Error('Kết nối với Solver bị gián đoạn do chờ quá lâu.'),{status:504,code:'STREAM_IDLE_TIMEOUT',retryable:true});
                  lastErr=timeoutErr;
                  if(attempt<maxAttempts-1){await new Promise(resolve=>setTimeout(resolve,700));continue;}
                  throw timeoutErr;
                }
                lastErr=fetchErr;
                if((fetchErr?.status===429||fetchErr?.status===502||fetchErr?.status===503||fetchErr?.status===504)&&attempt<maxAttempts-1){
                  await new Promise(resolve=>setTimeout(resolve,900*(attempt+1)));continue;
                }
                throw fetchErr;
              }finally{
                clearTimeout(idleTimer);
              }
            }
            throw lastErr||new Error('Solver không trả về kết quả.');
          }
          thinking.remove();
          let answer=String(d.answer||'Mình chưa có câu trả lời.');
          if(d.degraded&&d.answer)answer+='\n\n> ⚠️ Lời giải này chưa qua bước kiểm tra kỹ. Hãy đối chiếu cẩn thận hoặc bấm Thử lại.';
          const msg=document.createElement('div');
          msg.className='study-ai-msg bot';
          msg.style.whiteSpace='normal';
          msg.dataset.studyQuery=userText;
          box.appendChild(msg);
          // Render through the dedicated AI renderer first. This prevents raw \\[ \\], \\frac, \\le,
          // and other TeX from leaking into the chat even when MathJax is not ready yet.
          if(typeof window.renderStudyAiMessage==='function'){
            try{window.renderStudyAiMessage(msg,answer)}catch(_e){msg.textContent=answer}
          }else{
            msg.textContent=answer;
            if(window.MathJax?.typesetPromise){try{await window.MathJax.typesetPromise([msg])}catch(_e){}}
          }
          if(d.tool){const tag=document.createElement('div');tag.className='study-ai-tool-tag';tag.textContent=String(d.tool).startsWith('MER')?'🧠 '+String(d.tool):'Kiểm chứng: '+String(d.tool);msg.appendChild(tag)}
          box.scrollTop=box.scrollHeight;
          box.scrollTop=box.scrollHeight;form.__studyImageData='';const pv=form.querySelector('[data-study-image-preview]');if(pv)pv.remove();
        }catch(err){
          thinking.classList.remove('study-ai-thinking');
          thinking.innerHTML='';
          const errorText=document.createElement('div');errorText.textContent='Lỗi: '+String(err.message||err);thinking.appendChild(errorText);
          if(backgroundDeep){
            const retryBtn=document.createElement('button');
            retryBtn.type='button';retryBtn.className='theme-chip';retryBtn.textContent='Thử lại';retryBtn.style.cssText='margin-top:10px';
            retryBtn.onclick=()=>{ta.value=userText;requestAnimationFrame(()=>submitQuestion())};
            thinking.appendChild(retryBtn);
          }
        }
        finally{clearTimeout(progressTimer);form.dataset.studyBusy='0';if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');submit.setAttribute('aria-label','Gửi');submit.textContent='Gửi'}}
      };
      form.__studySubmit=submitQuestion;
      const sendButton=form.querySelector('[data-study-send]');
      if(sendButton&&!sendButton.dataset.studyBound){
        sendButton.dataset.studyBound='1';
        sendButton.addEventListener('click',function(e){submitQuestion(e)});
      }
      if(!ta.dataset.studyEnterBound){
        ta.dataset.studyEnterBound='1';
        ta.addEventListener('keydown',function(e){
          if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
            e.preventDefault();e.stopImmediatePropagation();submitQuestion(e);
          }
        },true);
      }
    }
  }

  async function compressImage(file){
    if(file.size>MAX_IMAGE_BYTES)throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 12 MB.');
    try{
      const bitmap=await createImageBitmap(file);
      let scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Không thể xử lý ảnh.');
      let data='';
      for(let round=0;round<4;round++){
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));
        canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const quality=[0.72,0.62,0.52,0.44][round];
        data=canvas.toDataURL('image/jpeg',quality);
        if(data.length<=MAX_IMAGE_DATA_CHARS)break;
        scale*=0.82;
      }
      bitmap.close?.();
      if(data.length>MAX_IMAGE_DATA_CHARS)throw new Error('Ảnh sau khi nén vẫn quá lớn. Hãy chụp gần hơn hoặc chọn ảnh rõ, gọn hơn.');
      return data;
    }catch(_e){
      if(_e?.message?.includes('quá lớn'))throw _e;
      const raw=await readAsDataURL(file);
      if(raw.length>MAX_IMAGE_DATA_CHARS)throw new Error('Không thể nén ảnh đủ nhỏ cho AI. Hãy chọn ảnh dưới 8 MB hoặc chụp lại gần hơn.');
      return raw;
    }
  }
  function readAsDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Không đọc được ảnh.'));reader.readAsDataURL(file)})}
  function preview(file,modal){
    if(!file.type.startsWith('image/'))return;const form=modal.querySelector('#studyAiForm');
    compressImage(file).then(dataUrl=>{form.__studyImageData=dataUrl;let pv=form.querySelector('[data-study-image-preview]');if(!pv){pv=document.createElement('div');pv.dataset.studyImagePreview='1';pv.style.cssText='margin-top:8px;display:flex;align-items:center;gap:8px';pv.innerHTML='<img alt="Ảnh đề bài" style="width:72px;height:54px;object-fit:cover;border-radius:10px;border:1px solid rgba(100,100,140,.25);cursor:zoom-in"><button type="button" class="theme-chip">Xoá ảnh</button>';form.insertBefore(pv,form.querySelector('textarea'));pv.querySelector('button').onclick=e=>{e.preventDefault();e.stopPropagation();form.__studyImageData='';pv.remove()};pv.querySelector('img').onclick=()=>openImageViewer(pv.querySelector('img').src,'Ảnh đề bài')}pv.querySelector('img').src=dataUrl;modal.classList.remove('hidden')}).catch(err=>{form.__studyImageData='';const pv=form.querySelector('[data-study-image-preview]');if(pv)pv.remove();modal.classList.remove('hidden');const box=modal.querySelector('#studyAiMessages');if(box){const msg=document.createElement('div');msg.className='study-ai-msg bot';msg.textContent='Lỗi: '+String(err.message||err);box.appendChild(msg);box.scrollTop=box.scrollHeight}})
  }
  function restoreSolverAfterCamera(){try{if(sessionStorage.getItem(CAMERA_RESTORE_KEY)!=='1')return;sessionStorage.removeItem(CAMERA_RESTORE_KEY)}catch(_e){}setTimeout(()=>{const modal=document.getElementById('study-ai-support');if(modal)modal.classList.remove('hidden');addComposerTools()},0)}
  // Global capture fallback: some mobile webviews/embedded browsers can swallow the button's
  // direct listener. Capture here and route the click to the same solver exactly once.
  document.addEventListener('click',function(e){
    const btn=e.target?.closest?.('[data-study-send]');
    if(!btn)return;
    const form=btn.closest('#studyAiForm');
    if(!form)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(typeof form.__studySubmit==='function'){
      form.__studySubmit(e);
      return;
    }
    // The modal may have been created after the initial observer pass.
    addComposerTools();
    setTimeout(()=>{ if(typeof form.__studySubmit==='function') form.__studySubmit(e); },0);
  },true);

  const obs=new MutationObserver(()=>setTimeout(addComposerTools,0));obs.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('pageshow',restoreSolverAfterCamera);window.addEventListener('focus',restoreSolverAfterCamera);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{addComposerTools();restoreSolverAfterCamera()},100));else setTimeout(()=>{addComposerTools();restoreSolverAfterCamera()},100);
})();
