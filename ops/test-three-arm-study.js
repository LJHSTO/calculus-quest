"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),C=require('../app/shared/learner-preferences');
async function main(){
 const output=path.join(root,'output/三组实验上线验收');fs.mkdirSync(output,{recursive:true});const dir=fs.mkdtempSync(path.join(output,'接口隔离-'));
 let port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 let base=`http://127.0.0.1:${port}`;const admin='synthetic-three-arm-admin';
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:'false',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r2',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-retention-r4',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'5000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w');let server;
 const checks=[];let token='';
 async function api(route,body,arm='',auth=token){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`} :{}),...(arm?{'X-Study-Arm':arm}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
 const check=(name)=>{checks.push(name);console.log('通过：'+name);};
 async function boot(){if(server){port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});base=`http://127.0.0.1:${port}`;}server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(server.exitCode!==null)throw new Error('隔离服务未启动，日志：'+path.join(dir,'server.log'));await new Promise(r=>setTimeout(r,100));}throw new Error('服务启动超时');}
 async function stop(){if(server?.exitCode===null){const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}}
 try{
  await boot();const reg=await api('/api/auth/register',{nickname:'三组隔离验收',password:'synthetic-test-password'},'A');assert.equal(reg.status,200,JSON.stringify(reg));token=reg.token;
  const ids={},baseline={};
  const course=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
  const pre={chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:course.flow.preQuiz.questions.map(q=>({questionId:q.id,response:q.type==='short_answer'?'合成前测，等待人工评分':q.type==='multiple'?q.answer:q.answer[0]}))};
  for(const arm of ['A','B','C']){
   const data=(await api('/api/learning/learner-preferences',null,arm)).data;assert.ok(data,arm+'返回准备状态');ids[arm]=data.study.id;baseline[arm]=data.record.answers;assert.equal(data.preparation.stage,'baseline');assert.equal(data.enabled,false);
   const survey=(await api('/api/study/survey?stage=baseline',null,arm)).data;
   assert.equal((await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,3]))},arm)).status,200);
   assert.equal((await api('/api/learning/learner-preferences',null,arm)).data.preparation.stage,'pretest');
   const submitted=await api('/api/learning/quiz/submit',pre,arm);assert.equal(submitted.status,200,JSON.stringify(submitted));
   const ready=(await api('/api/learning/learner-preferences',null,arm)).data;assert.equal(ready.preparation.stage,'configuration');assert.equal(ready.enabled,arm!=='A');
   if(arm==='A'){
    assert.equal((await api('/api/learning/learner-preferences',{answers:C.defaults(),expectedRevision:1},arm)).status,403);
    assert.equal((await api('/api/study/confirm-defaults',{},arm)).status,200);
   }else{const saved=await api('/api/learning/learner-preferences',{answers:ready.record.answers,expectedRevision:1},arm);assert.equal(saved.status,200,JSON.stringify(saved));}
   assert.equal((await api('/api/learning/learner-preferences',null,arm)).data.preparation.stage,'ready');
   assert.equal((await api('/api/learning/research-controls',{profile:{}},arm)).status,403,'不能绕开分组修改策略');
   const review=await api('/api/study/review',null,arm);assert.equal(review.status,200);assert.equal(Array.isArray(review.data.linked),arm==='B');
  }
  assert.equal(new Set(Object.values(ids)).size,3);assert.deepEqual(baseline.A,baseline.B);assert.deepEqual(baseline.B,baseline.C);check('三份轮次、同一默认配置、A锁定、B/C同权限、仅B有关联反馈');
  const a=(await api('/api/learning/snapshot',null,'A'));
  const snapshot=await api('/api/learning/snapshot',{generation:a.generation,baseRevision:a.revision,snapshot:{...(a.snapshot||{}),currentChapterId:'V14-C1',currentUnitId:'GH-01-K01',note:'只属于A组的合成记录'}},'A');assert.equal(snapshot.status,200,JSON.stringify(snapshot));
  assert.notEqual((await api('/api/learning/snapshot',null,'C')).snapshot?.note,'只属于A组的合成记录');
  const ordinary=await api('/api/auth/me',{});assert.notEqual(ordinary.participant.participantId,ids.A);assert.equal((await api('/api/learning/snapshot')).snapshot?.note||'','');check('同账号各组学习快照隔离，普通学习历史独立');
  const point=course.modules[0].knowledgePoints[0];assert.equal(point.formativeQuiz.questions.length,3);assert.equal(point.formativeQuiz.adaptive,false);
  const answer={chapterId:'V14-C1',unitId:point.id+'-formative',phase:'formative',answers:point.formativeQuiz.questions.map(q=>({questionId:q.id,response:q.type==='multiple'?q.answer:q.answer[0]}))};
  assert.equal((await api('/api/learning/quiz/submit',{...answer,answers:answer.answers.slice(0,1)},'B')).status,400,'不能仅答第一道就完成检测');
  const complete=await api('/api/learning/quiz/submit',answer,'B');assert.equal(complete.status,200,JSON.stringify(complete));
  assert.equal((await api('/api/study/review',null,'B')).data.results.length,3);assert.equal((await api('/api/study/review',null,'C')).data.results.length,0);check('三道共同检测整批提交与不同组成绩隔离');
  const before=(await api('/api/learning/learner-preferences',null,'C')).data.record;
  const changed=structuredClone(before.answers);changed.D4={value:'sidebar',reason:'try',note:''};
  assert.equal((await api('/api/learning/learner-preferences',{answers:changed,expectedRevision:before.revision},'C')).status,403,'C在普通学习中不可修改');
  assert.equal((await api('/api/learning/learner-preferences',null,'B')).data.record.answers.D4.value,'inline');
  assert.equal((await api('/api/learning/learner-preferences',{answers:changed,expectedRevision:2},'B')).status,403,'B与C采用相同修改窗口');check('学习中前后端均锁定B/C设置');
  for(const module of require('../app/shared/study-stages').stages.map(s=>({...s,knowledgePoints:s.points.map(id=>course.modules.flatMap(m=>m.knowledgePoints).find(p=>p.id===id))}))){
   for(const p of module.knowledgePoints){const result=await api('/api/learning/quiz/submit',{chapterId:course.id,unitId:p.id+'-formative',phase:'formative',answers:p.formativeQuiz.questions.map(q=>({questionId:q.id,response:q.type==='multiple'?q.answer:q.answer[0]}))},'C');assert.equal(result.status,200,JSON.stringify(result));}
   if(!module.review)continue;
   assert.equal((await api('/api/learning/learner-preferences',null,'C')).data.enabled,false,'检测完成也要等回顾决策后开放');
   const decision={stage:module.id,review_understanding:4,review_action:4,decision:'change'};
   assert.equal((await api('/api/study/review',{...decision,decision:'bypass'},'C')).status,400);
   assert.equal((await api('/api/study/review',decision,'C')).status,200);
   const open=(await api('/api/learning/learner-preferences',null,'C')).data;assert.equal(open.enabled,true);assert.equal(open.configurationWindow.kind,'stage_review_configuration');
   const blocked=await api('/api/learning/quiz/submit',{chapterId:course.id,unitId:point.id+'-formative',phase:'formative',answers:answer.answers},'C');assert.equal(blocked.status,409,'尚未保存配置不能绕过窗口提交');
   assert.equal((await api('/api/learning/learner-preferences',{answers:changed,expectedRevision:open.record.revision-1},'C')).status,409,'窗口内旧版本不能覆盖');
   assert.equal((await api('/api/learning/learner-preferences',{answers:changed,expectedRevision:open.record.revision},'C')).status,200);
   assert.equal((await api('/api/learning/learner-preferences',null,'C')).data.enabled,false,'保存后立即关闭窗口');
  }
  check('两次回顾后的配置窗口、旧版本冲突与保存后锁定均由服务器执行');
  for(const module of require('../app/shared/study-stages').stages.map(s=>({...s,knowledgePoints:s.points.map(id=>course.modules.flatMap(m=>m.knowledgePoints).find(p=>p.id===id))}))){
   for(const p of module.knowledgePoints){if(p.id===point.id)continue;const result=await api('/api/learning/quiz/submit',{chapterId:course.id,unitId:p.id+'-formative',phase:'formative',answers:p.formativeQuiz.questions.map(q=>({questionId:q.id,response:q.type==='multiple'?q.answer:q.answer[0]}))},'B');assert.equal(result.status,200,JSON.stringify(result));}
   if(!module.review)continue;
   const review=(await api('/api/study/review',null,'B')).data;assert.equal(review.pendingStage.id,module.id);
   const saved=await api('/api/study/review',{stage:module.id,review_understanding:4,review_action:4,decision:'keep',reason:'合成测试：保持并观察下一阶段独立作答'},'B');assert.equal(saved.status,200,JSON.stringify(saved));
  }
  assert.equal((await api('/api/study/survey',{stage:'final',answers:{}},'B')).status,409);
  assert.equal((await api('/api/learning/quiz/submit',{chapterId:course.id,unitId:course.id+'-post',phase:'post',answers:course.flow.postQuiz.questions.map(q=>({questionId:q.id,response:q.type==='short_answer'?'__unknown__':q.type==='multiple'?q.answer:q.answer[0]}))},'B')).status,200);
  const final=(await api('/api/study/survey?stage=final',null,'B')).data;assert.equal(final.items.length,16);assert.equal((await api('/api/study/survey',{stage:'final',answers:Object.fromEntries(final.items.map(q=>[q.id,4]))},'B')).status,200);
  assert.equal((await api('/api/study/survey?stage=final',null,'A')).data.items.length,13);
  const outcomes='/api/learning/proactive/outcomes';
  assert.equal((await api(outcomes+'/start',{chapterId:course.id,stageId:'transfer'},'B')).status,409);
  assert.equal((await api('/api/study/judgment',{action:'start'},'B')).status,409);check('两次阶段回顾、分组问卷及三天门槛');
  await stop();const SQL=await require('sql.js')(),database=new SQL.Database(fs.readFileSync(env.DB_PATH));database.run("UPDATE quiz_results SET created_at=? WHERE user_id=? AND phase='post'",[new Date(Date.now()-73*3600000).toISOString(),ids.B]);fs.writeFileSync(env.DB_PATH,Buffer.from(database.export()));database.close();await boot();
  for(const stageId of ['retention','transfer']){
   const started=await api(outcomes+'/start',{chapterId:course.id,stageId},'B');assert.equal(started.status,200,JSON.stringify(started));
   const state=(await api(outcomes+'?chapterId='+course.id,null,'B')).data,stage=state.stages.find(s=>s.id===stageId);assert.ok(stage.items.length);
   const done=await api(outcomes+'/submit',{chapterId:course.id,stageId,sessionId:started.sessionId,responses:Object.fromEntries(stage.items.map(q=>[q.id,q.options?.[0]?.value||'A']))},'B');assert.equal(done.status,200,JSON.stringify(done));
  }
  const judgment=await api('/api/study/judgment',{action:'start'},'B');assert.equal(judgment.status,200,JSON.stringify(judgment));assert.equal(judgment.data.items.length,6);assert.ok(judgment.data.items.every(q=>!q.guide));
  const draft=await api('/api/study/judgment',{action:'draft',revision:0,answers:{J1:'合成判断草稿'}},'B');assert.equal(draft.data.revision,1);
  assert.equal((await api('/api/study/judgment',{action:'draft',revision:0,answers:{}},'B')).status,409);
  assert.equal((await api('/api/learning/assistant/ask',{question:'配置任务期间索要提示'},'B')).status,409);
  assert.equal((await api('/api/study/judgment',{action:'submit',revision:1,answers:{}},'B')).status,400);
  const browser=await require('playwright-core').chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/?study=B');await page.locator('#login-identifier').fill('三组隔离验收');await page.locator('#login-password').fill('synthetic-test-password');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
   await page.evaluate(()=>ThreeArmStudyUI.openJudgment());await page.locator('[data-judgment=J1]').waitFor();assert.equal(await page.locator('[data-judgment=J1]').inputValue(),'合成判断草稿');
   for(const item of judgment.data.items)await page.locator(`[data-judgment=${item.id}]`).fill('合成答卷：参考独立表现保持设置，并观察后续证据。');
   await page.getByRole('button',{name:'保存草稿，稍后继续',exact:true}).click();await page.reload();await page.evaluate(()=>ThreeArmStudyUI.openJudgment());await page.locator('[data-judgment=J6]').waitFor();assert.match(await page.locator('[data-judgment=J6]').inputValue(),/合成答卷/);
   await page.screenshot({path:path.join(dir,'配置判断-草稿恢复.png')});await page.getByRole('button',{name:'提交六个情境回答',exact:true}).click();await page.getByText('配置判断已提交，等待研究人员评分。',{exact:true}).waitFor();assert.deepEqual(errors,[]);check('三天后配置判断真实页面填写、刷新恢复、提交接续');
   await page.goto(base+'/three-arm-admin.html');await page.locator('#study-admin-token').fill(admin);await page.locator('#study-admin-enter').click();
   await page.getByRole('button',{name:'查看介入与静默回放',exact:true}).click();await page.getByRole('heading',{name:'介入与静默回放',exact:true}).waitFor();await page.getByLabel('回放数据来源').selectOption('preview');await page.getByRole('button',{name:'读取所选版本',exact:true}).click();await page.getByRole('button',{name:'下载回放与人工标注文件',exact:true}).waitFor();await page.screenshot({path:path.join(dir,'管理端-决策回放.png')});await page.getByRole('button',{name:'返回管理',exact:true}).click();
   const recovery=await browser.newPage();let surveyWrites=0;
   await recovery.route('**/api/study/survey',async route=>{if(route.request().method()!=='POST')return route.continue();surveyWrites++;const response=await route.fetch();if(surveyWrites===1)return route.fulfill({status:200,contentType:'application/json',body:''});return route.fulfill({response});});
   await recovery.goto(base+'/?study=A');await recovery.locator('[data-auth-mode=register]').click();await recovery.locator('#nickname').fill('网络恢复合成验收');await recovery.locator('#register-password').fill('synthetic-browser-password');await recovery.locator('#register-password-confirm').fill('synthetic-browser-password');await recovery.locator('#login-submit').click();await recovery.locator('#auth-gate').waitFor({state:'hidden'});
   await recovery.locator('[data-view=learn]').first().click();await recovery.locator('#three-arm-dialog[open]').waitFor();for(const field of await recovery.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="3"]').check();await recovery.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();await recovery.waitForFunction(()=>Boolean(ThreeArmStudyUI.run?.baselineAt));
   const recoveredRun=await recovery.evaluate(()=>ThreeArmStudyUI.run.id);const recoveredExport=(await api('/api/admin/three-arm/export',null,'',admin)).data;assert.equal(surveyWrites,2);assert.equal(recoveredExport.records.filter(r=>r.run_id===recoveredRun&&r.kind==='survey'&&r.slot==='baseline').length,1,'响应丢失后的重试不能重复记录问卷');await recovery.close();check('问卷已保存但响应丢失时自动恢复，填写不丢失、记录不重复');
   await page.getByRole('button',{name:'打开匿名配置判断评分',exact:true}).click();await page.getByRole('heading',{name:'配置判断人工评分',exact:true}).waitFor();assert.equal(await page.locator('select').count(),18);await page.screenshot({path:path.join(dir,'管理端-匿名评分.png')});
  }finally{await browser.close();}
  assert.equal((await api('/api/study/judgment',null,'B')).data.status,'submitted');
  const rating=await api('/api/admin/three-arm/rating',{runId:ids.B,rater:'合成评分员',scores:Object.fromEntries(judgment.data.items.map(q=>[q.id,[2,1,2]]))},'',admin);assert.equal(rating.data.total,30);check('保持与迁移、配置判断草稿保护、无答案泄露、人工评分');
  const exported=await api('/api/admin/three-arm/export',null,'',admin);assert.equal(exported.status,200);assert.equal(exported.data.runs.length,4);assert.ok(exported.data.runs.every(r=>r.mode==='preview'));check('管理导出保留实验轮次与体验数据标记');
  assert.ok(exported.data.tables.quiz_results.length>18);
  assert.equal((await api('/api/study/enroll',{consent:true},'assigned')).status,409);
  assert.equal((await api('/api/admin/three-arm/baseline',{reviewer:'仅合成环境的教师确认',confirmed:true},'',admin)).status,200);
  const allocated=[];for(let i=0;i<6;i++){const reg=await api('/api/auth/register',{nickname:'合成正式分配'+i,password:'synthetic-test-password'},'','');const formal=await api('/api/study/enroll',{consent:true},'assigned',reg.token);assert.equal(formal.status,200,JSON.stringify(formal));allocated.push(formal.data.arm);assert.equal((await api('/api/study/enroll',{consent:true,arm:'A'},'assigned',reg.token)).data.id,formal.data.id);}
  for(const arm of ['A','B','C'])assert.equal(allocated.filter(x=>x===arm).length,2);check('正式分配区组平衡、同一账号不能自行换组、体验与正式数据分离');
  await stop();await boot();for(const arm of ['A','B','C'])assert.equal((await api('/api/study/state',null,arm)).data.run.id,ids[arm]);check('服务重启后轮次、配置和隔离关系保留');
  fs.writeFileSync(path.join(dir,'验收结果.json'),JSON.stringify({passed:true,checks},null,2));
 }finally{await stop();fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
