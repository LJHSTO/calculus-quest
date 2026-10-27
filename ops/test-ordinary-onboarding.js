'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/学习入口与六维设置整理-2026-10-27');
async function main(){
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,'合成测试-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),base=`http://127.0.0.1:${port}`;
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:'synthetic-entry-admin',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'5000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});let browser;const checks=[],errors=[];
 async function api(route,body,token=''){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
 try{
  for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const password='synthetic-entry-password',u=await api('/api/auth/register',{nickname:'合成普通流程',password,email:''});assert.equal(u.status,200);
  const token=u.token,C=require('../app/shared/learner-preferences'),answers=C.defaults();for(const a of Object.values(answers))a.reason='default';
  assert.equal((await api('/api/learning/learner-preferences',null,token)).data.preparation.stage,'entry');
  assert.equal((await api('/api/learning/learner-preferences',{answers,expectedRevision:0},token)).status,403);
  assert.equal((await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'GH-01-K01-formative',phase:'formative',answers:[{questionId:'GH-01-K01-check-q1',response:'A'}]},token)).code,'learner_preparation_required');checks.push('未完成前测不能抢先保存设置或绕过API提交练习');
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#login-identifier').fill('合成普通流程');await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.evaluate(()=>switchView('learn'));await page.locator('#pilot-dialog[open]').waitFor();assert.equal(await page.locator('#pilot-dialog input[aria-label=预试加入码]').count(),1);assert.equal((await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:[]},token)).code,'learner_preparation_required');await page.getByRole('button',{name:'进入普通学习',exact:true}).click();await page.waitForFunction(()=>LearnerSetup.preparation?.stage==='pretest');checks.push('加入码位于前测前，普通学习必须明确选择，服务端禁止跳过入口作答');
  await page.evaluate(async()=>{await ensureChapterLoaded('V14-C1');selectUnit('V14-C1-pre');});
  const q=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').flow.preQuiz.questions;
  // Use the genuine submit button with independent "I do not know" responses.
  for(const item of q){await page.locator(`[data-question="${item.id}"] ${item.type==='short_answer'?'[data-short-unknown]':'input[value="__unknown__"]'}`).check();}
  await page.locator('[data-submit-quiz="V14-C1-pre"]').click();
  await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));
  assert.equal(await page.locator('#learner-setup[open]').count(),0,'提交后应保留结果直到下一步');
  await page.getByRole('button',{name:'下一步：设置学习方式',exact:true}).first().click();await page.locator('#learner-setup[open]').waitFor();
  assert.equal(await page.locator('#learner-setup .learner-steps button').count(),6);assert.equal((await api('/api/learning/pilot',null,token)).data.enrollment,null);
  assert.notEqual((await api('/api/learning/grade',{unitId:'V14-C1-pre',questions:[]},token)).code,'learner_preparation_required','已提交的前测评分不应被六维准备拦住');
  assert.equal((await api('/api/learning/support-cycle',{action:'report',scope:'GH-01-K01',unitId:'GH-01-K01',need:'concept'},token)).code,'learner_preparation_required');checks.push('无预试码也进入六维；保留前测结果、不自动跳转；未设置时支持API受保护');
  await page.screenshot({path:path.join(out,'无预试码进入六维.png'),animations:'disabled'});
  await page.getByRole('button',{name:'稍后继续',exact:true}).click();await page.evaluate(()=>selectUnit('GH-01-K01'));await page.locator('#learner-setup[open]').waitFor();checks.push('关闭设置后点课件仍回到必经设置');
  await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});
  await page.waitForFunction(()=>currentUnitId==='GH-01-K01');
  await page.evaluate(()=>renderPlayer());
  assert.equal(await page.locator('.workspace-canvas-tabs:visible').count(),1,'局部重绘后课件工具栏必须保留');
  assert.equal(await page.locator('#support-need-launcher').count(),0);assert.equal(await page.locator('#pilot-learning-guide').isVisible(),false);
  const d=(await api('/api/learning/learner-preferences',null,token)).data;assert.equal(d.preparation.stage,'ready');assert.equal(d.record.generation,1);assert.equal(d.record.selectionSource,'defaults_button');
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.waitForFunction(()=>LearnerSetup.preparation?.stage==='ready');assert.equal(await page.locator('#learner-setup[open]').count(),0);checks.push('默认确认和理由持久化；保存后进入课件；刷新无需重设；学习页无主动求助入口和准备横幅');
  await page.locator('[data-openmaic-state="ready"]').first().waitFor();
  await page.setViewportSize({width:1366,height:768});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'正常学习页.png'),animations:'disabled'});
  assert.equal(await page.locator('#reset-progress').count(),0);
  assert.match(await page.locator('#learner-preferences-button').innerText(),/已设置/);
  await page.evaluate(()=>selectUnit('V14-C1-pre'));await page.locator('#learning-action-dock button').filter({hasText:'继续学习'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'下一步：设置学习方式',exact:true}).count(),0);assert.equal(await page.locator('#learner-setup[open]').count(),0);
  await page.locator('#learning-action-dock button').filter({hasText:'继续学习'}).click();await page.waitForFunction(()=>currentUnitId==='GH-01-K01');assert.equal(await page.locator('#learner-setup[open]').count(),0);checks.push('返回前测显示已设置和继续学习，不重新打开配置');
  await page.locator('#learner-preferences-button').click();assert.equal(await page.locator('.learner-review-row').count(),6);await page.getByRole('button',{name:'修改提示位置',exact:true}).click();
  for(const loc of ['inline','sidebar']){await page.locator(`input[name=D4-placement][value=${loc}]`).check();assert.equal(await page.locator('input[name=D4-placement]:checked').inputValue(),loc);}assert.equal(await page.locator('input[name=D4-format]').count(),0);
  await page.screenshot({path:path.join(out,'提示呈现-位置与展开.png'),animations:'disabled'});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.locator('#learner-setup footer button').last().evaluate(n=>{const r=n.getBoundingClientRect();return r.bottom<=innerHeight&&r.top>=0;}));await page.screenshot({path:path.join(out,'六维设置-窄屏.png'),animations:'disabled'});await page.setViewportSize({width:1366,height:768});
  await page.locator('select[name=preference-reason]').selectOption('separate_chat');await page.getByRole('button',{name:'下一项',exact:true}).click();await page.getByRole('button',{name:'下一项',exact:true}).click();await page.getByRole('button',{name:'核对选择',exact:true}).click();await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});
  const saved=(await api('/api/learning/learner-preferences',null,token)).data.record;assert.equal(saved.answers.D4.value,'sidebar');assert.equal(saved.profile.placement,'sidebar');assert.equal(saved.profile.presentationFormat,'plain');checks.push('D4仅两种位置，侧栏配置保存生效，窄屏按钮可见');
  // Late enrollment is a rehearsal-only continuation, with explicit reuse consent.
  const version=await api('/api/admin/pilot/version',{design:'learner-configurable-20-v1',useMode:'rehearsal',project:'late-resume',title:'合成接续演练',reason:'合成测试',responsible:'合成',contact:'合成',reviewReference:'合成',retention:'合成',withdrawal:'合成'},'synthetic-entry-admin');assert.equal(version.status,200);
  const beforeJoin=await api('/api/learning/snapshot',null,token);
  await page.locator('#pilot-entry-button').click();await page.getByRole('textbox',{name:'预试加入码'}).fill(version.data.joinCode);await page.getByRole('button',{name:'用此加入码继续',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'开启新一轮学习',exact:true}).count(),0);await page.locator('#pilot-dialog input[type=checkbox]').nth(0).check();await page.locator('#pilot-dialog input[type=checkbox]').nth(1).check();await page.getByRole('button',{name:'确认并加入',exact:true}).click();await page.locator('#learner-setup[data-mode=baseline][open]').waitFor();
  for(const [k]of C.surveys.baseline)await page.locator(`input[name=baseline-${k}][value="3"]`).check();await page.getByRole('button',{name:'保存并继续',exact:true}).click();await page.locator('#learner-setup[data-mode=study]').waitFor();
  const resumed=(await api('/api/learning/pilot',null,token)).data.enrollment;assert.equal(resumed.stage,'ready');assert.equal(resumed.arm,'configurable');assert.equal(resumed.configuration.revision,saved.revision);assert.equal(resumed.rehearsalResume.baselineTiming,'after_pretest_exposure');
  assert.equal((await api('/api/learning/snapshot',null,token)).generation,beforeJoin.generation);assert.deepEqual((await api('/api/learning/snapshot',null,token)).snapshot.quizResults,beforeJoin.snapshot.quizResults);
  await page.getByRole('button',{name:'开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});await page.evaluate(()=>selectUnit('V14-C1-pre'));await page.locator('#learning-action-dock button').filter({hasText:'继续学习'}).waitFor();await page.evaluate(()=>syncLearningSnapshot('revisit_pretest'));await page.screenshot({path:path.join(out,'已设置-前测继续.png'),animations:'disabled'});await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.waitForFunction(()=>LearnerSetup.enrollment?.stage==='ready');assert.equal(await page.locator('#learner-setup[open]').count(),0);await page.waitForFunction(()=>currentUnitId==='V14-C1-pre');await page.locator('#learning-action-dock button').filter({hasText:'继续学习'}).waitFor();await page.screenshot({path:path.join(out,'已设置-返回前测.png'),animations:'disabled'});checks.push('旧前测和已设置偏好接续演练，保留进度，刷新及前测回看不重复配置');
  await page.close();const snapshot=await api('/api/learning/snapshot',null,token);const reset=await api('/api/learning/reset',{generation:snapshot.generation,baseRevision:snapshot.revision,snapshot:{}},token);assert.equal(reset.status,403,JSON.stringify(reset));assert.equal((await api('/api/learning/pilot',null,token)).data.enrollment.stage,'ready');assert.equal((await api('/api/admin/learning/reset',{},token)).status,403);const afterReset=await api('/api/learning/snapshot',null,token);assert.equal(afterReset.generation,snapshot.generation);assert.deepEqual(afterReset.snapshot,snapshot.snapshot);checks.push('学生重置接口关闭且原代次、进度、配置不变');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'普通学习必经流程测试.json'),JSON.stringify({passed:true,checks,errors,synthetic:true},null,2));console.log(JSON.stringify({passed:true,checks}));
 }finally{await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
