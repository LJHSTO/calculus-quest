"use strict";
const assert=require('node:assert/strict'),{buildReplay,modelInputs}=require('../lib/three-arm-replay');
const t=n=>new Date(Date.UTC(2026,9,31,12,0,n)).toISOString(),fingerprint='fixture-protocol';
const row=(id,seconds,revision)=>({id,user_id:'r1',created_at:t(seconds),scope_key:'GH-01-K01',unit_id:'GH-01-K01',scene_type:'game',candidate_kind:'task_difficulty',delivery_decision:'stay_silent',reason_codes_json:'["student_declined"]',evidence_snapshot_json:JSON.stringify({engineeringControl:{revision},confirmedGapCount:1,hiddenAnswer:'FUTURE_SECRET'}),evidence_refs_json:JSON.stringify([{id:'valid',capturedAt:t(seconds-1),correct:false},{id:'future',capturedAt:t(59),correct:true}])});
const source={runs:[{id:'r1',ownerId:'owner1',mode:'preview',protocolFingerprint:fingerprint},{id:'r2',ownerId:'owner1',mode:'formal',consentedAt:t(0),protocolFingerprint:fingerprint},{id:'r3',ownerId:'owner2',mode:'preview',protocolFingerprint:'other'}],tables:{
 learner_preference_history:[{user_id:'r1',document:JSON.stringify({revision:1,at:t(0),answers:{D3:{value:'hint'},D5:{value:'ask'}},profile:{initialSupportLevel:'L2'}})},{user_id:'r1',document:JSON.stringify({revision:2,at:t(20),answers:{D3:{value:'example'},D5:{value:'cue'}},profile:{initialSupportLevel:'L5'}})}],
 proactive_decisions:[row('d1',10,1),row('d2',30,2),{...row('formal',10,1),user_id:'r2'}],
 events:[{id:'earlier',user_id:'r1',created_at:t(5),payload:JSON.stringify({eventType:'parameter_commit',unitId:'GH-01-K01',data:{parameter:'input_x',newValue:2,answer:'HIDDEN_ANSWER'}})},{id:'future',user_id:'r1',created_at:t(50),payload:JSON.stringify({eventType:'parameter_commit',data:{value:'FUTURE_SECRET'}})},{id:'filter',user_id:'r1',created_at:t(40),payload:JSON.stringify({eventType:'proactive_candidate_suppressed',unitId:'GH-01-K01',data:{kind:'task_difficulty',reason:'client_cooldown'}})}],
 quiz_results:[{user_id:'r1',unit_id:'GH-01-K01-formative',question_id:'q-future',created_at:t(55),is_correct:1}]}};
const options={mode:'preview',protocolFingerprint:fingerprint,splitSalt:'synthetic-replay-seed-20261031'},bundle=buildReplay(source,options),inputs=modelInputs(bundle),text=JSON.stringify(inputs);
assert.equal(bundle.caseCount,3);assert.equal(bundle.participantCount,1);assert.equal(bundle.cases[0].input.configuration.revision,1);assert.equal(bundle.cases[1].input.configuration.revision,2);
assert.equal(bundle.cases[0].input.currentEvidence.refs.length,1);assert.equal(bundle.cases[0].input.history.length,1);
assert.ok(!/FUTURE_SECRET|HIDDEN_ANSWER|q-future|student_declined|owner1/.test(text),'未来信息、原决策和身份不进入模型输入');
assert.equal(bundle.cases[0].evaluation.subsequentIndependentResults.length,1);assert.equal(bundle.cases[2].observedPolicy.source,'client_filter');
assert.deepEqual(modelInputs(buildReplay(source,options)),inputs,'重复导出稳定');
assert.equal(new Set(bundle.cases.map(c=>c.split)).size,1,'同一参与者不跨数据集');
for(const variant of ['no_current_recheck','no_initial_evidence'])assert.deepEqual(require('../lib/education-replay-runner').ablate(inputs[0].input,variant).history,inputs[0].input.history,'无题目ID的决策证据消融不得误删操作历史');
assert.throws(()=>buildReplay(source,{...options,mode:undefined}),/明确/);
assert.equal(buildReplay(source,{...options,mode:'formal'}).caseCount,0,'不把体验记录混入正式数据');
console.log('三组回放适配通过：逐决策配置、静默与前端过滤、按人划分、未来信息隔离、研究模式和协议隔离。');
require('../lib/education-replay-runner').run(inputs,{models:['synthetic'],complete:async()=>({text:JSON.stringify({action:'silent',rationale:'合成验证现有运行器能够直接读取三组输入。',confidence:.5})})}).then(rows=>{assert.equal(rows.length,3);assert.ok(rows.every(r=>r.status==='ok'));console.log('三组模型输入已通过现有回放运行器。');}).catch(e=>{console.error(e);process.exitCode=1;});
