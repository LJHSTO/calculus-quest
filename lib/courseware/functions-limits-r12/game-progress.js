(function(){
 'use strict';
 // UI restoration never submits an answer or establishes learning evidence.
 window.CQGameProgress={register(scope,hooks,ids){
  const screen=()=>document.querySelector('.screen.active')?.id||'';
  const screens=new Set([...document.querySelectorAll('.screen[id]')].map(n=>n.id));if(!screens.size)screens.add('');
  const text=n=>[...n.childNodes].filter(n=>n.nodeType!==1||n.tagName!=='BUTTON').map(n=>n.textContent).join('\n').slice(0,1200);
  window.CQCoursewareProgress={
   get:()=>({version:'game-ui-r12-v1',scope,state:hooks.get(),screen:screen(),pending:Boolean(document.querySelector('.r7-continue')),
    feedback:ids.map(id=>{const n=document.getElementById(id);return n?{id,text:text(n),tone:n.classList.contains('error')?'error':n.classList.contains('success')?'success':n.classList.contains('feedback-error')?'feedback-error':n.classList.contains('feedback-success')?'feedback-success':'',visible:getComputedStyle(n).display!=='none'}:null;}).filter(Boolean),audit:window.CQ?.getProgress?.()||null}),
   set:saved=>{
    if(saved?.version!=='game-ui-r12-v1'||saved.scope!==scope||!saved.state||!screens.has(saved.screen))return;
    const restoring=window.__cqRestoringProgress;window.__cqRestoringProgress=true;
    try{
     document.querySelectorAll('.r7-continue').forEach(n=>n.remove());if(hooks.set(saved.state,saved)===false)return;
     for(const n of document.querySelectorAll('.screen'))n.classList.toggle('active',n.id===saved.screen);
     for(const f of (Array.isArray(saved.feedback)?saved.feedback:[]).slice(0,ids.length)){
      if(!ids.includes(f.id)||typeof f.text!=='string')continue;const n=document.getElementById(f.id);if(!n)continue;
      n.textContent=f.text.slice(0,1200);n.style.display=f.visible?'block':'none';
      n.classList.remove('error','success','feedback-error','feedback-success');if(['error','success','feedback-error','feedback-success'].includes(f.tone))n.classList.add(f.tone);
     }
     window.CQ?.restoreProgress?.(saved.audit);
     hooks.after?.(saved.state,saved);
     window.__cqGameProgressRestored=true;
    }finally{window.__cqRestoringProgress=restoring;}
   }
  };
  window.dispatchEvent(new Event('cq:progress-ready'));
 }};
})();
