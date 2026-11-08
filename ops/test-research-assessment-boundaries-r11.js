'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const registry=require('../lib/assessments/functions-limits-registry'),assessment=require('../lib/course-assessment'),order=require('../lib/quiz-question-order');
const route=registry.routeFor(require('../data/multi-scene-learning-route.json')),chapter=route.chapters.find(c=>c.id==='V14-C1'),index=assessment.buildAssessmentIndex(route);
for(const phase of ['pre','post']){
 const qs=chapter.flow[phase+'Quiz'].questions;
 assert.deepEqual(order.orderQuestions([...qs].reverse(),phase).map(q=>q.id),qs.map(q=>q.id),'固定研究题序不可被题型排序改写');
 const rows=qs.filter(q=>q.type==='short_answer').map(q=>({chapterId:'V14-C1',unitId:'V14-C1-'+phase,questionId:q.id,response:'合成自主解题理由',status:'pending_review'}));
 assert.equal(rows.length,4);assert.equal(assessment.authoritativeGradingQuestions(index,rows).length,0,'研究短答留给盲评，不进入自动AI评分重试');
}
const source=fs.readFileSync(require.resolve('../app/main/agentic-path.js'),'utf8');
const begin=source.indexOf('async function agenticAfterQuizSubmit('),end=source.indexOf('function agenticBuildPostRelearnExtensionPlan(',begin);
assert(begin>=0&&end>begin);
(async()=>{
 for(const version of [7,10,11])for(const phase of ['pre','post']){
  const pending={pendingPlan:{type:'old'},pendingAt:'old'};let unlocked=0,finished=0,saved=0;
  const context=vm.createContext({ensureAgenticPath:()=>pending,agenticUnlockDefaultNext:()=>unlocked++,LearnerSetup:{afterPosttest:()=>finished++},saveState:()=>saved++});
  vm.runInContext(source.slice(begin,end),context);
  await context.agenticAfterQuizSubmit({id:'V14-C1-'+phase,assessmentPhase:phase},[{question:{id:`fl-r${version}-${phase}-X-1`}}]);
  assert.equal(pending.pendingPlan,null);assert.equal(saved,1);assert.equal(unlocked,phase==='pre'?1:0);assert.equal(finished,phase==='post'?1:0);
 }
 console.log('研究测量边界通过：r11固定题序、短答不进AI自动判分，r7/r10/r11前后测不生成学情干预分支。');
})().catch(e=>{console.error(e);process.exitCode=1;});
