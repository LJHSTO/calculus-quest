'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const contract=require('../app/shared/learner-preferences'),controls=require('../lib/research-controls'),policy=require('../lib/proactive-policy');
const config=policy.configFromEnv({PROACTIVE_POLICY_MODE:'active',PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_ASSIGNMENT_SALT:'synthetic-r12-only'});
const options=contract.dimensions.map(d=>[d.id,contract.optionsFor(d.id,true).map(o=>o[0])]);
const combinations=options.reduce((rows,[id,values])=>rows.flatMap(row=>values.map(value=>({...row,[id]:{value,reason:'default',note:''}}))),[{}]);
const results=[];
for(const answers of combinations){
 const profile=contract.profile(answers,controls.defaults),effective=controls.effectiveConfig(config,{profile});
 const input={config:effective,assignment:{condition:'treatment'},context:{chapterId:'V14-C1',unitId:'GH-01-K01-formative',knowledgePointId:'GH-01-K01',isQuiz:true,phase:'formative',quizSubmitted:true,sceneType:'quiz'},signal:{kind:'formative_outcome'},evidence:{families:['result','task'],confirmedIncorrect:2,questionCount:2,naturalBoundary:true},budget:{remaining:10}};
 const initial=policy.evaluate(input);assert.equal(initial.displayAllowed,true);assert.equal(initial.supportLevel,profile.initialSupportLevel);
 assert.equal(profile.helpNeed,answers.D1.value==='cautious'?.8:.7);assert.equal(profile.minimumEvidenceFamilies,answers.D1.value==='cautious'?2:1);
 assert.equal(profile.cooldownSeconds,answers.D2.value==='quiet'?180:60);assert.equal(profile.boundaryOnly,true);
 assert.equal(profile.placement,answers.D4.value);assert.equal(profile.authorityLevel,answers.D5.value==='ask'?'A1':'A2');assert.equal(profile.supportInquiryEnabled,answers.D5.value==='ask');
 for(const phase of ['pre','post','retention','transfer'])assert.equal(policy.evaluate({...input,context:{...input.context,phase}}).displayAllowed,false);
 assert.equal(policy.evaluate({...input,policyState:{studentPreference:'off'}}).displayAllowed,false);
 const partial=policy.evaluate({...input,evidence:{...input.evidence,families:['result']}});assert.equal(partial.displayAllowed,answers.D1.value==='standard');
 assert.equal(policy.evaluate({...input,context:{...input.context,isQuiz:false,sceneType:'simulation'},signal:{kind:'quiet_dwell'},evidence:{families:['time'],dwellSeconds:900,naturalBoundary:false}}).displayAllowed,false);
 const failed={independentAttemptVerified:true,verificationCheckId:'new-check',confirmedIncorrect:1,questionCount:1};
 const lifecycle={phase:'awaiting_independent_attempt',supportLevel:profile.initialSupportLevel,activeVerificationCheckId:'new-check'};
 const first=policy.lifecycle.independentAttemptOutcome({lifecycle,currentLevel:profile.initialSupportLevel,maxEscalations:profile.maxEscalations,evidence:failed});
 const canContinue=answers.D6.value==='followup'&&profile.initialSupportLevel!=='L5';assert.equal(first.kind,canContinue?'continued_friction':'maximum_support_reached');
 if(canContinue){const next=policy.lifecycle.independentAttemptOutcome({lifecycle:{...first.transition.lifecycle,phase:'awaiting_independent_attempt',activeVerificationCheckId:'second-check'},currentLevel:first.supportLevel,maxEscalations:profile.maxEscalations,evidence:{...failed,verificationCheckId:'second-check'}});assert.equal(next.kind,'maximum_support_reached');}
 const replay=policy.lifecycle.independentAttemptOutcome({lifecycle:{...lifecycle,lastVerificationCheckId:'new-check'},currentLevel:profile.initialSupportLevel,maxEscalations:profile.maxEscalations,evidence:failed});assert.equal(replay.kind,'verification_replayed');
 const success=policy.lifecycle.independentAttemptOutcome({lifecycle,currentLevel:profile.initialSupportLevel,maxEscalations:profile.maxEscalations,evidence:{...failed,independentAttemptSuccess:true,confirmedIncorrect:0,confirmedCorrect:1}});assert.equal(success.kind,'independent_attempt_success');assert.equal(success.transition.currentLevel,'L0');
 const decline=policy.lifecycle.independentAttemptOutcome({lifecycle,currentLevel:profile.initialSupportLevel,maxEscalations:profile.maxEscalations,evidence:{independentAttemptDeclined:true,verificationCheckId:'new-check'}});assert.equal(decline.kind,'verification_declined');
 results.push({choices:Object.fromEntries(Object.entries(answers).map(([id,a])=>[id,a.value])),initialLevel:initial.supportLevel,firstFailure:first.kind,passed:true});
}
const adapter=policy.adapterForChapter('V14-C1');for(const scope of adapter.knowledgePointIds||['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03']){const seen=[];for(let i=0;i<8;i++){const check=adapter.nextVerificationCheck(scope,'L2','',seen);assert.ok(check);assert(!seen.includes(check.id));assert.equal(Object.hasOwn(check,'answer'),false);seen.push(check.id);}assert.equal(adapter.nextVerificationCheck(scope,'L2','',seen),null);}
const out=path.resolve(process.env.SUPPORT_R12_OUTPUT||path.join(__dirname,'../tmp/support-drafts-r12'));fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'六维96组合规则核验.json'),JSON.stringify({passed:true,profileCount:combinations.length,adapterVersion:adapter.version,results,scope:'全部96个当前实验配置的纯规则状态转换；不是96组完整浏览器或真实模型实验',checks:['两档阈值与证据类数','60/180秒间隔和边界','三种支持起点','两个位置','先询问/直接提示权限','D6停止或一次升级上限','保护测验/静音不介入','只停留不自动诊断','同题重放不追加评分','正确即退出','拒绝不升级','每KP八题排重后耗尽']},null,2));console.log('r12 六维96种当前配置规则核验通过');
