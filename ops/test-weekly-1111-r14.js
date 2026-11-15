"use strict";
// 2026-11-11 weekly to-do: questionnaire additions, reason options, stage-review
// minimum dwell, the shared short answer and the per-round linked review.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),C=require('../app/shared/learner-preferences'),measures=require('../lib/assessments/three-arm-design-v1'),registry=require('../lib/assessments/functions-limits-registry');
const checks=[];const check=name=>{checks.push(name);console.log('通过：'+name);};

function instrumentChecks(){
  for(const d of C.dimensions){assert.ok(!C.reasonsFor(d.id).some(([v])=>v==='decline'),d.id+'不再提供“暂不说明理由”');assert.ok(C.reasonsFor(d.id).some(([v])=>v==='other'));}
  assert.ok(C.reasonsFor('D1','decline').some(([v])=>v==='decline'),'已保存的旧理由仍显示');
  const legacy=C.defaults();for(const a of Object.values(legacy))a.reason='decline';assert.doesNotThrow(()=>C.validate(legacy),'旧记录仍可读取');
  const other=C.defaults();for(const a of Object.values(other))a.reason='default';other.D2.reason='other';assert.throws(()=>C.validate(other),/补充说明/);
  check('设置理由去掉“暂不说明”，其他原因必须写明，旧记录兼容');
  const by=(time,arm)=>measures.surveys.filter(q=>q.time===time&&q.group.split(' ').includes(arm));
  assert.equal(by('前测前','A').length,18);
  for(const id of ['demo_age','demo_gender','demo_grade','demo_major','pa_experience','pa_preference','pa_interrupt_concern','pa_control_desire','pa_verify_habit','hs_monitor_trait','pa_ideal'])assert.ok(by('前测前','B').some(q=>q.id===id),id);
  assert.deepEqual([by('即时后测后','A').length,by('即时后测后','B').length,by('即时后测后','C').length],[24,27,27]);
  for(const id of ['agent_control','agent_rationale','helpseek_judgment','agent_verify','agent_trust','agent_overreliance'])assert.ok(by('即时后测后','A').some(q=>q.id===id),id);
  const scenarios=by('即时后测后','A').filter(q=>q.type==='text');assert.deepEqual(scenarios.map(q=>q.sourceCase),['J2','J3_J5']);assert.ok(scenarios.every(q=>q.rubric==='configurationRubric'&&!q.optional));
  for(const q of measures.surveys.filter(q=>q.type==='choice'))assert.ok(Array.isArray(q.options)&&q.options.length>=3,q.id);
  assert.ok(!measures.surveys.some(q=>['review_next_focus','review_action','review_understanding'].includes(q.id)));
  check('开屏问卷18题；当天结束问卷 A 24、B/C 27 题，含两道情境题和共同短答');
}

