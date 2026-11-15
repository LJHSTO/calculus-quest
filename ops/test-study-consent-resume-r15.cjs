'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),bank=require('../lib/assessments/functions-limits-r14'),old=require('../lib/assessments/functions-limits-r13');
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cq-consent-r15-')),out=path.join(root,'output/playwright/r15');fs.mkdirSync(out,{recursive:true});
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base=`http://127.0.0.1:${port}`;
 const admin=crypto.randomBytes(20).toString('hex'),password='synthetic-r15-password';
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:'false',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r13',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'5000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});let browser,token='';const checks=[],errors=[];
 const check=name=>{checks.push(name);console.log('通过：'+name);};
 const api=async(route,body,arm='B',auth=token)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`} :{}),...(arm?{'X-Study-Arm':arm}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};};
 try{
  for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(server.exitCode!==null)throw Error('隔离服务启动失败');await new Promise(r=>setTimeout(r,100));}
  token=(await api('/api/auth/register',{nickname:'签署恢复合成',password})).token;
  const doc=(await api('/api/study/enrollment-document',null,'assigned')).data.document;
  const signed={consent:true,adult:true,participantName:'合成测试者',signature:'合成测试者',consentVersion:doc.version,consentHash:doc.hash};
  assert.equal((await api('/api/study/enroll',{consent:true},'assigned')).status,400);
  assert.equal((await api('/api/study/enroll',signed,'assigned')).status,409,'未审核禁止正式入组');
  assert.equal((await api('/api/study/consent',{...signed,signature:'不一致'})).status,400);
  assert.equal((await api('/api/study/consent',{...signed,consentHash:'old'})).status,400);
  assert.equal((await api('/api/study/consent',{...signed,adult:false})).status,400);
  const saved=await api('/api/study/consent',signed);assert.equal(saved.status,200,JSON.stringify(saved));assert(saved.data.receipt.receiptHash);assert(saved.data.run.consentReceiptHash);
  assert.deepEqual((await api('/api/study/consent',signed)).data.receipt,saved.data.receipt);
  assert.equal((await api('/api/study/consent',null,'C')).data.receipt,null,'按轮次隔离');
  const otherToken=(await api('/api/auth/register',{nickname:'其他合成账号',password},'','')).token;
  assert.equal((await api('/api/study/consent',null,'B',otherToken)).data.receipt,null,'按账号隔离');
  const exported=(await api('/api/admin/three-arm/export',null,'',admin));assert.equal(exported.status,200);assert(!JSON.stringify(exported).includes(signed.participantName));
  assert.equal((await api('/api/admin/three-arm/consents',null,'',token)).status,403);
  assert.equal((await api('/api/admin/three-arm/consents',null,'',admin)).data[0].signature,signed.signature);
  check('签署校验、版本校验、服务端存档、重复提交、账号及轮次隔离、实名导出权限');
  const items=(await api('/api/study/survey?stage=baseline')).data.items,answers=Object.fromEntries(items.map(q=>[q.id,q.type==='text'?'合成回答':3]));
  assert.equal((await api('/api/study/survey',{stage:'baseline',answers:{...answers,demo_age:null}})).status,400);
  assert.equal((await api('/api/study/survey',{stage:'baseline',answers:{...answers,demo_age:'skip'}})).status,400);
  check('必答问卷不能通过null或skip绕过');
  for(const form of ['X','Y','Z']){
   const before=old.forms(form),after=bank.forms(form);assert.equal(after.length,12);assert.equal(after.reduce((n,q)=>n+q.points,0),32);
   for(let i=0;i<after.length;i++)for(const key of ['answer','options','rubric','referenceAnswer','figure'])assert.deepEqual(after[i][key],before[i][key],`${form}:${i}:${key}`);
   assert.match(after[7].question,/计算器/);assert.doesNotMatch(after[7].question,/反例输入|预测模型/);
   assert(bank.publicForm('pre',form).items.every(q=>!('answer'in q)&&!('rubric'in q)));
  }
  check('新版三份测验保留分值、答案、量规和题图；只更新四道生成题的阅读表述');
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  async function login(){await page.goto(base+'/?study=B');await page.locator('#login-identifier').fill('签署恢复合成');await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});}
  await login();await page.evaluate(()=>{ThreeArmStudyUI.setRun(null);return ThreeArmStudyUI.openSurvey('baseline');});const dialog=page.locator('#three-arm-dialog');
  assert.equal(await dialog.getByText('不愿回答',{exact:true}).count(),0);assert.equal(await dialog.getByText('暂不作答',{exact:true}).count(),0);
  await dialog.locator('input[name=study-demo_age][value="2"]').check();await dialog.getByLabel('你理想中的主动式 AI 学习助手应该怎样帮助你？（选填）',{exact:true}).count().catch(()=>0);
  const free=dialog.locator('textarea').first();await free.fill('刷新后保留的合成想法');
  const draft=await page.evaluate(()=>({run:ThreeArmStudyUI.run.id,keys:Object.keys(localStorage).filter(k=>k.startsWith('study-form-draft-v2:'))}));assert(draft.keys.some(k=>k.includes(draft.run)),'初始化尚未结束也必须按真实轮次保存草稿');
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.evaluate(()=>ThreeArmStudyUI.openSurvey('baseline'));
  assert(await dialog.locator('input[name=study-demo_age][value="2"]').isChecked());assert.equal(await dialog.locator('textarea').first().inputValue(),'刷新后保留的合成想法');
  await page.screenshot({path:path.join(out,'问卷刷新恢复.png')});
  await dialog.getByRole('button',{name:'稍后继续',exact:true}).click();await page.locator('#auth-menu-toggle').click();await page.locator('#auth-logout').click();await page.locator('#auth-gate').waitFor({state:'visible'});await page.waitForFunction(()=>!authTransitionInProgress);await login();await page.evaluate(()=>ThreeArmStudyUI.openSurvey('baseline'));
  assert(await dialog.locator('input[name=study-demo_age][value="2"]').isChecked());assert.equal(await dialog.locator('textarea').first().inputValue(),'刷新后保留的合成想法');check('问卷选择和开放题草稿跨刷新与退出重进恢复，无不愿回答选项');
  await dialog.getByRole('button',{name:'稍后继续',exact:true}).click();await page.evaluate(()=>ThreeArmStudyUI.openTasks());await page.getByRole('button',{name:'查看已签署的知情同意书',exact:true}).click();await dialog.getByText('参与者姓名：合成测试者',{exact:true}).waitFor({state:'visible'});await page.screenshot({path:path.join(out,'已签署同意书.png')});
  assert.deepEqual(errors,[]);check('已签署同意书可再次读取并保存副本，浏览器无未捕获错误');
  await api('/api/admin/three-arm/baseline',{reviewer:'仅隔离合成测试',confirmed:true},'',admin);
  const formalArms=[];
  for(const entry of ['A','B','C',...Array(6).fill('assigned')]){
   const nickname='合并签署'+entry+crypto.randomBytes(4).toString('hex');await api('/api/auth/register',{nickname,password},'','');
   const context=await browser.newContext({viewport:{width:1366,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base+'/?study='+entry);await p.locator('#login-identifier').fill(nickname);await p.locator('#login-password').fill(password);await p.locator('#login-submit').click();await p.locator('#auth-gate').waitFor({state:'hidden'});
   await p.evaluate(()=>ThreeArmStudyUI.openTasks());if(entry!=='assigned')await p.getByRole('button',{name:'继续准备',exact:true}).click();
   const combined=p.locator('#three-arm-dialog');await combined.locator('[name=participant-name]').waitFor({state:'visible'});
   assert.equal(await combined.locator('input[name^="study-"]').count(),0,'签署前不收集问卷');
   await p.evaluate(()=>{window.consentDialogBefore=document.querySelector('#three-arm-dialog');window.consentPageMarker='same-page';});
   await combined.locator('[name=participant-name]').fill('合成测试者');await combined.locator('[name=participant-signature]').fill('合成测试者');for(const c of await combined.locator('input[type=checkbox]').all())await c.check();
   await combined.getByRole('button',{name:'签署并填写学习前问卷',exact:true}).click();await combined.locator('input[name=study-demo_age]').first().waitFor({state:'visible'});
   assert(await p.evaluate(()=>window.consentPageMarker==='same-page'&&window.consentDialogBefore===document.querySelector('#three-arm-dialog')&&consentDialogBefore.open),'同一页面和窗口连续完成');
   assert.equal(await combined.locator('details summary').innerText(),'1. 知情同意（已签署，可查看或保存副本）');
   const study=await p.evaluate(()=>ThreeArmStudyUI.run);assert(study.consentReceiptHash);if(entry==='assigned'){formalArms.push(study.arm);assert.equal(study.mode,'formal');assert(study.firstSessionClock.elapsedSeconds<30);}
   for(const field of await combined.locator('fieldset').all()){const radios=field.locator('input[type=radio]');if(await radios.count())await radios.first().check();}
   await combined.getByRole('button',{name:'保存并继续',exact:true}).click();await combined.waitFor({state:'hidden'});
   await p.waitForFunction(()=>LearnerSetup.preparation?.stage==='pretest');
   assert.equal((await p.evaluate(()=>ThreeArmStudyUI.request('state'))).run.baselineAt!==null,true);
   if(entry==='B')await p.screenshot({path:path.join(out,'合并签署进入前测.png')});await context.close();
  }
  assert.deepEqual(formalArms.sort(),['A','A','B','B','C','C']);check('三组体验与随机正式入组在同一页签署并填写问卷，正式计时不中断，正确进入前测');
  await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());FirstSessionBudget.update({id:'clock-combined-test',firstSessionClock:{elapsedSeconds:3839,completed:false,enforce:true,maximumSeconds:5400,posttestReserveFromSeconds:3840}});});
  assert.equal(await page.locator('.first-session-budget-reminder').count(),0);
  await page.waitForTimeout(1500);await page.locator('.first-session-budget-reminder').waitFor({state:'visible'});
  assert.equal(await page.locator('.first-session-budget-dialog[open]').count(),0,'预留提醒不抢占任务窗口');
  await page.locator('.first-session-budget-reminder button').click();await page.waitForTimeout(1100);assert.equal(await page.locator('.first-session-budget-reminder').count(),0,'同一轮不重复提醒');
  await page.evaluate(()=>FirstSessionBudget.update({id:'clock-combined-test',firstSessionClock:{elapsedSeconds:5400,completed:false,enforce:true,maximumSeconds:5400,posttestReserveFromSeconds:3840}}));
  await page.locator('.first-session-budget-dialog[open]').waitFor({state:'visible'});assert.deepEqual(errors,[]);check('64分钟轻提示、关闭后不重复、90分钟截止提示保持有效');
 }finally{if(browser)await browser.close();if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}fs.closeSync(log);fs.writeFileSync(path.join(out,'consent-resume-result.json'),JSON.stringify({checks,errors,synthetic:true},null,2));}
 console.log(JSON.stringify({passed:true,checks:checks.length,output:out}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
