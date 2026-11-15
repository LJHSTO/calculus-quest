'use strict';
const assert=require('node:assert/strict'),C=require('../app/shared/learner-preferences');
(async()=>{
 const SQL=await require('sql.js')(),database=new SQL.Database();
 const db={getDbSync:()=>database,saveNow(){},getQuizResultsByUser:()=>[]};
 const study=require('../lib/three-arm-study').createStore({db});
 study.get('learner');
 database.run(`CREATE TABLE events(id TEXT,user_id TEXT,payload TEXT,created_at TEXT);
 CREATE TABLE learner_preference_history(user_id TEXT,document TEXT);
 CREATE TABLE proactive_decisions(id TEXT,scope_key TEXT,unit_id TEXT,scene_type TEXT,action TEXT,support_level TEXT,evidence_snapshot_json TEXT);
 CREATE TABLE proactive_interventions(id TEXT,decision_id TEXT,user_id TEXT,status TEXT,shown_at TEXT,resolution TEXT,resolved_at TEXT,followup_outcome_json TEXT,presentation TEXT,created_at TEXT);
 CREATE TABLE learning_assistant_messages(id TEXT,user_id TEXT,role TEXT,context_json TEXT,conversation_id TEXT,unit_id TEXT,knowledge_point_id TEXT,created_at TEXT);`);
 const at='2026-11-14T01:00:00Z',run={id:'learner',arm:'B',mode:'preview',configuredAt:at,createdAt:at,reviewedStages:[]};
 database.run('INSERT INTO three_arm_runs VALUES(?,?,?,?,?,?)',['learner','owner','study','preview','B',JSON.stringify(run)]);
 database.run('INSERT INTO learner_preference_history VALUES(?,?)',['learner',JSON.stringify({revision:1,at,answers:C.defaults()})]);
 for(const [i,outcome]of ['independent_attempt_success','continued_friction','verification_declined'].entries()){
  database.run('INSERT INTO proactive_decisions VALUES(?,?,?,?,?,?,?)',['decision'+i,'GH-01-K01','GH-01-K01-formative','quiz','review_mistake','L2','{}']);
  database.run('INSERT INTO proactive_interventions VALUES(?,?,?,?,?,?,?,?,?,?)',['offer'+i,'decision'+i,'learner','resolved',at,'accepted',at,JSON.stringify({independentAttempt:{outcome,checkId:'check'+i}}),'{}',at]);
 }
 const message=(id,role,context)=>database.run('INSERT INTO learning_assistant_messages VALUES(?,?,?,?,?,?,?,?)',[id,'learner',role,JSON.stringify(context),'conversation','GH-01-K01-formative','GH-01-K01',at]);
 message('u1','user',{questionId:'q1',requestId:'r1',proactiveInterventionId:'offer0'});
 message('a1','assistant',{questionId:'q1',requestId:'r1'});
 message('u2','user',{questionId:'q1',requestId:'r2',proactiveInterventionId:'offer0'});
 message('a2','assistant',{questionId:'q1',requestId:'r2'});
 message('u3','user',{questionId:'q2',requestId:'r3'});
 message('a3','assistant',{questionId:'q2',requestId:'r3'});
 database.run('INSERT INTO events VALUES(?,?,?,?)',['visible','learner',JSON.stringify({eventType:'knowledge_answer_visible',data:{messageId:'a1',qualifiedVisible:true}}),at]);
 const rounds=study.review('learner').phases[0].rounds;
 assert.deepEqual(rounds.filter(r=>r.initiator!=='learner').map(r=>r.check),['correct','incorrect','skipped']);
 const linked=rounds.find(r=>r.interventionId==='offer0');
 assert.equal(linked.followups,1,'首次接受后的消息不能算追问');
 assert.equal(linked.helpSeenAt,new Date(at).toISOString());
 const own=rounds.find(r=>r.initiator==='learner');
 assert.equal(own.questionId,'q2','另一个题目的主动提问不能归到旧提醒');
 assert.equal(own.helpSeenAt,null,'生成回复不等于显示正文');
 assert.equal(rounds.filter(r=>['agent_ask','agent_quiz_review'].includes(r.initiator)).length,3);
 database.close();console.log('r19 review: 检查结果、主动提问归属、正文可见性、首条消息与追问区分通过');
})().catch(e=>{console.error(e);process.exitCode=1;});
