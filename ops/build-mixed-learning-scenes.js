'use strict';
// Six conceptual explorations: old demonstrations remain available. This
// source generates only the six replacement challenge resources and route links.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),routePath=path.join(root,'data/multi-scene-learning-route.json');
const route=JSON.parse(fs.readFileSync(routePath,'utf8')),chapter=route.chapters.find(c=>c.id==='V14-C1');
const lessons=[
 {id:'GH-01-K01',title:'对应关系修理台',lead:'用按钮添加或移除一条对应，比较“一对多”与“多对一”。',goal:'同一个输入只能有一个输出；不同输入可以有相同输出。',kind:'mapping'},
 {id:'GH-01-K02',title:'坐标取证台',lead:'选一个输入，在图上找到它的输出。',goal:'点 (x, y) 在图像上，当且仅当 y=f(x)。横坐标和纵坐标不能任意调换。',kind:'coordinate'},
 {id:'GH-01-K03',title:'趋势对照窗',lead:'把整条曲线上下移动，观察变化方向是否改变。',goal:'看 x 增大时 y 怎样变化；低于横轴不等于下降。',kind:'trend'},
 {id:'GH-02-K01',title:'靠近观察站',lead:'从两侧取越来越近的点，再单独改变中心点值。',goal:'附近的趋近趋势与中心点的函数值是两件事。有限数表提供线索，不构成一般性证明。',kind:'approach'},
 {id:'GH-02-K02',title:'两侧会合实验室',lead:'在“会合”和“跳跃”之间切换，试试只改点值会怎样。',goal:'左右极限相等时双侧极限才存在；改变一个点不能修复两侧的跳跃。',kind:'sides'},
 {id:'GH-02-K03',title:'缺口修复工作台',lead:'先修复一个点，再比较不能只靠改点修好的情况。',goal:'连续需要点值存在、极限存在且相等。局部的点修复不能改变两侧趋势。',kind:'repair'}
];
const css=`*{box-sizing:border-box}body{margin:0;color:#203a41;background:#f5f8f7;font:16px/1.65 'Microsoft YaHei','PingFang SC',sans-serif}main{max-width:1020px;margin:auto;padding:clamp(18px,3vw,36px)}header small{color:#247467;letter-spacing:.08em}h1{font-size:clamp(23px,3vw,32px);margin:8px 0}p{margin:8px 0}.layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(260px,1fr);gap:20px;margin:22px 0}.card{background:white;border:1px solid #dbe6e2;border-radius:16px;padding:20px;min-width:0}button{font:inherit;background:#fff;color:#224b43;border:1px solid #b2cec3;border-radius:10px;padding:10px 14px;cursor:pointer;min-height:44px;margin:4px}button:hover{background:#eef7f2}button[aria-pressed=true],button.primary{background:#196c5c;color:#fff}button:focus-visible,input:focus-visible{outline:3px solid #de9e30;outline-offset:3px}button:disabled{opacity:.65;cursor:default}svg{width:100%;height:auto;display:block}svg text{font-size:15px;fill:#274047}input[type=range]{width:100%;min-height:36px;accent-color:#196c5c}label{display:block;margin-top:12px}.result{min-height:55px;padding:12px 0;font-weight:600}.note{border-left:3px solid #b8cfc4;padding-left:14px;color:#52655f}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:8px;border-bottom:1px solid #dbe6e2;text-align:center}.support-anchor{width:100%;min-width:0}.mapping{display:grid;grid-template-columns:1fr 1fr;gap:16px}.mapping div{background:#eff5f2;border-radius:10px;padding:16px;text-align:center}@media(max-width:650px){.layout{grid-template-columns:1fr}main{padding:14px}.card{padding:16px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
function runtime(){
 const cfg=JSON.parse(document.getElementById('lesson').textContent),view=document.getElementById('view'),controls=document.getElementById('controls'),result=document.getElementById('result'),check=document.getElementById('check');
 let mode=0,level=0,shift=-3,x=1,point=5,chosen=null,attempt=0;
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{fn();chosen=null;result.textContent='';render();};return b;};
 const emit=(type,data)=>window.OpenMaicLearningEvidence?.emit(type,{...data,independent:false});
 function range(label,value,min,max,fn){const l=document.createElement('label');l.textContent=label;const r=document.createElement('input');r.type='range';r.min=min;r.max=max;r.step=1;r.value=value;r.setAttribute('aria-label',label);r.oninput=()=>{fn(Number(r.value));chosen=null;result.textContent='';renderView();};r.onchange=()=>emit('parameter_commit',{parameter:cfg.kind,value:Number(r.value)});l.append(r);return l;}
 const X=x=>200+x*45,Y=y=>180-y*25;
 function graph(lines,dots=[]){return `<svg viewBox="0 0 400 340" role="img" aria-label="${cfg.goal}"><path d="M20 180H380M200 20V320" stroke="#9baea6"/><text x="378" y="200">x</text><text x="214" y="20">y</text><text x="185" y="200">0</text>${[-3,-2,-1,1,2,3].map(t=>`<text x="${X(t)-5}" y="200">${t}</text><text x="177" y="${Y(t)+5}">${t}</text>`).join('')}${lines.map(l=>`<path d="${l}" fill="none" stroke="#1d7462" stroke-width="3"/>`).join('')}${dots.map(d=>`<circle cx="${X(d[0])}" cy="${Y(d[1])}" r="7" fill="${d[2]||'#d38c21'}" stroke="#244e43" stroke-width="2"/>`).join('')}</svg>`;}
 function renderView(){
  if(cfg.kind==='mapping'){view.innerHTML=`<div class="mapping"><div>输入 1 →</div><div>${mode?'输出 2 和 3':'输出 2'}</div><div>输入 2 →</div><div>输出 2</div></div><p class="note">${mode?'输入 1 同时对应两个不同的输出。':'两个不同的输入都对应输出 2。'}</p>`;}
  if(cfg.kind==='coordinate'){view.innerHTML=graph([`M${X(-2)},${Y(-3)} L${X(2)},${Y(5)}`],[[x,2*x+1]])+`<p>规则 f(x)=2x+1　当前点 (${x}, ${2*x+1})</p>`;}
  if(cfg.kind==='trend'){view.innerHTML=graph([`M${X(-2)},${Y(-2+shift)}L${X(2)},${Y(2+shift)}`])+`<p>y=x${shift>=0?'+':''}${shift}，观察区间：−2≤x≤2。</p>`;}
  if(cfg.kind==='approach'){const delta=[.5,.1,.01,.001][level];view.innerHTML=`<table><caption>规则：x≠1 时 f(x)=x+1；f(1)=${point}</caption><thead><tr><th>方向</th><th>x</th><th>f(x)</th></tr></thead><tbody><tr><td>左侧</td><td>${(1-delta).toFixed(3)}</td><td>${(2-delta).toFixed(3)}</td></tr><tr><td>右侧</td><td>${(1+delta).toFixed(3)}</td><td>${(2+delta).toFixed(3)}</td></tr></tbody></table><p>中心点：(1, ${point})；两侧数值围绕 2 变化。</p>`;}
  if(cfg.kind==='sides'||cfg.kind==='repair'){const right=mode?4:2;view.innerHTML=graph([`M${X(-3)},${Y(-1)}L${X(0)},${Y(2)}`,`M${X(0)},${Y(right)}L${X(2)},${Y(right+2)}`],[[0,2,'white'],[0,right,'white'],[0,point]])+`<p>左极限 2；右极限 ${right}；点值 f(0)=${point}。</p>`;}
 }
 function render(){
  renderView();controls.replaceChildren();const tools=document.createElement('div');controls.append(tools);
  if(cfg.kind==='mapping')tools.append(button(mode?'移除多出的箭头':'再加一条 1 → 3 的箭头',()=>{mode=1-mode;emit('parameter_commit',{parameter:'mapping',value:mode});}));
  if(cfg.kind==='coordinate')for(const t of [-2,-1,0,1,2]){const b=button(`取 x=${t}`,()=>{x=t;emit('parameter_commit',{parameter:'input_x',value:x});});b.setAttribute('aria-pressed',String(t===x));tools.append(b);}
  if(cfg.kind==='trend')tools.append(range('整体上下移动',shift,-3,3,v=>shift=v));
  if(cfg.kind==='approach'){tools.append(button('再靠近一步',()=>{level=Math.min(3,level+1);emit('parameter_commit',{parameter:'distance_step',value:level});}),button('回到较远处',()=>{level=0;emit('parameter_commit',{parameter:'distance_step',value:0});}),button('只改变中心点值',()=>{point=point===5?2:5;emit('parameter_commit',{parameter:'point_value',value:point});}));}
  if(cfg.kind==='sides'||cfg.kind==='repair')tools.append(button(mode?'换成可会合的两侧':'换成跳跃的两侧',()=>{mode=1-mode;emit('parameter_commit',{parameter:'case',value:mode});}),range('只改变中心点高度',point,0,5,v=>point=v));
  const q=document.createElement('p');q.textContent=({mapping:'当前对应关系是不是函数？',coordinate:'只要点在图像上，交换两个坐标后就一定还在图像上吗？',trend:'向右看，当前图像在这个区间怎样变化？',approach:'只改变 f(1)，会改变 x 趋近 1 时的极限吗？',sides:'当前双侧极限存在吗？',repair:'当前图像在 x=0 处连续吗？'})[cfg.kind];controls.append(q);
  const opts=cfg.kind==='trend'?['上升','下降','不变']:['是','否'];if(cfg.kind==='coordinate'){opts[0]='一定在';opts[1]='不一定';}if(cfg.kind==='approach'){opts[0]='会改变';opts[1]='不会改变';}
  const choices=document.createElement('div');choices.setAttribute('role','group');choices.setAttribute('aria-label','记录我的观察');opts.forEach((t,i)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.setAttribute('aria-pressed','false');b.onclick=()=>{chosen=i;choices.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));};choices.append(b);});controls.append(choices);
 }
 check.onclick=()=>{if(chosen===null){result.textContent='先选一个观察结论；也可以继续探索。';return;}const answer=cfg.kind==='mapping'?mode:cfg.kind==='coordinate'?1:cfg.kind==='trend'?0:cfg.kind==='approach'?1:cfg.kind==='sides'?mode:(mode===0&&point===2?0:1);const correct=chosen===answer;attempt++;
  window.OpenMaicLearningEvidence?.recordChallenge({challenge_id:cfg.id+'-concept-'+mode,is_correct:correct,independent:false,attempt_number:attempt,response:chosen,expected:answer,parameters:{mode,level,shift,x,point},evidence_scope:'assisted_concept_exploration',feedback_version:'mixed-20261025-v1'});
  result.textContent=(correct?'观察吻合。':'再核对一下。')+cfg.goal;check.disabled=true;setTimeout(()=>{check.disabled=false;},500);
 };
 render();
}
const target=path.join(root,'resources/open-maic/函数极限混合探索');fs.mkdirSync(target,{recursive:true});
for(const c of lessons){const kp=chapter.modules.flatMap(m=>m.knowledgePoints).find(k=>k.id===c.id),old=kp.resourceCandidates.find(r=>r.type==='game');
 let contract;if(old.root==='open-maic/函数极限混合探索'){const html=fs.readFileSync(path.join(target,old.file),'utf8');contract=JSON.parse(html.match(/id="openmaic-semantic-contract"[^>]*>([\s\S]*?)<\/script>/)[1]);}else{const html=fs.readFileSync(path.join(root,'resources',old.root,old.file),'utf8');contract=JSON.parse(html.match(/id="openmaic-semantic-contract"[^>]*>([\s\S]*?)<\/script>/)[1]);}
 Object.assign(contract,{contract_revision:'2026-10-25',course_version:'mixed-concept-exploration-v1',resource_title:c.title,learning_objective:c.goal,observable_evidence:'参数探索与学生提交的概念判断；不根据拖动次数推断掌握或动机',evidence_events:['scene_entered','parameter_commit','attempt_submitted','challenge_result']});
 Object.assign(contract.capabilities,{controls:['button','range'],reports_attempt:true,reports_challenge:true,reports_hint:false,reports_reset:false,judges_correctness:true,requires_webgl:false,requires_network:false,keeps_local_state:false});contract.safe_entry_points.resume_supported=false;contract.assessment_restrictions.independent_evidence_allowed=false;
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.title}</title><style>${css}</style><script type="application/json" id="openmaic-semantic-contract">${JSON.stringify(contract)}</script></head><body><main><header><small>函数与极限 · 概念探索</small><h1>${c.title}</h1><p>${c.lead}</p></header><div class="layout"><section class="card" id="view" aria-label="数学关系可视化"></section><section class="card"><div id="controls"></div><button class="primary" id="check" type="button">核对我的观察</button><p class="result" id="result" role="status"></p><small>这是可反复探索的学习活动，不计入前后测成绩。</small></section></div><section class="support-anchor" data-cq-support-anchor></section><details class="note"><summary>这项探索帮助我理解什么？</summary><p>${c.goal}</p></details></main><script type="application/json" id="lesson">${JSON.stringify(c)}</script><script>(${runtime.toString()})();</script></body></html>`;
 fs.writeFileSync(path.join(target,c.id+'.html'),html);Object.assign(old,{root:'open-maic/函数极限混合探索',file:c.id+'.html',title:c.title,description:c.lead+' '+c.goal,
  teachingActions:[{id:c.id+'-mixed-intro',type:'speech',text:c.lead+' 可以先自由探索，再按需要点击“核对我的观察”。'},{id:c.id+'-mixed-purpose',type:'speech',text:c.goal}]});
}
const serialized=JSON.stringify(route,null,2)+'\n';if(fs.readFileSync(routePath,'utf8')!==serialized)fs.writeFileSync(routePath,serialized);console.log('已生成6项概念探索；原讲解、模拟、关系图与视图保留。');
