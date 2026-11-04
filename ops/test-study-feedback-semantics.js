'use strict';
const assert=require('node:assert/strict');
async function main(){
 const assistant=require('../lib/learning-assistant'),route=require('../data/multi-scene-learning-route.json'),index=assistant.buildCourseContextIndex(route);
 const resolve=sceneType=>assistant.resolveAssistantContext({index,chapterId:'V14-C1',unitId:'GH-02-K01',sceneType,contextRef:{kind:'lesson',scope:'lesson'}});
 const payload=resolved=>{const p=assistant.buildAssistantPrompt({resolved,question:'表中先看哪一列？'});return JSON.parse(p.user.slice(p.user.indexOf('{')));};
 const slide=payload(resolve('slide'));assert.match(slide.currentLesson.summary,/x不能取哪个值？对，就是1/);assert.ok(slide.currentLesson.objects.some(o=>o.type==='table'&&o.text.includes('0.99')));
 const interactive=payload(resolve('simulation'));assert.equal(interactive.currentLesson,null);assert.match(interactive.interactiveScene.activity.fact,/x=2/);
 const goals=require('../lib/support-goals');const prompt=JSON.parse(goals.promptFor({scope:'GH-02-K01',sceneType:'slide',need:{need:'concept'},plan:{primaryGoal:'cognitive',strategy:'concept_hint',knowledgeScaffoldLevel:'L2'}}).user);assert.ok(prompt.currentLesson.objects.some(o=>o.type==='table'));
 const SQL=await require('sql.js')(),database=new SQL.Database(),records=[];const time=Date.parse('2026-11-03T12:00:00Z');
 database.run('CREATE TABLE events(id TEXT,user_id TEXT,type TEXT,payload TEXT,created_at TEXT)');
 database.run('CREATE TABLE proactive_decisions(id TEXT,scope_key TEXT,unit_id TEXT,scene_type TEXT,action TEXT,evidence_snapshot_json TEXT)');
 database.run('CREATE TABLE proactive_interventions(id TEXT,decision_id TEXT,user_id TEXT,status TEXT,shown_at TEXT,resolved_at TEXT,resolution TEXT,followup_outcome_json TEXT,created_at TEXT)');
 const db={getDbSync:()=>database,saveNow(){},upsertUser(){},currentLearningGeneration:()=>1,getQuizResultsByUser:()=>records};
 const preferences=require('../lib/learner-preferences').createStore({db});const study=require('../lib/three-arm-study').createStore({db,preferences,clock:()=>time+60000});const run=study.resolve({id:'synthetic-feedback'},'B');
 const initial=preferences.read(run.id);preferences.save(run.id,{answers:initial.answers,expectedRevision:initial.revision,generation:1,experimental:true,configurationWindow:{kind:'initial_configuration'}});study.confirm(run.id);
 const config=preferences.read(run.id);config.at=new Date(time).toISOString();database.run('UPDATE learner_preference_history SET document=? WHERE id=(SELECT id FROM learner_preference_history WHERE user_id=? ORDER BY rowid DESC LIMIT 1)',[JSON.stringify(config),run.id]);
 for(const [i,offset,unit]of [['before',1000,'GH-01-K01'],['after',4000,'GH-01-K01'],['other',5000,'GH-01-K02']])records.push({id:i,unit_id:unit+'-formative',question_id:i,phase:'formative',is_correct:1,created_at:new Date(time+offset).toISOString()});
 for(const [id,action,offset]of [['invitation','review_mistake',2000],['hint','concept_hint',3000]]){
  const at=new Date(time+offset).toISOString();database.run('INSERT INTO proactive_decisions VALUES(?,?,?,?,?,?)',[id,'GH-01-K01','GH-01-K01-formative','slide',action,JSON.stringify({engineeringControl:{revision:config.revision}})]);
  database.run('INSERT INTO proactive_interventions VALUES(?,?,?,?,?,?,?,?,?)',[id,id,run.id,'shown',at,'','',JSON.stringify({shownExposure:{qualifiedVisible:true}}),at]);
  database.run('INSERT INTO events VALUES(?,?,?,?,?)',[id,run.id,'learning_event',JSON.stringify({eventType:'proactive_surface_visible',data:{decisionId:id,qualifiedVisible:true,exposureKind:id==='hint'?'support_content':'offer'}}),at]);
 }
 const linked=study.review(run.id).linked.find(c=>c.revision===config.revision);
 assert.equal(linked.displayVersion,1,'自主初始配置展示为第1版，系统预置不算学生的一版');
 assert.equal(study.review(run.id).linked.length,1);assert.equal(study.review(run.id).phases.length,2);
 assert.equal(study.review(run.id).phases[0].points.length,3);assert.equal(study.review(run.id).phases[0].results.length,3);assert.equal(study.review(run.id).phases[1].started,false);
 assert.equal(linked.invitations,1);assert.equal(linked.visibleInvitations,1);assert.equal(linked.helpRounds,1);assert.equal(linked.visible,1);assert.equal(linked.accepted,0,'正文可见不要求点击接受');
 assert.deepEqual(linked.configurationResults.map(r=>r.id),['before','after','other']);assert.deepEqual(linked.independentResults.map(r=>r.id),['after'],'先作答与其他知识点不混入帮助后结果');assert.equal(linked.experiences[0].sceneType,'quiz');
 database.run('INSERT INTO events VALUES(?,?,?,?,?)',['duplicate',run.id,'learning_event',JSON.stringify({eventType:'proactive_surface_visible',data:{decisionId:'hint',qualifiedVisible:true,exposureKind:'support_content'}}),new Date(time+10000).toISOString()]);
 assert.deepEqual(study.review(run.id).linked.find(c=>c.revision===config.revision).independentResults.map(r=>r.id),['after'],'刷新产生重复回执不能挪动首次曝光时间');
 database.run('DELETE FROM events');assert.equal(study.review(run.id).linked.find(c=>c.revision===config.revision).visible,0,'旧卡片可见回执不能追认为正文可见');
 database.close();console.log('通过：当前讲解与互动数值隔离；询问、正文可见、接受分别统计；配置期间与帮助后同知识点成绩分开；检测结果场景可追溯。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
