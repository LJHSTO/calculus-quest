'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),course=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
async function main(){
 const remote=process.env.STUDENT_UX_BASE_URL||'';
 if(remote&&process.env.STUDENT_UX_ALLOW_TEST_ACCOUNT!=='1')throw Error('公网验收需要明确允许创建合成体验账号');
 const output=path.join(root,'output/学生体验修复验收');fs.mkdirSync(output,{recursive:true});const dir=fs.mkdtempSync(path.join(output,remote?'公网三组-':'三组浏览器-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const base=remote.replace(/\/$/,'')||`http://127.0.0.1:${port}`;
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r2',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-retention-r4',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'5000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=remote?{exitCode:0}:spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});
 let browser,page,arm='',registered=false;const errors=[],checks=[],timings=[],networkErrors=[];
 const account='合成体验修复'+Date.now();
 const pass=text=>{checks.push(text);console.log('通过：'+text);};
 const shot=name=>page.screenshot({path:path.join(dir,arm+'组-'+name+'.png')});
 async function answer(unit,questions){
  await page.waitForFunction(id=>currentUnitId===id,unit);
  for(const q of questions)await page.locator(`[data-question="${q.id}"] ${q.type==='short_answer'?'[data-short-unknown]':'input[value="__unknown__"]'}`).check();
  const t=Date.now();await page.locator(`[data-submit-quiz="${unit}"]`).click();await page.waitForFunction(id=>state.submittedQuizzes.includes(id),unit);timings.push({arm,event:'提交独立检测',unit,ms:Date.now()-t});
 }
 async function next(label){await page.getByRole('button',{name:label,exact:true}).last().click();}
 async function closeProbe(){await page.locator('#three-arm-dialog[open]').waitFor({timeout:15000});await page.locator('#three-arm-dialog').getByRole('button',{name:'跳过，继续学习',exact:true}).click();}
 async function saveSettings(sidebar){
  await page.locator('#learner-setup[open]').waitFor();
  if(sidebar){await page.locator('#learner-setup [data-dimension=D4] button').click();await page.locator('input[name=D4-placement][value=sidebar]').check();await page.locator('select[name=preference-reason]').selectOption({index:1});await page.locator('#learner-setup .learner-steps button').last().click();await page.getByRole('button',{name:'核对选择',exact:true}).click();}
  await page.locator('#learner-setup').getByRole('button',{name:/保存.*学习/}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});
 }
 try{
  let ready=false;for(let i=0;i<120;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
  for(arm of (process.env.TEST_ARM?[process.env.TEST_ARM]:['A','B','C'])){
   const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(remote?60000:20000);page.on('pageerror',e=>errors.push({arm,message:e.message}));
   page.on('requestfailed',r=>networkErrors.push({arm,path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
   await page.addInitScript(()=>{window.uxLongTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.uxLongTasks.push({at:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});});
   await page.goto(base+'/?study='+arm);
   if(!registered){await page.locator('[data-auth-mode=register]').click();await page.locator('#nickname').fill(account);await page.locator('#register-password').fill('synthetic-browser-password');await page.locator('#register-password-confirm').fill('synthetic-browser-password');}
   else{await page.locator('#login-identifier').fill(account);await page.locator('#login-password').fill('synthetic-browser-password');}
   const authentication=page.waitForResponse(r=>/\/api\/auth\/(register|login)$/.test(new URL(r.url()).pathname));await page.locator('#login-submit').click();const auth=await authentication;assert.equal(auth.status(),200,'认证接口应成功');await page.locator('#auth-gate').waitFor({state:'hidden'});registered=true;
   await page.locator('[data-view=learn]').first().click();await page.locator('#three-arm-dialog[open]').waitFor();
   for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="3"]').check();
   await page.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();
   await answer('V14-C1-pre',course.flow.preQuiz.questions);await page.locator('[data-quiz-path-action=pilot-next]').last().click();
   if(arm!=='A')await saveSettings(arm==='B');
   await page.waitForFunction(()=>currentUnitId==='GH-01-K01');assert.equal(await page.locator('#learner-setup[open]').count(),0);
   await page.locator('[data-openmaic-state=ready]').first().waitFor();
   assert.ok(await page.locator('.player-top').evaluate(n=>n.getBoundingClientRect().height)<80,'桌面顶部一行');
   if(arm==='A'){assert.equal(await page.locator('#learner-preferences-button').isVisible(),false);await page.locator('#auth-menu-toggle').click();await page.locator('#account-learning-preferences').click();await page.locator('#learner-setup[open]').waitFor();assert.equal(await page.locator('#learner-setup input').count(),0);await page.locator('#learner-setup').getByRole('button',{name:'返回学习',exact:true}).click();}
   else{await page.locator('#learner-preferences-button').click();await page.locator('#learner-setup[open]').waitFor();assert.equal(await page.locator('#learner-setup input').count(),0,'学习中只能查看');await page.locator('#learner-setup').getByRole('button',{name:'返回学习',exact:true}).click();}
   pass(arm+'组前测接续、A直接进课、B/C初始配置及学习中只读');
   await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=game]').click();
   const frame=page.frameLocator('iframe[data-courseware-frame]');await frame.getByRole('button',{name:'发车检查',exact:true}).waitFor();
   assert.match(await frame.locator('.learning-note').innerText(),/进入三题检测/);
   await page.locator('[data-classroom-action=fullscreen]').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));
   assert.equal(await page.locator('.player-top').isVisible(),false,'全屏隐藏头部');
   await shot('全屏课件就绪');
   await frame.locator('body').evaluate(n=>n.dataset.uxIdentity='same-iframe');
   const t=Date.now();for(let i=0;i<2;i++){await frame.getByRole('button',{name:'发车检查',exact:true}).click();await page.waitForTimeout(350);}
   await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation');timings.push({arm,event:'两次游戏错误后出现询问',ms:Date.now()-t});
   const support=page.locator(arm==='B'?'.learning-support-surface':'.task-support-panel');await support.getByRole('button',{name:'请老师讲一下',exact:true}).waitFor();
   if(await page.locator('#workspace-support-notice').isVisible())await page.locator('#workspace-support-notice').click();
   assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true,'点击帮助不退出全屏');assert.equal(await page.locator('.fullscreen-support-notice').count(),0,'全屏不重复入口');
   if(arm!=='B'){
    await support.getByRole('button',{name:'课件小窗',exact:true}).click();
    const scaled=await page.locator('iframe[data-courseware-frame]').evaluate(n=>({width:n.getBoundingClientRect().width,layout:n.clientWidth,transform:getComputedStyle(n).transform}));
    assert.equal(scaled.layout,1280);assert.ok(scaled.width<=330&&scaled.width>=200);assert.notEqual(scaled.transform,'none');
    assert.equal(await frame.locator('body').getAttribute('data-ux-identity'),'same-iframe');await shot('全屏课件小窗');
    await support.getByRole('button',{name:'放大课件',exact:true}).click();assert.equal(await frame.locator('body').getAttribute('data-ux-identity'),'same-iframe');
   }
   await shot('全屏老师询问');await support.getByRole('button',{name:'请老师讲一下',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered');
   await page.waitForFunction(()=>document.querySelector('#workspace-support-notice').hidden,'老师卡片可见时隐藏重复定位提示');
   if(remote){const audit=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.content.audit);assert.equal(audit.fallback,false,'公网老师必须实际调用模型成功');assert.equal(audit.provider,'openai-compatible');timings.push({arm,event:'官方模型帮助',audit});}
   await page.waitForTimeout(1600);
   if(arm==='B'){
    for(const width of [1366,1440,1920]){
     await page.setViewportSize({width,height:960});
     await page.waitForFunction(w=>innerWidth===w,width);
     await shot('全屏老师讲解-'+width);
     const layout=await page.evaluate(()=>{
      const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,width:r.width,right:r.right};};
      return {viewport:innerWidth,course:box('.core-learning-workspace>.player'),teacher:box('.learning-workspace-tools')};
     });
     assert.ok(layout.teacher.width>=300&&layout.teacher.width<=361,'老师侧栏宽度稳定，不随长回复扩张：'+JSON.stringify(layout));
     assert.ok(layout.course.width>layout.teacher.width*2,'课件保留主要画布');
     assert.ok(layout.course.right<=layout.teacher.x+1&&layout.teacher.right<=layout.viewport+1,'课件与老师不重叠、不超出视口');
     timings.push({arm,event:'全屏长回复布局',...layout});
    }
    await page.setViewportSize({width:1440,height:960});
   }
   await shot('全屏老师讲解');await support.getByRole('button',{name:'结束这轮帮助',exact:true}).click();await closeProbe();
   const retryAt=Date.now();for(let i=0;i<2;i++){await frame.getByRole('button',{name:'发车检查',exact:true}).click();await page.waitForTimeout(350);}
   await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation');timings.push({arm,event:'结束帮助后新的连续错误再次询问',ms:Date.now()-retryAt});
   await support.getByRole('button',{name:'我先自己试',exact:true}).click();
   assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true);await page.locator('[data-classroom-action=fullscreen]').click();
   await page.setViewportSize({width:390,height:844});await shot('窄屏课程');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'窄屏无横向溢出');await page.locator('[data-workspace-canvas=slide]').click();await page.locator('[data-workspace-canvas=interactive]').click();await page.setViewportSize({width:1440,height:960});
   pass(arm+'组真实错误及时询问、一键帮助、全屏保留、课件状态保留及窄屏适配');
   if(process.env.STUDENT_UX_HELP_ONLY==='1'){await context.close();continue;}
   await page.reload();await page.waitForFunction(()=>ThreeArmStudyUI.run?.arm===new URLSearchParams(location.search).get('study'));await page.waitForTimeout(5500);assert.equal(await page.locator('#three-arm-dialog[open]').count(),0,'刷新不重复体验询问');
   for(const module of require('../app/shared/study-stages').stages.map(s=>({...s,knowledgePoints:s.points.map(id=>course.modules.flatMap(m=>m.knowledgePoints).find(p=>p.id===id))}))){
    for(const point of module.knowledgePoints){
     await page.waitForFunction(id=>currentUnitId===id,point.id);
     await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=game]').click();
     if(point.id!=='GH-01-K01'){
      const game=page.frameLocator('iframe[data-courseware-frame]');const labels={'GH-01-K02':'坐标 (3, 3)','GH-01-K03':'让探险车通行','GH-02-K01':'检查着陆','GH-02-K02':'让两侧飞船入港','GH-02-K03':'试着过桥'};
      for(let i=0;i<2;i++){await game.getByRole('button',{name:labels[point.id],exact:true}).click();await page.waitForTimeout(350);}
      await page.waitForFunction(id=>{const c=KnowledgeAssistant.designSpaceSnapshot().supportCycle;return c?.scope===id&&c.status==='awaiting_confirmation';},point.id);
      const help=page.locator(arm==='B'?'.learning-support-surface':'.task-support-panel');
      if(arm==='B'&&!(await help.isVisible()))await page.locator('#workspace-support-notice').click();
      await help.getByRole('button',{name:'我先自己试',exact:true}).click();
     }
     await next('完成学习，进入三题检测');await answer(point.id+'-formative',point.formativeQuiz.questions);
     assert.equal(await page.locator('#workspace-coach-toggle').isVisible(),false,'无旧回看路径门');
     if(point.id!==module.points.at(-1))await next('下一节');
    }
    if(!module.review){await next('进入独立后测');continue;}
    await page.waitForTimeout(5500);assert.equal(await page.locator('#three-arm-dialog[open]').count(),0,'阶段回顾不自行弹出');
    await next('完成本段，查看学习回顾');await page.locator('#three-arm-dialog[open]').waitFor();await page.getByText('这次回顾对你有帮助吗？',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-linked-feedback]').count(),arm==='B'?1:0);await shot(module.id+'阶段回顾');
    for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="4"]').check();
    if(arm!=='A')await page.locator('input[name=review-decision][value=change]').check();
    await page.locator('#three-arm-dialog').getByRole('button',{name:'保存回顾并继续',exact:true}).click();
    if(arm!=='A'){await page.locator('#learner-setup[open]').waitFor();assert.equal(await page.locator('#learner-setup [data-dimension]').count(),6);await saveSettings(false);}
   }
   await answer('V14-C1-post',course.flow.postQuiz.questions);await page.getByRole('button',{name:'下一步：填写学习体验问卷',exact:true}).click();await page.locator('#three-arm-dialog[open]').waitFor();
   assert.equal(await page.locator('#three-arm-dialog [data-study-question]').count(),arm==='A'?13:16);
   for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="4"]').check();
   await page.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();await page.getByText('学习体验已保存。',{exact:true}).waitFor();await shot('完成学习与三天任务');
   assert.equal(await page.getByRole('button',{name:'开始配置判断',exact:true}).isEnabled(),false);
   timings.push({arm,event:'学习期间长任务',items:await page.evaluate(()=>window.uxLongTasks)});pass(arm+'组六个知识点实际下一步导航、两次手动回顾与配置窗口、后测问卷接续');
   await context.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dir,'验收结果.json'),JSON.stringify({passed:true,helpOnly:process.env.STUDENT_UX_HELP_ONLY==='1',checks,errors,networkErrors,timings},null,2));
 }catch(e){console.error('页面错误：'+JSON.stringify(errors));if(page&&!page.isClosed()){await shot('失败现场').catch(()=>{});fs.writeFileSync(path.join(dir,'失败状态.json'),JSON.stringify({errors,networkErrors,...await page.evaluate(()=>({unit:typeof currentUnitId==='undefined'?null:currentUnitId,study:window.ThreeArmStudyUI?.run,snapshot:window.KnowledgeAssistant?.designSpaceSnapshot?.(),body:document.body.innerText.slice(-10000)})).catch(()=>({}))},null,2));}throw e;}
 finally{await browser?.close();if(server.exitCode===null){const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}fs.closeSync(log);console.log('浏览器证据：'+dir);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
