(function(){
 'use strict';
 const id=window.R7_TASK_ID,model=window.R7Tasks,task=model.tasks[id];
 if(!task)return;
 function init(){
  const selectors=window.R7_PANEL||['.controls-panel','#controlsPanel','#controls','#sidebar','#info','.game-container'];
  const panel=selectors.map(s=>document.querySelector(s)).find(Boolean)||document.body;
  const box=document.createElement('section');box.className='r7-learning';box.setAttribute('aria-label','本页学习任务');
  const intro=document.createElement('p');intro.className='r7-guide';intro.textContent=task.guide;box.append(intro);panel.prepend(box);
  window.R7Continue=function(next){const feedback=[...document.querySelectorAll('[id*="feedback"],.feedback')].find(e=>!e.closest('.r7-learning')&&e.getBoundingClientRect().height>0);const host=feedback||document.querySelector('.screen.active')||box;host.querySelector('.r7-continue')?.remove();const button=document.createElement('button');button.className='r7-continue';button.type='button';button.textContent='读完反馈，继续';button.addEventListener('click',()=>{button.remove();next();},{once:true});host.append(button);};
  let count=0,solutionSeen=false,attempted=false,feedbackCount=0;
  function emit(kind,more){const payload={type:'maic_learning_event',event_type:kind,schema_version:'openmaic-learning-event-v2',chapter_id:'V14-C1',knowledge_point_id:id.slice(0,9),scene_type:id.slice(10),resource_id:id,task_version:model.version,evidence_scope:'guided_courseware_r7',independent:false,attempt_id:(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random())+'-'+count,...more};payload.event_id=payload.attempt_id;payload.timestamp=new Date().toISOString();payload.course_version='functions-limits-preserved-r7-20261106';payload.source=more?.source||'student';payload.emission_source=payload.source;if(window.OpenMaicLearningEvidence?.emit)window.OpenMaicLearningEvidence.emit(kind,payload);else window.parent.postMessage({type:'maic_learning_event',payload},'*');}
  if(task.game){if(typeof window.startGame==='function'){window.startGame();const reset=window.resetGame;if(reset)window.resetGame=function(){reset();window.startGame();};}return;}
  const form=document.createElement('form');form.className='r7-check';const prompt=document.createElement('p');prompt.textContent=task.prompt;form.append(prompt);
  for(const f of task.fields){const label=document.createElement('label');label.textContent=f.label;const control=document.createElement(f.type==='number'?'input':'select');control.name=f.id;control.required=true;control.id='r7-'+f.id;
   if(f.type==='number'){control.type='number';control.step='any';control.min=f.min;control.max=f.max;}else{const blank=new Option('请选择你的判断','');blank.disabled=true;blank.selected=true;control.add(blank);for(const [value,text]of f.options)control.add(new Option(text,value));}label.append(control);form.append(label);}
  const check=document.createElement('button');check.type='submit';check.textContent='核对判断';const solution=document.createElement('button');solution.type='button';solution.textContent='看解析';solution.disabled=true;
  const feedback=document.createElement('p');feedback.className='r7-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');form.append(check,solution,feedback);box.append(form);
  function context(){if(task.context==='sides'){const values=['sim-left','sim-right'].map(k=>document.getElementById(k)?.value?.trim());return {left:values[0]?Number(values[0]):NaN,right:values[1]?Number(values[1]):NaN};}return task.context?{...window.R7SceneContext}:{};}
  form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const answers=Object.fromEntries(task.fields.map(f=>[f.id,f.type==='number'?Number(form.elements[f.id].value):form.elements[f.id].value]));const c=context(),result=model.grade(id,answers,c);if(result===null){feedback.textContent='请先完成上方的参数设置，确认数值有效，再核对。';return;}attempted=true;solution.disabled=false;count++;feedback.textContent=result?'判断正确。'+task.solution:'还需要修改。'+task.hint;emit('challenge_result',{challenge_id:id+'-check-r7',is_correct:result,attempt_number:count,parameters:{task_id:id,answers,context:c,solution_seen:solutionSeen,prior_feedback_count:feedbackCount}});feedbackCount++;emit('authored_feedback_exposed',{source:'system',parameters:{task_id:id,feedback_type:result?'explanation':'targeted_cue'}});});
  solution.addEventListener('click',()=>{solutionSeen=true;feedback.textContent=task.solution;emit('solution_viewed',{parameters:{task_id:id,support_source:'authored_solution'}});});
  function changed(){if(attempted){feedback.textContent='条件或作答已改变，请重新核对。';attempted=false;}}
  form.addEventListener('input',changed);window.addEventListener('r7-state',changed);if(task.context==='sides')['sim-left','sim-right'].forEach(k=>document.getElementById(k)?.addEventListener('input',changed));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
