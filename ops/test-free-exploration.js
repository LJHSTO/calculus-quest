'use strict';
const assert=require('node:assert/strict'),M=require('../resources/open-maic/主动探索证据/free-exploration'),P=require('../lib/proactive-policy'),{inquiryEvidence}=require('../lib/support-cycle');
const now=Date.now(),point='GH-01-K01',scene='simulation';
function rowsFor(point,scene){const c=M.get(point,scene),[channel,b]=Object.entries(c.bindings)[0];let values=b.values?Object.keys(b.values).slice(0,c.minimum):[b.min,b.max];if(point==='GH-02-K03'&&scene==='simulation')values=[2,4];return values.map((value,i)=>({id:`event-${i}`,created_at:new Date(now-8000+i*3500).toISOString(),payload:{eventType:'courseware_exploration_observed',data:{task_version:M.version,knowledge_point_id:point,scene_type:scene,evidence_scope:'free_exploration_observation',independent:false,parameters:{channel,value}}}}));}
for(const p of M.points)for(const s of ['simulation','mindMap','visualization3d']){
 const rows=rowsFor(p,s);assert.ok(M.collect(rows,p,s,now),p+':'+s);
 assert.equal(M.collect([rows[0],rows[0],rows[0]],p,s,now),null,'重复状态不构成比较');
 assert.equal(M.collect(rows,p,s,now+300001),null,'过时观察不能触发');
 assert.equal(M.collect(rows.map(r=>({...r,payload:{...r.payload,eventType:'parameter_commit'}})),p,s,now),null,'通用操作次数不构成语义证据');
 const d=rows[0].payload.data;assert.equal(M.verify({...d,task_version:'old'},p),null);assert.equal(M.verify({...d,parameters:{channel:'speed',value:1}},p),null);
}
const opportunity=M.collect(rowsFor(point,scene),point,scene,now),evidence={explorationOpportunity:opportunity,naturalBoundary:true,boundaryEventType:'courseware_exploration_observed',families:['process','task'],familyStrength:{process:.8,task:.8},evidenceRefs:opportunity.sources};
// A device 3 seconds ahead can have both events clamped to their batch receipt.
// Preserve the within-session comparison duration, not its absolute wall clock.
const batched=rowsFor(point,scene).map((r,i)=>({...r,created_at:new Date(now-500+i*250).toISOString(),payload:{...r.payload,sessionId:'one-learning-session',timing:{clientAt:new Date(now-500+i*3500).toISOString()}}}));
assert.ok(M.collect(batched,point,scene,now),'小幅时钟偏差与批量上报不能抹去真实比较间隔');
assert.equal(M.collect(batched.map((r,i)=>({...r,payload:{...r.payload,sessionId:'different-'+i}})),point,scene,now),null,'不能用不同会话的客户端时钟拼出比较间隔');
assert.equal(M.collect(batched.map(r=>({...r,payload:{...r.payload,timing:{clientAt:new Date(now+60000).toISOString()}}})),point,scene,now),null,'过大的时钟偏差不能放宽时间条件');
assert.equal(M.collect(batched.map((r,i)=>({...r,payload:{...r.payload,timing:{clientAt:new Date(now+i*100).toISOString()}}})),point,scene,now),null,'快速连续点击仍不满足比较间隔');
const config=P.configFromEnv({PROACTIVE_POLICY_MODE:'active',PROACTIVE_EXPERIMENT_ID:'free-exploration-unit',PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_ASSIGNMENT_SALT:'test-only'});
const params={config,assignment:{condition:'treatment'},context:{chapterId:'V14-C1',unitId:point,knowledgePointId:point,sceneType:scene,isQuiz:false},signal:{kind:'exploration_reflection'},evidence,budget:{remaining:10},now};
const decision=P.evaluate(params);assert.equal(decision.displayAllowed,true,JSON.stringify(decision.reasonCodes));assert.equal(decision.helpNeedScore,null);assert.equal(decision.evidencePackage.inference.need_help_now,null);assert.equal(decision.timing.action,'boundary');
assert.equal(P.evaluate({...params,evidence:{...evidence,explorationOpportunity:null}}).displayAllowed,false);
assert.equal(P.evaluate({...params,evidence:{...evidence,naturalBoundary:false}}).displayAllowed,false);
assert.equal(P.evaluate({...params,assignment:{condition:'control'}}).displayAllowed,false);
assert.equal(P.evaluate({...params,context:{...params.context,isQuiz:true,quizSubmitted:false,phase:'pre'}}).displayAllowed,false);
const cautious={...config,engineeringControls:{profile:{minimumEvidenceFamilies:2}}};
assert.equal(P.evaluate({...params,config:cautious}).displayAllowed,false);
const revisit=rowsFor(point,scene);revisit.push({...revisit[0],id:'revisit',created_at:new Date(now-100).toISOString()});
const revisited=M.collect(revisit,point,scene,now);assert.equal(revisited.observationCount,3);assert.ok(revisited.sources.some(r=>r.id==='revisit'));
assert.equal(P.evaluate({...params,config:cautious,evidence:{...evidence,explorationOpportunity:revisited}}).displayAllowed,true);
for(const kind of ['quiet_dwell','repeated_parameter'])assert.equal(P.evaluate({...params,signal:{kind},evidence:{families:['time','process','task'],familyStrength:{time:1,process:1,task:1},educationalTaskMapped:true,parameterCommitCount:20,dwellSeconds:600,naturalBoundary:true}}).displayAllowed,false,'操作多或停留久不能单独构成困难');
assert.equal(inquiryEvidence(evidence,params.signal).basis,'exploration_comparison');assert.equal(inquiryEvidence({...evidence,naturalBoundary:false},params.signal),null);
assert.equal(inquiryEvidence({evidenceRefs:[],naturalBoundary:true},params.signal),null);
const G=require('../lib/support-goals');
for(const need of ['reflection','clarify_concept']){
 const confirmed=G.validateNeed({need,confirmed:true}),plan=G.selectPlan(confirmed);
 assert.equal(plan.primaryGoal,need==='reflection'?'metacognitive':'cognitive');
 assert.ok(!/不知道|没弄懂/.test(plan.rationale),'整理意愿不得记成困难自述');
 const prompt=G.promptFor({scope:point,need:confirmed,plan,exploration:{text:opportunity.text,guide:opportunity.guide}});
 assert.ok(prompt.user.includes('"need":"'+need+'"'));
}
console.log('18场景自由探索语义、去重、过期、非数学操作过滤、无错误主动询问、测量和对照保护通过；HelpNeed保持未估计。');
