(function(){
 'use strict';
 function start(){
  const tag=document.querySelector('[data-concept-exploration]'),M=window.FreeExploration;if(!tag||!M)return;
  const {point,scene}=JSON.parse(tag.textContent),config=M.get(point,scene);if(!config)return;
  const sidebar=document.querySelector('#sidebar,.sidebar');
  const host=(scene==='mindMap'?sidebar:null)||document.querySelector('#controls-panel,#controlsPanel,.controls-panel,#controls,.controls')||sidebar;if(!host)return;
  if(scene==='mindMap'&&point==='GH-02-K01')sidebar.classList.remove('collapsed');
  if(scene==='mindMap'&&point==='GH-01-K01'){const toggle=document.querySelector('#toggle-sidebar');if(toggle)document.querySelector('#diagram-area')?.append(toggle);}
  document.body.dataset.explorationPoint=point;document.body.dataset.explorationScene=scene;
  const layout=document.querySelector('link[data-exploration-layout]');if(layout)document.head.append(layout);
  // Refit the original renderer after panel layout changes, without replacing its state.
  const canvasHost=document.querySelector('#canvas-container');
  if(scene==='visualization3d'&&canvasHost){const legend=document.querySelector('#legend');if(legend)canvasHost.append(legend);}
  if(canvasHost){let size='';new ResizeObserver(([entry])=>{const next=Math.round(entry.contentRect.width)+':'+Math.round(entry.contentRect.height);if(next!==size){size=next;requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}}).observe(canvasHost);}
  if(point==='GH-01-K01'&&scene==='simulation'){
   const extra=document.createElement('details');extra.className='course-extra-controls';const label=document.createElement('summary');label.textContent='演示速度与观察记录';extra.append(label);
   for(const item of [document.querySelector('#speed-slider')?.closest('.control-group'),document.querySelector('.trace-table')])if(item)extra.append(item);
   host.append(extra);
  }
  if(point==='GH-02-K01'&&scene==='simulation'){
   const extra=document.createElement('details');extra.className='course-extra-controls';const label=document.createElement('summary');label.textContent='数据记录与趋势预测';extra.append(label);
   for(const item of [document.querySelector('#table-container'),document.querySelector('#prediction-panel')])if(item){const heading=item.previousElementSibling;if(heading?.classList.contains('section-title'))extra.append(heading);extra.append(item);}
   host.insertBefore(extra,host.querySelector('.concept-exploration'));
  }
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
