'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(path.join(__dirname,'../app/main/knowledge-assistant.js'),'utf8');
const fn=s.slice(s.indexOf('  function coursewareProgressScope()'),s.indexOf('  function quizAssistantLocked('));
function context(overrides={}){const c={state:{participant:{participantId:'study-synthetic'}},global:{StudyEntry:{arm:'B'},ThreeArmStudyUI:{run:{id:'study-synthetic'}}},learningSnapshotGeneration:1,learningSnapshotReady:true,proactiveStudy:{loaded:true},proactiveStudyKey:'study-synthetic|V14-C1',isSignedInNow:()=>true,courseMeta:()=>({chapterId:'V14-C1'}),activeProactiveOutcomeSession:()=>null,...overrides};vm.createContext(c);vm.runInContext(fn+'\nthis.scope=coursewareProgressScope',c);return c;}
assert.equal(context().scope().runId,'study-synthetic');
for(const change of [{learningSnapshotReady:false},{learningSnapshotGeneration:0},{learningSnapshotGeneration:-1},{learningSnapshotGeneration:1.5},{proactiveStudy:{loaded:false}},{proactiveStudyKey:'different-owner|V14-C1'},{proactiveStudy:{loaded:true,agentAssistanceBlocked:true}},{isSignedInNow:()=>false},{activeProactiveOutcomeSession:()=>({id:'protected'})},{global:{StudyEntry:{arm:'assigned'},ThreeArmStudyUI:{run:{id:'old-study'}}}},{global:{StudyEntry:{arm:'B'},ThreeArmStudyUI:{run:null}}}])assert.equal(context(change).scope(),null);
assert.equal(context({global:{}}).scope().runId,'ordinary');
console.log('课件进度作用域13项：服务器恢复、保护状态、正代次、轮次归属及普通学习通过');
