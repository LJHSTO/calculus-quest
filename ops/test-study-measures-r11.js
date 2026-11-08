'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const bank=require('../lib/assessments/functions-limits-r11'),old=require('../lib/assessments/functions-limits-r10'),delayed=require('../lib/assessments/functions-limits-delayed-r11'),figures=require('../lib/assessments/assessment-figures-r11'),reg=require('../lib/assessments/regulation-transfer-r11');
const root=path.resolve(__dirname,'..'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const before=JSON.stringify(old.forms('X'));
for(const form of ['X','Y','Z']){
 const qs=bank.forms(form);assert.equal(qs.length,12);assert.equal(qs.reduce((s,q)=>s+q.points,0),32);assert.equal(qs.filter(q=>q.type==='single').length,8);assert.equal(qs.filter(q=>q.figure).length,5);
 assert.equal(new Set(qs.map(q=>q.id)).size,12);for(const id of bank.ids)assert.equal(qs.filter(q=>q.knowledgePointId===id).length,2);
 for(const q of qs){assert.equal(q.instrumentVersion,bank.version);if(q.type==='single'){assert.equal(q.options.filter(o=>q.answer.includes(o.value)).length,1);}else assert.equal(q.rubric.length,4);}
 const pub=bank.publicForm('pre',form);assert.equal(pub.maxScore,32);assert(!pub.items.some(q=>['answer','analysis','rubric','referenceAnswer','commentPrompt'].some(k=>k in q)));
 const p=bank.variants[form],f=form.toLowerCase();assert.deepEqual(figures.byId[f+'-point-membership'].markers.map(x=>[x.x,x.y]),[[p.a,2*p.a+1],[p.a+1,2*p.a+1]]);
 assert.deepEqual(figures.byId[f+'-point-and-nearby'].points.map(x=>[x.x,x.y,x.filled]),[[p.t,2*p.t+1,false],[p.t,p.c,true]]);
 assert.deepEqual(figures.byId[f+'-one-sided'].points.map(x=>[x.x,x.y,x.filled]),[[1,p.b+1,false],[1,p.b+6,true]]);
}
assert.equal(JSON.stringify(old.forms('X')),before);assert.equal(delayed.retention.length,8);assert.equal(delayed.transfer.length,6);assert.equal(delayed.transfer.filter(q=>q.figure).length,3);
for(const q of [...delayed.retention,...delayed.transfer]){assert.equal(q.instrumentVersion,delayed.version);assert.equal(q.options.filter(o=>q.answer.includes(o.value)).length,1);}
const xs=bank.forms('X'),ys=bank.forms('Y');for(let i=0;i<12;i++){assert.equal(xs[i].pairId,ys[i].pairId);assert.equal(xs[i].points,ys[i].points);assert.equal(xs[i].type,ys[i].type);assert.equal(Boolean(xs[i].figure),Boolean(ys[i].figure));assert.equal(xs[i].equivalence.constructId,ys[i].equivalence.constructId);}
for(const asset of figures.assets()){
 assert.match(asset.svg,/^<svg /);assert(!/<script|foreignObject|(?:href|src)=["']https?:|NaN|undefined/u.test(asset.svg));assert(!/因此|所以|正确答案|选[ABCD]|不连续|连续|极限为|趋近于/u.test(asset.alt));
 assert.equal(asset.sha256,sha(asset.svg));assert.equal(fs.readFileSync(path.join(root,asset.file),'utf8'),asset.svg);
 const g=figures.byId[asset.id];for(const pts of g.segments||[])for(const [x,y]of pts){assert(x>=g.xRange[0]&&x<=g.xRange[1]);assert(y>=g.yRange[0]&&y<=g.yRange[1]);}
}
assert.equal(figures.assets().length,22);
assert.equal(reg.publicInstrument().order.reduce((s,t)=>s+t.budgetSeconds,0)+120+60+60,840);
for(const id of reg.taskOrder){
 const p=reg.publicTask(id);assert(!JSON.stringify(p).includes('mathKeys'));assert(!('criteria' in p));
 if(p.kind==='behavior'){
  for(const phase of ['attempt','check']){const q=reg.publicTask(id,phase).question;assert(!('answer'in q)&&!('analysis'in q));}
  assert.equal(reg.publicTask(id,'support',{level:0}).help,null);assert.equal(reg.publicTask(id,'support',{level:2}).help.level,2);
  assert.equal(reg.gradeMath(id,'initial','skip').score,null);assert.equal(reg.gradeMath(id,'initial','unknown').score,0);assert.throws(()=>reg.gradeMath(id,'initial','E'));
 }
}
const keys=reg.ratingCards();const mathAnswers=Object.fromEntries(keys.filter(x=>x.kind==='behavior').map(x=>[x.id,{initial:x.mathKeys.initial.answer,check:x.mathKeys.check.answer}]));assert.equal(reg.mathSummary(mathAnswers).score,4);assert.equal(reg.mathSummary({}).score,null);
const rated=Object.fromEntries(reg.taskOrder.map(id=>[id,[2,2,2]]));assert.equal(reg.summarizeRatings(rated).behaviorScore,12);assert.equal(reg.summarizeRatings(rated).scenarioScore,12);assert.equal(reg.summarizeRatings(rated).combinedScore,null);
assert.equal(reg.summarizeRatings({...rated,sensor:[2,null,2]}).behaviorScore,null);assert.equal(reg.summarizeRatings({...rated,pause_case:[0,0,0]}).behaviorScore,12);assert.throws(()=>reg.summarizeRatings({...rated,sensor:[3,2,2]}));
assert.throws(()=>reg.normalizeSubmission('sensor',{arm:'B'}));assert.throws(()=>reg.normalizeSubmission('sensor',{initialReason:'字'.repeat(601)}));assert.throws(()=>reg.normalizeSubmission('sensor',{helpChoice:'forced'}));assert.deepEqual(reg.normalizeSubmission('sensor',{skipped:true},{complete:true}),{skipped:true});
const report={passed:true,at:new Date().toISOString(),forms:3,itemsPerForm:12,figureItemsPerForm:5,figures:22,retention:8,transfer:6,regulationBudgetSeconds:840,regulationPrimaryMax:12,scenarioSecondaryMax:12,mathSeparateMax:4,checks:['图形坐标、空实点、版本及成对覆盖一致','替代描述提供同等图形信息，不输出选项答案或连续性结论','公开材料无答案与评分量规','行为与情境分别盲评，数学分不自动计入调节分','缺失不转成零，旧r10对象未改动'],limits:['未进行教师审题、真人计时或经验等值验证','本测试不证明浏览器已渲染图片，需父任务做UI集成验证']};
const out=path.join(root,'output/学习体验与调节迁移-r11-20261107');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'测量模块自检.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
