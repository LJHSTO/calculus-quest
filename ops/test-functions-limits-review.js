"use strict";
const assert = require("node:assert/strict");
const bank = require("../lib/assessments/functions-limits-r2");
const route = require("../data/multi-scene-learning-route.json");
const assessment = require("../lib/course-assessment");
const adapter = require("../lib/proactive-policy/adapters/functions-limits-r2");
const outcome = require("../lib/proactive-outcomes/functions-limits");
const transfer = require("../lib/assessments/functions-limits-transfer-r4");
const chapter = route.chapters.find(c => c.id === "V14-C1");
// Independently solved keys, primary form followed by its two variants.
const keys = [
  ["BBA","BBB","AAB","BBA","CBA"],
  ["BBA","AAA","BBB","CBA","ABB"],
  ["BBA","BBB","CCC","ABA","BBB"],
  ["ABC","BBB","BBA","CBA","BBC"],
  ["ABA","CCC","BBB","BBB","BBB"],
  ["BBB","BBB","CCA","AAA","CBC"]
];
let checks = 0;
for (const [i, kp] of bank.ids.entries()) for (let l = 1; l <= 5; l++) {
  let last = "";
  for (let f = 0; f < 3; f++) {
    const q = adapter.nextVerificationCheck(kp, `L${l}`, last); last = q.id;
    const correct = q.options.filter(o => adapter.gradeVerificationCheck({knowledgePointId:kp,supportLevel:`L${l}`,checkId:q.id,response:o.value})?.correct).map(o=>o.value);
    assert.deepEqual(correct, [keys[i][l-1][f]], q.id);
    assert.equal(q.options.length, 5); checks++;
  }
}
assert.equal(checks,90);
for (const phase of ["pre","post"]) {
  const qs = bank.questions(phase), actual = chapter.flow[`${phase}Quiz`].questions;
  for (const [i,q] of qs.entries()) {
    assert.equal(actual[i].question,q.question);
    assert.deepEqual(actual[i].options,q.options);
    assert.deepEqual(actual[i].answer,q.answer);
    assert.equal(actual[i].instrumentVersion,bank.version);
    if(q.type!=="short_answer") {
      assert.equal(assessment.scoreObjectiveQuestion(q,q.answer).score,q.points);
      assert.equal(assessment.scoreObjectiveQuestion(q,"__unknown__").score,0);
    } else assert.equal(q.rubric.reduce((n,r)=>n+r.points,0),q.points);
  }
  assert.equal(qs.reduce((n,q)=>n+q.points,0),100);
  for(const value of ["A","B","C","D"])assert.equal(qs.slice(0,8).filter(q=>q.answer[0]===value).length,2);
  assert.match(qs[0].question,/唯一性/);
}
assert.doesNotMatch(bank.questions('pre')[11].question,/内点/,'缺失函数值的点不可预设为定义域内点');
assert.match(bank.questions('pre')[11].question,/左右两侧/);
const points = chapter.modules.flatMap(m=>m.knowledgePoints);
assert.equal(points.flatMap(p=>p.formativeQuiz.questions).length,12);
assert.match(points[2].formativeQuiz.questions[0].question,/直线段/);
assert.match(points[5].formativeQuiz.questions[1].question,/内点/);
assert.equal(outcome.version,"functions-limits-retention-r4");
const old = outcome.forVersion("functions-limits-retention-r3").publicStage("transfer");
assert.ok(old.items.every(q=>q.id.includes("-r3-")));
assert.ok(outcome.publicStage("transfer").items.every(q=>q.id.includes("-r4-")));
assert.equal(outcome.grade("transfer",Object.fromEntries(old.items.map(q=>[q.id,"A"]))),null);
const independentlySolved = [2,1,0,2,0,3,2,0,1,3,0,3];
assert.deepEqual(transfer.items.map(q=>q.row[2]),independentlySolved);
const responses = Object.fromEntries(transfer.items.map((q,i)=>[q.id,String.fromCharCode(65+independentlySolved[i])]));
assert.equal(outcome.grade("transfer",responses).score,12);
assert.match(transfer.items[0].row[0],/余额/);
assert.doesNotMatch(transfer.items[2].row[0],/水位/);
assert.match(transfer.items[6].row[1][2],/尚未证明/);
assert.match(transfer.items[8].row[0],/不按整小时/);
assert.match(transfer.items[10].row[0],/f\(3\)=5/);
const currentStems = [...bank.questions('pre'), ...bank.questions('post'), ...points.flatMap(p=>p.formativeQuiz.questions)].map(q=>q.question).concat(transfer.items.map(q=>q.row[0]));
currentStems.push(...outcome.publicStage("retention").items.map(q=>q.prompt));
const commonTasks = require("../lib/study-workbench");
for(let i=0;i<6;i++)for(const phase of ["t0","t1","outcome"])currentStems.push(commonTasks.publicProbe(i,phase).prompt);
for(const kp of bank.ids)for(let l=1;l<=5;l++){let last="";for(let f=0;f<3;f++){const q=adapter.nextVerificationCheck(kp,`L${l}`,last);last=q.id;currentStems.push(q.prompt||q.question);}}
assert.ok(currentStems.every(s=>typeof s==="string"&&s.length>0),"审图依赖检查必须读取真实题干");
for (const stem of currentStems) assert.doesNotMatch(stem, /如图|看下图|观察下图|见图|图中|回看课件|使用落点模拟器/, '题目必须自足，不能引用未提供的图像');
assert.equal(outcome.grade("retention",Object.fromEntries(outcome.publicStage("retention").items.map(q=>[q.id,"__unknown__"]))).score,0);
console.log("通过：90道实际支架检查独立答案、前后测24题100分及生成一致性、12道形成题、12道新版迁移、18道保持、历史版本隔离。内容审校不能代替等值性预试。");
