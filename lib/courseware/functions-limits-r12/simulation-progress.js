(function(){
 'use strict';
 window.CQSimulationState={
  number:(value,fallback,min=-1e6,max=1e6)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:fallback,
  install(scope,hooks){
   window.CQSimulationProgress={get:()=>({version:'simulation-ui-r12-v1',scope,state:hooks.get()}),set:saved=>{
    if(saved?.version!=='simulation-ui-r12-v1'||saved.scope!==scope||!saved.state||typeof saved.state!=='object'||Array.isArray(saved.state))return;
    const restoring=window.__cqRestoringProgress;window.__cqRestoringProgress=true;
    try{hooks.set(saved.state);}finally{window.__cqRestoringProgress=restoring;}
   }};
   window.dispatchEvent(new Event('cq:progress-ready'));
  }
 };
})();