async function httpChecks(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'weekly-r14-'));
  const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
  const base=`http://127.0.0.1:${port}`;
  const env={...process.env,NODE_ENV:'test',THREE_ARM_REVIEW_MIN_SECONDS:'3',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:'synthetic-weekly-admin',LOCAL_ADMIN_AUTH_BYPASS:'false',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',RATE_LIMIT_MAX:'5000'};
  const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log]});
  let token='';
  const api=async(route,body,arm='B')=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}),'X-Study-Arm':arm},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};};
  try{
    for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    const reg=await api('/api/auth/register',{nickname:'周任务合成验收',password:'synthetic-test-password'});assert.equal(reg.status,200,JSON.stringify(reg));token=reg.token;
    await api('/api/learning/learner-preferences');
    const survey=(await api('/api/study/survey?stage=baseline')).data;assert.equal(survey.items.length,18);
    const filled=Object.fromEntries(survey.items.map(q=>[q.id,q.type==='text'?'':q.type==='choice'?q.options.length:3]));
    assert.equal((await api('/api/study/survey',{stage:'baseline',answers:{...filled,demo_major:7}})).status,400,'单选超出选项范围被拒绝');
    assert.equal((await api('/api/study/survey',{stage:'baseline',answers:{...filled,pa_ideal:3}})).status,400,'开放题不接受数字');
    const saved=await api('/api/study/survey',{stage:'baseline',answers:filled});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.answers.pa_ideal,null,'选填开放题留空记为缺失');
    check('开屏问卷单选与开放题由服务器校验，选填留空不记为 0');
    const course=registry.routeFor(require('../data/multi-scene-learning-route.json')).chapters.find(c=>c.id==='V14-C1');
    const run=(await api('/api/study/state')).data.run,form=run.assessmentOrder[0];
    const questions=form==='X'?course.flow.preQuiz.questions:course.flow.preQuiz.alternateFormQuestions;
    const preSubmit=await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:questions.map(q=>({questionId:q.id,response:q.type==='short_answer'?'合成前测':q.type==='multiple'?q.answer:q.answer[0]}))});assert.equal(preSubmit.status,200,JSON.stringify(preSubmit));
    const ready=(await api('/api/learning/learner-preferences')).data;
    assert.equal((await api('/api/learning/learner-preferences',{answers:ready.record.answers,expectedRevision:1})).status,200);
    const stage=require('../app/shared/study-stages').stages[0];
    for(const id of stage.points){const p=course.modules.flatMap(m=>m.knowledgePoints).find(p=>p.id===id);const r=await api('/api/learning/quiz/submit',{chapterId:course.id,unitId:id+'-formative',phase:'formative',answers:p.formativeQuiz.questions.map((q,i)=>({questionId:q.id,response:i===0?(q.options.find(o=>!q.answer.includes(o.value))?.value||q.answer[0]):q.type==='multiple'?q.answer:q.answer[0]}))});assert.equal(r.status,200,JSON.stringify(r));}
    const review=(await api('/api/study/review')).data;
    assert.equal(review.pendingStage.id,stage.id);assert.equal(review.reviewWindow.minimumSeconds,3);assert.ok(review.reviewWindow.remainingSeconds>0);
    assert.ok(Array.isArray(review.phases[0].rounds),'B组回顾提供每一轮帮助');
    for(const r of review.phases[0].rounds){assert.ok(['agent_ask','agent_cue','agent_quiz_review','learner'].includes(r.initiator));assert.ok(['accepted','declined','postponed','no_response','pending'].includes(r.response));assert.ok(['correct','incorrect','skipped','none'].includes(r.check));}
    const answer={stage:stage.id,review_understanding:4,review_action:4,review_next_focus:'先分别看左右两侧再比较',decision:'keep'};
    const early=await api('/api/study/review',answer);assert.equal(early.status,409);assert.equal(early.code,'review_minimum_time');
    const reopened=(await api('/api/study/review')).data;assert.equal(reopened.reviewWindow.openedAt,review.reviewWindow.openedAt,'重新打开不重置计时');
    await new Promise(r=>setTimeout(r,3200));
    assert.equal((await api('/api/study/review',answer)).status,409,'关闭回顾后的墙钟时间不能充当阅读时间');
    const browser=await require('playwright-core').chromium.launch({channel:'chrome',headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1366,height:900}});await page.goto(base+'/?study=B');await page.locator('#login-identifier').fill('周任务合成验收');await page.locator('#login-password').fill('synthetic-test-password');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
      await page.locator('[data-view=learn]').first().click();await page.waitForFunction(()=>Boolean(ThreeArmStudyUI.run?.configuredAt));await page.evaluate(()=>ThreeArmStudyUI.openReview());
      const save=page.locator('#three-arm-dialog').getByRole('button',{name:'保存回顾并继续',exact:true});await save.waitFor();assert.equal(await save.isDisabled(),true);
      await page.waitForFunction(()=>document.querySelector('.study-review-timer')?.textContent==='可以保存了。',{},{timeout:15000});assert.equal(await save.isEnabled(),true);
      fs.mkdirSync(path.join(root,'output/playwright/r15'),{recursive:true});await page.screenshot({path:path.join(root,'output/playwright/r15/电脑端阶段回顾.png')});
    }finally{await browser.close();}
    const done=await api('/api/study/review',{stage:stage.id,decision:'keep'});assert.equal(done.status,200,JSON.stringify(done));
    const other=(await api('/api/study/review',null,'A'));assert.notEqual(other.data?.phases?.[0]?.rounds?.length>=0&&other.data?.linked,true);
    check('回顾至少停留到协议时长才能保存，重开不重计时；只提交保持/调整即可保存，无重复体验题；B组有逐轮帮助记录');
    const protocol=require(path.join(root,'lib/three-arm-study'));assert.ok(protocol);
  }finally{server.kill();}
}

(async()=>{
  instrumentChecks();
  await httpChecks();
  console.log(JSON.stringify({passed:checks.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
