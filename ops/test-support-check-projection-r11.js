'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const take=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const adapter=require('../lib/proactive-policy/adapters/functions-limits-r10'),lifecycle=require('../lib/proactive-policy/lifecycle');
const scope='GH-01-K02',first=adapter.nextVerificationCheck(scope,'L2'),second=adapter.nextVerificationCheck(scope,'L2',first.id,[first.id]);
const db={getProactiveDecisionForUser:()=>({unit_id:scope,scene_type:'mindMap'}),getProactiveIntervention:()=>({user_id:'synthetic',presentation:{questionId:'q2'}})};
const factory=new Function('proactivePolicy','db','proactiveStudyConfig','proactiveStudentPreferences','proactivePendingQuietCandidate','parseStoredJson',
 take('function hasPendingProactiveCheck(','const proactiveCheckSubmissions=')+'\n'+take('function publicProactivePolicyState(','function proactivePolicyStateRecord(')+'\nreturn {hasPendingProactiveCheck,publicProactivePolicyState};');
const api=factory({lifecycle,adapterForChapter:()=>adapter},db,{chapterId:'V14-C1'},new Set(['standard','off']),()=>({}),
 (v,f)=>{try{return typeof v==='string'?JSON.parse(v):v??f;}catch{return f;}});
assert.doesNotThrow(()=>api.publicProactivePolicyState({}));
const row=life=>({user_id:'synthetic',scope_key:scope,current_level:'L2',lifecycle_json:JSON.stringify({phase:'awaiting_independent_attempt',...life})});
const completed=row({activeVerificationCheckId:first.id,lastVerificationCheckId:first.id});
assert.equal(api.hasPendingProactiveCheck(completed),false);assert.equal(api.publicProactivePolicyState(completed).verificationCheck,null);
assert.equal(api.hasPendingProactiveCheck(row({activeVerificationCheckId:'',lastVerificationCheckId:first.id,lastOutcome:'continued_friction'})),false,'旧记录缺签发ID但有已答结果，不能形成隐形锁');
const waiting=row({activeVerificationCheckId:second.id,lastVerificationCheckId:first.id});
assert.equal(api.hasPendingProactiveCheck(waiting),true);
const projected=api.publicProactivePolicyState(waiting);assert.equal(projected.verificationCheck.id,second.id);assert.equal(projected.lifecycle.activeVerificationCheckId,second.id);
assert.deepEqual(projected.checkContext,{unitId:scope,sceneType:'mindMap',questionId:'q2'});
assert.equal(Object.hasOwn(projected.verificationCheck,'answer'),false);assert.equal(Object.hasOwn(projected.verificationCheck,'correctLabel'),false);
const muted=api.publicProactivePolicyState({...waiting,student_preference:'off'});assert.equal(muted.verificationCheck.id,second.id,'关闭主动帮助不会藏起已经签发的待答题');
const valid=second.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:scope,supportLevel:'L2',checkId:second.id,response:o.value})?.correct);
const grade=adapter.gradeVerificationCheck({knowledgePointId:scope,supportLevel:'L2',checkId:second.id,response:valid.value});assert.equal(grade.correctLabel,valid.label);assert.ok(grade.explanation);
console.log('独立检查投影回归通过：空状态、已答不保护、第二轮同ID回放、问题锚点、无未答答案泄露、提交后解释。');
