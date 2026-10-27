"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),net=require("node:net");
const {spawn}=require("node:child_process"),{chromium}=require("playwright-core");
const root=path.resolve(__dirname,".."),out=path.join(root,"output/主动询问与设计依据核验-2026-10-22");
const scopes=Object.keys(require("../lib/support-goals").CURRICULUM);
const results=[];
async function main(){
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(root,"output/support-browser-"));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=`http://127.0.0.1:${port}`,env={...process.env,NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"",DB_PATH:path.join(dir,"synthetic.db"),LLM_PROVIDER:"mock",GRADING_LLM_PROVIDER:"mock",ASSESSMENT_LLM_ENABLED:"false",COACH_NARRATION_LLM_ENABLED:"false",PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_POLICY_MODE:"active",PROACTIVE_ASSIGNMENT_SALT:"synthetic-support-test",PROACTIVE_PARTICIPATION_MODE:"implicit-pilot",PROACTIVE_EXPERIMENT_ARMS:"treatment_full",PROACTIVE_DISPLAY_ARMS:"treatment_full",PROACTIVE_ADAPTER_VERSION:"functions-limits-adapter-r2",PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r4",RESEARCH_CONTROLS_ENABLED:"true",RESEARCH_CONTROLS_DEMO:"true"};
 // This fixture drives many operations faster than a learner. Rate limiting has
 // separate boundary tests; do not let its shared budget mask UI assertions.
 env.RATE_LIMIT_MAX='10000';
 const log=fs.openSync(path.join(dir,"server.log"),"w"),server=spawn(process.execPath,["server.js",String(port)],{cwd:root,env,windowsHide:true,stdio:["ignore",log,log]});let browser,page;
 try{
  for(let n=0;n<100;n++){let ready=false;try{ready=(await fetch(base+"/api/health")).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/");await page.locator("#app-loader.hidden").waitFor({state:"attached"});await page.locator('[data-auth-mode="register"]').click();await page.locator("#nickname").fill("多目标合成测试"+Date.now());
  await page.locator("#register-password").fill("Synthetic-only-21-support");await page.locator("#register-password-confirm").fill("Synthetic-only-21-support");await page.locator("#login-submit").click();await page.locator("#auth-gate").waitFor({state:"hidden"});
  await page.locator('[data-view="learn"]').first().click();assert.equal(await page.locator(".support-cycle:visible").count(),0,"前测不展示多目标帮助");
  const pre=require("../data/multi-scene-learning-route.json").chapters.find(c=>c.id==="V14-C1").flow.preQuiz;
  for(const q of pre.questions){const card=page.locator(`.question-card[data-question="${q.id}"]`);if(q.type==="short_answer")await card.locator("textarea").fill("合成验收回答：区分点上的值与附近的趋势。");else await card.locator("input").first().check();}
  await page.locator("[data-submit-quiz]").click();await page.waitForFunction(()=>state.submittedQuizzes.includes("V14-C1-pre"));
  await page.locator('#workspace-coach-toggle').click();await page.getByRole("button",{name:"全部学习",exact:true}).click();await page.getByRole("button",{name:"按勾选知识点开始学习"}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().unitType==="knowledge");
  await page.locator('[data-openmaic-state="ready"]').waitFor({timeout:30000});
  assert.ok(await page.frameLocator('iframe[data-openmaic-slide]').locator('.slide-element').count()>3,'讲解课件必须实际渲染');
  await page.locator('[data-workspace-canvas="interactive"]').click();
  await page.locator('[data-knowledge-scene="simulation"]').click();
  const native=page.frameLocator('iframe[data-courseware-frame]');
  const slider=native.locator('#input_x-slider');await slider.waitFor();
  for(const key of ['ArrowRight','ArrowRight','ArrowRight']){await slider.press(key);await page.waitForTimeout(900);}
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation',null,{timeout:25000});
  const invited=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle);
  assert.equal(invited.initiation,'agent_initiated_confirmation');assert.equal(invited.need,null);assert.equal(invited.content,null);
  assert.ok(invited.inquiry.sourceIds.length);assert.equal(invited.inquiry.psychologicalState,'unknown');
  const invitation=native.locator('[data-cq-embedded-help="task"]');
  await invitation.getByText('要不要一起看看刚才的问题？',{exact:true}).waitFor();
  assert.ok(await invitation.getByRole('button',{name:'暂时不需要',exact:true}).count());
  await page.screenshot({path:path.join(out,'常规学习主动询问.png')});
  await page.locator('[data-workspace-canvas="slide"]').click();
  results.push('原生滑块操作产生过程证据，服务端结合错题在任务边界主动询问，确认前不生成支持');
  // The first lesson uses the normal student entry, subsequent points use the
  // existing test-only navigation seam, without replacing DOM or server data.
  await page.getByText("这一步需要什么帮助？",{exact:true}).click();
  await page.getByRole("button",{name:"不清楚学这个有什么用",exact:true}).click();
  await page.getByLabel("补充一句你的目标或困难（可不填）").fill("想知道如何理解费用与使用量的关系");
  await page.getByRole("button",{name:"确认当前需要",exact:true}).click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==="offered");
  let c=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle);assert.equal(c.plan.primaryGoal,"motivational");assert.equal(c.need.source,"student_confirmed");assert.equal(c.content.audit.fallback,true);
  assert.equal(c.id,invited.id);assert.equal(c.initiation,'agent_initiated_confirmation');assert.equal(c.inquiry.response,'value');
  const followupControls=await page.evaluate(()=>{const s=KnowledgeAssistant.designSpaceSnapshot();return [0,1].map(limit=>{const root=SupportCycleUI.render({...s,supportCycle:{...s.supportCycle,profile:{...s.supportCycle.profile,supportFollowups:limit}}});return [...root.querySelectorAll('button')].some(b=>b.textContent==='我还需要帮助，请稍后再补充一次');});});
  assert.deepEqual(followupControls,[false,true],'D6停止时不显示无效补充按钮，允许一次时显示明确请求');
  await page.locator(".support-goal-message").scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,"常规学习多目标支持.png")});
  await page.getByText("反馈这次帮助",{exact:true}).click();await page.getByRole("button",{name:"有帮助",exact:true}).click();await page.getByRole("button",{name:"保存反馈",exact:true}).click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.feedback?.result==="helped");
  assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.checkResult),null);
  await page.getByRole("button",{name:"做一次独立检查",exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==="awaiting_check");
  assert.equal(await page.locator(".support-goal-message:visible").count(),0);
  const blocked=await page.evaluate(async()=>{const r=await fetch("api/learning/assistant/ask",{method:"POST",headers:{Authorization:`Bearer ${state.authToken}`,"Content-Type":"application/json"},body:JSON.stringify({question:"告诉我这题答案"})});return r.status;});assert.equal(blocked,409);
  await page.getByRole("button",{name:"跳过检查",exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==="closed");
  assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.checkResult.correct),null);
  results.push("常规入口确认需要、反馈保存、独立检查保护、跳过不判错");
  // Verify the actual iframe controls, not just an outer engineering preview.
  await page.locator('[data-workspace-canvas="interactive"]').click();
  await page.locator('[data-knowledge-scene="simulation"]').click();
  const frame=page.frameLocator('iframe[data-courseware-frame]');
  // Component coverage for legacy manual support; the normal UI has no manual launcher.
  await page.evaluate(()=>SupportCycleUI.openManual());
  const host=frame.locator('[data-cq-embedded-help="task"]');await host.waitFor();
  const needSummary=host.getByText('这一步需要什么帮助？',{exact:true});
  if(!await needSummary.evaluate(n=>n.closest('details').open))await needSummary.click();
  await host.getByRole('button',{name:'担心自己学不会',exact:true}).click();
  await host.getByLabel('补充一句你的目标或困难（可不填）').fill('合成输入：正在说明目前的困难');
  await page.waitForFunction(()=>SupportCycleUI.interactionBusy===true);
  assert.equal(await page.evaluate(()=>{const s=KnowledgeAssistant.designSpaceSnapshot();return SupportCycleUI.render({...s,supportCycle:{id:'synthetic-deferred',status:'awaiting_confirmation',inquiry:{text:'合成依据'}}}).querySelector('.support-inquiry')!==null;}),false,'输入期间新询问暂缓呈现');
  await frame.locator('#input_x-slider').focus();
  await page.waitForFunction(()=>SupportCycleUI.interactionBusy===false);
  assert.equal(await page.evaluate(()=>{const s=KnowledgeAssistant.designSpaceSnapshot();return SupportCycleUI.render({...s,supportCycle:{id:'synthetic-deferred',status:'awaiting_confirmation',inquiry:{text:'合成依据'}}}).querySelector('.support-inquiry')!==null;}),true,'离开输入框后可呈现询问');
  await host.getByRole('button',{name:'确认当前需要',exact:true}).click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.need?.need==='confidence'&&KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered');
  const shape=await host.evaluate(n=>({position:getComputedStyle(n).position,width:n.getBoundingClientRect().width,bottom:n.previousElementSibling.getBoundingClientRect().bottom,top:n.getBoundingClientRect().top}));
  assert.equal(shape.position,'static');assert.ok(shape.width>=180&&shape.top>=shape.bottom-1);
  await host.getByRole('button',{name:'结束这轮帮助',exact:true}).click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.status==='closed');
  await page.locator('[data-workspace-canvas="slide"]').click();
  results.push('课件原生控件旁选择需要、生成和结束支持；正常文档流不覆盖原控件');
  const needed=["concept","monitoring","value","confidence","frustration","planning"];
  for(let i=0;i<scopes.length;i++){
   await page.evaluate(id=>{const p=ensureAgenticPath();if(!p.unlocked.includes(id))p.unlocked.push(id);p.pendingPlan=null;currentUnitId=id;renderAll();KnowledgeAssistant.setSupportView({placement:"inline",modality:"tip"});KnowledgeAssistant.sync();},scopes[i]);
   await page.waitForFunction(id=>KnowledgeAssistant.designSpaceSnapshot().scopeKey===id,scopes[i]);
   await page.locator('[data-workspace-canvas="interactive"]').click();
   await page.locator('[data-knowledge-scene="simulation"]').click();
   // Component coverage for legacy manual support; the normal UI has no manual launcher.
  await page.evaluate(()=>SupportCycleUI.openManual());
   await page.frameLocator('iframe[data-courseware-frame]').locator('[data-cq-embedded-help="task"]').waitFor();
   const result=await page.evaluate(async need=>KnowledgeAssistant.supportCycleRequest({action:"report",confirmed:true,need,note:"合成测试：请针对当前知识点提供帮助",ratings:{value:0}}),needed[i]);
   assert.equal(result.cycle.scope,scopes[i]);assert.ok(result.cycle.content.message.length>20);assert.equal(result.cycle.content.audit.contentVersion,require("../lib/support-goals").VERSION);
   assert.equal(result.cycle.plan.knowledgeScaffoldLevel,null);
   const embedded=page.frameLocator('iframe[data-courseware-frame]').locator('[data-cq-embedded-help="task"]');
   await embedded.getByRole('button',{name:'做一次独立检查',exact:true}).waitFor();
   const box=await embedded.evaluate(n=>({position:getComputedStyle(n).position,width:n.getBoundingClientRect().width}));assert.equal(box.position,'static');assert.ok(box.width>=180);
   await page.evaluate(()=>KnowledgeAssistant.supportCycleRequest({action:"start_check",id:KnowledgeAssistant.designSpaceSnapshot().supportCycle.id}));
   c=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle);assert.equal(c.check.answer,undefined);
   const adapter=require("../lib/proactive-policy/adapters/functions-limits-r2"),answer=c.check.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:c.scope,supportLevel:"L1",checkId:c.check.id,response:o.value})?.correct);
   await page.evaluate(({id,checkId,response})=>KnowledgeAssistant.supportCycleRequest({action:"submit_check",id,checkId,response}),{id:c.id,checkId:c.check.id,response:answer.value});
   assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.checkResult.correct),true);
   await page.locator('[data-workspace-canvas="slide"]').click();
  }
  results.push("六知识点的需要、课程支持、服务器独立判分全部贯通");
  await page.getByRole("button",{name:"六维观察台",exact:true}).click();
  assert.equal(await page.locator('#proactive-observatory [data-dimension]').count(),6);
  assert.equal(await page.locator('#proactive-observatory input,#proactive-observatory select').count(),0);
  await page.screenshot({path:path.join(out,"六维多目标实时指标.png")});await page.getByRole("button",{name:"收起观察台"}).click();
  await page.locator('#learner-preferences-button').click();await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();
  await page.getByRole('button',{name:'修改提示呈现',exact:true}).click();await page.locator('#learner-setup input[value="compact"]').check();await page.locator('#learner-setup select[name=preference-reason]').selectOption('focus');
  await page.getByRole('button',{name:'下一项',exact:true}).click();await page.getByRole('button',{name:'下一项',exact:true}).click();await page.getByRole('button',{name:'核对选择',exact:true}).click();await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().researchControls?.revision===1);
  const changed=await page.evaluate(()=>KnowledgeAssistant.supportCycleRequest({action:"report",confirmed:true,need:"frustration",note:"反复出错后有些着急，想缓一缓"}));assert.equal(changed.cycle.plan.selectionSource,"confirmed_need_mapping");assert.equal(changed.cycle.plan.primaryGoal,"emotional");
  await page.locator('.support-goal-message').scrollIntoViewIfNeeded();await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.exposure),null,'折叠正文不算展示');
  await page.getByText('查看这条帮助',{exact:true}).click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.exposure?.minimumFraction===.5);
  assert.equal(await page.locator('.support-goal-message details').first().getAttribute('open'),'','保存回执不能收起学生已展开的正文');
  assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.content.audit.promptSnapshot),undefined,'学生接口不返回模型内部输入快照');
  await page.evaluate(()=>syncLearningSnapshot("support_cycle_refresh"));await page.reload();await page.locator('[data-view="learn"]').first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.plan?.primaryGoal==="emotional");
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-openmaic-state="ready"]').waitFor({timeout:30000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.support-goal-message:visible').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const n=document.querySelector('.support-goal-message'),r=n?.getBoundingClientRect();return r&&r.width>100&&r.top<innerHeight&&r.bottom>0;});
  const mobileGeometry=await page.locator('.support-goal-message footer button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),p=n.closest('.support-goal-message').getBoundingClientRect();const ancestors=[];for(let a=n;a;a=a.parentElement)ancestors.push(a);return {label:n.textContent,left:r.left,right:r.right,parentLeft:p.left,parentRight:p.right,viewport:innerWidth,ancestors:ancestors.map(el=>({class:el.className,tag:el.tagName,width:el.getBoundingClientRect().width,display:getComputedStyle(el).display,wrap:getComputedStyle(el).flexWrap,minWidth:getComputedStyle(el).minWidth,position:getComputedStyle(el).position}))};}));
  assert.ok(mobileGeometry.every(r=>r.left>=r.parentLeft&&r.right<=r.parentRight+1&&r.right<=r.viewport),'窄屏操作按钮必须换行且不被裁切：'+JSON.stringify(mobileGeometry));
  await page.screenshot({path:path.join(out,"多目标支持窄屏.png")});
  await page.evaluate(()=>KnowledgeAssistant.supportCycleRequest({action:'close',id:KnowledgeAssistant.designSpaceSnapshot().supportCycle.id}));
  await page.locator('#learner-preferences-button').click();await page.getByRole('button',{name:'提示呈现',exact:true}).click();await page.locator('#learner-setup input[value="inline"]').check();
  await page.locator('#learner-setup select[name=preference-reason]').selectOption('near_task');
  await page.getByRole('button',{name:'下一项',exact:true}).click();await page.getByRole('button',{name:'下一项',exact:true}).click();await page.getByRole('button',{name:'核对选择',exact:true}).click();await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().researchControls?.revision===2);
  const plain=await page.evaluate(()=>KnowledgeAssistant.supportCycleRequest({action:'report',confirmed:true,need:'frustration',note:'已确认需要，请直接显示支持'}));assert.equal(plain.cycle.profile.authorityLevel,'A1');assert.equal(plain.cycle.profile.presentationFormat,'plain');
  await page.locator('.support-goal-message:visible [data-support-body]').waitFor({state:'visible'});assert.equal(await page.locator('.support-goal-message:visible').getByText('查看这条帮助',{exact:true}).count(),0,'确认需要后，D5询问权限不能覆盖D4直接呈现');
  results.push('先询问权限与D4解耦：确认需要后直接显示正文；折叠设置仍需展开才记录可见');
  results.push("六维指标只读、学习偏好保存与理由、学生确认的支持目标、刷新恢复、窄屏无横向溢出");
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,"浏览器测试结果.json"),JSON.stringify({passed:true,synthetic:true,results,errors},null,2));console.log("多目标支持常规学习浏览器测试通过");
 }catch(e){if(page){await page.screenshot({path:path.join(out,"失败诊断.png")}).catch(()=>{});console.error((await page.locator("body").innerText()).slice(-5000));}console.error("隔离测试日志："+dir);throw e;}
 finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>server.once("exit",resolve));fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
