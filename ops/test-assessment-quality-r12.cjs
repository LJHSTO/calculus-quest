'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const bank=require('../lib/assessments/functions-limits-r12'),prior=require('../lib/assessments/functions-limits-r11');
const registry=require('../lib/assessments/functions-limits-registry'),probes=require('../lib/assessments/functions-limits-probes-r12');
const delayed=require('../lib/assessments/functions-limits-delayed-r12'),outcomes=require('../lib/proactive-outcomes/functions-limits-r12');
const adapter=require('../lib/proactive-policy/adapters/functions-limits-r12'),oldAdapter=require('../lib/proactive-policy/adapters/functions-limits-r11');
const figures=require('../lib/assessments/assessment-figures-r11');
const initial=JSON.stringify(['X','Y','Z'].map(prior.forms));
const keyLabel=q=>q.options.find(o=>o.value===(Array.isArray(q.answer)?q.answer[0]:q.answer)).label;
function validChoices(q){
  const real=q.options.filter(o=>!o.value.startsWith('__'));
  assert.equal(real.length,4);assert.equal(new Set(real.map(o=>o.label)).size,4);
  assert.ok(real.some(o=>o.value===(Array.isArray(q.answer)?q.answer[0]:q.answer)));
  assert.ok(!q.options.some(o=>o.value==='__skip__'));
}
function distribution(rows){return rows.reduce((out,q)=>{const key=Array.isArray(q.answer)?q.answer[0]:q.answer;out[key]=(out[key]||0)+1;return out;},{});}
for(const form of ['X','Y','Z']){
  const qs=bank.forms(form),p=bank.variants[form];
  assert.equal(qs.length,12);assert.equal(qs.reduce((n,q)=>n+q.points,0),32);
  assert.equal(qs.filter(q=>q.figure).length,5);assert.equal(qs.filter(q=>q.type==='short_answer').length,4);
  for(const id of bank.ids)assert.equal(qs.filter(q=>q.knowledgePointId===id).length,2);
  assert.deepEqual(Object.values(distribution(qs.filter(q=>q.type==='single'))).sort(),[2,2,2,2]);
  const expected=[/不违反/,/不能，经过这两个记录点/,/只有甲/,null,/不能，观测点之间/,/能否定.*但不能证明/,new RegExp('^'+(2*p.t+1)+'$'),null,new RegExp(`左侧${p.b+1}、右侧${p.b+1}`),null,/左右趋近值与实际点值相等/,null];
  qs.forEach((q,i)=>{assert.match(q.id,/^fl-r12-/);if(q.type==='single'){validChoices(q);assert.match(keyLabel(q),expected[i]);assert.equal(q.options.at(-1).value,'__unknown__');}else{assert.equal(q.rubric.length,4);assert.equal(q.rubric.reduce((n,c)=>n+c.points,0),4);}});
  // Independently recompute the four explanation keys and counterexample inequalities.
  assert.equal((p.a*p.a+2*p.a+1-p.a*p.a)/(p.a+1-p.a),2*p.a+1);
  const counter=p.e*.75;assert.ok(counter<p.e&&2*counter>=p.e);assert.ok(p.e/2>0);
  assert.equal(2+(p.end-1),1+p.end);assert.equal(p.a+1,3*p.a+1-2*p.a);
  const publicRows=bank.publicForm('pre',form).items;
  assert.ok(publicRows.every(q=>!['answer','analysis','referenceAnswer','rubric','commentPrompt','hasAnswer'].some(k=>k in q)));
  assert.doesNotMatch(bank.publicForm('pre',form).instructions,/暂不作答|跳过/);
  qs[0].options[0].label='变更只影响本次对象';
}
assert.equal(JSON.stringify(['X','Y','Z'].map(prior.forms)),initial);
const commons=bank.ids.flatMap((id,index)=>{
  const rows=probes.formative(index);assert.equal(rows.length,2);assert.equal(new Set(rows.map(q=>q.subSkill)).size,2);
  rows.forEach(q=>{validChoices(q);assert.equal(q.points,1);assert.match(q.id,/^fl-r12-formative-/);});return rows;
});
assert.deepEqual(Object.values(distribution(commons)).sort(),[3,3,3,3]);
for(let index=0;index<6;index++){
  const seen=[],keys=[];
  for(let variant=0;variant<8;variant++){
    const q=probes.raw(index,variant),k=variant+5,L=k+1;validChoices(q);
    const expected=[String(k+1),`只有P在图像上；Q的纵坐标应为${2*k+3}`,'已经否定包含这两点的区间严格上升',String(Number((variant===0?.07:(variant+1)*.1).toFixed(4))),`不能，两侧分别趋近${L}和${L+1}`,`可以，改为${L}并与共同极限相等`];
    assert.equal(keyLabel(q),expected[index]);if(index===3)assert.match(q.prompt,/输入误差的绝对值限制为小于正半径r/);
    const check=adapter.nextVerificationCheck(bank.ids[index],'L2',seen.at(-1),seen);assert.ok(check);assert.equal(check.id,q.id+'-support');assert.ok(!('answer'in check));
    const graded=adapter.gradeVerificationCheck({knowledgePointId:bank.ids[index],supportLevel:'L2',checkId:check.id,response:q.answer});assert.equal(graded.correct,true);seen.push(check.id);keys.push(q);
  }
  assert.equal(adapter.nextVerificationCheck(bank.ids[index],'L2',seen.at(-1),seen),null);
  assert.deepEqual(Object.values(distribution(keys)).sort(),[2,2,2,2]);
  const old=oldAdapter.nextVerificationCheck(bank.ids[index],'L2');
  assert.deepEqual(adapter.publicVerificationCheck(bank.ids[index],'L2',old.id),old);
  for(const option of old.options)assert.deepEqual(adapter.gradeVerificationCheck({knowledgePointId:bank.ids[index],supportLevel:'L2',checkId:old.id,response:option.value}),oldAdapter.gradeVerificationCheck({knowledgePointId:bank.ids[index],supportLevel:'L2',checkId:old.id,response:option.value}));
}
assert.equal(delayed.retention.length,8);assert.equal(delayed.transfer.length,6);
assert.deepEqual(Object.values(distribution(delayed.retention)).sort(),[2,2,2,2]);
assert.deepEqual(Object.values(distribution(delayed.transfer)).sort(),[1,1,2,2]);
for(const stage of ['retention','transfer']){
  delayed[stage].forEach(validChoices);
  const correct=Object.fromEntries(delayed[stage].map(q=>[q.id,q.answer[0]]));assert.equal(outcomes.grade(stage,correct).score,delayed[stage].length);
  assert.equal(outcomes.grade(stage,{}),null);
  const first=delayed[stage][0].id;assert.equal(outcomes.grade(stage,{...correct,[first]:'__unknown__'}).score,delayed[stage].length-1);
  assert.equal(outcomes.grade(stage,{...correct,[first]:'skip'}).complete,false);
  assert.ok(outcomes.publicStage(stage).items.every(q=>!('answer'in q)&&!('analysis'in q)));
}
for(const version of registry.versions)assert.equal(outcomes.forVersion(registry.delayedVersion(version)).version,registry.delayedVersion(version));
assert.equal(registry.versionForRun({studyVersion:'learner-functions-r11-old'}),prior.version);
assert.equal(registry.versionForRun({assessmentVersion:'not-installed'}),null);
assert.equal(Object.keys(registry.verifyFigureAssets(process.cwd())).length,22);
for(const form of ['X','Y','Z']){
  const p=bank.variants[form],prefix=form.toLowerCase();
  const member=figures.byId[prefix+'-point-membership'];
  assert.deepEqual(member.segments,[[[0,1],[p.a+2,2*p.a+5]]]);
  assert.equal(member.markers[0].y,2*member.markers[0].x+1);assert.notEqual(member.markers[1].y,2*member.markers[1].x+1);
  const samples=figures.byId[prefix+'-finite-samples'];assert.equal(samples.segments.length,0);assert.equal(samples.samples.length,3);
  const near=figures.byId[prefix+'-point-and-nearby'];assert.ok(near.points.some(pnt=>pnt.x===p.t&&pnt.y===2*p.t+1&&!pnt.filled));assert.ok(near.points.some(pnt=>pnt.x===p.t&&pnt.y===p.c&&pnt.filled));
  const sides=figures.byId[prefix+'-one-sided'];assert.equal(sides.segments[0][1][1],sides.segments[1][0][1]);assert.notEqual(sides.points.find(pnt=>pnt.filled).y,sides.segments[0][1][1]);
}
// Compare Git-normalized bytes so a Windows checkout's CRLF is not a material change.
for(const file of ['lib/assessments/functions-limits-r10.js','lib/assessments/functions-limits-r11.js','lib/assessments/functions-limits-delayed-r11.js','lib/assessments/functions-limits-probes-r10.js','lib/assessments/assessment-figures-r11.js']){
  const frozen=cp.execFileSync('git',['show','033456e:'+file]),normalized=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');assert.equal(crypto.createHash('sha256').update(normalized).digest('hex'),crypto.createHash('sha256').update(frozen).digest('hex'));
}
console.log('r12题库通过：36核心题/12共同形成题/14延迟题/48支架检查、选项平衡、独立数学答案、22图哈希与坐标、旧题Git内容保留、历史检查判分兼容、公共投影不含答案。');
