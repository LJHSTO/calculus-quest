'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const feedback=require('../lib/research-feedback'),memory=require('../lib/learner-memory'),kg=require('../lib/kg'),coach=require('../lib/agentic-coach');
const at='2026-11-08T01:00:00Z',base={user_id:'synthetic',chapter_id:'V14-C1',unit_id:'GH-01-K01-formative',learning_generation:1,phase:'formative',status:'graded',created_at:at};
const rows=[{...base,id:'practice-ok',question_id:'fl-r12-formative-p-1',is_correct:1},{...base,id:'practice-gap',question_id:'fl-r12-formative-p-2',is_correct:0},...[7,10,11,12,13].flatMap(v=>['pre','post'].map(phase=>({...base,id:`protected-${v}-${phase}`,question_id:`fl-r${v}-${phase}-X-1`,unit_id:'V14-C1-'+phase,phase,is_correct:1,score:2,max_score:2})))];
const before=structuredClone(rows),index=new Map(rows.map(r=>[r.question_id,{question:{knowledgePointIds:['GH-01-K01']}}]));
const options={userId:'synthetic',generation:1,chapterId:'V14-C1',points:[{id:'GH-01-K01',name:'函数规则'}],index,now:Date.parse(at)+1000};
const first=memory.buildLearnerMemory({...options,rows});
assert.deepEqual([first.points[0].correct,first.points[0].incorrect,first.points[0].pending],[1,1,0]);
assert.deepEqual(first.points[0].sources.map(r=>r.id),['practice-ok','practice-gap']);
const changed=rows.map(r=>feedback.isProtectedQuestionId(r.question_id)?{...r,is_correct:0,score:0}:r);
assert.deepEqual(memory.buildLearnerMemory({...options,rows:changed}),first,'隐藏判分变化不得改变学生画像');
assert.deepEqual(rows,before,'不修改原答或内部统计输入');
for(const input of [rows,changed]){
 const selected=feedback.learningRows(input);assert.equal(selected.length,2);
 const summary=kg.summariseQuizResults(selected);assert.deepEqual(summary.byChapter.map(r=>r.phase),['formative']);
 const plan=coach.plan({chapterId:'V14-C1',currentUnitId:'GH-01-K01',quizSummary:summary});assert.equal(plan.metrics.preAccuracy,null);assert.equal(plan.metrics.postAccuracy,null);
 assert(!JSON.stringify(summary).includes('protected-'));
}
assert.equal(feedback.isProtectedQuestionId('ordinary-pre-1'),false);
assert.equal(feedback.isProtectedQuestionId('fl-r12-retention-1'),false);
const privatePre={ready:true,submitted:12,expected:12,earned:16,possible:16,accuracy:1,stratum:'pre-high',basis:'internal'};
assert.deepEqual(feedback.publicPretest(privatePre),{ready:true,submitted:12,expected:12});assert.equal(privatePre.earned,16);assert.equal(feedback.publicPretest(null),null);
const server=fs.readFileSync(require.resolve('../server.js'),'utf8'),start=server.indexOf('function publicProactiveAssignment('),end=server.indexOf('function publicProactiveParticipation(',start);
const project=vm.runInNewContext(server.slice(start,end)+'\npublicProactiveAssignment');
assert(!Object.hasOwn(project({stratum:'pre-high'}),'stratum'));assert.equal(project(null),null);
console.log('研究反馈边界通过：画像/来源与KG不受隐藏判分变化影响，形成反馈保留，前测只投影就绪与进度，分层留在内部。');
