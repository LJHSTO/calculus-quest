(function(){
 'use strict';
 const model=window.R9Native,id=window.R7_TASK_ID,task=model.tasks[id],point=id.slice(0,9),index=model.points.indexOf(point);
 function init(){
  const guide=document.querySelector('.r8-guidance');if(!guide||index<0)return;
  document.body.dataset.activityRevision=model.version;
  const concept=document.createElement('p');concept.className='r9-concept';concept.textContent=model.concepts[index];guide.prepend(concept);
  if(!task)return;
  guide.classList.add('r9-native');guide.style.setProperty('--r9-text',getComputedStyle(guide.querySelector('.r7-guide')).color);const title=document.createElement('strong');title.textContent=task.title;guide.querySelector('.r7-guide').textContent=task.goal;concept.after(title);
  const work=document.createElement('div');work.className='r9-work';guide.append(work);
  const feedback=document.createElement('p');feedback.className='r9-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');guide.append(feedback);
  let sequence=0,feedbackCount=0,feedbackVersion=0,exposedFeedbackVersion=-1,lastCommit='',snapshots=[];
  let getDraft=()=>({}),restoreDraft=()=>{};
  function emit(kind,state,extra={}){if(window.__cqRestoringProgress)return;const key=crypto.randomUUID?.()||Date.now()+'-'+(++sequence),data={schema_version:'openmaic-learning-event-v2',event_id:key,attempt_id:key,chapter_id:'V14-C1',knowledge_point_id:point,scene_type:id.slice(10),resource_id:id,course_version:model.courseVersion,task_version:model.version,evidence_scope:'native_construction_r10',independent:false,source:'student',emission_source:'student',timestamp:new Date().toISOString(),parameters:{task_id:id,state,prior_feedback_count:feedbackCount},...extra};
   if(window.OpenMaicLearningEvidence?.emit)window.OpenMaicLearningEvidence.emit(kind,data);else window.parent.postMessage({type:'maic_learning_event',payload:{...data,event_type:kind}},'*');
  }
  function say(text){if(window.__cqRestoringProgress)return;if(feedback.textContent!==text){feedback.textContent=text;feedbackVersion++;}if(text)requestAnimationFrame(()=>{const scroll=guide.querySelector('.r9-content')||guide;const f=feedback.getBoundingClientRect(),s=scroll.getBoundingClientRect();if(f.bottom>s.bottom)scroll.scrollTop+=f.bottom-s.bottom+8;
   // Re-observe updated content even when its visible fraction stayed unchanged.
   exposure.takeRecords();exposure.unobserve(feedback);exposure.observe(feedback);
  });}
  const exposure=new IntersectionObserver(entries=>{if(window.__cqRestoringProgress)return;if(entries.some(e=>e.intersectionRatio>=.5)&&feedback.textContent&&feedbackVersion!==exposedFeedbackVersion){exposedFeedbackVersion=feedbackVersion;emit('authored_feedback_exposed',{feedback:feedback.textContent,feedback_version:feedbackVersion},{source:'system',emission_source:'system'});}},{threshold:.5});exposure.observe(feedback);
  function commit(state){if(window.__cqRestoringProgress)return false;const result=model.evaluate(id,state);if(!result){say('先完成有效的操作设置，再采用这组结果。');return false;}say(result.feedback);const key=model.fingerprint(id,state);if(lastCommit===key)return result.correct;lastCommit=key;
   emit('challenge_result',state,{challenge_id:id+'-construction',is_correct:result.correct,attempt_number:++sequence});feedbackCount++;return result.correct;
  }
  function button(text,fn,host=work){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);host.append(b);return b;}
  function line(text,host=work){const p=document.createElement('p');p.textContent=text;host.append(p);return p;}
  function slider(label,min,max,step,value,change,host=work){const l=document.createElement('label');l.className='r9-slider';const out=document.createElement('span'),input=document.createElement('input');input.type='range';Object.assign(input,{min,max,step,value});input.setAttribute('aria-label',label);const update=()=>{out.textContent=label+'：'+Number(input.value);change?.(Number(input.value));};input.addEventListener('input',()=>{update();say('');});input.addEventListener('change',()=>emit('exploration_observed',{control:label,value:Number(input.value)}));l.append(out,input);host.append(l);out.textContent=label+'：'+value;return input;}
  function renderSnapshots(){let list=guide.querySelector('.r9-records');if(!list){list=document.createElement('ol');list.className='r9-records';feedback.before(list);}list.replaceChildren();for(const record of snapshots){const li=document.createElement('li');li.textContent=task.kind==='mapping_observe'?'输入'+record.x+' → 输出'+Number(record.y.toFixed(3))+'；规则：'+record.ruleLabel:task.kind==='sides'?'左'+record.left+' / 右'+record.right+' → '+(record.left===record.right?'共同极限'+record.left:'不相等'):task.kind==='projection'?({top:'俯视：高度被压掉',side:'侧视：极限高度差2',angle:'斜视：位置与高度同时可见'})[record.view]:'共同极限1 / 点值'+record.value+' → '+(record.value===1?'连续':'不连续');list.append(li);}}
  function observe(state,text){if(window.__cqRestoringProgress)return;if(snapshots.some(s=>JSON.stringify(s)===JSON.stringify(state))){say('这组条件已经保留。改变一个相关条件，再比较。');return;}snapshots.push(state);snapshots=snapshots.slice(-4);renderSnapshots();say(text);emit('exploration_observed',{records:snapshots});}
  function plot(fn,a,b,minY=-7,maxY=7){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 300 120');svg.classList.add('r9-plot');svg.setAttribute('role','img');svg.setAttribute('aria-label','函数曲线与当前标记点');work.prepend(svg);const X=x=>20+(x+3)/6*260,Y=y=>100-(y-minY)/(maxY-minY)*85;
   return ()=>{const pts=Array.from({length:121},(_,i)=>{const x=-3+i/20;return X(x)+','+Y(fn(x));}).join(' ');const values=b?[a(),b()]:[a()];svg.innerHTML='<path d="M20 '+Y(0)+'H280 M150 10V105" stroke="currentColor" opacity=".35" fill="none"/><polyline points="'+pts+'" fill="none" stroke="#bda5ff" stroke-width="2"/>'+values.map((p,i)=>'<circle cx="'+X(p.x)+'" cy="'+Y(p.y)+'" r="5" fill="'+(i?'#fbbf24':'#56b4ff')+'"/><text x="'+Math.min(240,Math.max(24,X(p.x)+6))+'" y="'+Math.max(13,Y(p.y)-8)+'" fill="currentColor" font-size="11">('+p.x+','+Number(p.y.toFixed(2))+')</text>').join('')+'<text x="280" y="'+(Y(0)-4)+'" fill="currentColor" font-size="11">x</text><text x="157" y="12" fill="currentColor" font-size="11">y</text>';};
  }
  if(task.kind==='mapping'){
   const links=[[],[],[]],table=document.createElement('table');table.className='r9-mapping';table.innerHTML='<caption>点击交点添加或移除连线</caption><thead><tr><th>输入 ↓ / 输出 →</th><th>0</th><th>1</th><th>2</th></tr></thead>';const body=document.createElement('tbody');table.append(body);work.append(table);
   links.forEach((row,i)=>{const tr=document.createElement('tr');const h=document.createElement('th');h.textContent=i-1;tr.append(h);[0,1,2].forEach(v=>{const cell=document.createElement('td');const b=button('○',()=>{const at=row.indexOf(v);at<0?row.push(v):row.splice(at,1);row.sort();b.textContent=row.includes(v)?'●':'○';b.setAttribute('aria-pressed',String(row.includes(v)));say('');},cell);b.setAttribute('aria-label','连接输入'+(i-1)+'与输出'+v);b.setAttribute('aria-pressed','false');tr.append(cell);});body.append(tr);});
   getDraft=()=>({links:links.map(row=>row.slice())});restoreDraft=s=>{for(let i=0;i<3;i++){links[i].splice(0,links[i].length,...[...new Set((Array.isArray(s.links?.[i])?s.links[i]:[]).filter(v=>[0,1,2].includes(v)))].sort());}body.querySelectorAll('tr').forEach((row,i)=>row.querySelectorAll('button').forEach((b,v)=>{b.textContent=links[i].includes(v)?'●':'○';b.setAttribute('aria-pressed',String(links[i].includes(v)));}));};
   button('采用这组连线',()=>commit({links}));
   }else if(task.kind==='domain'){
   let mode='hole',pointValue=0;const read=line(''),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 320 140');svg.classList.add('r9-plot');svg.setAttribute('role','img');svg.setAttribute('aria-label','x等于2处的空点和点值草稿');work.prepend(svg);
   function draw(){read.textContent=mode==='hole'?'题目条件：f(2)未定义。其余输入按x+2计算。':'题目条件：另外规定f(2)=0，其余输入仍按x+2计算。';svg.innerHTML='<path d="M15 110H305 M70 12V130" fill="none" stroke="currentColor" opacity=".45"/><path d="M10 97.5L310 35" stroke="#9b8ce8" stroke-width="3"/><circle cx="190" cy="60" r="7" fill="#141b29" stroke="#bda5ff" stroke-width="3"/><circle cx="190" cy="'+(110-pointValue*12.5)+'" r="5" fill="#f2a1cd"/><text x="201" y="53" fill="currentColor" font-size="12">空点(2,4)</text><text x="105" y="'+Math.min(128,124-pointValue*12.5)+'" fill="currentColor" font-size="12">草稿(2,'+pointValue+')</text><text x="295" y="123" fill="currentColor" font-size="12">x</text>';}
   getDraft=()=>({mode,pointValue});restoreDraft=s=>{if(['hole','assigned'].includes(s.mode))mode=s.mode;if(Number.isFinite(s.pointValue)&&s.pointValue>=-2&&s.pointValue<=5)pointValue=s.pointValue;draw();};
   button('切换：是否另给点值',()=>{mode=mode==='hole'?'assigned':'hole';draw();say('题目条件已改变，请重新核对定义。');});slider('准备画的f(2)',-2,5,1,0,v=>{pointValue=v;draw();});button('保留未定义，不补点',()=>commit({mode,pointValue,action:'exclude'}));button('按草稿画实际点值',()=>commit({mode,pointValue,action:'assign'}));draw();
  }else if(task.kind==='point'){
   let x=0,y=0;const draw=plot(v=>2*v-1,()=>({x,y}));getDraft=()=>({x,y});restoreDraft=s=>{if(Number.isFinite(s.x)&&Math.abs(s.x)<=3)x=s.x;if(Number.isFinite(s.y)&&Math.abs(s.y)<=7)y=s.y;draw();};slider('横坐标x',-3,3,1,x,v=>{x=v;draw();});slider('纵坐标y',-7,7,1,y,v=>{y=v;draw();});button('固定这个点',()=>commit({x,y}));draw();
  }else if(task.kind==='counterexample'){
   let a=-2,b=1;const draw=plot(v=>v*v-4,()=>({x:a,y:a*a-4}),()=>({x:b,y:b*b-4}),-5,6);getDraft=()=>({a,b});restoreDraft=s=>{if(Number.isFinite(s.a)&&Math.abs(s.a)<=3)a=s.a;if(Number.isFinite(s.b)&&Math.abs(s.b)<=3)b=s.b;draw();};slider('左标记x₁',-3,3,.5,a,v=>{a=v;draw();});slider('右标记x₂',-3,3,.5,b,v=>{b=v;draw();});button('保留这个反例',()=>{if(a>=b)return say('先把x₁放在x₂左边，按输入从小到大的顺序比较。');commit({a,b});});draw();
  }else if(task.kind==='neighborhood'){
   let delta=.5,epsilon=.2,gain=1;const read=line(''),track=document.createElement('div');track.className='r9-band';track.setAttribute('role','img');work.prepend(track);
   function update(){read.textContent='输入范围：0<|x−2|<'+delta+'；允许输出误差：|f(x)−4|<'+epsilon+'。输出距离是输入距离的'+gain+'倍。';track.style.setProperty('--span',delta*100+'%');track.style.setProperty('--allowed',epsilon/gain*100+'%');track.setAttribute('aria-label','紫色输入范围半径'+delta+'，绿色允许半径'+epsilon/gain);track.innerHTML='<i class="r9-allowed"></i><i class="r9-chosen"></i><span>中心：a=2 / L=4</span>';}
   getDraft=()=>({delta,epsilon,gain});restoreDraft=s=>{if(Number.isFinite(s.delta)&&s.delta>=.01&&s.delta<=1)delta=s.delta;if([.2,.05].includes(s.epsilon))epsilon=s.epsilon;if([1,2,3,4].includes(s.gain))gain=s.gain;update();};slider('倍率k',1,4,1,gain,v=>{gain=v;update();});slider('邻近范围δ',.01,1,.01,delta,v=>{delta=v;update();});button('采用这个邻近范围',()=>commit({delta,epsilon,gain}));button('换成误差0.05',()=>{epsilon=epsilon===.2?.05:.2;update();say('误差已改变。重新选择能覆盖整个邻域的范围。');});update();
  }else if(task.kind==='sides'){
   const read=line('运行原判定器后，这里会保留对照。');getDraft=()=>({read:read.textContent.slice(0,300)});restoreDraft=s=>{if(typeof s.read==='string')read.textContent=s.read.slice(0,300);};const run=document.querySelector('.sim-btn');run?.addEventListener('click',()=>{const values=['sim-left','sim-right'].map(k=>document.getElementById(k).value.trim());if(values.some(v=>!v))return;const [left,right]=values.map(Number);if(![left,right].every(v=>Number.isFinite(v)&&Math.abs(v)<=1000))return;read.textContent='左：'+left+' → '+(left===right?'同一个有限数 → 双侧极限为'+left:'不同的有限数 → 无双侧有限极限')+' ← 右：'+right;observe({left,right},left===right?'这个结论来自两侧有限且相等；没有用到点值。':'这不是操作失败，而是一个对照情形。两侧均值不能替代共同极限。');});
  }else if(task.kind==='repair'){
   let selected='hole',value=0;const details=line(''),cases=document.createElement('div');cases.className='r9-case-row';work.prepend(cases);const desc={hole:'x≠0时f(x)=x+2，f(0)未定义。点值 ✕ → 两侧共同趋近2 → 等值待检查。',jump:'x<0时f(x)=x+1，x>0时f(x)=x+3，f(0)=2。点值 ✓ → 左1、右3 ✕ → 无法进入等值检查。',corner:'f(x)=|x|。f(0)=0 ✓ → 左右都趋近0 ✓ → 点值等于极限 ✓。'};
   function update(){details.textContent=desc[selected];for(const b of cases.children)b.setAttribute('aria-pressed',String(b.dataset.case===selected));}
   getDraft=()=>({selected,value});restoreDraft=s=>{if(['hole','jump','corner'].includes(s.selected))selected=s.selected;if(Number.isFinite(s.value)&&s.value>=-2&&s.value<=5)value=s.value;update();};
   for(const [key,label]of Object.entries({hole:'缺一个点',jump:'两侧跳跃',corner:'连续的尖角'})){const b=button(label,()=>{selected=key;update();say('');},cases);b.dataset.case=key;}
   slider('准备采用的f(0)',-2,5,1,value,v=>value=v);button('应用点值修复',()=>commit({case:selected,value,action:'apply'}));button('只改点值无法修复',()=>commit({case:selected,value,action:'impossible'}));button('保留原函数',()=>commit({case:selected,value,action:'leave'}));update();
  }else if(task.kind==='mapping_observe'){
   slider('固定输入x',-3,3,.5,0,v=>{window.R9Scene?.setInput(v);});button('保留这条映射',()=>{const s=window.R9Scene?.read();if(!s)return say('图形正在初始化，请稍后再操作。');if(!Number.isFinite(s.y))return say('这个输入不在当前函数的实数定义域内，不能生成输出。请检查规则允许哪些输入。');s.ruleLabel=document.getElementById('func-select').selectedOptions[0].textContent;observe(s,'已保留 x='+s.x+' → f(x)='+Number(s.y.toFixed(3))+'。固定规则后，同一个输入只有这一个输出。再选不同输入作比较。');});
  }else if(task.kind==='signed_pillar'){
   let target='negative';const read=line('当前收集目标：零平面下方的顶端。');getDraft=()=>({target});restoreDraft=s=>{if(['negative','positive'].includes(s.target))target=s.target;read.textContent='接着收集：零平面'+(target==='negative'?'下':'上')+'方的顶端。';};button('收集刚生成的立柱',()=>{const s=window.R9Scene?.read();if(!s||s.rule!=='linear')return say('先用原控件选择f(x)=x/3，再生成立柱。选择规则或还未生成不算失败。');if(commit({...s,target})){target=target==='negative'?'positive':'negative';read.textContent='接着收集：零平面'+(target==='negative'?'下':'上')+'方的顶端。';}});
  }else if(task.kind==='terrain'){
   button('保留这对截面证据',()=>{const c=window.R7SceneContext;if(!c)return say('图形正在初始化。');if(c.first>=c.second)return say('先让x₁<x₂，再比较两个输出。');commit({a:c.first,b:c.second,scale:c.scale});});
  }else if(task.kind==='tail'){
   const read=line(''),track=document.createElement('div');track.className='r9-distance';work.prepend(track);let epsilon=.05;
   function update(){const x=Number(document.getElementById('x-slider')?.value||1);read.textContent='X='+x+'，当前距离1/X='+Number((1/x).toFixed(4))+'；要求所有x>X时，距离小于'+epsilon+'。';track.textContent='3 ← 距离 '+Number((1/x).toFixed(4))+' → 3+1/X';}
   getDraft=()=>({epsilon});restoreDraft=s=>{if([.05,.1].includes(s.epsilon))epsilon=s.epsilon;update();};document.getElementById('x-slider')?.addEventListener('input',update);button('采用这个门槛X',()=>{window.R9Scene?.pause();update();commit({x:Number(document.getElementById('x-slider').value),epsilon});});button('换一条误差带',()=>{epsilon=epsilon===.05?.1:.05;update();say('误差要求已改变，再选一个门槛。');});update();
  }else if(task.kind==='projection'){
   let view='angle';getDraft=()=>({view});restoreDraft=s=>{if(['top','side','angle'].includes(s.view)){view=s.view;document.getElementById('preset-'+view)?.click();}};for(const v of ['top','side','angle'])document.getElementById('preset-'+v)?.addEventListener('click',()=>{view=v;});button('保留当前投影观察',()=>observe({view,left:1,right:-1},({top:'俯视只能比较水平位置，输出高度被压掉了。还需要侧视确认左右趋近值。',side:'侧视能看出两侧极限高度1与−1相差2，双侧有限极限不存在。',angle:'斜视同时显示位置与高度。改变相机只改变投影，不改变函数值。'})[view]));
  }else if(task.kind==='point_observe'){
   button('保留点值与附近趋势',()=>{const s=window.R9Scene?.read();if(!s)return say('图形正在初始化。');observe(s,'共同极限仍为1，当前f(0)='+s.value+'。'+(s.value===1?'两者相等，函数连续。':'只改变了点值，附近规则没变；两者不相等，所以不连续。'));});
  }
  const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6;
  function restoreRecord(record){if(!record||typeof record!=='object')return null;
   if(task.kind==='mapping_observe'&&finite(record.x)&&finite(record.y))return {x:record.x,y:record.y,ruleLabel:String(record.ruleLabel||'').slice(0,100),rule:String(record.rule||'').slice(0,40),density:finite(record.density)?record.density:1};
   if(task.kind==='sides'&&finite(record.left)&&finite(record.right))return {left:record.left,right:record.right};
   if(task.kind==='projection'&&['top','side','angle'].includes(record.view))return {view:record.view,left:1,right:-1};
   if(task.kind==='point_observe'&&finite(record.value))return {value:record.value,limit:1};return null;
  }
  window.CQNativeProgress={get:()=>({version:'native-ui-r12-v1',task:id,state:getDraft(),snapshots:snapshots.slice(-4),feedback:feedback.textContent.slice(0,1400),feedbackCount,lastCommit:lastCommit.slice(0,1400),sequence}),
   set:s=>{if(s?.version!=='native-ui-r12-v1'||s.task!==id||!s.state||typeof s.state!=='object')return;const restoring=window.__cqRestoringProgress;window.__cqRestoringProgress=true;
    try{restoreDraft(s.state);snapshots=(Array.isArray(s.snapshots)?s.snapshots:[]).slice(-4).map(restoreRecord).filter(Boolean);if(snapshots.length)renderSnapshots();feedback.textContent=typeof s.feedback==='string'?s.feedback.slice(0,1400):'';feedbackVersion++;exposedFeedbackVersion=feedbackVersion;feedbackCount=Number.isFinite(s.feedbackCount)?Math.max(0,Math.min(10000,Math.trunc(s.feedbackCount))):0;sequence=Number.isFinite(s.sequence)?Math.max(0,Math.min(10000,Math.trunc(s.sequence))):0;lastCommit=typeof s.lastCommit==='string'?s.lastCommit.slice(0,1400):'';}finally{window.__cqRestoringProgress=restoring;}
   }};
  const actions=document.createElement('footer');actions.className='r9-actions';for(const b of [...work.children].filter(n=>n.tagName==='BUTTON'||n.classList.contains('r9-slider')))actions.append(b);
  const content=document.createElement('div');content.className='r9-content';content.append(...guide.childNodes);guide.append(content,actions);
  // Guided constructions remain practice even when their final state is valid.
  work.addEventListener('click',()=>requestAnimationFrame(()=>window.dispatchEvent(new Event('resize'))));
  window.dispatchEvent(new Event('cq:progress-ready'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
