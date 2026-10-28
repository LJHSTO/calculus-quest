(function(){
 'use strict';
 function start(){
  const tag=document.querySelector('[data-concept-exploration]'),M=window.FreeExploration;if(!tag||!M)return;
  const {point,scene}=JSON.parse(tag.textContent),config=M.get(point,scene);if(!config)return;
  const host=document.querySelector('#controls-panel,#controlsPanel,.controls-panel,#controls,.controls')||document.querySelector('#sidebar,.sidebar');if(!host)return;
  const guide=document.createElement('details');guide.className='free-exploration-guide';
  const title=document.createElement('summary');title.textContent='观察线索';const text=document.createElement('p');text.textContent=config.guide;guide.append(title,text);host.prepend(guide);
  if(scene==='visualization3d'&&point==='GH-02-K01')title.textContent='拓展：x 越来越大，与趋近有限点不同';
  if(scene==='visualization3d'&&point==='GH-02-K03')title.textContent='空间示意：仍须检查连续的三个条件';
  if(point==='GH-01-K03')title.textContent='观察线索：按 x 从小到大判断增减';
  const style=document.createElement('style');style.textContent='.free-exploration-guide{box-sizing:border-box;flex:1 0 100%;width:100%;max-width:100%;padding:8px 12px;border-bottom:1px solid #9890be44;font:14px/1.6 "Microsoft YaHei",sans-serif;text-align:left}.free-exploration-guide summary{cursor:pointer;font-weight:600;min-height:28px}.free-exploration-guide p{margin:8px 0;color:inherit}.free-exploration-guide summary:focus-visible{outline:2px solid #8f7fea}';document.head.append(style);
  const previous=new Map();
  function record(channel,value){const data={task_version:M.version,knowledge_point_id:point,scene_type:scene,evidence_scope:'free_exploration_observation',independent:false,parameters:{channel,value}};
   if(channel==='input'&&config.bindings.rule){const current=document.querySelector(config.bindings.rule.selector+'.active');data.parameters.context=current?.dataset.func??current?.getAttribute('onclick')?.match(/\((?:'([^']+)'|(\d+))/)?.slice(1).find(x=>x!==undefined);}
   const checked=M.verify(data,point);if(!checked||previous.get(channel)===checked.key)return;
   if(!window.OpenMaicLearningEvidence?.emit)return;previous.set(channel,checked.key);
   window.OpenMaicLearningEvidence.emit('exploration_observed',data);
  }
  for(const [channel,b]of Object.entries(config.bindings)){
   document.addEventListener(b.event,e=>{
    if(!e.isTrusted||document.hidden)return;const target=e.target.closest?.(b.selector);if(!target)return;
    // Read AFTER the courseware's handler. Timers and automatic animation never count.
    setTimeout(()=>{
     let value;
     if(b.read)value=Number(document.querySelector(b.read)?.textContent);
     else if(!b.values)value=Number(target.value);
     else if(target.tagName==='SELECT')value=target.value;
     else if(channel==='gap')value=target.textContent.includes('修复')?'gap':'continuous';
     else if(channel==='node')value=target.dataset.id||target.dataset.nodeId||target.id.replace(/^node-/,'');
     else value=target.dataset.func??target.getAttribute('onclick')?.match(/\((?:'([^']+)'|(\d+))/)?.slice(1).find(x=>x!==undefined);
     record(channel,value);
    },0);
   });
  }
  // The step buttons open actual concept nodes, not a quiz; reopening is deduplicated.
  if(scene==='mindMap'){
   const scripts=[...document.querySelectorAll('script[type="application/json"]')];let map;
   for(const s of scripts){try{const j=JSON.parse(s.textContent);if(j.nodes&&j.revealOrder){map=j;break;}}catch{}}
   document.addEventListener('click',e=>{if(!e.isTrusted||document.hidden||!e.target.closest('#btn-next,#btn-prev,#nextBtn,#prevBtn')||!map)return;
    setTimeout(()=>{const n=Number((document.querySelector('#step-indicator,#step-info,#stepText')?.textContent||'').match(/\d+/)?.[0]);const id=map.revealOrder[n-1];if(id)record('node',id);},0);
   });
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
