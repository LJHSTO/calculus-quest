'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../app/shared/learner-preferences'),controls=require('../lib/research-controls');
const goals=require('../lib/support-goals'),{createStore}=require('../lib/support-cycle');
const adapter=require('../lib/proactive-policy/adapters/functions-limits-r2');
const policy=require('../lib/proactive-policy');
async function main(){
 const SQL=await require('sql.js')(),database=new SQL.Database();let time=Date.parse('2026-10-30T12:00:00Z');
 const events=[],db={getDbSync:()=>database,saveNow(){},insertEvent:e=>events.push(e)};
 const store=createStore({db,clock:()=>time,experimentId:'synthetic-configuration-96'});
 const prefs=require('../lib/learner-preferences').createStore({db});
 const config=policy.configFromEnv({PROACTIVE_POLICY_MODE:'active',PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_ASSIGNMENT_SALT:'synthetic',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full'});
 const rows=[];let combinations=[C.defaults()];
 for(const d of C.dimensions){
  assert.equal(C.reasonsFor(d.id).length,6,'each new choice has six rationale options');
  for(const [legacy]of C.reasons){
   assert.ok(C.reasonsFor(d.id,legacy).length<=7);
   assert.ok(C.reasonsFor(d.id,legacy).some(([id])=>id===legacy));
   assert.ok(C.reasonLabel(d.id,legacy));
  }
  combinations=combinations.flatMap(a=>C.optionsFor(d.id,true).map(([value])=>({...a,[d.id]:{value,reason:'try',note:''}})));
 }
 assert.equal(combinations.length,96);
 for(let i=0;i<combinations.length;i++){
  const a=combinations[i],user='synthetic-config-'+i,scope='GH-01-K01';
  const record=prefs.save(user,{answers:a,experimental:true,expectedRevision:0,elapsedMs:1234});
  const p=controls.validate(record.profile),summary=C.behaviorSummary(a);
  assert.equal(summary.length,6);assert.equal(new Set(summary.map(([id])=>id)).size,6);
  assert.equal(p.minimumEvidenceFamilies,a.D1.value==='cautious'?2:1);
  assert.equal(p.helpNeed,a.D1.value==='cautious'?.8:.7);
  assert.equal(p.cooldownSeconds,a.D2.value==='quiet'?180:60);
  assert.equal(p.placement,a.D4.value);assert.equal(p.authorityLevel,a.D5.value==='cue'?'A2':'A1');
  const decisionInput={config:controls.effectiveConfig(config,{profile:p}),assignment:{condition:'treatment_full'},context:{chapterId:'V14-C1',unitId:scope,sceneType:'simulation',isQuiz:false},signal:{kind:'quiet_dwell'},evidence:{families:['result','time'],dwellSeconds:180,confirmedGapCount:1,naturalBoundary:true},budget:{remaining:10},now:time};
  const decision=policy.evaluate(decisionInput);
  assert.equal(decision.displayAllowed,a.D1.value==='standard','same medium-strength trace is allowed by standard, suppressed by cautious');
  if(decision.displayAllowed)assert.equal(decision.supportLevel,({hint:'L2',guided:'L3',example:'L5'})[a.D3.value]);
  assert.equal(policy.evaluate({...decisionInput,evidence:{...decisionInput.evidence,naturalBoundary:false}}).displayAllowed,false);
  assert.equal(policy.evaluate({...decisionInput,context:{...decisionInput.context,isQuiz:true,phase:'pre',quizSubmitted:false}}).displayAllowed,false);
  assert.equal(policy.evaluate({...decisionInput,assignment:{condition:'control'}}).displayAllowed,false);
  const args={profile:p,profileRevision:1,decisionId:'decision-'+i,signal:{kind:'repeated_parameter'},evidence:{confirmedGapCount:1,naturalBoundary:true,boundaryEventType:'parameter_commit',evidenceRefs:[{id:'answer-'+i,sourceType:'quiz_result',capturedAt:new Date(time).toISOString()}]}};
  const invited=store.invite(user,scope,1,args);
  assert.equal(Boolean(invited),a.D5.value==='ask','cue does not silently enter the confirmation-only knowledge path');
  if(invited){assert.equal(invited.status,'awaiting_confirmation');assert.equal(invited.content,null);}
  let c=store.report(user,scope,1,{need:'concept',confirmed:true,...(invited?{inquiryId:invited.id}:{})},p,1);
  assert.equal(c.plan.knowledgeScaffoldLevel,({hint:'L2',guided:'L3',example:'L5'})[a.D3.value]);
  let calls=0;const generate=async input=>{calls++;return goals.generateSupport(input,{live:false});};
  const guard=()=>({profileRevision:1,protected:false,boundary:true,disabled:false,occupied:false});
  await store.advance(user,scope,1,{guard:()=>({...guard(),protected:true}),generate});assert.equal(calls,0);
  await store.advance(user,scope,1,{guard:()=>({...guard(),occupied:true}),generate});assert.equal(calls,0);
  await store.advance(user,scope,1,{guard:()=>({...guard(),boundary:false}),generate});assert.equal(calls,0);
  c=await store.advance(user,scope,1,{guard,generate});assert.equal(c.status,'offered');assert.equal(calls,1);
  assert.equal(c.content.audit.fallback,true);assert.ok(c.content.message);
  c=store.act(user,c.id,1,{action:'feedback',result:'not_helped',requestMore:true},{adapter});
  if(a.D6.value==='followup'){
   assert.equal(c.status,'queued');assert.equal(Date.parse(c.dueAt)-time,p.cooldownSeconds*1000);
   await store.advance(user,scope,1,{guard,generate});assert.equal(calls,1);
   time+=p.cooldownSeconds*1000;c=await store.advance(user,scope,1,{guard,generate});assert.equal(calls,2);
   c=store.act(user,c.id,1,{action:'feedback',result:'not_helped',requestMore:true},{adapter});assert.equal(c.status,'engaged');
  }else {assert.equal(c.status,'engaged');assert.equal(calls,1);}
  store.act(user,c.id,1,{action:'close'},{adapter});
  rows.push({id:i+1,values:Object.fromEntries(Object.entries(a).map(([id,v])=>[id,v.value])),profileHash:record.hash,policy:{mediumEvidenceAllowed:decision.displayAllowed,supportLevel:decision.supportLevel,reasons:decision.reasonCodes},model:'mock',calls,passed:true});
 }
 // Legacy reasons remain readable and valid across the new UI version.
 const legacy=C.defaults();for(const a of Object.values(legacy))a.reason='independence';assert.doesNotThrow(()=>C.validate(legacy));
 const ordinary=structuredClone(legacy);ordinary.D5.value='request';assert.equal(C.profile(ordinary,{}).proactivity,'reactive');assert.throws(()=>C.validate(ordinary,{experimental:true}));
 const out=path.join(__dirname,'../output/learner-configuration-20261030');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'contract-matrix.json'),JSON.stringify({passed:true,synthetic:true,version:C.version,scope:'saved policy, support planning, confirmation gate, protected/busy/boundary silence, fallback and follow-up limits; not a real-model or human test',combinations:rows.length,eventCount:events.length,rows},null,2));
 console.log('PASS: 96 saved configurations; six/seven rationale bound; legacy compatibility; support content level, confirmation, silence, fallback and follow-up branches.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
