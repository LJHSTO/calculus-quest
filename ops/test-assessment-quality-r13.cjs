'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const bank=require('../lib/assessments/functions-limits-r13'),prior=require('../lib/assessments/functions-limits-r12'),probes=require('../lib/assessments/functions-limits-probes-r13'),oldProbes=require('../lib/assessments/functions-limits-probes-r12');
const figures=require('../lib/assessments/assessment-figures-r13'),commonFigures=require('../lib/assessments/assessment-figures-r11'),root=path.resolve(__dirname,'..');
const secret=['answer','analysis','rubric','referenceAnswer','commentPrompt','hasAnswer'];
for(const form of ['X','Y','Z']){
  const old=prior.forms(form),rows=bank.forms(form),p=bank.variants[form];
  assert.equal(rows.length,12);assert.equal(rows.reduce((sum,q)=>sum+q.points,0),32);assert.equal(rows.filter(q=>q.figure).length,5);assert.equal(rows.filter(q=>q.type==='short_answer').length,4);
  rows.forEach((q,i)=>{assert.match(q.id,/^fl-r13-/);assert.deepEqual(q.answer,old[i].answer);assert.deepEqual(q.options,old[i].options);assert.deepEqual(q.rubric,old[i].rubric);assert.equal(q.referenceAnswer,old[i].referenceAnswer);});
  for(const i of [3,7])assert.match(rows[i].question,/1—3句或数式/);
  for(const i of [9,11]){assert.match(rows[i].question,/①.*②.*③.*④/);assert.match(rows[i].question,/一句话/);assert.equal(rows[i].rubric.length,4);}
  // Recompute the numeric targets independently of the inherited reference text.
  assert.equal((p.a+1)**2-p.a*p.a,2*p.a+1);assert.ok(p.e*.75<p.e&&2*p.e*.75>p.e);assert.equal(2*(p.e/2),p.e);
  assert.equal(2+(p.end-1),1+p.end);assert.equal(p.a+1,3*p.a+1-2*p.a);
  assert(bank.publicForm('pre',form).items.every(q=>secret.every(key=>!(key in q))));
}
const common=bank.ids.flatMap((id,i)=>probes.formative(i));assert.equal(common.length,12);assert.equal(common.filter(q=>q.figure).length,2);
assert.deepEqual(common[4].figure,commonFigures.publicFigure('x-finite-samples'));assert.deepEqual(commonFigures.byId['x-finite-samples'].samples,[[0,0],[1,1],[2,2]]);assert.equal(commonFigures.byId['x-finite-samples'].segments.length,0);assert.match(common[4].question,/x=0、1、2.*0、1、2/);
assert.deepEqual(common[10].figure,commonFigures.publicFigure('z-corner'));assert.deepEqual(commonFigures.byId['z-corner'].segments,[[[2,2],[4,0],[6,2]]]);assert.match(common[10].question,/\|x−4\|/);
let withFigures=0;
for(let index=0;index<6;index++)for(let variant=0;variant<11;variant++){
  const q=probes.raw(index,variant),old=oldProbes.raw(index,variant);assert.equal(q.answer,old.answer);assert.deepEqual(q.options,old.options);assert.match(q.id,/-probe-r13-/);
  if(q.figure){withFigures++;const g=figures.byId[q.figure.id],k=variant+5,L=k+1,key=q.options.find(o=>o.value===q.answer).label;
    if(index===1){assert(g.markers[0].y===2*g.markers[0].x+1);assert(g.markers[1].y!==2*g.markers[1].x+1);for(const [x,y]of g.segments[0])assert.equal(y,2*x+1);assert.equal(key,`只有P在图像上；Q的纵坐标应为${2*k+3}`);}
    else if(index===4){assert.equal(g.segments[0].at(-1)[1],L);assert.equal(g.segments[1][0][1],L+1);assert(g.points.every(p=>p.x===0&&!p.filled));assert.equal(key,`不能，两侧分别趋近${L}和${L+1}`);}
    else{assert.equal(index,5);assert.equal(g.segments[0].at(-1)[1],L);assert.equal(g.segments[1][0][1],L);assert(g.points.some(p=>p.x===0&&p.y===L+2&&p.filled));assert.equal(key,`可以，改为${L}并与共同极限相等`);}
    assert.doesNotMatch(q.figure.alt+q.figure.caption,/正确|答案|只有P|不存在|不能修复|连续的依据/);
  }
}
assert.equal(withFigures,12);
for(let i=0;i<6;i++)for(const stage of ['t0','t1','outcome','return_probe']){const q=probes.publicProbe(i,stage);assert(!('answer'in q)&&!('analysis'in q));const raw=probes.raw(i,{t0:0,t1:1,outcome:2,return_probe:7}[stage]);assert(probes.gradeProbe(i,stage,raw.answer).correct);assert.equal(probes.gradeProbe(i,stage,'__unknown__').score,0);assert.equal(probes.gradeProbe(i,stage,'skip').score,null);}
for(const item of figures.assets()){
  const bytes=fs.readFileSync(path.join(root,item.src));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(bytes.toString('utf8'),item.svg);
  const g=figures.byId[item.id],coords=[...(g.segments||[]).flat(),...(g.points||[]).map(p=>[p.x,p.y]),...(g.markers||[]).map(p=>[p.x,p.y])];
  assert(coords.every(([x,y])=>x>=g.xRange[0]&&x<=g.xRange[1]&&y>=g.yRange[0]&&y<=g.yRange[1]));
}
for(const file of ['functions-limits-r12.js','functions-limits-probes-r12.js','functions-limits-delayed-r12.js','assessment-figures-r11.js']){const rel='lib/assessments/'+file;assert.equal(fs.readFileSync(path.join(root,rel),'utf8').replace(/\r\n/g,'\n'),cp.execFileSync('git',['show','8af40e9:'+rel],{cwd:root,encoding:'utf8'}));}
assert.equal(require('../lib/assessments/functions-limits-delayed-r12').version,'functions-limits-delayed-r12-20261108');
console.log('r13测量专项通过：3卷各12题32分、4生成式目标不减、两短解释与两结构化要点；2共同形成图与12检查图语义坐标/hash正确；所有原答案与旧r12字节不变；延迟沿用未改r12。');
