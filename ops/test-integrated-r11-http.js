'use strict';
// Local-only synthetic protocol verification. Clock fixtures are patched only
// while the parent agent has stopped its dedicated database owner process.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const registry=require('../lib/assessments/functions-limits-registry'),bank=registry.forVersion();
const base=process.argv.find(v=>/^http:/.test(v))||'http://127.0.0.1:53657';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const out=path.resolve(__dirname,'../tmp/integrated-r11-http'),file=path.join(out,'private-synthetic-fixtures.json');fs.mkdirSync(out,{recursive:true});
const checks=[];
async function api(actor,route,body){
 const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':actor?.arm||'B',...(actor?.token?{Authorization:'Bearer '+actor.token}:{}),...(actor?.runId&&!route.startsWith('/api/auth/')?{'X-Study-Run':actor.runId}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,...await r.json()};
}
const ok=(value)=>{assert.equal(value.status,200,JSON.stringify(value));return value;};
async function make(label){
 const nickname='集成合成'+label+Date.now(),password='Synthetic-r11-http-only-123';
 const p=ok(await api(null,'/api/auth/register',{nickname,password}));
 const actor={token:p.token,nickname,password};const state=ok(await api(actor,'/api/study/state')).data;actor.runId=state.run.id;actor.run=state.run;
 const survey=ok(await api(actor,'/api/study/survey?stage=baseline')).data;
 ok(await api(actor,'/api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,q.options?.find(o=>o.value===3)?.value??3]))}));return actor;
}
const answer=q=>({questionId:q.id,response:q.type==='short_answer'?'合成工程验收回答：依据题目给定规则逐项核对；此处保留人工批改。':q.answer[0]});
async function quiz(actor,phase,unitId,questions){return ok(await api(actor,'/api/learning/quiz/submit',{chapterId:'V14-C1',unitId,phase,answers:questions.map(answer)}));}
async function prepareActor(actor){
 const route=ok(await api(actor,'/api/course/multi-scene-learning-route')),chapter=route.chapters.find(c=>c.id==='V14-C1');
 const qs=chapter.flow.preQuiz.questions;assert.equal(qs.length,12);assert.equal(qs.filter(q=>q.figure).length,5);assert.ok(qs.every(q=>!q.answer&&!q.analysis&&!q.rubric));
 assert.ok(chapter.modules.flatMap(m=>m.knowledgePoints).every(p=>p.formativeQuiz.questions.length===2));
 const receipt=await quiz(actor,'pre','V14-C1-pre',bank.questions('pre',actor.run.assessmentOrder[0]));assert.ok(receipt.results.every(q=>q.status==='submitted'&&!q.analysis&&q.score===null));
 const p=ok(await api(actor,'/api/learning/learner-preferences')).data,answers=p.record.answers;for(const a of Object.values(answers))a.reason='default';
 answers.D5.value='cue';
 ok(await api(actor,'/api/learning/learner-preferences',{answers,expectedRevision:p.record.revision,selectionSource:'synthetic_r11_http'}));
}
async function leaveRealIntervention(actor){
 const {chromium}=require('playwright-core'),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 try{
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});
  await page.locator('#login-identifier').fill(actor.nickname);await page.locator('#login-password').fill(actor.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('[data-view="learn"]').first().click();await page.waitForTimeout(1000);
  if(await page.locator('[data-guide-pause]').isVisible())await page.locator('[data-guide-pause]').click();
  await page.evaluate(async()=>{ensureAgenticPath().pendingPlan=null;agenticUnlockUnit('GH-01-K02','synthetic_timeout_fixture');selectUnit('GH-01-K02');await syncLearningSnapshot('synthetic_timeout_fixture');});
  await page.waitForTimeout(500);if(await page.locator('[data-guide-pause]').isVisible())await page.locator('[data-guide-pause]').click();
  await page.locator('[data-workspace-canvas="interactive"]').click();await page.locator('[data-knowledge-scene="mindMap"]').click();const frame=page.frameLocator('iframe[data-courseware-frame]');await frame.locator('.r9-native').waitFor();
  await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();await frame.getByRole('slider',{name:'准备画的f(2)',exact:true}).press('ArrowUp');await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();await page.evaluate(()=>analyticsFlushUntilSettled(20000));
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().offer?.interventionId,null,{timeout:25000});
  const offer=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().offer);actor.pendingIntervention={id:offer.interventionId,decisionId:offer.decisionId};
  await page.waitForTimeout(1200);await page.screenshot({path:path.join(out,'到期前真实未处理帮助.png')});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 const data=ok(await api(null,'/api/admin/three-arm/export')).data;
 const pending=data.tables.proactive_interventions.find(r=>r.id===actor.pendingIntervention.id);assert.ok(pending&&['offered','shown'].includes(pending.status));
 const row=data.tables.quiz_results.find(r=>r.user_id===actor.runId&&r.is_correct===1);assert.ok(row);
 actor.preservedAnswer=Object.fromEntries(['id','question_id','response','score','max_score','is_correct','status','ai_score','ai_feedback'].map(k=>[k,row[k]]));
}
async function prepare(){
 const main=await make('完整'),ui=await make('浏览器'),timeout=await make('截止'),legacy=await make('旧版');
 await prepareActor(timeout);
 await leaveRealIntervention(timeout);
 for(const actor of [main,ui]){
  await prepareActor(actor);
  for(let i=0;i<6;i++){
   await quiz(actor,'formative',bank.ids[i]+'-formative',registry.formative(i));
   if(i===2){const review=ok(await api(actor,'/api/study/review')).data;assert.equal(review.pendingStage.id,'S1');ok(await api(actor,'/api/study/review',{stage:'S1',decision:'keep',review_understanding:null,review_action:null,reason:''}));}
  }
  await quiz(actor,'post','V14-C1-post',bank.questions('post',actor.run.assessmentOrder[1]));
  const survey=ok(await api(actor,'/api/study/survey?stage=final')).data;ok(await api(actor,'/api/study/survey',{stage:'final',answers:Object.fromEntries(survey.items.map(q=>[q.id,q.options?.find(o=>o.value===3)?.value??3]))}));
 }
 const state=ok(await api(main,'/api/study/state')).data;assert.equal(state.posttestComplete,true);assert.ok(state.run.finalSurveyAt);assert.equal(state.run.regulationVersion,'regulation-transfer-r11-20261107');
 const delayed=ok(await api(main,'/api/learning/proactive/outcomes?chapterId=V14-C1')).data;assert.ok(delayed.stages.every(s=>s.status==='locked'));
 const denied=await api(main,'/api/study/regulation',{action:'start',runId:main.runId,revision:0,requestId:crypto.randomUUID()});assert.equal(denied.status,409);
 fs.writeFileSync(file,JSON.stringify({version:'synthetic-r11-fixtures-only',base,createdAt:new Date().toISOString(),main,ui,timeout,legacy},null,2));
 checks.push('r11注册、12题前测/5图、6×2形成性、阶段回顾、12题后测、最终问卷均通过真实HTTP','72小时未到，保持/迁移及调节入口均拒绝提前开始');
 fs.writeFileSync(path.join(out,'prepare-results.json'),JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks,fixtureFile:file}));
}
async function patch(){
 const target=process.argv.find(v=>v.startsWith('--db='))?.slice(5);assert.ok(target,'需要显式合成DB路径');const workspace=path.resolve(__dirname,'..'),dbPath=path.resolve(target),relative=path.relative(path.join(workspace,'tmp'),dbPath);
 assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(dbPath)==='synthetic.db');
 const fixture=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(fixture.version,'synthetic-r11-fixtures-only');
 const SQL=await require('sql.js')(),sql=new SQL.Database(fs.readFileSync(dbPath));
 function rows(q,args=[]){const s=sql.prepare(q);try{s.bind(args);const out=[];while(s.step())out.push(s.getAsObject());return out;}finally{s.free();}}
 const get=id=>JSON.parse(rows('SELECT document FROM three_arm_runs WHERE id=?',[id])[0].document),save=r=>sql.run('UPDATE three_arm_runs SET study_id=?,mode=?,document=? WHERE id=?',[r.studyId,r.mode,JSON.stringify(r),r.id]);
 const shift=(value,hours)=>value?new Date(Date.parse(value)-hours*3600000).toISOString():value;
 for(const [key,hours] of [['main',73],['ui',73],['timeout',76]]){
  const actor=fixture[key],run=get(actor.runId);assert.equal(run.mode,'preview');assert.equal(run.assessmentVersion,registry.version);
  for(const field of ['createdAt','baselineAt','configuredAt','finalSurveyAt'])run[field]=shift(run[field],hours);
  run.firstSessionBudget.startedAt=shift(run.firstSessionBudget.startedAt,hours);
  if(key==='timeout'){run.mode='formal';run.consentedAt=run.createdAt;run.syntheticClockFixture=true;}
  save(run);
  for(const row of rows('SELECT id,created_at FROM quiz_results WHERE user_id=?',[run.id]))sql.run('UPDATE quiz_results SET created_at=? WHERE id=?',[shift(row.created_at,hours),row.id]);
 }
 const old=get(fixture.legacy.runId);old.studyVersion='learner-design-feedback-functions-r10-20261106';old.assessmentVersion=registry.legacyVersion;old.delayedVersion='functions-limits-delayed-r10';old.formativeCount=3;old.studyId='synthetic-r10-archive';delete old.regulationVersion;delete old.firstSessionBudget;save(old);
 const oldRoute=require('../data/multi-scene-learning-route.json'),oldBank=registry.forVersion(registry.legacyVersion),records=oldBank.questions('pre',old.assessmentOrder[0]).map(q=>({id:'old-'+q.id,chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',questionId:q.id,questionType:q.type,questionText:q.question,response:answer(q).response,timestamp:old.createdAt}));
 const snapshot={courseAssessmentFingerprint:require('../lib/course-assessment').assessmentFingerprint(oldRoute),submittedQuizzes:['V14-C1-pre'],quizResults:records,quizAttempts:{}};
 // Use the existing snapshot columns rather than inventing participant grades.
 const columns=rows('PRAGMA table_info(snapshots)').map(r=>r.name),values={id:'synthetic-r10-clock-snapshot-'+old.id,user_id:old.id,reason:'synthetic_r10_archive_fixture',generation:1,revision:1,created_at:new Date().toISOString(),data:JSON.stringify(snapshot)};
 const names=columns.filter(k=>Object.hasOwn(values,k));sql.run(`INSERT INTO snapshots (${names.join(',')}) VALUES (${names.map(()=>'?').join(',')})`,names.map(k=>values[k]));
 fs.writeFileSync(dbPath,sql.export());sql.close();fs.writeFileSync(path.join(out,'offline-patch.json'),JSON.stringify({syntheticOnly:true,database:dbPath,at:new Date().toISOString(),changes:['main clocks -73h','timeout clocks -76h and synthetic formal mode','legacy preview version and pretest response snapshot'],answersOrGradesOverwritten:false},null,2));console.log(JSON.stringify({patched:true,database:dbPath}));
}
async function armExpiry(){
 const fixture=JSON.parse(fs.readFileSync(file,'utf8')),actor=fixture.ui;let state=ok(await api(actor,'/api/study/regulation')).data;assert.equal(state.status,'available');
 const send=async action=>{state=ok(await api(actor,'/api/study/regulation',{runId:actor.runId,revision:state.revision||0,requestId:crypto.randomUUID(),action,...(action==='start'?{}:{taskId:state.taskId,phase:state.phase})})).data;};
 await send('start');await send('begin');assert.equal(state.status,'active');console.log(JSON.stringify({armed:true,fixtureFile:path.join(out,'private-ui-fixture.json')}));
}
async function patchExpiry(){
 const target=process.argv.find(v=>v.startsWith('--db='))?.slice(5);assert.ok(target);const dbPath=path.resolve(target),relative=path.relative(path.resolve(__dirname,'../tmp'),dbPath);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(dbPath)==='synthetic.db');
 const fixture=JSON.parse(fs.readFileSync(file,'utf8')),SQL=await require('sql.js')(),sql=new SQL.Database(fs.readFileSync(dbPath)),stmt=sql.prepare('SELECT document FROM regulation_transfer_sessions WHERE run_id=?');stmt.bind([fixture.ui.runId]);assert.ok(stmt.step());const session=JSON.parse(stmt.getAsObject().document);stmt.free();assert.equal(session.status,'active');
 session.deadlineAt=new Date(Date.now()+45000).toISOString();session.startedAt=new Date(Date.parse(session.deadlineAt)-840000).toISOString();session.syntheticClockFixture=true;
 sql.run('UPDATE regulation_transfer_sessions SET document=? WHERE run_id=?',[JSON.stringify(session),fixture.ui.runId]);fs.writeFileSync(dbPath,sql.export());sql.close();console.log(JSON.stringify({patched:true,kind:'synthetic-regulation-45-second-remaining',database:dbPath}));
}
async function verify(){
 const fixture=JSON.parse(fs.readFileSync(file,'utf8')),main=fixture.main,timeout={...fixture.timeout,arm:'assigned'},legacy=fixture.legacy;
 const oldRoute=ok(await api(legacy,'/api/course/multi-scene-learning-route')),oldChapter=oldRoute.chapters.find(c=>c.id==='V14-C1');assert.ok(oldChapter.flow.preQuiz.questions.every(q=>q.id.startsWith('fl-r10-')));assert.ok(oldChapter.modules.flatMap(m=>m.knowledgePoints).every(p=>p.formativeQuiz.questions.length===3));
 const oldResults=ok(await api(legacy,'/api/learning/quiz-results'));assert.equal(oldResults.data.filter(q=>q.phase==='pre').length,12);
 const upgraded=ok(await api(legacy,'/api/study/preview/new',{previousRunId:legacy.runId})).data.run;assert.notEqual(upgraded.id,legacy.runId);assert.equal(upgraded.previousRunId,legacy.runId);assert.equal(ok(await api(legacy,'/api/study/preview/new',{previousRunId:legacy.runId})).data.run.id,upgraded.id);
 const newActor={...legacy,runId:upgraded.id};assert.equal(ok(await api(newActor,'/api/study/previous')).data.results.length,12);assert.equal(ok(await api(newActor,'/api/learning/quiz-results')).data.length,0);checks.push('旧r10快照恢复、旧3题route保持、显式新体验幂等且旧成绩保留、新run不串成绩');
 const beforeCleanup=ok(await api(null,'/api/admin/three-arm/export')).data;
 assert.ok(!beforeCleanup.records.some(r=>r.run_id===timeout.runId&&r.kind==='time_limit_end'),'必须是fresh过期formal的首次请求，不能依赖已失败的旧清理');
 assert.ok(['offered','shown'].includes(beforeCleanup.tables.proactive_interventions.find(r=>r.id===timeout.pendingIntervention.id)?.status),'到期前必须确有真实未处理帮助');
 const expired=ok(await api(timeout,'/api/study/state')).data;assert.equal(expired.run.firstSessionClock.expired,true);assert.equal(expired.run.firstSessionClock.elapsedSeconds,5400);
 const afterCleanup=ok(await api(null,'/api/admin/three-arm/export')).data,closed=afterCleanup.tables.proactive_interventions.find(r=>r.id===timeout.pendingIntervention.id);assert.equal(closed.resolution,'first_session_time_limit');assert.equal(closed.status,'first_session_time_limit');
 const preserved=afterCleanup.tables.quiz_results.find(r=>r.id===timeout.preservedAnswer.id);assert.deepEqual(Object.fromEntries(Object.keys(timeout.preservedAnswer).map(k=>[k,preserved[k]])),timeout.preservedAnswer);
 const cleanupRecords=afterCleanup.records.filter(r=>r.run_id===timeout.runId&&['time_limit_end','time_limit_cleanup'].includes(r.kind));assert.equal(cleanupRecords.length,2);assert.equal(cleanupRecords.find(r=>r.kind==='time_limit_cleanup').document.completed,true);
 ok(await api(timeout,'/api/study/state'));const repeated=ok(await api(null,'/api/admin/three-arm/export')).data;assert.deepEqual(repeated.records.filter(r=>r.run_id===timeout.runId&&['time_limit_end','time_limit_cleanup'].includes(r.kind)),cleanupRecords);checks.push('fresh正式超时首请求成功关闭真实未处理intervention，已答分数/原回答不变，成功清理标记与重复请求幂等');
 assert.equal((await api(timeout,'/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:bank.ids[0]+'-formative',phase:'formative',answers:registry.formative(0).map(answer)})).code,'FIRST_SESSION_TIME_LIMIT');
 assert.equal((await api(timeout,'/api/study/preview/new',{previousRunId:timeout.runId})).status,403);
 const missed=ok(await api(timeout,'/api/learning/proactive/outcomes?chapterId=V14-C1')).data;assert.equal(missed.followupAnchor.kind,'first_session_deadline_after_time_limit');assert.equal(missed.followupAnchor.posttestMissing,true);assert.equal(missed.stages.find(s=>s.id==='retention').status,'available');checks.push('正式90分钟停止新答题、不允许切版、现场时钟固定90min；后测缺失保留并按截止+72h开放随访');
 for(const actor of [main,fixture.ui])for(const stageId of ['retention','transfer']){
  const before=ok(await api(actor,'/api/learning/proactive/outcomes?chapterId=V14-C1')).data,stage=before.stages.find(s=>s.id===stageId);assert.equal(stage.status,'available');
  const started=ok(await api(actor,'/api/learning/proactive/outcomes/start',{chapterId:'V14-C1',stageId}));
  const active=started.data.stages.find(s=>s.id===stageId);assert.ok(active.items.some(q=>q.figure));assert.ok(active.items.every(q=>!q.answer&&!q.analysis));
  const responses=Object.fromEntries(active.items.map(q=>[q.id,q.options.find(o=>!['__skip__','__unknown__'].includes(o.value)).value]));
  ok(await api(actor,'/api/learning/proactive/outcomes/submit',{chapterId:'V14-C1',stageId,sessionId:started.sessionId,responses}));
 }
 fs.writeFileSync(path.join(out,'private-ui-fixture.json'),JSON.stringify({base,nickname:fixture.ui.nickname,password:fixture.ui.password,runId:fixture.ui.runId,syntheticOnly:true},null,2));
 checks.push('保持8题→数学迁移6题主路由顺序、图像下发、无提前答案及服务器保存');
 let reg=ok(await api(main,'/api/study/regulation')).data;assert.equal(reg.status,'available');
 const action=async(action,answers)=>{const body={runId:main.runId,revision:reg.revision||0,requestId:crypto.randomUUID(),action,...(action==='start'?{}:{taskId:reg.taskId,phase:reg.phase}),...(answers?{answers}:{})};const result=ok(await api(main,'/api/study/regulation',body));reg=result.data;return body;};
 await action('start');await action('begin');
 assert.equal((await api(main,'/api/learning/assistant/history?chapterId=V14-C1&unitId=GH-01-K01')).status,409);assert.equal((await api(main,'/api/study/review')).status,409);
 assert.equal((await api(timeout,'/api/study/regulation',{runId:main.runId,revision:reg.revision,requestId:crypto.randomUUID(),action:'draft',taskId:reg.taskId,phase:reg.phase,answers:{}})).status,409);
 while(reg.phase!=='summary'){
  assert.ok(!JSON.stringify(reg).includes('answerKey'));assert.ok(!JSON.stringify(reg).includes('mathKeys'));
  if(reg.task.kind==='scenario'){await action('next',{choice:reg.task.options[0].value,reason:'合成理由',verification:'合成核对'});continue;}
  if(reg.phase==='attempt')await action('next',{initialAnswer:reg.task.question.options[0].value,initialReason:'合成初次判断',confidence:'unsure'});
  else if(reg.phase==='support'){await action('help',{});if(reg.task.help?.level<2)await action('help',{});await action('next',{helpChoice:'hint',actionChoice:'self_check',actionNote:'合成实际核对'});}
  else if(reg.phase==='check')await action('next',{checkAnswer:reg.task.question.options[0].value,checkReason:'合成独立检查'});
  else if(reg.phase==='reflect')await action('next',{reflectionDecision:'change',reflectionReason:'合成依据'});
 }
 const finish=await action('finish');assert.equal(reg.status,'submitted');assert.equal(ok(await api(main,'/api/study/regulation',finish)).data.status,'submitted');checks.push('14分钟主路由四任务/两层线索/独立检查/反思完成；旧帮助封锁、跨run拒绝、重复完成幂等');
 fs.writeFileSync(path.join(out,'verify-results.json'),JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}
(process.argv.includes('--patch-expiry')?patchExpiry():process.argv.includes('--arm-expiry')?armExpiry():process.argv.includes('--patch')?patch():process.argv.includes('--verify')?verify():prepare()).catch(e=>{console.error(e);process.exitCode=1;});
