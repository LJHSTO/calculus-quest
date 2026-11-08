'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=path.join(root,'lib/courseware/functions-limits-r10/native-runtime.js'),original=fs.readFileSync(file,'utf8');
assert(!original.includes('native-ui-r12-v1'),'already installed');let s=original;
const replace=(a,b)=>{assert(s.includes(a),a.slice(0,75));s=s.replace(a,b);};
replace("let sequence=0,feedbackCount=0,feedbackVersion=0,exposedFeedbackVersion=-1,lastCommit='',snapshots=[];","let sequence=0,feedbackCount=0,feedbackVersion=0,exposedFeedbackVersion=-1,lastCommit='',snapshots=[];\n  let getDraft=()=>({}),restoreDraft=()=>{};");
replace('function emit(kind,state,extra={}){const key=', 'function emit(kind,state,extra={}){if(window.__cqRestoringProgress)return;const key=');
replace('function say(text){if(feedback.textContent', 'function say(text){if(window.__cqRestoringProgress)return;if(feedback.textContent');
replace('entries=>{if(entries.some', 'entries=>{if(window.__cqRestoringProgress)return;if(entries.some');
replace('function commit(state){const result=', 'function commit(state){if(window.__cqRestoringProgress)return false;const result=');
const start=s.indexOf('  function observe('),end=s.indexOf('  function plot(',start);assert(start>=0&&end>start);
s=s.slice(0,start)+`  function renderSnapshots(){let list=guide.querySelector('.r9-records');if(!list){list=document.createElement('ol');list.className='r9-records';feedback.before(list);}list.replaceChildren();for(const record of snapshots){const li=document.createElement('li');li.textContent=task.kind==='mapping_observe'?'输入'+record.x+' → 输出'+Number(record.y.toFixed(3))+'；规则：'+record.ruleLabel:task.kind==='sides'?'左'+record.left+' / 右'+record.right+' → '+(record.left===record.right?'共同极限'+record.left:'不相等'):task.kind==='projection'?({top:'俯视：高度被压掉',side:'侧视：极限高度差2',angle:'斜视：位置与高度同时可见'})[record.view]:'共同极限1 / 点值'+record.value+' → '+(record.value===1?'连续':'不连续');list.append(li);}}
  function observe(state,text){if(window.__cqRestoringProgress)return;if(snapshots.some(s=>JSON.stringify(s)===JSON.stringify(state))){say('这组条件已经保留。改变一个相关条件，再比较。');return;}snapshots.push(state);snapshots=snapshots.slice(-4);renderSnapshots();say(text);emit('exploration_observed',{records:snapshots});}
`+s.slice(end);
replace("button('采用这组连线',()=>commit({links}));",`getDraft=()=>({links:links.map(row=>row.slice())});restoreDraft=s=>{for(let i=0;i<3;i++){links[i].splice(0,links[i].length,...[...new Set((Array.isArray(s.links?.[i])?s.links[i]:[]).filter(v=>[0,1,2].includes(v)))].sort());}body.querySelectorAll('tr').forEach((row,i)=>row.querySelectorAll('button').forEach((b,v)=>{b.textContent=links[i].includes(v)?'●':'○';b.setAttribute('aria-pressed',String(links[i].includes(v)));}));};
   button('采用这组连线',()=>commit({links}));`);
replace("button('切换：是否另给点值'",`getDraft=()=>({mode,pointValue});restoreDraft=s=>{if(['hole','assigned'].includes(s.mode))mode=s.mode;if(Number.isFinite(s.pointValue)&&s.pointValue>=-2&&s.pointValue<=5)pointValue=s.pointValue;draw();};
   button('切换：是否另给点值'`);
replace("slider('横坐标x'",`getDraft=()=>({x,y});restoreDraft=s=>{if(Number.isFinite(s.x)&&Math.abs(s.x)<=3)x=s.x;if(Number.isFinite(s.y)&&Math.abs(s.y)<=7)y=s.y;draw();};slider('横坐标x'`);
replace("slider('左标记x₁'",`getDraft=()=>({a,b});restoreDraft=s=>{if(Number.isFinite(s.a)&&Math.abs(s.a)<=3)a=s.a;if(Number.isFinite(s.b)&&Math.abs(s.b)<=3)b=s.b;draw();};slider('左标记x₁'`);
replace("slider('倍率k'",`getDraft=()=>({delta,epsilon,gain});restoreDraft=s=>{if(Number.isFinite(s.delta)&&s.delta>=.01&&s.delta<=1)delta=s.delta;if([.2,.05].includes(s.epsilon))epsilon=s.epsilon;if([1,2,3,4].includes(s.gain))gain=s.gain;update();};slider('倍率k'`);
replace("const run=document.querySelector('.sim-btn');",`getDraft=()=>({read:read.textContent.slice(0,300)});restoreDraft=s=>{if(typeof s.read==='string')read.textContent=s.read.slice(0,300);};const run=document.querySelector('.sim-btn');`);
replace("for(const [key,label]of Object.entries({hole:",`getDraft=()=>({selected,value});restoreDraft=s=>{if(['hole','jump','corner'].includes(s.selected))selected=s.selected;if(Number.isFinite(s.value)&&s.value>=-2&&s.value<=5)value=s.value;update();};
   for(const [key,label]of Object.entries({hole:`);
replace("let target='negative';const read=line('当前收集目标：零平面下方的顶端。');",`let target='negative';const read=line('当前收集目标：零平面下方的顶端。');getDraft=()=>({target});restoreDraft=s=>{if(['negative','positive'].includes(s.target))target=s.target;read.textContent='接着收集：零平面'+(target==='negative'?'下':'上')+'方的顶端。';};`);
replace("document.getElementById('x-slider')?.addEventListener('input',update);",`getDraft=()=>({epsilon});restoreDraft=s=>{if([.05,.1].includes(s.epsilon))epsilon=s.epsilon;update();};document.getElementById('x-slider')?.addEventListener('input',update);`);
replace("let view='angle';for",`let view='angle';getDraft=()=>({view});restoreDraft=s=>{if(['top','side','angle'].includes(s.view)){view=s.view;document.getElementById('preset-'+view)?.click();}};for`);
replace("  const actions=document.createElement('footer');",`  const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6;
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
  const actions=document.createElement('footer');`);
replace("work.addEventListener('click',()=>requestAnimationFrame(()=>window.dispatchEvent(new Event('resize'))));","work.addEventListener('click',()=>requestAnimationFrame(()=>window.dispatchEvent(new Event('resize'))));\n  window.dispatchEvent(new Event('cq:progress-ready'));" );
fs.writeFileSync(file,s);const changed=[];
function walk(dir){for(const n of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,n.name);if(n.isDirectory())walk(p);else if(n.name.endsWith('.html')){const html=fs.readFileSync(p,'utf8');if(!html.includes(original))continue;assert.equal(html.split(original).length,2,'source occurs more than once '+p);fs.writeFileSync(p,html.replace(original,s));changed.push(path.relative(root,p));}}}
walk(path.join(root,'resources/open-maic'));assert.equal(changed.length,24,'all current 24 integrated resources share the same source');
const out=process.env.COURSEWARE_QA_OUT||path.join(root,'tmp/game-progress-r12');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'native源与24嵌入同步.json'),JSON.stringify({source:path.relative(root,file),sourceBefore:crypto.createHash('sha256').update(original).digest('hex'),sourceAfter:crypto.createHash('sha256').update(s).digest('hex'),changed,gradingSourceChanged:false,versionChanged:false},null,2));console.log('native UI hooks与24个嵌入资源同步完成');
