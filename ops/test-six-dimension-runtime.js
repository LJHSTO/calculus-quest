"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createRuntime}=require("../lib/proactive-agent-runtime");
const {extractBehaviorFeatures}=require("../lib/proactive-policy/behavior-features");
const policy=require("../lib/proactive-policy"),controls=require("../lib/research-controls");
async function main(){
  const dir=fs.mkdtempSync(path.join(__dirname,"../output/six-dimension-runtime-"));
  const SQL=await require("sql.js")();let database=new SQL.Database(),now=Date.parse("2026-10-20T10:00:00Z");
  const file=path.join(dir,"synthetic.db"),db={getDbSync:()=>database,saveNow:()=>fs.writeFileSync(file,Buffer.from(database.export()))};
  let runtime=createRuntime({db,clock:()=>now});
  const scope="GH-01-K01",user="synthetic-a",generation=1;
  const config=policy.configFromEnv({PROACTIVE_POLICY_MODE:"active",PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_ASSIGNMENT_SALT:"synthetic"});
  const input={assignment:{condition:"treatment"},context:{chapterId:"V14-C1",unitId:scope,knowledgePointId:scope,sceneType:"simulation"},
    signal:{kind:"quiz_review"},evidence:{families:["result","task"],confirmedIncorrect:1,questionCount:1},budget:{remaining:10},now};
  const run=overrides=>policy.evaluate({...input,config:controls.effectiveConfig(config,{profile:{...controls.defaults,...overrides}})});
  const decision=run({});
  assert.equal(decision.displayAllowed,true);
  assert.equal(decision.evidencePackage.provenance.calibrated,false);
  assert.equal(run({minimumEvidenceFamilies:3}).displayAllowed,false);
  assert.equal(run({helpNeed:1}).displayAllowed,false);
  assert.equal(run({initialSupportLevel:"L3"}).action,"decompose_subgoal");
  for(const level of ["L1","L2","L3","L4","L5"])assert.equal(run({initialSupportLevel:level}).supportLevel,level);
  assert.equal(run({proactivity:"reactive"}).displayAllowed,false);
  const events=[0,1,0].map((value,i)=>({id:"e"+i,created_at:new Date(now-5000+i*1000).toISOString(),
    payload:{eventType:"parameter_commit",sceneType:"simulation",data:{value:{parameter:"input_x",newValue:value}}}}));
  const features=extractBehaviorFeatures(events,{now});
  assert.equal(features.parameterStats[0].reversals,1);
  assert.equal(features.parameterStats[0].count,3);
  assert.equal(extractBehaviorFeatures([],{now}).lastInteractionAgeMs,null);
  const job=runtime.schedule({user,scope,generation,kind:"delayed_hint",dueMs:1000,ttlMs:10000,payload:{source:"synthetic"}});
  assert.equal(runtime.delayed(user,scope,generation).status,"queued");
  db.saveNow();database.close();database=new SQL.Database(fs.readFileSync(file));
  runtime=createRuntime({db,clock:()=>now});
  now+=1100;assert.equal(runtime.delayed(user,scope,generation).status,"ready","重启后恢复到期任务");
  assert.equal(runtime.settle(job.id,"other","delivered","wrong-user"),null);
  assert.equal(runtime.settle(job.id,user,"delivered","fresh_policy").status,"delivered");
  assert.equal(runtime.settle(job.id,user,"delivered","duplicate"),null);
  assert.equal(runtime.openHint(user,scope,"d1"),null,"观察台不能替代学生授权");
  const grant=runtime.grant(user,scope,"open_hint",1),receipt=runtime.openHint(user,scope,"d1");
  assert.equal(receipt.permission_id,grant.id);
  assert.equal(runtime.openHint(user,scope,"d1").id,receipt.id);
  runtime.undo("other",receipt.id);assert.equal(runtime.openHint(user,scope,"d1").status,"applied");
  runtime.undo(user,receipt.id);assert.equal(runtime.openHint(user,scope,"d1"),null);
  runtime.revoke(user,grant.id);assert.equal(runtime.openHint(user,scope,"d2"),null);
  const reviewGrant=runtime.grant(user,scope,"prepare_review",168);
  runtime.remember({user,scope,generation,sourceId:"check1",outcome:{success:false},reviewHours:1});
  runtime.remember({user,scope,generation,sourceId:"check1",outcome:{success:false},reviewHours:1});
  assert.equal(runtime.state(user,generation).memory.length,1);
  assert.equal(runtime.state("other",generation).memory.length,0);
  now+=3600001;runtime.tick();
  assert.equal(runtime.state(user,generation).tasks.find(t=>t.kind==="review").status,"ready");
  assert.match(runtime.state(user,generation).tasks.find(t=>t.kind==="review").payload.message,/独立检查/);
  runtime.revoke(user,reviewGrant.id);
  assert.equal(runtime.state(user,generation).tasks.find(t=>t.kind==="review").status,"cancelled");
  runtime.grant(user,scope,"prepare_review",1);
  runtime.schedule({user,scope,generation,kind:"review",dueMs:1000,ttlMs:7200000,payload:{sourceId:"expiry-check"}});
  now+=1001;runtime.tick();
  assert.equal(runtime.state(user,generation).tasks.find(t=>t.payload.sourceId==="expiry-check").status,"ready");
  now+=3600000;runtime.tick();
  assert.equal(runtime.permission(user,scope,"prepare_review"),null);
  assert.equal(runtime.state(user,generation).tasks.find(t=>t.payload.sourceId==="expiry-check").status,"cancelled",
    "已准备但未查看的复习也须服从授权到期");
  assert.equal(runtime.state(user,2).memory.length,0,"新学习代次不混用旧证据");
  const outcome=policy.lifecycle.independentAttemptOutcome({lifecycle:{phase:"awaiting_independent_attempt",supportLevel:"L1",activeVerificationCheckId:"q"},
    currentLevel:"L1",maxEscalations:0,evidence:{independentAttemptVerified:true,verificationCheckId:"q",confirmedIncorrect:1,questionCount:1}});
  assert.equal(outcome.kind,"maximum_support_reached");
  assert.equal(outcome.followupOutcome.outcome,"configured_escalation_limit");
  const expiring=runtime.schedule({user,scope,generation,kind:"delayed_hint",dueMs:1000,ttlMs:2000,payload:{}});
  now+=3000;runtime.tick();
  assert.equal(runtime.state(user,generation).tasks.find(t=>t.id===expiring.id).status,"expired");
  const calibration=require("./evaluate-help-calibration");
  assert.throws(()=>calibration.evaluate([]),/数据不足/);
  const labels=Array.from({length:40},(_,i)=>[0,1].map(label=>({participantId:"synthetic-"+i,
    opportunityId:"example-"+label,helpNeedScore:label ? .8 : .2,needLabel:label}))).flat();
  const calibrationResult=calibration.evaluate(labels);
  assert.equal(calibrationResult.probabilityCalibrated,false);
  assert.equal(calibrationResult.holdout.balancedAccuracy,1);
  assert.throws(()=>calibration.evaluate([...labels,labels[0]]),/重复/);
  database.close();
  fs.writeFileSync(path.join(dir,"验收.json"),JSON.stringify({synthetic:true,passed:true,
    checks:["主决策证据契约","阈值与证据数量门控","L1–L5起始策略","行为特征与缺失值","队列跨重启","到期与过期","重复投递保护","账号隔离","限时授权与撤回","可撤销自动展开","跨会话结果记忆","离线准备与撤回","学习代次隔离","升级上限停止"]},null,2));
  console.log("六维运行时合成测试通过："+dir);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
