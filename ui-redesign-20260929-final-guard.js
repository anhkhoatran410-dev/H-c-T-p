/* STUDY TH — final user UI handoff guard */
(function(){
'use strict';
if(window.__studyFinalUiGuard)return;window.__studyFinalUiGuard=true;
function boot(){
 var tries=0,t=setInterval(function(){
  tries++;
  if(window.state&&typeof window.studentGoV2==='function'){
   var has=!!localStorage.getItem('study_student_session_v3')||!!localStorage.getItem('study_candidate');
   if(has){
    if(window.state.page==='landing'||window.state.page==='login'||!document.querySelector('.student-app-v2')){
      window.state.page='home';
    }
    if(typeof window.render==='function')window.render();
   }
  }
  if(tries>20)clearInterval(t);
 },250);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.addEventListener('study-app-loaded',function(){setTimeout(boot,50)});
})();