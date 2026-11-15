'use strict';
const assert=require('node:assert/strict'),{build}=require('../lib/study-interaction-timeline');
const time='2026-11-13T12:00:00+08:00',utc='2026-11-13T04:00:00.000Z';
const run={id:'r1',ownerId:'private-owner',mode:'preview',arm:'B',protocolFingerprint:'p1',createdAt:time};
const source={runs:[run,{...run,id:'r2',mode:'formal',consentedAt:time},{...run,id:'r3',protocolFingerprint:'p2'},{...run,id:'r4',status:'withdrawn'}],records:[{run_id:'r1',kind:'staff_observation',slot:'once',document:{at:time,note:'技术协助'}}],tables:{
 learning_assistant_messages:[{id:'m1',user_id:'r1',role:'assistant',content:'同一输入必须有唯一输出。',conversation_id:'c1',unit_id:'k1',created_at:time,provider:'openai-compatible',context_json:JSON.stringify({requestId:'q1',questionId:'item1',fallback:false,modelAudit:{requestedModel:'same-model',reportedModel:'same-model',queueMs:0,executionMs:1500,latencyMs:1505,usage:{prompt_tokens:2000,completion_tokens:70}}})}],
 events:[{id:'e1',user_id:'r1',created_at:time,payload:JSON.stringify({eventType:'assistant_request_finished',unitId:'k1',data:{requestId:'q2',status:'cancelled',queueMs:20,executionMs:0,totalMs:20}})},{id:'other',user_id:'r2',created_at:time,payload:'{}'}],
 quiz_results:[{id:'quiz1',user_id:'r1',created_at:time,question_id:'written',is_correct:-1,response:'暂未评分',phase:'pre'},{id:'quiz2',user_id:'r1',created_at:time,question_id:'wrong',is_correct:0,response:'2',phase:'formative'}],
 agent_memory:[{id:'mem1',user_id:'r1',created_at:time,payload_json:JSON.stringify({outcome:{status:'skipped',checkId:'check1',questionId:'item1'}})}],
 learner_support_rounds:[{id:'cycle1:1',user_id:'r1',document:JSON.stringify({offeredAt:time,cycleId:'cycle1',round:1,scope:'k1',content:{message:'结构化帮助',audit:{provider:'openai-compatible',fallback:false,latencyMs:2000,model:{requestedModel:'same-model',reportedModel:'same-model'}}},responses:[{id:'feedback:1',at:'2026-11-13T04:01:00Z',action:'feedback',result:'not_helped'}]})}],
 agent_tasks:[{id:'task',user_id:'r1',created_at:time,updated_at:'2026-11-13T04:02:00Z',status:'cancelled',payload_json:'{}'}]
}};
const result=build(source,{mode:'preview',protocolFingerprint:'p1'});
assert.equal(result.summaries.length,1);assert.equal(result.summaries[0].runId,'r1');assert(!JSON.stringify(result).includes('private-owner'));
assert.equal(result.modelCalls.length,3);assert.equal(result.modelCalls.find(x=>x.sourceId==='m1').queueMs,0);assert.equal(result.modelCalls.find(x=>x.sourceId==='cycle1:1').queueMs,null);
assert.equal(result.checks.find(x=>x.sourceId==='quiz1').correct,null);assert.equal(result.checks.find(x=>x.sourceId==='quiz2').correct,false);assert.equal(result.checks.find(x=>x.sourceId==='mem1').correct,null);
assert.equal(result.timeline.find(x=>x.sourceId==='m1').at,utc);assert.equal(result.timeline.find(x=>x.sourceId==='task').at,'2026-11-13T04:02:00.000Z');
assert.equal(result.timeline.filter(x=>x.sourceTable==='learner_support_rounds').length,2);assert.deepEqual(result.issues,[]);
assert.equal(build(source,{mode:'preview',protocolFingerprint:'p1',runId:'r2'}).timeline.length,0);
assert.throws(()=>build(source,{mode:'all',protocolFingerprint:'p1'}));
assert(result.notes.some(x=>x.includes('事后结果')));
assert.equal(result.modelCalls.find(x=>x.sourceId==='m1').totalMs,null,'缺失的请求总耗时不能用生成耗时冒充');
source.tables.learning_assistant_messages.push({id:'button-user',user_id:'r1',role:'user',content:'系统预置请求',created_at:time,context_json:JSON.stringify({inputOrigin:'action_button',inputActionLabel:'继续讲解'})});
const sourced=build(source,{mode:'preview',protocolFingerprint:'p1'}).timeline.find(r=>r.sourceId==='button-user');assert.equal(sourced.inputOrigin,'action_button');assert.equal(sourced.inputActionLabel,'继续讲解');
assert.equal(result.timeline.find(r=>r.sourceId==='m1').inputOrigin,'unrecorded','旧文本不能猜测为手工输入');
source.tables.events.push({id:'completed',user_id:'r1',created_at:time,payload:JSON.stringify({eventType:'assistant_request_finished',data:{requestId:'q1',status:'completed',totalMs:1520}})});
assert.equal(build(source,{mode:'preview',protocolFingerprint:'p1'}).modelCalls.find(x=>x.sourceId==='m1').totalMs,1520);
source.tables.events.push({id:'skip',user_id:'r1',created_at:time,payload:JSON.stringify({eventType:'proactive_verification_declined',data:{checkId:'check1',interventionId:'i1'}})});
source.tables.proactive_interventions=[{id:'i1',user_id:'r1',created_at:time,presentation:JSON.stringify({questionId:'item1'})}];
const skipped=build(source,{mode:'preview',protocolFingerprint:'p1'}).checks.filter(c=>c.checkId==='check1');
assert.equal(skipped.length,1);assert.equal(skipped[0].status,'skipped');assert.equal(skipped[0].correct,null);assert.equal(skipped[0].questionId,'item1');assert.equal(skipped[0].sourceId,'skip');
console.log('PASS: mode/version/run isolation; full dialogue and structured rounds; cancelled queue calls; UTC sorting; null vs zero vs incorrect; no owner identity; retrospective records separate from decision inputs');
