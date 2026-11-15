'use strict';
const assert=require('node:assert/strict'),policy=require('../lib/proactive-policy'),C=require('../app/shared/learner-preferences');
const answers=C.defaults();for(const v of Object.values(answers))v.reason='default';
for(const d of C.dimensions){const reasons=C.reasonsFor(d.id).filter(([id])=>!['try','other'].includes(id));assert.equal(reasons.length,3);for(const other of C.dimensions.filter(x=>x.id!==d.id))assert(reasons.every(([id])=>!C.reasonsFor(other.id).some(([code])=>code===id)));}
function evaluate({timing='boundary',lastReasonCode='',phase='idle',incorrect=1,pending=0,kind='quiz_review'}={}){
 const config={...policy.configFromEnv({PROACTIVE_POLICY_MODE:'active',PROACTIVE_EXPERIMENT_ID:'r19-policy-test',PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_ASSIGNMENT_SALT:'synthetic',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r16'})};
 answers.D2.value=timing;config.engineeringControls={profile:C.profile(answers,{})};
 return policy.evaluate({config,assignment:{condition:'treatment_full'},context:{chapterId:'V14-C1',unitId:'GH-01-K01-formative',knowledgePointId:'GH-01-K01',isQuiz:true,quizSubmitted:true,phase:'formative',sceneType:'quiz'},signal:{kind},evidence:{confirmedIncorrect:incorrect,pendingReview:pending,questionCount:2,families:['result'],naturalBoundary:true},policyState:{cooldownUntil:new Date(Date.now()+55000).toISOString(),lastReasonCode,lifecycle:{phase}},budget:{remaining:10}});
}
assert.equal(evaluate().deliveryDecision,'intervene','新形成性错误可越过普通探索冷却');
for(const args of [{timing:'quiet'},{lastReasonCode:'dismissed:student'},{lastReasonCode:'ignored:student'},{lastReasonCode:'snoozed:student'},{phase:'declined'},{incorrect:0},{pending:1}])assert.equal(evaluate(args).deliveryDecision,'stay_silent',JSON.stringify(args));
console.log('r19: 六维理由互不复制；新形成性错误、安静间隔、明确拒绝与待评分边界通过');
