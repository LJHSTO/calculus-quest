'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function main(){
 const source=fs.readFileSync(path.resolve(__dirname,'../app/main/agentic-path.js'),'utf8'),body=source.slice(source.indexOf('async function agenticAfterQuizSubmit('),source.indexOf('\nfunction agenticBuildPostRelearnExtensionPlan'));
 for(const version of ['r7','r10'])for(const phase of ['pre','post']){
  const calls=[],pending={pendingPlan:{},pendingAt:'previous'},sandbox={ensureAgenticPath:()=>pending,agenticUnlockDefaultNext:()=>calls.push('unlock'),LearnerSetup:{afterPosttest:()=>calls.push('post')},saveState:()=>calls.push('save')};
  vm.runInNewContext(body,sandbox);await sandbox.agenticAfterQuizSubmit({id:'V14-C1-'+phase,assessmentPhase:phase},[{question:{id:'fl-'+version+'-'+phase+'-X-4'},status:'submitted',isCorrect:null}]);
  assert.deepEqual(calls,[phase==='pre'?'unlock':'post','save']);assert.equal(pending.pendingPlan,null);
 }
 const target=require.resolve('../lib/assessments/functions-limits-delayed-r10'),original=fs.readFileSync,materialsPath=require.resolve('../lib/research-sites/materials');
 delete require.cache[materialsPath];const before=require(materialsPath).fingerprint;
 try{fs.readFileSync=function(file,...args){const result=original.call(this,file,...args);if(path.resolve(String(file))!==target)return result;return Buffer.isBuffer(result)?Buffer.concat([result,Buffer.from('\n// scorer fingerprint regression')]):result+'\n// scorer fingerprint regression';};delete require.cache[materialsPath];assert.notEqual(require(materialsPath).fingerprint,before);}finally{fs.readFileSync=original;delete require.cache[materialsPath];}
 const history=require('../lib/assessments/three-arm-instrument-history.json');assert.equal(history.length,4);assert.ok(history.every(x=>x.instrument.surveys.length===26&&x.sourceCommit&&x.sourceSha256));assert.equal(history.filter(x=>x.version==='three-arm-measures-20261104-v3').length,2);
 const checks=['r7/r10前后测人工待评不发自动评分或路径建议请求','研究站评分源改变会改变材料指纹','历史问卷按原提交保存；同版本不同定义保持可区分'];
 const server=original(path.resolve(__dirname,'../server.js'),'utf8'),stateBody=server.slice(server.indexOf('function proactiveOutcomeState('),server.indexOf('\nfunction closeProactiveSupportForOutcomeSession'));
 const registry=require('../lib/proactive-outcomes/functions-limits-r10');
 for(const test of [{name:'当前新轮次',ready:true,version:null,expected:'functions-limits-delayed-r10',locked:false},{name:'旧冻结轮次',ready:true,version:'functions-limits-retention-r4',expected:'functions-limits-retention-r4',locked:false},{name:'未知冻结版本',ready:true,version:'unavailable',expected:'unavailable',locked:true},{name:'普通旧后测无锚点',ready:false,oldPost:true,expected:null,locked:true}]){
  const run=test.version?{runtimeManifest:{proactiveDefinition:{outcomeInstrumentVersion:test.version}}}:null;
  const sandbox={proactiveStudyConfig:{chapterId:'V14-C1',experimentId:'fixture'},proactiveOutcomes:registry,outcomeRegistry:registry,proactiveRetentionDelayHours:72,proactiveRetentionCloseHours:null,proactiveRetentionReminderHours:[],proactiveProtocolFingerprint:'fixture',proactiveParticipationForUser:()=>({status:'enrolled'}),proactiveAssignmentForUser:()=>({}),proactiveAssessmentCompletion:()=>({ready:test.ready,completedAt:'2020-01-01T00:00:00Z'}),threeArmStudy:{get:()=>run},publicProactiveParticipation:x=>x,publicProactiveOutcomeSession:x=>x,proactiveOutcomeReview:()=>null,db:{listProactiveOutcomeAttempts:()=>[],listProactiveOutcomeSessions:()=>[],proactiveRetentionReminderHistory:()=>[],getQuizResultsByUser:()=>test.oldPost?[{chapter_id:'V14-C1',phase:'post',question_id:'old-post-1'}]:[]}};
  vm.runInNewContext(stateBody,sandbox);const result=sandbox.proactiveOutcomeState('fixture','V14-C1');assert.equal(result.instrumentVersion,test.expected,test.name);assert.equal(result.versionUnavailable,test.locked,test.name);if(test.locked)assert.ok(result.stages.every(s=>s.status==='locked'&&!s.items));
 }
 checks.push('新轮次选r10，旧冻结轮次保留r4，未知版本及无锚点旧后测保持锁定');
 const report={passed:true,at:new Date().toISOString(),checks};fs.writeFileSync(path.resolve(__dirname,'../output/综合课程-r10-20261106/集成与版本回归.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
