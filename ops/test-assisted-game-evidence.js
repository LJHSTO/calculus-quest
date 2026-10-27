'use strict';
const assert=require('node:assert/strict'),evidence=require('../lib/assisted-game-evidence');
const M=require('../resources/open-maic/函数极限混合探索/game-model');
const policy=require('../lib/proactive-policy'),coach=require('../app/main/proactive-learning').createProactiveCoach({cooldownMs:1000});
const points=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
const now=Date.now();
const fs=require('node:fs'),vm=require('node:vm');
const render=fs.readFileSync(require.resolve('../app/main/render-learning.js'),'utf8');
const bridge=vm.runInNewContext(render.slice(0,render.indexOf('function coursewareFrameUrl'))+';sanitizeCoursewareLearningEvent');
function attempt(kind,id,correctClaim=false){return {attempt_id:id,challenge_id:points[kind]+'-game-r0',independent:false,evidence_scope:'assisted_game_attempt',feedback_version:'concept-games-20261027-v3',parameters:M.create(kind),response:kind===1?[-3,-3]:M.create(kind),is_correct:correctClaim};}
for(let kind=0;kind<6;kind++) {
 const bridged=JSON.parse(JSON.stringify(bridge(attempt(kind,'bridge'))));
 assert.deepEqual(bridged.parameters,M.create(kind),'真实课件转接必须保留完整任务状态');
 assert.equal(evidence.grade(bridged,points[kind]),false,'经浏览器字段过滤后仍能服务端复核');
}
for(let kind=0;kind<6;kind++)assert.equal(evidence.grade(attempt(kind,'a',true),points[kind]),false,'服务端重新判定，不信客户端正确声明');
assert.equal(evidence.grade({...attempt(0,'a'),parameters:{...M.create(0),kind:1}},points[0]),null);
assert.equal(evidence.grade({...attempt(0,'a'),independent:true},points[0]),null);
const rows=[0,1].map(i=>({id:'row'+i,created_at:new Date(now-1000+i*200).toISOString(),payload:{eventType:'courseware_challenge_result',data:attempt(0,'a'+i)}}));
assert.equal(evidence.collect([...rows,rows[1]],points[0],now).failures.length,2,'重复事件去重');
const fixed=attempt(0,'pass');fixed.parameters.links=[[0],[0],[1]];
assert.equal(evidence.grade(fixed,points[0]),true);
assert.equal(evidence.collect([...rows,{id:'pass',created_at:new Date(now).toISOString(),payload:{eventType:'courseware_challenge_result',data:fixed}}],points[0],now).failures.length,0,'修正成功后旧失败不继续触发');
coach.consume({eventType:'unit_enter',unitId:points[0],unitType:'knowledge',sceneType:'game'},now-2000);
assert.equal(coach.consume({eventType:'courseware_challenge_result',unitId:points[0],data:attempt(0,'a')},now-1000),null);
assert.equal(coach.consume({eventType:'courseware_challenge_result',unitId:points[0],data:attempt(0,'b')},now).kind,'task_difficulty');
const config=policy.configFromEnv({PROACTIVE_POLICY_MODE:'active',PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_EXPERIMENT_ID:'synthetic-practice',PROACTIVE_ASSIGNMENT_SALT:'test-only',PROACTIVE_EXPERIMENT_ARMS:'treatment',PROACTIVE_DISPLAY_ARMS:'treatment'});
const input={config,assignment:{condition:'treatment'},context:{chapterId:'V14-C1',unitId:points[0],knowledgePointId:points[0],sceneType:'game',isQuiz:false},signal:{kind:'task_difficulty'},evidence:{families:['process','task'],familyStrength:{process:1,task:.8},assistedTaskFailures:2,naturalBoundary:true},budget:{remaining:10},now};
assert.equal(policy.evaluate(input).displayAllowed,true);
assert.equal(policy.evaluate({...input,evidence:{...input.evidence,assistedTaskFailures:1}}).displayAllowed,false);
assert.equal(policy.evaluate({...input,evidence:{...input.evidence,naturalBoundary:false}}).displayAllowed,false);
assert.equal(policy.evaluate({...input,context:{...input.context,isQuiz:true,phase:'pre'}}).displayAllowed,false);
assert.equal(policy.evaluate({...input,policyState:{cooldownUntil:new Date(now+60000).toISOString()}}).displayAllowed,false);
console.log('有反馈练习困难测试通过：六知识点服务端复核、伪正确/非法状态、重复去重、成功清除、主动候选、边界/测验/冷却保护。');
