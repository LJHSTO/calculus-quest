'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const mathInstruments=require('../lib/assessments/functions-limits-registry'),courseAssessment=require('../lib/course-assessment'),learnerMemory=require('../lib/learner-memory');
const archivedLearningRoute=require('../data/multi-scene-learning-route.json'),learningRoute=mathInstruments.routeFor(archivedLearningRoute);
const source=fs.readFileSync(require.resolve('../server.js'),'utf8'),start=source.indexOf('  assessmentIndex = courseAssessment.buildAssessmentIndex(learningRoute);'),end=source.indexOf('  assistantContextIndex =',start);
assert(start>0&&end>start);
const context={assessmentIndex:null,courseAssessment,learningRoute,archivedLearningRoute,mathInstruments,mathIndexesForVersion:version=>({assessmentIndex:courseAssessment.buildAssessmentIndex(mathInstruments.routeFor(archivedLearningRoute,version))})};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
for(const version of mathInstruments.versions){
 const selected=context.mathIndexesForVersion(version).assessmentIndex;
 for(const id of selected.keys())assert(context.assessmentIndex.has(id),'缺少已注册历史题：'+id);
 const begin=source.indexOf('function assignedAssessmentEntry('),finish=source.indexOf('function proactiveAssessmentQuestionCount(',begin);
 const selectContext={mathVersionFor:()=>version,threeArmStudy:{get:()=>({assessmentOrder:'XY'})}};vm.createContext(selectContext);vm.runInContext(source.slice(begin,finish),selectContext);
 for(const phase of ['pre','post','formative']){
  const allowed=index=>[...index.values()].filter(e=>e.chapterId==='V14-C1'&&e.phase===phase&&selectContext.assignedAssessmentEntry(e,'synthetic')).map(e=>e.question.id).sort();
  assert.deepEqual(allowed(context.assessmentIndex),allowed(selected),'跨版本题目不得进入当前轮次');
 }
}
const oldVersion='functions-limits-integrated-r11-20261107',old=context.mathIndexesForVersion(oldVersion).assessmentIndex;
const questions=[...old.values()].filter(e=>e.unitId==='GH-01-K01-formative');assert.equal(questions.length,2);
const rows=questions.map((e,i)=>({id:'old-'+i,user_id:'synthetic',chapter_id:'V14-C1',learning_generation:1,phase:'formative',question_id:e.question.id,is_correct:i,status:'graded',created_at:'2026-11-08T01:00:00Z'}));
const memory=learnerMemory.buildLearnerMemory({userId:'synthetic',chapterId:'V14-C1',generation:1,points:[{id:'GH-01-K01',name:'函数规则'}],rows,index:context.assessmentIndex,now:Date.parse('2026-11-08T02:00:00Z')});
assert.deepEqual([memory.points[0].correct,memory.points[0].incorrect,memory.points[0].sources.length],[1,1,2]);
console.log('多版本全局题索引通过：旧形成题画像保留，所有注册版本可定位，当前轮次题目集合不混入其他版本。');
