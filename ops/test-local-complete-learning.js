'use strict';
// Runs the actual student UI against an already-running local instance. No
// snapshot writes, navigation seams, fabricated learning events or mock model.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
const freeOnly=process.env.CQ_FREE_EXPLORATION==='1';
const requireLiveModel=process.env.CQ_ALLOW_MODEL_FALLBACK!=='1';
const root=path.resolve(__dirname,'..'),dir=path.join(root,'output/本地学习运行'),out=path.join(root,freeOnly?'output/自由探索触发核验-2026-10-27':'output/课件语义与完整流程验收-2026-10-27');
const route=require('../data/multi-scene-learning-route.json'),chapter=route.chapters.find(c=>c.id==='V14-C1'),C=require('../app/shared/learner-preferences'),M=require('../resources/open-maic/主动探索证据/exploration-model');
async function main(){
 const runtime=JSON.parse(fs.readFileSync(path.join(dir,'运行状态.json'),'utf8')),code=JSON.parse(fs.readFileSync(path.join(dir,'演练凭据.json'),'utf8')).joinCode,base=`http://127.0.0.1:${runtime.port}`;
 const credentials={nickname:'完整流程演练'+Date.now(),password:crypto.randomBytes(16).toString('base64url')+'9aA!'};fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(dir,'本轮完整流程账号.json'),JSON.stringify(credentials));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);
 const checks=[],errors=[],cycles=[],decisions=[];let userId=null,failure=null;page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{try{if(r.url().includes('/api/learning/assistant/intervention'))decisions.push(await r.json());}catch{}});
 page.on('response',async r=>{try{if(r.url().endsWith('/api/auth/register')){const j=await r.json();userId=j.participant?.id;}}catch{}});
 const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
 async function answerQuiz(quiz){
  for(const q of quiz.questions){const card=page.locator(`.question-card[data-question="${q.id}"]`);if(!await card.isVisible())continue;
   if(q.type==='short_answer')await card.locator('textarea').fill('合成流程验收：分别检查输入、输出以及点值与附近趋势；这不是真人学习回答。');
   else{const inputs=card.locator('input');const targets=Array.isArray(q.answer)?q.answer:[q.answer];for(const a of targets){const exact=card.locator(`input[value="${a}"]`);if(await exact.count())await exact.check();else await inputs.first().check();}}
  }
  await page.locator('[data-submit-quiz]').click();await page.locator('.quiz-encouragement-banner').waitFor();
 }
 async function next(){const action=page.locator('#learning-action-dock button').last();await action.click();}
 async function resolveHelp(scope,required){
  const notice=page.getByRole('button',{name:/知点想询问你.*查看/});
  // Real rehearsal sampling can pause support. Complete that UI record, then
  // make fresh observations; never inject a decision or bypass measurement.
  if(freeOnly){
   await page.waitForTimeout(1500);
   const probe=page.getByRole('button',{name:'学习情况 · 回答或跳过',exact:true});
   if(await probe.isVisible()){
    await probe.click();const dialog=page.locator('#pilot-probe-dialog');await dialog.getByRole('button',{name:'不确定',exact:true}).click();await dialog.getByRole('button',{name:'保存这次记录',exact:true}).click();await dialog.waitFor({state:'hidden'});
    if(scope==='GH-01-K01'){const controls=page.frameLocator('iframe[data-courseware-frame]').locator('[onclick^="applyPreset"]');await controls.nth(0).click();await page.waitForTimeout(3500);await controls.nth(1).click();}
   }
  }
  try{await notice.first().waitFor({timeout:required?25000:2500});}catch{if(required)throw Error(freeOnly?'自由探索比较后没有可见主动询问':'两次真实判断错误后没有可见主动询问');return;}
  await notice.first().click();
  const frame=page.frameLocator('iframe[data-courseware-frame]'),native=frame.locator('[data-cq-embedded-help="task"]');
  let host=page.locator('.task-support-panel:visible,.learning-support-surface:visible').first();if(await native.isVisible())host=native;
  const need=host.getByText('这一步需要什么帮助？',{exact:true});await need.click();
  if(freeOnly)await host.getByText('要不要一起整理刚才的发现？',{exact:true}).waitFor();
  await host.getByRole('button',{name:freeOnly?'整理刚才的发现':'概念或步骤没弄懂',exact:true}).click();await host.getByRole('button',{name:'开始帮助',exact:true}).click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered',null,{timeout:40000});
  const c=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle);cycles.push({scope,id:c.id,initiation:c.initiation,confirmedNeed:c.need?.need,sourceIds:c.inquiry?.sourceIds,audit:c.content.audit});
  if(freeOnly){assert.equal(c.need.need,'reflection');assert.ok(!/不知道|没弄懂/.test(c.plan.rationale),'探索整理不能误记为困难自述');}
  if(requireLiveModel)assert.equal(c.content.audit.fallback,false,'必须验证真实模型生成，不能用备用内容代替');
  if(freeOnly){assert.equal(c.inquiry.basis,'exploration_comparison');assert.equal(c.inquiry.psychologicalState,'unknown');}
  await shot(scope+'-真实主动支持');
  await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().supportCycle?.exposure),null,{timeout:10000});
  await host.getByRole('button',{name:'我先试一试',exact:true}).click();
  await host.getByText('反馈与下一步',{exact:true}).click();await host.getByRole('button',{name:'有帮助',exact:true}).click();await host.getByRole('button',{name:'保存反馈',exact:true}).click();
  const end=host.getByRole('button',{name:'结束这轮帮助',exact:true});if(await end.isVisible())await end.click();
 }
 try{
  await page.goto(base);await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-auth-mode=register]').click();await page.locator('#nickname').fill(credentials.nickname);await page.locator('#register-password').fill(credentials.password);await page.locator('#register-password-confirm').fill(credentials.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('#home-pilot-entry').click();await page.getByLabel('预试加入码',{exact:true}).fill(code);await page.getByRole('button',{name:'阅读预试说明',exact:true}).click();await page.locator('#pilot-dialog input[type=checkbox]').check();await page.getByRole('button',{name:'确认并加入',exact:true}).click();
  await page.getByText('学习前，先了解一下你',{exact:true}).waitFor();for(const [key]of C.surveys.baseline)await page.locator(`input[name="baseline-${key}"][value="3"]`).check();await page.getByRole('button',{name:'保存并继续',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});checks.push('新账号、真实加入码、说明、学习前问卷');
  await answerQuiz(chapter.flow.preQuiz);await shot('前测完成');assert.equal(await page.locator('#learner-setup').isVisible(),false);await next();await page.getByText('让帮助适合你的学习方式',{exact:true}).waitFor();
  for(let i=0;i<6;i++){await page.locator('#learner-setup select[name=preference-reason]').selectOption('independence');await page.getByRole('button',{name:i===5?'核对选择':'下一项',exact:true}).click();}await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});checks.push('前测结果手动推进、六维逐项理由、保存');
  const points=chapter.modules.flatMap(m=>m.knowledgePoints);
  for(let i=0;i<points.length;i++){
   const p=points[i];await page.waitForFunction(id=>currentUnitId===id,p.id);
   await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=simulation]').click();
   const f=page.frameLocator('iframe[data-courseware-frame]'),d=f.locator('.concept-exploration');
   const freeControl=f.locator('input[type=range]').first();
   if(await freeControl.isVisible()){await freeControl.focus();await freeControl.press('ArrowRight');await freeControl.press('Tab');}
   if(freeOnly){
    if([0,1,3,4].includes(i)){const buttons=f.locator(i===3?'[data-func]':i===4?'[onclick^="setFunctionType"]':'[onclick^="applyPreset"]');await buttons.nth(0).click();await page.waitForTimeout(3500);await buttons.nth(1).click();}
    else if(i===2){const canvas=f.locator('#canvas'),box=await canvas.boundingBox();for(const ratio of [.3,.7]){await page.mouse.move(box.x+box.width*ratio,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*(ratio+.05),box.y+box.height*.5,{steps:8});await page.mouse.up();await page.waitForTimeout(3500);}}
    else{const slider=f.locator('#point_y_coordinate-slider');await slider.focus();await slider.press('Home');await slider.press('Tab');await page.waitForTimeout(3500);await slider.focus();for(let k=0;k<80;k++)await slider.press('ArrowRight');await slider.press('Tab');}
    await resolveHelp(p.id,i===0);assert.equal(await d.getAttribute('open'),null,'自由探索路径不打开概念核对');
   }else{
   await d.locator('summary').first().click();const task=M.get(p.id,'simulation');
   for(const response of task.options.map((_,k)=>k).filter(k=>k!==task.answer)){await d.locator(`input[value="${response}"]`).check();await d.locator('button[type=submit]').click();}
   await resolveHelp(p.id,i===0);
   if(!await d.evaluate(n=>n.open))await d.locator('summary').first().click();
   await d.locator(`input[value="${task.answer}"]`).check();await d.locator('button[type=submit]').click();await d.getByRole('button',{name:'收起，继续探索'}).click();
   }
   await shot(p.id+'-探索完成');await next();
   await page.getByRole('button',{name:'做小题测一测',exact:true}).click();
   await page.locator('.question-card').first().waitFor();await answerQuiz(p.formativeQuiz);await next();checks.push(p.id+(freeOnly?'自由探索、不做可选核对、':'自由探索、概念核对、')+'形成性检测、继续');console.log(p.id+' 已完成');
  }
  await page.locator('.question-card').first().waitFor();await answerQuiz(chapter.flow.postQuiz);await next();await page.getByText('填写本次学习体验',{exact:true}).waitFor();
  for(const kind of ['final','configuration'])for(const [key]of C.surveys[kind])await page.locator(`input[name="${kind}-${key}"][value="3"]`).check();await page.getByRole('button',{name:'保存问卷并结束本轮预试',exact:true}).click();await page.getByText('问卷已经保存，谢谢参与。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/退出后续测量并排除/}).count(),0);await shot('后测与问卷已完成');checks.push('后测、结束问卷、无一键排除回放按钮');
  if(!userId)userId=await page.evaluate(()=>state.participant?.participantId);
  assert.ok(userId,'需要注册响应中的账号ID核对回放');
  const response=await fetch(base+'/api/admin/research/selected-participants',{method:'POST',headers:{Authorization:`Bearer ${runtime.adminToken}`,'Content-Type':'application/json'},body:JSON.stringify({userIds:[userId]})});const exported=await response.json();assert.equal(response.status,200);const tables=exported.data.tables;assert.ok(tables.learner_support_cycles.length>=1);assert.ok(tables.learner_preference_history.length>=1);assert.ok(tables.quiz_results.some(r=>r.phase==='post'));assert.ok(tables.pilot_enrollments.some(r=>JSON.parse(r.document).status==='finished'));
  fs.writeFileSync(path.join(dir,'本轮新账号完整回放.json'),JSON.stringify(exported.data));
  const actualCycle=tables.learner_support_cycles.map(r=>JSON.parse(r.payload_json)).find(c=>c.content&&(!requireLiveModel||c.content.audit?.fallback===false));
  assert.ok(actualCycle?.exposure&&actualCycle?.feedback,'真实支持必须关联实际曝光与反馈');
  for(const sourceId of actualCycle.inquiry.sourceIds)assert.ok(JSON.stringify(exported.data).split(sourceId).length>=3,'来源事件应同时出现在证据与支持记录');
  const enrollment=JSON.parse(tables.pilot_enrollments.find(r=>JSON.parse(r.document).status==='finished').document);
  const staff=await browser.newPage({viewport:{width:1440,height:1000}});
  await staff.goto(base+'/pilot-workbench.html');await staff.locator('#pilot-token').fill(runtime.adminToken);await staff.locator('#pilot-login-button').click();
  await staff.getByLabel('查看预试项目',{exact:true}).selectOption(enrollment.project);
  const row=staff.locator('.pilot-dashboard tbody tr').filter({hasText:enrollment.participantCode});await row.getByRole('button',{name:'查看回放',exact:true}).click();await staff.locator('.pilot-replay-summary strong').waitFor();
  const downloading=staff.waitForEvent('download');await staff.getByRole('button',{name:'下载当前回放包（JSON）',exact:true}).click();const download=await downloading;await download.saveAs(path.join(dir,'本轮管理员界面下载回放.json'));assert.match(download.suggestedFilename(),/完整学生回放/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'本轮管理员界面下载回放.json'),'utf8')).participants.length,1);
  await staff.screenshot({path:path.join(out,'管理员新账号回放导出.png')});await staff.close();
  checks.push('管理员界面下载与接口核对真实新账号回放，关联配置、判断、模型支持、反馈、作答和问卷');
  assert.deepEqual(errors,[]);console.log('完整新账号学习流程通过：'+checks.join('；'));
 }catch(e){failure=e.message;await shot('完整流程失败现场');console.log((await page.locator('body').innerText()).slice(-4500));console.log(JSON.stringify(decisions).slice(-3500));throw e;}
 finally{fs.writeFileSync(path.join(out,'新账号完整学习验收.json'),JSON.stringify({synthetic:true,liveLocal:true,mockedModel:false,requireLiveModel,liveModelVerified:cycles.some(c=>c.audit.fallback===false),passed:checks.length===10&&!failure,failure,checks,errors,cycles:cycles.map(c=>({...c,audit:{fallback:c.audit.fallback,provider:c.audit.provider,model:c.audit.model,latencyMs:c.audit.latencyMs}}))},null,2));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
