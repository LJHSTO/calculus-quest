'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const registry=require('../lib/assessments/functions-limits-registry'),assessment=require('../lib/course-assessment'),stages=require('../app/shared/study-stages');
const raw=require('../data/multi-scene-learning-route.json'),original=structuredClone(raw),current=registry.routeFor(raw),old=registry.routeFor(raw,registry.legacyVersion);
assert.deepEqual(raw,original);assert.deepEqual(old,original);
const chapter=current.chapters.find(c=>c.id==='V14-C1'),points=chapter.modules.flatMap(m=>m.knowledgePoints||[]);
assert.ok(points.every(p=>p.formativeQuiz.questions.length===2));
for(const order of ['XY','YX']){
 const view=assessment.buildPublicLearningRoute(current,order),c=view.chapters.find(c=>c.id==='V14-C1');
 for(const [index,phase] of ['pre','post'].entries()){
  const qs=c.flow[phase+'Quiz'].questions;assert.equal(qs.length,12);assert.equal(qs.filter(q=>q.figure).length,5);assert.ok(qs.every(q=>q.form===order[index]));
  assert.ok(qs.every(q=>!('answer'in q)&&!('analysis'in q)&&!('rubric'in q)));
 }
 assert.equal(view.quizKnowledgePointCuration.questionSetFingerprint,registry.questionIdentityFingerprint(view));
}
assert.notEqual(assessment.assessmentFingerprint(current),assessment.assessmentFingerprint(old));
assert.equal(Object.keys(registry.verifyFigureAssets(process.cwd())).length,22);
const reader=fs.readFileSync;try{fs.readFileSync=function(file,...args){return String(file).endsWith('x-corner.svg')?Buffer.from('tampered'):reader.call(this,file,...args);};assert.throws(()=>registry.verifyFigureAssets(process.cwd()),/完整性/);}finally{fs.readFileSync=reader;}
const q=structuredClone(current);q.chapters.find(c=>c.id==='V14-C1').flow.preQuiz.questions[0].figure={src:'https://example.invalid/unsafe.svg'};
assert.equal(assessment.buildPublicLearningRoute(q).chapters.find(c=>c.id==='V14-C1').flow.preQuiz.questions[0].figure,undefined);
const scope=points[0].id,rows=points[0].formativeQuiz.questions.map(q=>({unit_id:scope+'-formative',question_id:q.id}));assert.equal(stages.completed({points:[scope]},rows),true);assert.equal(stages.completed({points:[scope]},[{...rows[0],question_id:'old1'},{...rows[0],question_id:'old2'}]),false);
const history=registry.exportInstruments();assert.ok(history[registry.legacyVersion].delayed.retention.length);assert.equal(history[registry.version].formative.length,6);
const outcomes=require('../lib/proactive-outcomes/functions-limits-r11');assert.ok(outcomes.forVersion('functions-limits-delayed-r10'));assert.equal(outcomes.publicStage('retention').items.length,8);assert.equal(outcomes.publicStage('transfer').items.length,6);assert.ok(outcomes.publicStage('transfer').items.every(q=>!('answer'in q)&&!('analysis'in q)));
(async()=>{
 const SQL=await require('sql.js')(),sql=new SQL.Database();const db={getDbSync:()=>sql,saveNow(){},currentLearningGeneration:()=>1,upsertUser(){},getQuizResultsByUser:()=>[]};
 const preferences={enterOrdinary(){},save(){}};const store=require('../lib/three-arm-study').createStore({db,preferences});
 const owner={id:'synthetic-owner'},created=store.resolve(owner,'B');assert.equal(created.assessmentVersion,registry.version);assert.equal(created.formativeCount,2);assert.ok(created.regulationVersion);assert.equal(store.publicRun(created).firstSessionClock.enforce,false);
 const archived={...created,studyId:'archived-r10-protocol',studyVersion:'learner-design-feedback-functions-r10-20261106',assessmentVersion:registry.legacyVersion,delayedVersion:'functions-limits-delayed-r10'};delete archived.regulationVersion;delete archived.firstSessionBudget;delete archived.formativeCount;
 sql.run('UPDATE three_arm_runs SET study_id=?,document=? WHERE id=?',[archived.studyId,JSON.stringify(archived),archived.id]);store.record(archived.id,'synthetic_result','once',{untouched:true});
 assert.equal(store.resolve(owner,'B').id,archived.id);assert.equal(store.publicRun(store.get(archived.id)).formativeCount,3);assert.equal(store.publicRun(store.get(archived.id)).firstSessionClock,null);
 const fresh=store.startCurrentPreview(owner,archived.id);assert.notEqual(fresh.id,archived.id);assert.equal(fresh.previousRunId,archived.id);assert.equal(store.startCurrentPreview(owner,archived.id).id,fresh.id);
 assert.equal(store.readRecord(archived.id,'synthetic_result').untouched,true);assert.equal(store.resolveBound(owner,archived.id,'B').id,archived.id);assert.throws(()=>store.resolveBound({id:'other'},archived.id,'B'),/不属于/);
 assert.equal(store.resolve(owner,'B').id,fresh.id);sql.close();
 const index=require('../lib/learning-assistant').buildCourseContextIndex(current),resolved={unit:index.units.get('GH-01-K01'),contextRef:{label:'输入与输出'}};
 const response=require('../lib/learning-assistant').mockAssistantAnswer({resolved,question:'请给一个例子'});assert.doesNotMatch(response,/趋近|斜率|间断/);assert.match(response,/允许输入|函数/);
 console.log('r11数学集成回归通过：X/Y配对、5图/卷、2题/点、无答案泄漏、22图哈希拒改、旧轮次保留、新体验幂等与归属隔离、K01备用回复对齐。');
})().catch(e=>{console.error(e);process.exitCode=1;});
