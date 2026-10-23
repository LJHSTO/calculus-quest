"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output','OpenMAIC实包与六维控制-2026-10-18');
const results=[];
async function main(){
 for(const enabled of [true,false]){
  const dir=fs.mkdtempSync(path.join(root,'output','control-browser-'));
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const base=`http://127.0.0.1:${port}`,env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'test.db'),LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'isolated-control-test',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'control,treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r2',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-retention-r4',RESEARCH_CONTROLS_ENABLED:String(enabled),RESEARCH_CONTROLS_DEMO:String(enabled)};
  const server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:'ignore'});let browser;
  try{
   let ok=false;for(let n=0;n<100;n++){try{ok=(await fetch(base+'/api/health')).ok;}catch{}if(ok)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ok);
   browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().includes('/api/auth/') && r.status()>=400){const p=await r.json().catch(()=>({}));console.log(JSON.stringify({status:r.status(),message:p.message}));}});
   await page.goto(base+'/?research=1');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-auth-mode="register"]').click();await page.locator('#nickname').fill('六维核验'+Date.now());await page.locator('#register-password').fill('control-browser-synthetic');await page.locator('#register-password-confirm').fill('control-browser-synthetic');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
   await page.locator('[data-view="learn"]').first().click();await page.getByRole('button',{name:'六维观察台',exact:true}).click();await page.locator('[data-research-controls] summary').click();
   assert.equal(await page.locator('[data-controls-form] fieldset').count(),6);
   if(enabled){
    for(const [name,value] of [['helpNeed','0.8'],['interruptibility','0.9'],['ttlSeconds','600'],['cooldownSeconds','120']])await page.locator(`[name="${name}"]`).fill(value);
    await page.locator('[name="boundaryOnly"]').check();await page.locator('[name="maxSupportLevel"]').selectOption('L2');await page.locator('[name="placement"]').selectOption('sidebar');await page.locator('[name="proactivity"]').selectOption('reactive');
    await page.locator('[name="minimumEvidenceFamilies"]').fill('2');
    await page.locator('[name="timingMode"]').selectOption('delayed');await page.locator('[name="delaySeconds"]').fill('30');
    await page.locator('[name="initialSupportLevel"]').selectOption('L2');await page.locator('[name="presentationFormat"]').selectOption('bubble');
    await page.locator('[name="authorityLevel"]').selectOption('A4');await page.locator('[name="maxEscalations"]').fill('1');await page.locator('[name="reviewAfterHours"]').fill('48');
    await page.getByRole('button',{name:'保存并应用于后续决策'}).click();await page.locator('[data-controls-status]').filter({hasText:'已保存'}).waitFor();
    const saved=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());assert.equal(saved.researchControls.revision,1);assert.equal(saved.view.placement,'sidebar');assert.equal(saved.locked,true,'前测仍保护');
    assert.equal(saved.view.format,'bubble');assert.equal(saved.researchControls.profile.maxEscalations,1);
    assert.equal(saved.researchControls.profile.authorityLevel,'A4');
    const stale=await page.evaluate(async()=>{try{await KnowledgeAssistant.researchControlRequest(KnowledgeAssistant.designSpaceSnapshot().researchControls.profile,0);return '';}catch(e){return e.message;}});assert.match(stale,/另一页面/);
    await page.screenshot({path:path.join(output,'六维控制台.png')});
    await page.reload();await page.locator('[data-view="learn"]').first().click();await page.getByRole('button',{name:'六维观察台',exact:true}).click();await page.locator('[data-research-controls] summary').click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().researchControls?.revision===1);assert.equal(await page.locator('[name="cooldownSeconds"]').inputValue(),'120');
    await page.setViewportSize({width:390,height:844});await page.locator('[name="cooldownSeconds"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'六维控制台窄屏.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({name:'六维真实保存、页面重载、版本冲突、独立测验保护和窄屏操作',passed:true});
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'收起观察台'}).click();
    const pre=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').flow.preQuiz;
    for(const q of pre.questions){const card=page.locator(`.question-card[data-question="${q.id}"]`);if(q.type==='short_answer')await card.locator('textarea').fill('先区分输入输出，再检查函数值与左右趋势。');else await card.locator('input').first().check();}
    await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));
    await page.getByRole('button',{name:'全部学习',exact:true}).click();await page.getByRole('button',{name:'按勾选知识点开始学习'}).click();
    await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().unitType==='knowledge');
    assert.equal(await page.locator('.support-display-settings:visible').count(),0,'展示模式不在课件上方重复显示 D4 与记忆设置');
    assert.ok((await page.locator('.workspace-canvas-toolbar').boundingBox()).height<160,'设置不能占用课件顶部的大块空间');
    await page.getByRole('button',{name:'六维观察台',exact:true}).click();
    if(!await page.locator('[data-controls-form]').isVisible())await page.locator('[data-research-controls] summary').click();
    await page.locator('[data-runtime-controls="authority"] [data-agent-action="grant"]').waitFor();
    assert.equal(await page.locator('[data-runtime-controls="authority"]').evaluate(e=>e.closest('fieldset').querySelector('legend').textContent.startsWith('D5')),true);
    assert.equal(await page.locator('[data-runtime-controls="memory"]').evaluate(e=>e.closest('fieldset').querySelector('legend').textContent.startsWith('D6')),true);
    await page.locator('[name="delaySeconds"]').fill('45');
    for(const kind of ['authority','memory']){
     const controls=page.locator(`[data-runtime-controls="${kind}"]`);
     await controls.locator('[data-agent-action="grant"]').click();
     await controls.locator('[data-agent-action="revoke"]').waitFor();
    }
    assert.equal(await page.locator('[name="delaySeconds"]').inputValue(),'45','授权更新不重置尚未保存的策略参数');
    await page.evaluate(()=>syncLearningSnapshot('permission_refresh_check'));
    await page.reload();await page.waitForFunction(()=>learningSnapshotReady===true);await page.locator('[data-view="learn"]').first().click();await page.getByRole('button',{name:'六维观察台',exact:true}).click();await page.locator('[data-research-controls] summary').click();
    for(const kind of ['authority','memory']){
     const controls=page.locator(`[data-runtime-controls="${kind}"]`);
     await controls.locator('[data-agent-action="revoke"]').waitFor();
     await controls.locator('[data-agent-action="revoke"]').click();
     await controls.locator('[data-agent-action="grant"]').waitFor();
    }
    await page.locator('[data-runtime-controls="memory"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'六维授权与记忆归位.png')});
    await page.locator('[name="placement"]').selectOption('inline');await page.getByRole('button',{name:'保存并应用于后续决策'}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().researchControls.revision===2);
    await page.getByRole('button',{name:'收起观察台'}).click();
    assert.equal(await page.locator('.support-display-settings:visible').count(),0,'切换任务内呈现后不重新出现重复设置');
    assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().view.placement),'inline');
    results.push({name:'课件上方无重复设置；D5/D6授权可保存、刷新恢复及撤回，不重置策略草稿',passed:true});
    await page.goto(base+'/');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#auth-gate').waitFor({state:'hidden'});
    await page.locator('[data-view="learn"]').first().click();
    await page.locator('#learn-view.active').waitFor();
    fs.writeFileSync(path.join(output,'普通入口诊断.txt'),await page.locator('body').innerText(),'utf8');
    await page.getByRole('button',{name:'六维观察台',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'六维观察台',exact:true}).count(),1);
    await page.locator('#auth-menu-toggle').click();
    await page.locator('.profile-password-settings summary').click();
    const nextPassword=require('node:crypto').randomUUID();
    await page.locator('#password-change-form [name="currentPassword"]').fill('control-browser-synthetic');
    await page.locator('#password-change-form [name="newPassword"]').fill(nextPassword);
    await page.locator('#password-change-form [name="confirmPassword"]').fill(nextPassword);
    await page.getByRole('button',{name:'更新密码',exact:true}).click();
    await page.locator('[data-password-feedback]').filter({hasText:'密码已更新'}).waitFor();
    assert.equal(await page.locator('#password-change-form [name="newPassword"]').inputValue(),'');
    assert.equal(await page.locator('.user-menu-panel').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),true);
    results.push({name:'展示模式普通入口可见观察台；页面改密成功并清空密码，菜单不超出屏幕',passed:true});
   }else{
    assert.equal(await page.getByRole('button',{name:'保存并应用于后续决策'}).isDisabled(),true);
    const rejected=await page.evaluate(async()=>{try{await KnowledgeAssistant.researchControlRequest(KnowledgeAssistant.designSpaceSnapshot().researchControls.profile,0);return '';}catch(e){return e.message;}});assert.match(rejected,/只读/);
    results.push({name:'普通服务网址参数不能解锁写入',passed:true});
   }
   assert.deepEqual(errors,[]);
  }catch(error){if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){console.log((await p.locator('#auth-gate').innerText()).slice(0,1600));await p.screenshot({path:path.join(output,'失败诊断.png')});}}throw error;}finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>server.once('exit',resolve));}
 }
 fs.writeFileSync(path.join(output,'六维控制浏览器验收.json'),JSON.stringify({generatedAt:new Date().toISOString(),synthetic:true,passed:true,results},null,2));console.log('六维控制浏览器与接口验收通过');
}
main().catch(e=>{fs.writeFileSync(path.join(output,'六维控制浏览器验收.json'),JSON.stringify({generatedAt:new Date().toISOString(),synthetic:true,passed:false,results,error:e.message},null,2));console.error(e);process.exitCode=1;});
