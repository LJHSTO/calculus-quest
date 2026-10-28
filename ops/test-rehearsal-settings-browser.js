'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/演练加入与偏好修改修复-2026-10-27');
const C=require('../app/shared/learner-preferences');
async function main(){
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,'隔离浏览器-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),base=`http://127.0.0.1:${port}`;
 const admin='synthetic-settings-admin',password='Synthetic-settings-27!';
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:admin,MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'10000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});let browser;const checks=[],errors=[];
 async function api(route,body,token=admin){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
 try{
  for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const v=(await api('/api/admin/pilot/version',{design:'learner-configurable-20-v1',useMode:'rehearsal',sampling:{silentProbability:.01},project:'synthetic-settings-rehearsal',title:'合成演练修改验收',reason:'隔离测试',responsible:'合成',contact:'合成',reviewReference:'合成',retention:'合成',withdrawal:'合成'})).data;
  assert.equal(v.version.capacity,null);
  for(let i=0;i<20;i++){const u=await api('/api/auth/register',{nickname:'名额合成'+i,password,email:''});assert.equal(u.status,200);assert.equal((await api('/api/learning/pilot/start',{joinCode:v.joinCode,versionHash:v.version.hash,consent:true},u.token)).status,200);}
  const nickname='第21位浏览器演练',u=await api('/api/auth/register',{nickname,password,email:''});assert.equal(u.status,200);
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#login-identifier').fill(nickname);await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('#home-pilot-entry').click();await page.getByLabel('预试加入码',{exact:true}).fill(v.joinCode);await page.getByRole('button',{name:'阅读预试说明',exact:true}).click();await page.locator('#pilot-dialog input[type=checkbox]').check();await page.getByRole('button',{name:'确认并加入',exact:true}).click();await page.getByText('学习前，先了解一下你',{exact:true}).waitFor();
  assert.equal((await api('/api/learning/pilot',null,u.token)).data.enrollment.allocationIndex,20);checks.push('已有20名额时，第21位经真实浏览器输码与确认成功加入');
  for(const [k]of C.surveys.baseline)await page.locator(`input[name="baseline-${k}"][value="3"]`).check();await page.getByRole('button',{name:'保存并继续',exact:true}).click();
  const chapter=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
  for(const q of chapter.flow.preQuiz.questions)await page.locator(`[data-question="${q.id}"] ${q.type==='short_answer'?'[data-short-unknown]':'input[value="__unknown__"]'}`).check();
  await page.locator('[data-submit-quiz="V14-C1-pre"]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));await page.locator('[data-quiz-path-action=pilot-next]').last().click();await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});await page.waitForFunction(()=>currentUnitId==='GH-01-K01');
  const quizBefore=(await api('/api/learning/learner-preferences',null,u.token)).data.pilot.enrollment.pretest;
  for(let i=0;i<6;i++){
   const d=C.dimensions[i];await page.locator('#learner-preferences-button').click();await page.getByText('已保存的学习偏好',{exact:true}).waitFor();await page.getByRole('button',{name:'修改'+d.short,exact:true}).click();
   const option=C.optionsFor(d.id,true).find(o=>o[0]!==d.default);await page.locator(`input[name="${d.id==='D4'?'D4-placement':d.id}"][value="${option[0]}"]`).check();await page.locator('#learner-setup select[name=preference-reason]').selectOption('independence');
   for(let n=i;n<6;n++)await page.getByRole('button',{name:n===5?'核对选择':'下一项',exact:true}).click();
   await page.getByRole('button',{name:'保存修改并返回学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});
   const saved=(await api('/api/learning/learner-preferences',null,u.token)).data;assert.equal(saved.record.revision,i+2);assert.equal(saved.record.answers[d.id].value,option[0]);assert.equal(saved.pilot.enrollment.configuration.hash,saved.record.hash);assert.equal(saved.configurationWindow.kind,'rehearsal_learning');
  }checks.push('六维分别从已设置入口修改并保存，服务端版本与有效配置逐项一致');
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#learner-preferences-button').click();await page.getByText('已保存的学习偏好',{exact:true}).waitFor();await page.screenshot({path:path.join(out,'六维已设置与修改入口.png'),animations:'disabled'});assert.equal((await api('/api/learning/learner-preferences',null,u.token)).data.record.revision,7);await page.getByRole('button',{name:'稍后继续',exact:true}).click();
  // Assessment navigation is a fixture seam, used only to test the server guard.
  await page.evaluate(()=>{currentUnitId='GH-01-K01-formative';renderAll();return syncLearningSnapshot('synthetic_assessment_guard');});
  const stored=(await api('/api/learning/learner-preferences',null,u.token)).data;assert.equal(stored.enabled,false);assert.equal((await api('/api/learning/learner-preferences',{answers:stored.record.answers,expectedRevision:7},u.token)).status,403);
  // The browser shows the lesson before its delayed snapshot save. Opening
  // preferences must sync it rather than keep the preceding assessment lock.
  await page.evaluate(()=>{currentUnitId='GH-01-K01';renderAll();});await page.locator('#learner-preferences-button').click();await page.getByText('已保存的学习偏好',{exact:true}).waitFor();assert.equal((await api('/api/learning/learner-preferences',null,u.token)).data.enabled,true);
  const after=(await api('/api/learning/learner-preferences',null,u.token)).data;assert.deepEqual(after.pilot.enrollment.pretest,quizBefore);checks.push('刷新保留配置；独立测验阻止修改；返回课件主动同步位置后恢复修改；前测记录不变');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'浏览器回归.json'),JSON.stringify({passed:true,synthetic:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
 }finally{await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
