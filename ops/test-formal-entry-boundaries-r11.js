'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app/main/core.js'),'utf8');
function fn(name){const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert(start>=0);const end=source.slice(start+1).search(/\n(?:async )?function /);return source.slice(start,start+1+end);}
function boot(arm='assigned'){
 const calls=[],applied=[];const c=vm.createContext({state:{authToken:'synthetic-one',participant:{participantId:'synthetic-owner'},completed:['old-cache'],quizResults:[],currentUnitId:'old-unit'},
  window:{StudyEntry:arm?{arm}:null},multiSceneLearningRoute:null,logoutGeneration:0,learningSurfaceRestore:null,learningSnapshotReady:false,learningSnapshotGeneration:7,learningSnapshotRevision:8,
  currentChapterId:'V14-C1',currentUnitId:'old-unit',currentView:'home',chapters:[{id:'V14-C1'}],validViews:new Set(['home','learn']),
  appRelativeUrl:x=>x,applyMultiSceneLearningRoute:route=>applied.push(route),isSignedIn:()=>Boolean(c.state.authToken&&c.state.participant),
  learningDefaults:()=>({completed:[],quizResults:[],currentUnitId:'',currentView:'home'}),clearPreviewKnowledgeSceneSelections(){},normalizeLearningStateCompatibility(){},persistStateLocally(){c.persisted=(c.persisted||0)+1;},AbortSignal,
  fetch:async(url,options)=>{calls.push({url,authorization:Boolean(options?.headers?.Authorization)});return c.responses.shift();}});
 for(const name of ['learningSession','learningSessionIsCurrent','applyServerLearningSnapshot','loadMultiSceneLearningRoute','hydrateLearningState'])vm.runInContext(fn(name),c);
 return{c,calls,applied,run:expression=>vm.runInContext(expression,c)};
}
const response=(status,body)=>({ok:status===200,status,json:async()=>body});
async function main(){
 const required={ok:false,code:'study_enrollment_required',message:'请先确认参加'};
 const publicRoute=boot();publicRoute.c.responses=[response(409,required),response(200,{chapters:[]})];await publicRoute.run('loadMultiSceneLearningRoute()');
 assert.deepEqual(publicRoute.calls.map(r=>r.authorization),[true,false]);assert.equal(publicRoute.applied.length,1);
 for(const [arm,status,code]of [['A',409,'study_enrollment_required'],['',409,'study_enrollment_required'],['assigned',409,'study_runtime_mismatch'],['assigned',403,'study_enrollment_required']]){
  const rejected=boot(arm);rejected.c.responses=[response(status,{ok:false,code})];await assert.rejects(rejected.run('loadMultiSceneLearningRoute()'),e=>e.status===status);assert.equal(rejected.calls.length,1);assert.equal(rejected.applied.length,0);
 }
 const lateRoute=boot();let finish;lateRoute.c.fetch=()=>new Promise(resolve=>{finish=resolve;});const loading=lateRoute.run('loadMultiSceneLearningRoute()');lateRoute.c.state.authToken='synthetic-new-owner';finish(response(200,{chapters:[]}));await assert.rejects(loading,/账号已变化/);assert.equal(lateRoute.applied.length,0);assert.equal(lateRoute.c.multiSceneLearningRoute,null);
 const pending=boot();pending.c.responses=[response(409,required)];assert.equal(await pending.run('hydrateLearningState()'),false);assert.equal(pending.c.state.authToken,'synthetic-one');assert.equal(pending.c.state.participant.participantId,'synthetic-owner');assert.equal(pending.c.state.completed.length,0);assert.equal(pending.c.learningSnapshotReady,false);assert.equal(pending.c.learningSnapshotGeneration,0);assert.equal(pending.c.persisted,1);
 for(const arm of ['A','']){const other=boot(arm);other.c.responses=[response(409,required)];await assert.rejects(other.run('hydrateLearningState()'),e=>e.status===409);assert.equal(other.c.state.completed.length,1);}
 const mismatch=boot();mismatch.c.responses=[response(409,{ok:false,code:'study_runtime_mismatch'})];await assert.rejects(mismatch.run('hydrateLearningState()'),e=>e.status===409);assert.equal(mismatch.c.state.completed.length,1);
 const lateSnapshot=boot();lateSnapshot.c.fetch=()=>new Promise(resolve=>{finish=resolve;});const hydrating=lateSnapshot.run('hydrateLearningState()');lateSnapshot.c.state.authToken='synthetic-new-owner';lateSnapshot.c.state.completed=['new-owner-work'];finish(response(409,required));assert.equal(await hydrating,false);assert.deepEqual(lateSnapshot.c.state.completed,['new-owner-work']);assert.equal(lateSnapshot.c.persisted,undefined);
 console.log('正式入口前端边界通过：仅明确未入组可取公开路线/暂缓快照，身份保持，preview/ordinary/403/版本冲突不旁路，晚响应不覆盖新账号。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
