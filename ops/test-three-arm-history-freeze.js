"use strict";
const assert=require('node:assert/strict');
async function main(){
 const SQL=await require('sql.js')(),database=new SQL.Database();let time=Date.parse('2026-10-31T12:00:00Z'),runtime={build:'fixture-1',prompt:'prompt-1'};const answers=[];
 database.run('CREATE TABLE events(id TEXT PRIMARY KEY,user_id TEXT,type TEXT,payload TEXT,created_at TEXT)');
 const db={getDbSync:()=>database,saveNow(){},upsertUser(){},currentLearningGeneration:()=>1,getQuizResultsByUser:()=>answers,
  insertEvent:e=>database.run('INSERT INTO events VALUES(?,?,?,?,?)',[e.id,e.user_id,e.type,JSON.stringify(e.payload),e.created_at])};
 const preferences=require('../lib/learner-preferences').createStore({db});
 const makeStudy=()=>require('../lib/three-arm-study').createStore({db,preferences,clock:()=>time,runtimeManifest:()=>structuredClone(runtime)});
 const study=makeStudy(),run=study.resolve({id:'synthetic-owner'},'B'),support=require('../lib/support-cycle').createStore({db,clock:()=>time,experimentId:'synthetic-history'});
 const profile={...require('../lib/research-controls').defaults,supportFollowups:1,cooldownSeconds:60,ttlSeconds:900};
 let revision=preferences.read(run.id).revision;
 const guard=()=>({profileRevision:revision,boundary:true,protected:false,disabled:false,occupied:false});
 const generate=async()=>({message:'核对同一个输入的输出是否唯一。',nextStep:'选择一个输入检查连线。',audit:{provider:'synthetic',contentHash:'hash-'+time}});
 let c=support.report(run.id,'GH-01-K01',1,{need:'concept',confirmed:true,sceneType:'game'},profile,revision);
 c=await support.advance(run.id,c.scope,1,{guard,generate});
 const expose=()=>support.act(run.id,c.id,1,{action:'exposed',round:c.rounds,visibleMs:1000,visibleFraction:.5},{});
 c=expose();time+=1000;
 answers.push({id:'independent-1',unit_id:'GH-01-K01-formative',question_id:'q1',phase:'formative',is_correct:1,created_at:new Date(time).toISOString()});
 c=support.act(run.id,c.id,1,{action:'feedback',result:'not_helped',requestMore:true},{});time+=61000;
 c=await support.advance(run.id,c.scope,1,{guard,generate});
 let linked=study.review(run.id,support.state(run.id,1)).linked.find(x=>x.revision===revision);
 assert.equal(linked.visible,1);assert.equal(linked.helpRounds,2);assert.equal(linked.supportCycles,1);assert.equal(linked.independentResults.length,1,'第二轮未见不能抹去第一轮后独立作答');
 c=expose();c=expose();linked=study.review(run.id,support.state(run.id,1)).linked.find(x=>x.revision===revision);
 assert.equal(linked.visible,2);assert.equal(linked.visibleCycles,1);
 for(let i=0;i<3;i++)assert.equal(makeStudy().review(run.id,[]).linked.find(x=>x.revision===revision).visible,2,'刷新与重复回执不增加轮数');
 // Restore a pre-migration database: only the original cycle and event log remain.
 database.run('DELETE FROM learner_support_rounds');
 linked=study.review(run.id,[]).linked.find(x=>x.revision===revision);assert.equal(linked.visible,2);assert.equal(linked.helpRounds,2);
 support.cancelForConfiguration(run.id,1);time+=1000;
 preferences.save(run.id,{answers:preferences.read(run.id).answers,expectedRevision:revision,generation:1,experimental:true});
 revision=preferences.read(run.id).revision;
 c=support.report(run.id,'GH-01-K02',1,{need:'concept',confirmed:true,sceneType:'game'},profile,revision);c=await support.advance(run.id,c.scope,1,{guard,generate});c=expose();
 const history=study.review(run.id,[]).linked;assert.equal(history.find(x=>x.revision===revision).visible,1);assert.equal(history.find(x=>x.revision===revision-1).visible,2);
 const exported=study.exportData();assert.equal(exported.tables.learner_support_rounds.length,3);assert.ok(exported.tables.learner_support_rounds.every(r=>JSON.parse(r.document).research.runId===run.id));
 const p=study.approveBaseline({reviewer:'合成测试教师',confirmed:true});const formal=study.enroll({id:'synthetic-formal'},{consent:true});
 assert.equal(formal.protocolFingerprint,p.fingerprint);assert.equal(formal.studyId,p.id);assert.deepEqual(formal.runtimeManifest,runtime);
 runtime={build:'fixture-2',prompt:'prompt-2'};
 const next=study.protocol();assert.notEqual(next.id,p.id);assert.equal(next.teacherReview.status,'pending');
 assert.throws(()=>study.resolve({id:'synthetic-formal'},'assigned'),/版本/);assert.throws(()=>study.enroll({id:'synthetic-formal'},{consent:true}),/版本/);
 assert.deepEqual(study.exportData().protocols.find(x=>x.id===p.id),p,'旧协议不得被修改或借用其教师确认');
 assert.equal(makeStudy().get(formal.id).protocolFingerprint,p.fingerprint,'重启保留冻结清单');
 runtime={build:'fixture-1',prompt:'prompt-1'};assert.equal(study.resolve({id:'synthetic-formal'},'assigned').id,formal.id,'恢复原版本可继续原轮次');
 console.log('三组帮助历史与版本冻结通过：逐轮曝光、独立成绩关联、重复回执、日志恢复、配置归属、正式版本隔离与恢复。');
 database.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
