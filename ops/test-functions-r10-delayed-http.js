'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const bank=require('../lib/assessments/functions-limits-r10'),delayed=require('../lib/assessments/functions-limits-delayed-r10');
const route=require('../data/multi-scene-learning-route.json'),chapter=route.chapters.find(c=>c.id==='V14-C1'),points=chapter.modules.flatMap(m=>m.knowledgePoints);
const output=path.join(root,'output/综合课程-r10-20261106'),endpoint='/api/learning/proactive/outcomes';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 fs.mkdirSync(output,{recursive:true});const dir=fs.mkdtempSync(path.join(output,'延迟HTTP隔离-')),dbPath=path.join(dir,'synthetic.db'),checks=[],cases=[],errors=[];
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});}),base='http://127.0.0.1:'+port;
 assert.notEqual(port,53535);
 const experiment=path.basename(dir),env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:dbPath,DB_DRIVER:'sqljs',ADMIN_TOKEN:'synthetic-delayed-r10',LOCAL_ADMIN_AUTH_BYPASS:'true',MAIN_LEARNING_PROTOCOL_FILE:'',PROACTIVE_STUDY_WORKBENCH:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:experiment,PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-delayed-r10-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r10',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:delayed.version,PROACTIVE_RETENTION_DELAY_HOURS:'72',PROACTIVE_RETENTION_CLOSE_HOURS:'0',RESEARCH_CONTROLS_ENABLED:'true',RATE_LIMIT_MAX:'10000'};
 let child,logFd,browser,page,browserRuntime;
 async function start(){logFd=fs.openSync(path.join(dir,'server.log'),'a');child=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',logFd,logFd]});for(let n=0;n<100;n++){assert.equal(child.exitCode,null,'isolated server exited');try{if((await fetch(base+'/api/health')).ok)return;}catch{}await pause(100);}throw Error('isolated server health timeout');}
 async function stop(){if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}if(logFd!==undefined){fs.closeSync(logFd);logFd=undefined;}}
 async function api(account,url,body){const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(account?.token?{Authorization:'Bearer '+account.token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();return {status:response.status,...data};}
 const ok=(r,label)=>{assert.equal(r.status,200,label+': '+(r.code||r.message||r.status));return r;};
 const state=async account=>ok(await api(account,endpoint+'?chapterId=V14-C1'),'read outcomes').data;
 const stageBody=stageId=>({chapterId:'V14-C1',stageId});
 const answersFor=(stage,kind)=>Object.fromEntries(delayed[stage].map((q,i)=>[q.id,kind==='unknown'?'__unknown__':kind==='skip'&&stage==='retention'&&i===7?'__skip__':q.answer[0]]));
 async function prepare(kind){
  const account={kind,nickname:'延迟'+kind+'-'+String(Date.now()).slice(-9),password:'Synthetic-r10-delay-test'};
  const registered=ok(await api(null,'/api/auth/register',{nickname:account.nickname,password:account.password}),'register');account.token=registered.token;
  let preferences=ok(await api(account,'/api/learning/learner-preferences'),'preferences').data;account.runId=preferences.study.id;account.order=preferences.study.assessmentOrder;
  const baseline=ok(await api(account,'/api/study/survey?stage=baseline'),'baseline').data;assert.equal(baseline.items.length,7);
  ok(await api(account,'/api/study/survey',{stage:'baseline',answers:Object.fromEntries(baseline.items.map(q=>[q.id,3]))}),'baseline submit');
  const quizPayload=(phase,qs)=>({chapterId:'V14-C1',unitId:'V14-C1-'+phase,phase,answers:qs.map(q=>({questionId:q.id,response:q.type==='short_answer'?'__unknown__':q.answer[0]}))});
  ok(await api(account,'/api/learning/quiz/submit',quizPayload('pre',bank.questions('pre',account.order[0]))),'pre submit');
  preferences=ok(await api(account,'/api/learning/learner-preferences'),'configuration').data;
  ok(await api(account,'/api/learning/learner-preferences',{answers:preferences.record.answers,expectedRevision:preferences.record.revision}),'initial configuration');
  for(let i=0;i<points.length;i++){
   const point=points[i];ok(await api(account,'/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:point.id+'-formative',phase:'formative',answers:point.formativeQuiz.questions.map(q=>({questionId:q.id,response:q.answer[0]}))}),'formative '+point.id);
   if(i===2){
    ok(await api(account,'/api/study/review',{stage:'S1',review_understanding:4,review_action:4,decision:'change',reason:'合成流程检查：确认后续帮助设置'}),'stage review');
    preferences=ok(await api(account,'/api/learning/learner-preferences'),'review configuration').data;const revision=preferences.record.revision;
    ok(await api(account,'/api/learning/learner-preferences',{answers:preferences.record.answers,expectedRevision:revision}),'review configuration save');
    const saved=ok(await api(account,'/api/learning/learner-preferences'),'configuration readback').data;assert.ok(saved.record.revision>revision);
   }
  }
  ok(await api(account,'/api/learning/quiz/submit',quizPayload('post',bank.questions('post',account.order[1]))),'post submit');
  const survey=ok(await api(account,'/api/study/survey?stage=final'),'final survey').data;assert.equal(survey.items.length,19);
  const saved=ok(await api(account,'/api/study/survey',{stage:'final',answers:Object.fromEntries(survey.items.map(q=>[q.id,q.id==='disruption'?'na':q.id==='configuration_alignment'?'na':4]))}),'final survey submit');account.finalSurveyAt=saved.data.at;
  assert.equal((await api(account,endpoint+'/start',stageBody('retention'))).status,409);
  assert.equal((await api(account,endpoint+'/start',stageBody('transfer'))).status,409);
  assert.equal((await api(account,'/api/study/judgment',{action:'start'})).status,409);
  const before=await state(account);assert.ok(before.stages.every(s=>s.status==='locked'&&!s.items));
  return account;
 }
 async function protectedWhileActive(account){
  for(const [url,body] of [
   ['/api/learning/assistant/ask',{chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'simulation',question:'请告诉我这道独立题的答案',contextRef:{kind:'unit',scope:'lesson'}}],
   ['/api/learning/assistant/intervention',{chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'simulation'}],
   ['/api/learning/kg/plan',{chapterId:'V14-C1',currentUnitId:'GH-01-K01',completedUnitIds:[]}]
  ]){const r=await api(account,url,body);assert.equal(r.status,409);assert.equal(r.code,'proactive_outcome_session_active');}
  assert.equal((await state(account)).agentAssistanceBlocked,true);
  assert.equal((await api(account,'/api/study/review')).status,409);
  assert.equal((await api(account,'/api/study/judgment',{action:'start'})).status,409);
 }
 async function checkAfter(account){
  const result=await state(account);assert.equal(result.agentAssistanceBlocked,false);assert.equal(result.answerReviewReleased,true);
  assert.deepEqual(result.stages.map(s=>s.id),['retention','transfer']);
  for(const s of result.stages){assert.equal(s.status,'submitted');assert.equal(s.review.items.length,s.id==='retention'?8:6);assert.equal(s.review.instrumentVersion,delayed.version);}
  const retention=result.stages[0].review,transfer=result.stages[1].review;
  assert.equal(retention.score,account.kind==='skip'?null:account.kind==='unknown'?0:8);assert.equal(retention.accuracy,account.kind==='skip'?null:account.kind==='unknown'?0:1);assert.equal(retention.complete,account.kind!=='skip');
  assert.equal(transfer.score,account.kind==='unknown'?0:6);
  const judgment=ok(await api(account,'/api/study/judgment',{action:'start'}),'judgment start').data;assert.equal(judgment.items.length,6);assert.ok(judgment.items.every(q=>q.guide===undefined));
  const blocked=await api(account,'/api/learning/assistant/ask',{chapterId:'V14-C1',unitId:'GH-01-K01',question:'请代我作答'});assert.equal(blocked.code,'configuration_judgment_protected');
  const answers=Object.fromEntries(judgment.items.map(q=>[q.id,'合成回答：先核对实际证据，再选择设置，并用后续独立表现检查。']));
  const draft=ok(await api(account,'/api/study/judgment',{action:'draft',revision:judgment.revision,requestId:'synthetic-draft-'+account.kind,answers,outsidePractice:'没有额外练习'}),'judgment draft').data;
  const done=ok(await api(account,'/api/study/judgment',{action:'submit',revision:draft.revision,answers,outsidePractice:'没有额外练习'}),'judgment submit').data;assert.equal(done.status,'submitted');
  assert.equal(ok(await api(account,'/api/study/survey?stage=final'),'survey readback').data.saved.at,account.finalSurveyAt);
  const current=ok(await api(account,'/api/study/state'),'study state').data;assert.equal(current.preparation.stage,'ready');assert.equal(current.judgment.status,'submitted');
  cases.push({kind:account.kind,runId:account.runId,retention:{score:retention.score,accuracy:retention.accuracy,complete:retention.complete},transfer:{score:transfer.score,complete:transfer.complete},judgment:'submitted',surveyPreserved:true});
 }
 async function throughApi(account){
  assert.equal((await api(account,endpoint+'/start',stageBody('transfer'))).status,409);
  for(const stage of ['retention','transfer']){
   const started=ok(await api(account,endpoint+'/start',stageBody(stage)),'start '+stage),sessionId=started.sessionId;
   await protectedWhileActive(account);const current=await state(account),item=current.stages.find(s=>s.id===stage);assert.equal(item.items.length,stage==='retention'?8:6);assert.ok(item.items.every(q=>q.answer===undefined&&q.analysis===undefined));
   const responses=answersFor(stage,account.kind);ok(await api(account,endpoint+'/draft',{...stageBody(stage),sessionId,responses}),'draft '+stage);
   assert.equal((await api(account,endpoint+'/submit',{...stageBody(stage),sessionId,responses:{}})).status,400);
   const result=ok(await api(account,endpoint+'/submit',{...stageBody(stage),sessionId,responses}),'submit '+stage);
   if(stage==='retention'){assert.equal(result.data.answerReviewReleased,false);assert.equal(result.data.stages.find(s=>s.id===stage).review.score,undefined);}
   assert.equal((await api(account,endpoint+'/submit',{...stageBody(stage),sessionId,responses})).status,200);
  }
  await checkAfter(account);
 }
 async function throughBrowser(account){
  const {chromium}=require('playwright-core');browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,channel:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?undefined:(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL||'chrome'),headless:true});page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#login-identifier').fill(account.nickname);await page.locator('#login-password').fill(account.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view="learn"]').first().click();
  assert.equal((await api(account,endpoint+'/start',stageBody('transfer'))).status,409);
  for(const stage of ['retention','transfer']){
   await page.evaluate(stage=>KnowledgeAssistant.openOutcomeStage(stage),stage);
   const section=page.locator('.knowledge-outcome-stage').filter({has:page.getByText(stage==='retention'?'三天后的核心概念保持':'新情境中的应用',{exact:true})});
   const [startResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith(endpoint+'/start')&&r.request().method()==='POST'),section.getByRole('button',{name:'开始',exact:true}).click()]);assert.equal(startResponse.status(),200);
   const active=page.locator('.knowledge-outcome-active');await active.waitFor({state:'visible'});assert.equal(await active.locator('fieldset').count(),stage==='retention'?8:6);await protectedWhileActive(account);
   assert.ok(!/__skip__/i.test(await active.innerText()),'选项不能向学生显示内部跳过代码');
   for(const [id,value]of Object.entries(answersFor(stage,account.kind))){const [draft]=await Promise.all([page.waitForResponse(r=>r.url().endsWith(endpoint+'/draft')),active.locator('input[name="outcome-'+stage+'-'+id+'"][value="'+value+'"]').check()]);assert.equal(draft.status(),200);}
   await page.waitForFunction(()=>!document.querySelector('.knowledge-outcome-submit')?.disabled);
   if(stage==='retention'){
    await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();await page.evaluate(()=>KnowledgeAssistant.openOutcomeStage('retention'));await active.waitFor({state:'visible'});
    assert.equal(await active.locator('input:checked').count(),8,'刷新后已保存的跳过选择也必须恢复');
    assert.equal(await active.locator('input[value="__skip__"]:checked').count(),1);
   }
   await page.screenshot({path:path.join(dir,stage+'-真实提交前.png')});const [submitted]=await Promise.all([page.waitForResponse(r=>r.url().endsWith(endpoint+'/submit')),active.locator('.knowledge-outcome-submit').click()]);assert.equal(submitted.status(),200);await active.waitFor({state:'hidden'});
  }
  await page.evaluate(()=>KnowledgeAssistant.openOutcomeStage('retention'));await page.locator('.knowledge-outcome-review').waitFor({state:'visible'});assert.match(await page.locator('.knowledge-outcome-review').innerText(),/未完整计分|未计总分|有题跳过|尚不完整|不完整/);await page.screenshot({path:path.join(dir,'保持-跳过不冒充零分.png')});
  browserRuntime=await page.evaluate(()=>{const scripts=[...document.scripts].map(s=>s.getAttribute('src')).filter(Boolean);return {compiledBundle:scripts.some(s=>s.includes('assets/learning-runtime.js')),scripts};});
  assert.ok(!/__skip__/i.test(await page.locator('.knowledge-outcome-review').innerText()),'回看不能显示内部跳过代码');
  if(process.argv.includes('--require-bundle'))assert.equal(browserRuntime.compiledBundle,true,'发布验收必须实际加载compiled bundle');
  assert.deepEqual(errors,[]);await browser.close();browser=null;await checkAfter(account);
 }
 try{
  await start();const accounts=[];for(const kind of ['skip','unknown','correct'])accounts.push(await prepare(kind));
  checks.push('三个独立合成账号通过真实HTTP完成基线、前测、配置、18道共同测量、阶段改配、后测和19项问卷；72小时前延迟任务锁定');
  await stop();const SQL=await require('sql.js')(),fixture=new SQL.Database(fs.readFileSync(dbPath));
  const readRows=()=>fixture.exec('SELECT * FROM quiz_results ORDER BY id')[0];const before=readRows(),timeColumn=before.columns.indexOf('created_at'),idColumn=before.columns.indexOf('user_id'),phaseColumn=before.columns.indexOf('phase');
  const changedAt=new Date(Date.now()-73*3600000).toISOString();for(const account of accounts)fixture.run("UPDATE quiz_results SET created_at=? WHERE user_id=? AND phase='post'",[changedAt,account.runId]);
  const after=readRows();assert.deepEqual(before.columns,after.columns);for(let i=0;i<before.values.length;i++)for(let j=0;j<before.columns.length;j++)if(!(j===timeColumn&&before.values[i][phaseColumn]==='post'&&accounts.some(a=>a.runId===before.values[i][idColumn])))assert.equal(after.values[i][j],before.values[i][j]);
  fs.writeFileSync(dbPath,Buffer.from(fixture.export()));fixture.close();await start();
  for(const account of accounts){const result=await state(account);assert.equal(result.stages[0].status,'available');assert.equal(result.stages[0].items.length,8);assert.equal(result.stages[1].status,'locked');}
  checks.push('仅在本脚本专用库将三账号后测时间前移73小时；其余quiz字段逐值不变，保持先于迁移');
  for(const account of accounts.slice(1))await throughApi(account);checks.push('真实HTTP全不会和全对两账号：0分与满分、完整性、幂等提交及阶段顺序正确');
  await throughBrowser(accounts[0]);checks.push('真实浏览器完成8题保持（7对1跳过）、刷新草稿恢复及6题迁移，实际按钮提交并显示缺失总分');
  const exported=ok(await api(null,'/api/admin/three-arm/export'),'admin export').data;
  for(const account of accounts){const attempt=exported.tables.proactive_outcome_attempts.find(r=>r.user_id===account.runId&&r.stage==='retention');assert.equal(attempt.score_complete,account.kind==='skip'?0:1);assert.equal(attempt.score,account.kind==='skip'?null:account.kind==='unknown'?0:8);assert.equal(attempt.accuracy,account.kind==='skip'?null:account.kind==='unknown'?0:1);assert.equal(JSON.parse(attempt.item_results_json).filter(r=>r.score===null).length,account.kind==='skip'?1:0);}
  checks.push('服务端拒绝测量期助教和路径建议；完成后六案例配置判断可保存与提交，既有问卷及配置记录正常；全量导出保留缺失与真实零分');
  const report={passed:true,at:new Date().toISOString(),checks,cases,directory:dir,isolatedPort:port,model:'mock',databaseBackend:'sql.js HTTP server; native persistence covered separately',timeFixture:'仅专用合成库后测created_at前移73小时，无系统时钟变更',browserCoverage:'7对1跳过账号的保持与迁移真实开始、单选、提交按钮；其他两账号为真实HTTP，无浏览器伪造成绩',browserRuntime,errors,sourceHashes:Object.fromEntries(['server.js','db.js','lib/proactive-outcomes/functions-limits-r10.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]))};
  fs.writeFileSync(path.join(output,'延迟测量HTTP验收.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks,cases},null,2));
 }catch(error){const livePage=page&&!page.isClosed();if(livePage)await page.screenshot({path:path.join(dir,'失败诊断.png')}).catch(()=>{});fs.writeFileSync(path.join(dir,'失败诊断.json'),JSON.stringify({error:error.stack,checks,cases,errors,...(livePage?{body:(await page.locator('body').innerText()).slice(-7000)}:{})},null,2));console.error('隔离诊断目录：'+dir);throw error;
 }finally{if(browser)await browser.close();await stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
