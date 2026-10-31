"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),course=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
async function main(){
 const output=path.join(root,'output/三组实验上线验收');fs.mkdirSync(output,{recursive:true});const dir=fs.mkdtempSync(path.join(output,'学生浏览器-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const base=`http://127.0.0.1:${port}`;
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r2',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-retention-r4',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'5000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});let browser,page,arm='';const errors=[],checks=[];
 const pass=text=>{checks.push(text);console.log('通过：'+text);};
 try{
  let ready=false;for(let i=0;i<120;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
  for(arm of (process.env.TEST_ARM?[process.env.TEST_ARM]:['A','B','C'])){
   const context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push({arm,message:e.message}));
   await page.goto(base+'/?study='+arm);await page.locator('[data-auth-mode=register]').click();await page.locator('#nickname').fill('合成三组学生'+arm);await page.locator('#register-password').fill('synthetic-browser-password');await page.locator('#register-password-confirm').fill('synthetic-browser-password');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
   await page.locator('[data-view=learn]').first().click();
   await page.locator('#three-arm-dialog[open]').waitFor();
   for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="3"]').check();
   await page.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();
   await page.waitForFunction(()=>currentUnitId==='V14-C1-pre');
   for(const q of course.flow.preQuiz.questions)await page.locator(`[data-question="${q.id}"] ${q.type==='short_answer'?'[data-short-unknown]':'input[value="__unknown__"]'}`).check();
   await page.locator('[data-submit-quiz="V14-C1-pre"]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));
   await page.locator('[data-quiz-path-action=pilot-next]').last().click();await page.locator('#learner-setup[open]').waitFor();
   if(arm==='A'){assert.equal(await page.locator('#learner-setup input[type=radio]').count(),0);await page.getByRole('button',{name:'确认默认设置并开始学习',exact:true}).click();}
   else{await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();await page.locator('#learner-setup').getByRole('button',{name:/保存.*学习/}).click();}
   await page.waitForFunction(()=>currentUnitId==='GH-01-K01');await page.locator('#learner-setup').waitFor({state:'hidden'});await page.locator('[data-openmaic-state=ready]').first().waitFor();
   assert.equal(await page.locator('#pilot-entry-button').isVisible(),false);pass(arm+'组真实注册、独立前测、配置确认和进入课程');
   await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=simulation]').click();
   const frame=page.frameLocator('iframe[data-courseware-frame]'),slider=frame.locator('#input_x-slider');await slider.waitFor();
   for(let i=0;i<4;i++){await slider.press('ArrowRight');await page.waitForTimeout(1000);}
   await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation',null,{timeout:40000});
   const support=page.locator('.task-support-panel');await support.getByText('要不要一起看看刚才的问题？',{exact:true}).waitFor();
   await page.locator('#workspace-support-notice').click();assert.equal(await page.locator('.task-support-workspace.support-focus-help').count(),1);
   const before=await slider.inputValue();await support.getByRole('button',{name:'放大课件',exact:true}).click();assert.equal(await page.locator('.task-support-workspace.support-focus-help').count(),0);assert.equal(await slider.inputValue(),before,'切换帮助/课件不得重载互动状态');
   await support.getByRole('button',{name:'查看帮助与课件小窗',exact:true}).click();assert.equal(await slider.inputValue(),before);await page.screenshot({path:path.join(dir,arm+'组-工作区询问与课件.png')});
   await page.locator('[data-classroom-action=fullscreen]').click();await page.locator('.fullscreen-support-notice').waitFor();await page.locator('.fullscreen-support-notice').click();await page.waitForFunction(()=>!document.fullscreenElement);assert.equal(await support.isVisible(),true);
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(dir,arm+'组-窄屏工作区帮助.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'窄屏工作区不横向溢出');await page.setViewportSize({width:1366,height:900});
   await support.getByText('这一步需要什么帮助？',{exact:true}).click();await support.getByRole('button',{name:'概念或步骤没弄懂',exact:true}).click();await support.getByRole('button',{name:'开始帮助',exact:true}).click();
   await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered');await support.getByText('先试这一步',{exact:true}).waitFor();await page.waitForTimeout(1600);
   await support.getByRole('button',{name:'结束这轮帮助',exact:true}).click();
   await page.locator('#three-arm-dialog[open]').waitFor({timeout:15000});assert.match(await page.locator('#three-arm-dialog').innerText(),/只问这一次/);await page.locator('#three-arm-dialog').getByRole('button',{name:'跳过，继续学习',exact:true}).click();
   pass(arm+'组真实滑块操作触发主动询问、确认后提供帮助、课件状态保留、一次性弹窗');
   await page.locator('[data-knowledge-scene=game]').click();await page.waitForTimeout(1200);assert.equal(await page.locator('.task-support-panel:visible').count(),0,'切换场景不能重播上一个场景的帮助');
   await page.locator('#three-arm-review').click();assert.equal(await page.locator('[data-linked-feedback]').count(),arm==='B'?1:0);await page.screenshot({path:path.join(dir,arm+'组-学习回顾.png')});await page.locator('#three-arm-dialog').getByRole('button',{name:'继续学习',exact:true}).click();
   if(arm==='B'){const linked=await page.evaluate(()=>ThreeArmStudyUI.request('review'));assert.equal(linked.linked.reduce((n,r)=>n+r.visible,0),1,'一轮实际帮助只计一次，候选与询问不重复计数');}
   if(arm!=='A'){
    await page.locator('#learner-preferences-button').click();await page.locator('#learner-setup [data-dimension=D4] button').click();await page.locator('input[name=D4-placement][value=sidebar]').check();await page.locator('select[name=preference-reason]').selectOption({index:1});await page.locator('#learner-setup .learner-steps button').last().click();await page.getByRole('button',{name:'核对选择',exact:true}).click();await page.getByRole('button',{name:'保存修改并返回学习',exact:true}).click();
    // Layout fixture requests help explicitly; proactive initiation was exercised above.
    await page.evaluate(()=>KnowledgeAssistant.supportCycleRequest({action:'report',confirmed:true,need:'concept',note:'合成侧栏布局验收'}));await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered');
    await page.locator('#workspace-support-notice').click();const side=page.locator('.learning-support-surface');await side.getByText('先试这一步',{exact:true}).waitFor();assert.equal(await page.locator('.task-support-panel:visible').count(),0,'侧栏不残留工作区帮助');await page.screenshot({path:path.join(dir,arm+'组-侧栏帮助.png')});
    await page.setViewportSize({width:390,height:844});await page.locator('#workspace-support-notice').click();await side.getByText('先试这一步',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(dir,arm+'组-窄屏侧栏帮助.png')});await page.setViewportSize({width:1366,height:900});
    await side.getByRole('button',{name:'结束这轮帮助',exact:true}).click();pass(arm+'组通过偏好页面修改位置，侧栏与工作区独立适配');
   }
   await page.reload();await page.waitForFunction(()=>ThreeArmStudyUI.run?.arm===new URLSearchParams(location.search).get('study'));await page.waitForTimeout(6000);assert.equal(await page.locator('#three-arm-dialog[open]').count(),0,'刷新后不再次弹出体验反馈');pass(arm+'组场景切换、关联反馈差异及刷新恢复');
   // Navigation is accelerated in this fixture; every quiz response, checkpoint
   // review and final survey is then entered through the actual student UI.
   async function answerInBrowser(unitId,questions){
    await page.evaluate(async id=>{const p=ensureAgenticPath();if(!p.unlocked.includes(id))p.unlocked.push(id);p.pendingPlan=null;state.pendingKnowledgeTransition=null;currentUnitId=id;renderAll();await syncLearningSnapshot('synthetic_measurement_navigation');KnowledgeAssistant.sync();},unitId);
    for(const q of questions)await page.locator(`[data-question="${q.id}"] ${q.type==='short_answer'?'[data-short-unknown]':'input[value="__unknown__"]'}`).check();
    await page.locator(`[data-submit-quiz="${unitId}"]`).click();await page.waitForFunction(id=>state.submittedQuizzes.includes(id),unitId);
   }
   for(const module of course.modules){
    for(const p of module.knowledgePoints)await answerInBrowser(p.id+'-formative',p.formativeQuiz.questions);
    await page.locator('#three-arm-dialog[open]').waitFor({timeout:15000});assert.equal(await page.locator('[data-linked-feedback]').count(),arm==='B'?1:0);
    for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="4"]').check();
    if(arm!=='A'){await page.locator('input[name="review-decision"][value="keep"]').check();await page.getByRole('textbox',{name:'保持或修改配置的依据'}).fill('合成浏览器回答：先保持设置，继续看独立检测。');}
    await page.locator('#three-arm-dialog').getByRole('button',{name:'保存回顾并继续',exact:true}).click();await page.locator('#three-arm-dialog').waitFor({state:'hidden'});
   }
   await answerInBrowser('V14-C1-post',course.flow.postQuiz.questions);
   await page.getByRole('button',{name:'下一步：填写学习体验问卷',exact:true}).click();await page.locator('#three-arm-dialog[open]').waitFor();
   assert.equal(await page.locator('#three-arm-dialog [data-study-question]').count(),arm==='A'?13:16);
   for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="4"]').check();
   await page.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();await page.getByText('学习体验已保存。',{exact:true}).waitFor();await page.screenshot({path:path.join(dir,arm+'组-完成问卷与延迟任务.png')});
   assert.equal(await page.getByRole('button',{name:'开始配置判断',exact:true}).isEnabled(),false);
   pass(arm+'组六次三题检测、两次回顾、后测接续问卷和三天任务入口');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'验收结果.json'),JSON.stringify({passed:true,checks,errors},null,2));
 }catch(e){if(page&&!page.isClosed()){await page.screenshot({path:path.join(dir,arm+'组-失败现场.png')}).catch(()=>{});fs.writeFileSync(path.join(dir,'失败状态.json'),JSON.stringify(await page.evaluate(()=>({unit:typeof currentUnitId==='undefined'?null:currentUnitId,study:window.ThreeArmStudyUI?.run,snapshot:window.KnowledgeAssistant?.designSpaceSnapshot?.(),body:document.body.innerText.slice(-9000)})).catch(()=>({})),null,2));}throw e;
 }finally{await browser?.close();if(server.exitCode===null){const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}fs.closeSync(log);console.log('浏览器证据：'+dir);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
