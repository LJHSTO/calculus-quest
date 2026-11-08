'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const tool=require('./functions-limits-blind-scoring-r11'),bank=require('../lib/assessments/functions-limits-r11'),figures=require('../lib/assessments/assessment-figures-r11'),reg=require('../lib/assessments/regulation-transfer-r11');
const output=path.resolve(__dirname,'../output/学习体验与调节迁移-r11-20261107');fs.mkdirSync(output,{recursive:true});
const out=fs.mkdtempSync(path.join(output,'盲评合成验收-'));
const q=bank.questions('post','Y').find(x=>x.type==='short_answer');
// The current production short items are textual. This synthetic figure-bearing
// item tests the generic frozen-figure path without changing the actual bank.
const syntheticQuestion={...q,figure:figures.publicFigure('y-point-and-nearby')};
const exported={quiz_results:[{id:'result-secret',user_id:'identity-private',question_id:q.id,phase:'post',arm:'B',response:'合成回答：分别比较左右与点值。'}]};
const p=tool.prepare(exported,path.join(out,'数学'), 'math',{questions:[syntheticQuestion]});assert.equal(p.rating.items.length,1);
const a=structuredClone(p.rating),b=structuredClone(p.rating);a.rater='R1';b.rater='R2';a.items[0].points=[1,1,0,1];b.items[0].points=[1,1,0,1];assert.equal(tool.reconcile(p.mapping,a,b).records[0].score,3);
assert(!tool.html(a).includes('identity-private'));assert(!tool.html(a).includes('result-secret'));assert(tool.html(a).includes('<svg'));assert(tool.html(a).includes(figures.publicFigure('y-point-and-nearby').sha256));
const altered=structuredClone(a);altered.items[0].material.figures[0].alt='更改后的描述';assert.throws(()=>tool.validateRating(altered,p.mapping),/不得修改/);
b.items[0].points=[0,1,0,1];assert.equal(tool.reconcile(p.mapping,a,b).records[0].status,'needs_adjudication');const c=structuredClone(a);c.rater='ADJ';c.items[0].points=[1,0,0,1];assert.equal(tool.reconcile(p.mapping,a,b,c).records[0].score,2);
const s={runId:'run-private',instrumentVersion:reg.version,status:'submitted',startedAt:'2026-11-01T00:00:00Z',responses:{sensor:{initialAnswer:'C',initialReason:'合成：分别看',helpChoice:'hint',actionChoice:'self_check',checkAnswer:'A',reflectionDecision:'stop',reflectionReason:'合成：能说明'},junction:{initialAnswer:'B',checkAnswer:'D',reflectionDecision:'continue'},pause_case:{choice:'continue',reason:'合成：有独立证据',verification:'换图核验'},worked_example_case:{choice:'hint',reason:'合成：有缺口',verification:'撤去例子'}},events:[],receipts:[{id:'receipt-private',taskId:'sensor',kind:'help',level:1,contentHash:tool.hash(reg.publicTask('sensor','support',{level:1}).help),issuedAt:'2026-11-01T00:01:00Z',visibleAt:'2026-11-01T00:01:02Z'}]};
const r=tool.prepare({regulationTransfer:{sessions:[s]}},path.join(out,'调节'),'regulation');assert.equal(r.rating.items.length,4);assert.equal(r.rating.items.reduce((n,x)=>n+x.material.figures.length,0),4);assert(!tool.html(r.rating).includes('run-private'));assert(!tool.html(r.rating).includes('receipt-private'));
const ra=structuredClone(r.rating),rb=structuredClone(r.rating);ra.rater='R1';rb.rater='R2';for(const item of ra.items)item.points=[2,1,2];for(const item of rb.items)item.points=[2,1,2];const result=tool.reconcile(r.mapping,ra,rb);assert.equal(result.summaries[0].behaviorScore,10);assert.equal(result.summaries[0].scenarioScore,10);assert.equal(result.summaries[0].combinedScore,null);
const missing=ra.items.find(x=>x.material.title.includes('传感器'));missing.points=[2,null,2];missing.missingReason='unscorable';const missingB=rb.items.find(x=>x.blindId===missing.blindId);missingB.points=[2,null,2];missingB.missingReason='unscorable';assert.equal(tool.reconcile(r.mapping,ra,rb).summaries[0].behaviorScore,null);
fs.writeFileSync(path.join(out,'验收回执.json'),JSON.stringify({passed:true,at:new Date().toISOString(),checks:['合成短答带真实SVG可打开','图形字节和材料hash防篡改','评分材料无身份组别元字段','双评分歧、独立裁决、缺失不补0','四个调节任务及4张真图、两种12分分别汇总'],scope:'合成数据，不修改生产题库或真实被试数据'},null,2));console.log(JSON.stringify({passed:true,directory:out}));
