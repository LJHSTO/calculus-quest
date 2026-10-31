(function(){
 'use strict';
 function start(){
  const config=document.querySelector('[data-concept-exploration]');
  if(!config||document.querySelector('.concept-exploration'))return;
  const {point,scene}=JSON.parse(config.textContent),M=window.ConceptExploration,t=M?.get(point,scene);if(!t)return;
  const host=document.querySelector('#controls-panel,#controlsPanel,.controls-panel,#controls,.controls')||document.querySelector('#sidebar,.sidebar');
  if(!host)return;
  let background=host;
  while(background.parentElement&&getComputedStyle(background).backgroundColor==='rgba(0, 0, 0, 0)')background=background.parentElement;
  const rgb=getComputedStyle(background).backgroundColor.match(/[\d.]+/g)?.slice(0,3).map(Number)||[255,255,255];
  host.style.setProperty('--concept-ink',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<128?'#edf0fa':'#24344a');
  if(getComputedStyle(host).display==='flex'&&getComputedStyle(host).flexDirection==='row')host.classList.add('concept-host-row');
  const details=document.createElement('details');details.className='concept-exploration';details.dataset.taskVersion=M.version;
  const style=document.createElement('style');style.textContent=`
  .concept-exploration{box-sizing:border-box;margin:12px 0;padding:10px 12px;border:1px solid #9890be66;border-radius:8px;color:inherit;background:transparent;font:14px/1.6 "Microsoft YaHei",sans-serif;min-width:0;max-width:100%;text-align:left}
  .concept-exploration summary{cursor:pointer;min-height:28px;font-weight:600;list-style:revert;color:inherit}.concept-exploration p{margin:10px 0;line-height:1.6;color:inherit}.concept-exploration small{opacity:.8}.concept-exploration label{display:flex;gap:8px;align-items:start;margin:7px 0;cursor:pointer}.concept-exploration input{margin-top:5px;flex:0 0 auto;accent-color:#7662d9}.concept-exploration button{font:inherit;min-height:40px;padding:7px 12px;border:1px solid #9890be88;border-radius:6px;background:transparent;color:inherit;cursor:pointer;margin:8px 6px 0 0}.concept-exploration button:disabled{opacity:.65;cursor:default}.concept-exploration button:focus-visible,.concept-exploration summary:focus-visible{outline:2px solid #8f7fea;outline-offset:3px}.concept-exploration .concept-result{padding-top:8px;border-top:1px solid #9890be66}.concept-exploration[hidden]{display:none!important}`;
  style.textContent+=`
  .concept-host-row{flex-wrap:wrap!important;align-items:flex-start!important}
  .concept-host-row > .concept-exploration{flex:1 0 100%;width:100%}
  .concept-exploration,.concept-exploration label,.concept-exploration label span{color:var(--concept-ink)!important}
  .concept-exploration label{display:flex!important;align-items:flex-start!important;gap:8px!important;width:100%!important;font-size:14px!important}
  .concept-exploration input[type=radio]{width:16px!important;height:16px!important;min-width:16px!important;max-width:16px!important;flex:0 0 16px!important;padding:0!important}
  .concept-exploration label span{display:block!important;flex:1 1 auto;min-width:0;white-space:normal;font:inherit;line-height:1.6}
  body:has(#main > #sidebar) #sidebar{overflow-y:auto}
  body:has(#main > #sidebar) #sidebar > .concept-exploration{flex-shrink:0;margin:12px}
  body:has(#main > #sidebar) #sidebar:has(.concept-exploration[open]) #node-detail{flex:0 0 auto}
  body:has(#main > #sidebar.collapsed) #toggle-sidebar{display:block!important}
  body:has(#main > #sidebar.collapsed) #sidebar{width:0!important;min-width:0!important;overflow:hidden!important}
  `;
  document.head.append(style);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const title=el('summary','课件练习'),intro=el('p',t.context),prompt=el('p',t.prompt),form=el('form'),choices=el('div'),result=el('p');
  result.className='concept-result';result.hidden=true;result.setAttribute('role','status');
  let selection=null,attempts=0,feedbackSeen=false;const submitted=new Set();
  t.options.forEach((text,index)=>{const label=el('label'),input=el('input');input.type='radio';input.name='concept-choice';input.value=String(index);input.onchange=()=>{selection=index;submit.disabled=submitted.has(index);};label.append(input,el('span',text));choices.append(label);});
  const submit=el('button',scene==='mindMap'?'核对这条连接':scene==='visualization3d'?'核对我的观察':'核对我的预测');submit.type='submit';
  const explanation=el('details');explanation.hidden=true;explanation.append(el('summary','查看依据'),el('p',t.explanation));
  const collapse=el('button','收起，继续探索');collapse.type='button';collapse.onclick=()=>{details.open=false;title.focus();};
  form.append(choices,submit);details.append(title,intro,prompt,form,result,explanation,collapse);host.append(details);
  const emit=(event,data)=>window.OpenMaicLearningEvidence?.emit(event,{...data,task_version:M.version,knowledge_point_id:point,scene_type:scene,evidence_scope:'concept_exploration_process',independent:false});
  details.addEventListener('toggle',()=>emit('task_progress',{stage:details.open?'concept_opened':'concept_closed',completed:false}));
  explanation.addEventListener('toggle',()=>{if(explanation.open){feedbackSeen=true;window.OpenMaicLearningEvidence?.recordHint({stage:'concept_explanation',task_version:M.version,knowledge_point_id:point,scene_type:scene,evidence_scope:'concept_exploration_process',independent:false});}});
  form.onsubmit=e=>{e.preventDefault();if(selection===null){result.hidden=false;result.textContent='先选一个判断，再核对。';return;}
   if(submitted.has(selection))return;
   if(!window.OpenMaicLearningEvidence?.recordChallenge){result.hidden=false;result.textContent='学习记录尚未连接，请稍后再核对；自由探索仍可使用。';return;}
   const response=selection,correct=response===t.answer;attempts++;
   const payload={challenge_id:`${point}:${scene}:concept`,task_version:M.version,scene_type:scene,response,independent:false,is_correct:correct,evidence_scope:'concept_exploration_attempt',feedback_seen:feedbackSeen,misconception:correct?null:t.misconception,attempt_number:attempts};
   window.OpenMaicLearningEvidence.recordChallenge(payload);submitted.add(response);submit.disabled=true;
   result.hidden=false;result.textContent=correct?'这个判断成立。可以查看依据，或继续自由探索。':'这个判断还需要核对。可以回到图中比较，再改变判断；也可以查看依据。';
   explanation.hidden=false;feedbackSeen=true;
  };
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
