'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/全功能演练与清爽学习-2026-10-27');
async function main(){
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,'演练浏览器-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),base=`http://127.0.0.1:${port}`;
 const admin='synthetic-rehearsal-admin',env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:admin,MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'10000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});let browser;const checks=[],errors=[];
 async function api(route,body,token=admin){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const raw=await r.text();if(r.headers.get('content-type')?.includes('ndjson'))return {status:r.status,events:raw.trim().split(/\r?\n/).map(line=>JSON.parse(line))};return {status:r.status,...JSON.parse(raw)};}
 try{
  for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const version=await api('/api/admin/pilot/version',{design:'learner-configurable-20-v1',useMode:'rehearsal',sampling:{silentProbability:1},project:'synthetic-rehearsal-browser',title:'合成演练流程',reason:'隔离验收',responsible:'合成',contact:'合成',reviewReference:'合成',retention:'合成',withdrawal:'合成退出'});assert.equal(version.status,200);
  const nickname='合成全功能演练',password='Synthetic-rehearsal-27',u=await api('/api/auth/register',{nickname,password,email:''});assert.equal(u.status,200);
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#login-identifier').fill(nickname);await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('#home-pilot-entry').click();await page.getByLabel('预试加入码',{exact:true}).fill(version.data.joinCode);await page.getByRole('button',{name:'阅读预试说明',exact:true}).click();await page.getByText(/本次演练不分组/).waitFor();await page.locator('#pilot-dialog input[type=checkbox]').check();await page.getByRole('button',{name:'确认并加入',exact:true}).click();await page.getByText('学习前，先了解一下你',{exact:true}).waitFor();
  const C=require('../app/shared/learner-preferences');for(const [k]of C.surveys.baseline)await page.locator(`input[name="baseline-${k}"][value="3"]`).check();await page.getByRole('button',{name:'保存并继续',exact:true}).click();
  const chapter=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
  for(const q of chapter.flow.preQuiz.questions)await page.locator(`[data-question="${q.id}"] ${q.type==='short_answer'?'[data-short-unknown]':'input[value="__unknown__"]'}`).check();
  await page.locator('[data-submit-quiz="V14-C1-pre"]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));assert.equal(await page.locator('#learner-setup[open]').count(),0);
  await page.locator('[data-quiz-path-action=pilot-next]').last().click();await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});await page.waitForFunction(()=>currentUnitId==='GH-01-K01');
  await page.waitForFunction(()=>LearnerSetup.enrollment?.stage==='ready');assert.equal(await page.locator('#pilot-entry-button').isVisible(),false);assert.equal(await page.locator('#home-pilot-entry').isVisible(),false);assert.equal(await page.locator('#pilot-learning-guide').isVisible(),false);assert.equal(await page.locator('#support-need-launcher').count(),0);assert.equal(await page.locator('#common-learning-task').count(),0);
  const d=(await api('/api/learning/learner-preferences',null,u.token)).data;assert.equal(d.pilot.enrollment.arm,'configurable');assert.equal(d.record.profile.supportInquiryEnabled,true);
  assert.equal((await api('/api/learning/support-cycle',{action:'report',scope:'GH-01-K01',unitId:'GH-01-K01',confirmed:true,need:'concept'},u.token)).status,409);
  assert.equal((await api('/api/learning/assistant/ask',{chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'simulation',question:'合成的手动启动问题'},u.token)).status,409);
  await page.waitForFunction(()=>document.querySelector('[data-knowledge-input]')?.disabled,{},{timeout:3000}).catch(async()=>{throw new Error(JSON.stringify(await page.evaluate(()=>({policy:LearnerSetup.enrollment?.experiencePolicy,stage:LearnerSetup.enrollment?.stage,unit:currentUnitId,kind:getUnit().type,placeholder:document.querySelector('[data-knowledge-input]').placeholder,cycle:KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status}))))});
  checks.push('真实输码入口→基线→前测结果→六维确认→学习；隐藏已完成步骤与输码；服务端拒绝手动启动支持');
  await page.locator('[data-openmaic-state=ready]').first().waitFor();await page.screenshot({path:path.join(out,'演练学习页-1366.png'),animations:'disabled'});
  await page.evaluate(()=>renderPlayer());await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=simulation]').click();
  const frame=page.frameLocator('iframe[data-courseware-frame]'),slider=frame.locator('#input_x-slider');await slider.waitFor();
  await page.locator('.pilot-probe-notice button').waitFor();assert.equal(await page.locator('#workspace-support-notice').isVisible(),false);
  await page.locator('[data-classroom-action=fullscreen]').click();await page.waitForFunction(()=>!!document.fullscreenElement);
  await page.locator('.pilot-probe-notice button').click();assert.equal(await frame.locator('[data-pilot-probe]').count(),0);
  await page.locator('#pilot-probe-dialog').getByRole('button',{name:'不确定',exact:true}).click();
  await page.route('**/api/learning/pilot/action',async route=>{if(route.request().postDataJSON()?.action==='answer')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'合成网络中断，请重试'})});else await route.continue();});
  await page.locator('#pilot-probe-dialog').getByRole('button',{name:'保存这次记录',exact:true}).click();await page.getByText('合成网络中断，请重试',{exact:true}).waitFor();await page.unroute('**/api/learning/pilot/action');
  await page.locator('#pilot-probe-dialog').getByRole('button',{name:'跳过，继续学习',exact:true}).click();await page.locator('#pilot-probe-dialog').waitFor({state:'hidden'});assert.equal((await api('/api/learning/pilot',null,u.token)).data.pending,null);await page.evaluate(()=>document.exitFullscreen());
  await page.evaluate(()=>LearnerSetup.openPilot({enrollment:LearnerSetup.enrollment,version:{withdrawal:'合成测试'}}));assert.equal(await page.locator('#learner-setup input[name^="final-"]').count(),0);await page.getByRole('button',{name:'开始学习',exact:true}).click();
  assert.equal((await api('/api/learning/learner-preferences',null,u.token)).data.enabled,true,'演练学习中可修改设置');
  assert.equal((await api('/api/learning/assistant/ask',{chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'simulation',question:'合成的手动启动问题'},u.token)).code,'awaiting_agent_support');
  await page.locator('[data-workspace-canvas=slide]').click();
  await page.frameLocator('iframe[data-openmaic-slide]').locator('.base-element-text .text').first().evaluate(node=>{const r=document.createRange();r.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(r);document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  const selectedReply=page.waitForResponse(r=>r.url().includes('/api/learning/assistant/ask'));
  await page.locator('[data-knowledge-selection-ask]').click();assert.equal((await selectedReply).status(),200,'选中文字可以主动发问');
  await page.waitForFunction(()=>!document.querySelector('[data-knowledge-send]').disabled);await page.locator('[data-knowledge-close]').click();
  await page.locator('[data-workspace-canvas=interactive]').click();checks.push('真实课件选文→问知点→请求成功→显示回复；与 agent 发起支持分别记录');
  await page.evaluate(()=>CalculusQuest6DHUD.open());const beforeLive=await page.locator('[data-observatory-live]').textContent();
  for(const key of ['ArrowRight','ArrowRight','ArrowRight']){await slider.press(key);await page.waitForTimeout(900);}
  assert.notEqual(await page.locator('[data-observatory-live]').textContent(),beforeLive);await page.evaluate(()=>CalculusQuest6DHUD.close());checks.push('研究抽样通过独立窗口回答、不嵌入课件；后测前无结束问卷；演练可改偏好；真实操作更新观察台');
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation',null,{timeout:30000});
  const invited=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle);assert.equal(invited.initiation,'agent_initiated_confirmation');assert.equal(invited.need,null);assert.equal(invited.content,null);assert.ok(invited.inquiry.sourceIds.length);assert.equal(invited.inquiry.psychologicalState,'unknown');
  const host=frame.locator('[data-cq-embedded-help=task]');await host.getByText('要不要一起看看刚才的问题？',{exact:true}).waitFor();await page.screenshot({path:path.join(out,'演练自动询问.png'),animations:'disabled'});
  assert.equal(await host.getByRole('button',{name:'暂时不需要',exact:true}).count(),1);assert.equal(await host.getByRole('button',{name:'稍后再问',exact:true}).count(),1);await host.getByText('这一步需要什么帮助？',{exact:true}).click();await host.getByRole('button',{name:'概念或步骤没弄懂',exact:true}).click();await host.getByRole('button',{name:'确认当前需要',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered');const accepted=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle);assert.equal(accepted.id,invited.id);assert.equal(accepted.initiation,'agent_initiated_confirmation');assert.ok(accepted.content.message);assert.equal(await page.locator('[data-knowledge-input]').isDisabled(),false);const chat=await api('/api/learning/assistant/ask',{chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'simulation',question:'请围绕刚才的提示继续解释输入与输出。'},u.token);assert.equal(chat.status,200,JSON.stringify(chat).slice(0,180));await host.getByRole('button',{name:'结束这轮帮助',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.status==='closed');checks.push('实际操作后自动询问；有依据且确认前无正文；确认同一询问后生成支持，可拒绝或结束');
  // Navigate through authored points using the existing fixture seam; exercise
  // actual scene controls and partial re-rendering, without injecting DOM.
  const layout=[];for(const scope of Object.keys(require('../lib/support-goals').CURRICULUM)){
   await page.evaluate(id=>{const p=ensureAgenticPath();if(!p.unlocked.includes(id))p.unlocked.push(id);p.pendingPlan=null;currentUnitId=id;renderAll();},scope);
   await page.evaluate(()=>renderPlayer());await page.locator('[data-workspace-canvas=interactive]').click();
   for(const type of ['simulation','game','mindMap','visualization3d']){
    const choice=page.locator(`[data-knowledge-scene="${type}"]`);if(!await choice.count())continue;
    assert.equal(await choice.isVisible(),true);await choice.click();await page.locator('iframe[data-courseware-frame]').waitFor();
    const box=await page.locator('iframe[data-courseware-frame]').boundingBox();assert.ok(box.width>=600&&box.height>=280,JSON.stringify({scope,type,box}));layout.push({scope,type,width:Math.round(box.width),height:Math.round(box.height)});
   }
   await page.locator('[data-workspace-canvas=slide]').click();assert.equal(await page.locator('.workspace-canvas-tabs:visible').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  assert.equal(layout.length,24);checks.push('六知识点×四种互动的选择按钮、课件面积、局部重绘和讲解切换');
  for(const width of [390,768,1920]){
   await page.setViewportSize({width,height:width===1920?1080:844});
   for(const scope of Object.keys(require('../lib/support-goals').CURRICULUM)){
    await page.evaluate(id=>{currentUnitId=id;renderAll();},scope);await page.locator('[data-workspace-canvas=interactive]').click();
    for(const type of ['simulation','game','mindMap','visualization3d']){
     await page.locator(`[data-knowledge-scene="${type}"]`).click();const f=page.locator('iframe[data-courseware-frame]');await f.waitFor();
     const box=await f.boundingBox();assert.ok(box.width>=Math.min(280,width-30)&&box.height>=240,JSON.stringify({width,scope,type,box}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
   }
  }checks.push('390、768、1366、1920 像素下六点24种互动布局，无页面横向溢出');
  await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:path.join(out,'演练学习页-1920.png'),animations:'disabled'});
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.waitForFunction(()=>LearnerSetup.enrollment?.stage==='ready');assert.equal(await page.locator('#pilot-entry-button').isVisible(),false);
  await page.locator('#auth-menu-toggle').click();await page.getByRole('button',{name:'本次演练与问卷',exact:true}).click();await page.getByText('退出预试与数据处理',{exact:true}).waitFor();checks.push('刷新保留加入与配置状态；头像菜单可访问问卷和退出');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'演练浏览器验收.json'),JSON.stringify({passed:true,synthetic:true,checks,layout,errors},null,2));console.log(JSON.stringify({passed:true,checks,layouts:layout.length}));
 }finally{await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
