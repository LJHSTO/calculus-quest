"use strict";
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const parse=x=>{if(x&&typeof x==='object')return x;try{return JSON.parse(x||'{}');}catch{return {};}};
const at=x=>Date.parse(x||'');
function buildReplay(source,{mode,protocolFingerprint,splitSalt}={}){
 if(!['preview','formal'].includes(mode)||!protocolFingerprint)throw new Error('请明确选择体验或正式记录，以及一个协议指纹');
 if(!splitSalt||splitSalt.length<16)throw new Error('回放划分种子至少16字符');
 const alias=id=>crypto.createHmac('sha256',splitSalt).update(String(id)).digest('hex').slice(0,24);
 const runs=(source.runs||[]).filter(r=>r.mode===mode&&r.protocolFingerprint===protocolFingerprint&&(mode!=='formal'||r.consentedAt));
 const owners=[...new Set(runs.map(r=>r.ownerId))].sort((a,b)=>alias(a).localeCompare(alias(b)));
 const splits=new Map(owners.map((id,i)=>[id,i<Math.floor(owners.length/2)?'development':i<Math.floor(owners.length*3/4)?'validation':'test']));
 const tables=source.tables||{},cases=[],excluded=[];
 const values=answers=>Object.fromEntries(Object.entries(answers||{}).map(([id,a])=>[id,a.value]));
 const metricKeys=['confirmedGapCount','sceneAttemptCount','sceneAttemptFailures','assistedTaskFailures','parameterCommitCount','dwellSeconds','independentAttemptSuccess','independentAttemptVerified','naturalBoundary','boundaryEventType','assessmentProtected','uncertaintyScore'];
 const operationKeys=['parameter','oldValue','newValue','value','sceneType','scene_type','correct','independent','reason','kind'];
 for(const run of runs){
  const configs=(tables.learner_preference_history||[]).filter(r=>r.user_id===run.id).map(r=>parse(r.document)).sort((a,b)=>at(a.at)-at(b.at));
  const events=(tables.events||[]).filter(r=>r.user_id===run.id).map(r=>({...r,event:parse(r.payload)}));
  const decisions=(tables.proactive_decisions||[]).filter(r=>r.user_id===run.id);
  const filtered=events.filter(r=>r.event.eventType==='proactive_candidate_suppressed').map(r=>({id:r.id,user_id:run.id,created_at:r.created_at,scope_key:r.event.unitId,scene_type:r.event.sceneType||r.event.data?.sceneType,
    candidate_kind:r.event.data?.kind,delivery_decision:'stay_silent',reason_codes_json:JSON.stringify([r.event.data?.reason||'client_filter']),evidence_snapshot_json:'{}',evidence_refs_json:'[]',clientFiltered:true}));
  const support=events.filter(r=>['support_cycle_decision_generate','support_cycle_decision_silent','support_cycle_generation_discarded','support_cycle_generation_deferred'].includes(r.event.eventType)).map(r=>({id:r.id,user_id:run.id,created_at:r.created_at,scope_key:r.event.unitId,scene_type:r.event.data?.sceneType,
    candidate_kind:r.event.eventType,action:r.event.eventType==='support_cycle_generation_discarded'?'cancel':r.event.eventType==='support_cycle_generation_deferred'?'defer':null,
    delivery_decision:r.event.eventType==='support_cycle_decision_generate'?'intervene':'stay_silent',reason_codes_json:JSON.stringify([r.event.data?.reason||r.event.eventType]),
    evidence_snapshot_json:JSON.stringify({engineeringControl:{revision:r.event.data?.profileRevision}}),evidence_refs_json:'[]',supportCycle:true}));
  for(const decision of [...decisions,...filtered,...support]){
   const cutoff=decision.created_at,evidence=parse(decision.evidence_snapshot_json),revision=evidence.engineeringControl?.revision;
   const config=[...configs].reverse().find(c=>at(c.at)<=at(cutoff)&&(revision==null||revision===c.revision));
   if(!Number.isFinite(at(cutoff))||!config){excluded.push({caseId:alias(decision.id),reason:'configuration_or_time_unavailable'});continue;}
   const refs=parse(decision.evidence_refs_json);
   const safeRefs=(Array.isArray(refs)?refs:[]).filter(r=>Number.isFinite(at(r.capturedAt))&&at(r.capturedAt)<=at(cutoff)).map(r=>({id:alias(r.id),sourceType:r.sourceType,capturedAt:r.capturedAt,serverRechecked:r.serverRechecked===true,independent:r.independent===true,correct:typeof r.correct==='boolean'?r.correct:null}));
   const history=events.filter(r=>at(r.created_at)<=at(cutoff)&&['parameter_commit','knowledge_scene_select','courseware_challenge_result','challenge_result','free_exploration_observation'].includes(r.event.eventType)).map(r=>{
    const d=r.event.data||{};return {eventId:alias(r.id),at:r.created_at,type:r.event.eventType,knowledgePointId:r.event.unitId,data:Object.fromEntries(operationKeys.filter(k=>['boolean','number','string'].includes(typeof d[k])).map(k=>[k,typeof d[k]==='string'?d[k].slice(0,120):d[k]]))};
   });
   const profile=config.profile||{},protectedTask=evidence.assessmentProtected===true||/-(pre|post|formative|retention|transfer)$/.test(decision.unit_id||'');
   const initial=evidence.boundaryRecheckAudit?.initialEvidenceSnapshot||evidence.initialEvidenceSnapshot;
   const input={knowledgePointId:decision.scope_key,sceneType:decision.scene_type,cutoff,candidateKind:decision.candidate_kind,configuration:{revision:config.revision,at:config.at,values:values(config.answers)},
    ...(initial&&Number.isFinite(at(initial.capturedAt))&&at(initial.capturedAt)<=at(cutoff)?{initialEvidence:{at:initial.capturedAt,...Object.fromEntries(metricKeys.filter(k=>['boolean','number','string'].includes(typeof initial[k])).map(k=>[k,initial[k]]))}}:{}),
    currentEvidence:{at:cutoff,refs:safeRefs,...Object.fromEntries(metricKeys.filter(k=>['boolean','number','string'].includes(typeof evidence[k])).map(k=>[k,evidence[k]]))},
    history,allowedActions:protectedTask?['silent','cancel','defer']:['silent','present','cancel','defer'],
    constraints:{protectedTask,requiresConfirmation:config.answers?.D5?.value==='ask',supportDepth:profile.initialSupportLevel||null,learnerCanClose:true},prefixCoverage:'available_structured_events_before_decision'};
   const outcomes=(tables.quiz_results||[]).filter(r=>r.user_id===run.id&&r.unit_id===decision.scope_key+'-formative'&&at(r.created_at)>at(cutoff)).map(r=>({at:r.created_at,questionId:r.question_id,correct:[0,1].includes(r.is_correct)?r.is_correct===1:null}));
   const silent=decision.delivery_decision==='stay_silent'||decision.clientFiltered;
   cases.push({caseId:alias(decision.id),participant:alias(run.ownerId),run:alias(run.id),split:splits.get(run.ownerId),protocolFingerprint,input,inputHash:hash(input),
    observedPolicy:{action:['cancel','defer'].includes(decision.action)?decision.action:silent?'silent':'present',deliveryDecision:decision.delivery_decision,reasonCodes:parse(decision.reason_codes_json),source:decision.clientFiltered?'client_filter':decision.supportCycle?'support_cycle':'server_policy',provenance:'observed_rule_not_human_gold'},
    evaluation:{subsequentIndependentResults:outcomes},annotation:{helpNeed:null,interruptibility:null,preferredAction:null,raterIds:[],adjudicated:false}});
  }
 }
 cases.sort((a,b)=>at(a.input.cutoff)-at(b.input.cutoff)||a.caseId.localeCompare(b.caseId));
 return {schemaVersion:'three-arm-education-replay-v1',dataClass:mode==='preview'?'engineering_preview_records':'formal_consented_records_for_review',mode,sourceFingerprint:protocolFingerprint,
  splitSeedFingerprint:hash(splitSalt),generatedAt:new Date().toISOString(),participantCount:owners.length,caseCount:cases.length,excluded,
  limitations:['后续表现仅在评价侧，模型输入不包含未来答案、问卷或分组标签。','观察策略与人工标签分开；回放不估计另一种帮助的学习收益。'],cases};
}
module.exports={buildReplay,modelInputs:require('./education-replay').modelInputs};
