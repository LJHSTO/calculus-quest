"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),net=require("node:net");
const {spawn}=require("node:child_process"),{chromium}=require("playwright-core");
const root=path.resolve(__dirname,".."),out=path.join(root,"output/预试接入与设计空间核查-2026-10-22");
async function main(){
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,"合成测试-"));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=`http://127.0.0.1:${port}`,admin="synthetic-admin-pilot-test";
 const env={...process.env,NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"",DB_PATH:path.join(dir,"synthetic.db"),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:"false",
  LLM_PROVIDER:"mock",GRADING_LLM_PROVIDER:"mock",ASSESSMENT_LLM_ENABLED:"false",COACH_NARRATION_LLM_ENABLED:"false",
  PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_POLICY_MODE:"active",
  PROACTIVE_ASSIGNMENT_SALT:"synthetic-pilot-only",PROACTIVE_PARTICIPATION_MODE:"implicit-pilot",PROACTIVE_EXPERIMENT_ARMS:"treatment_full",
  PROACTIVE_DISPLAY_ARMS:"treatment_full",PROACTIVE_ADAPTER_VERSION:"functions-limits-adapter-r2",PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r4",
  RESEARCH_CONTROLS_ENABLED:"true",RESEARCH_CONTROLS_DEMO:"true"};
 const logs=fs.openSync(path.join(dir,"server.log"),"w"),server=spawn(process.execPath,["server.js",String(port)],{cwd:root,env,windowsHide:true,stdio:["ignore",logs,logs]});let browser,page;
 async function api(route,body,token=admin){const r=await fetch(base+route,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
 try{
  for(let n=0;n<100;n++){try{if((await fetch(base+"/api/health")).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.equal((await api("/api/admin/pilot",null,"invalid")).status,403);
  const p=await api("/api/admin/pilot/version",{project:"pilot-browser",title:"合成预试",reason:"自动化验收",responsible:"合成负责人",contact:"仅测试",reviewReference:"合成记录不是真人",retention:"隔离保存",withdrawal:"测试退出",sampling:{silentProbability:1,intervalSeconds:30,minGapSeconds:30}});assert.equal(p.status,200,JSON.stringify(p));
  browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/");await page.locator("#app-loader.hidden").waitFor({state:"attached"});await page.locator('[data-auth-mode="register"]').click();await page.locator("#nickname").fill("预试合成验收"+Date.now());
  await page.locator("#register-password").fill("Synthetic-only-pilot-2026");await page.locator("#register-password-confirm").fill("Synthetic-only-pilot-2026");await page.locator("#login-submit").click();await page.locator("#auth-gate").waitFor({state:"hidden"});
  await page.locator('#home-pilot-entry').click();await page.getByLabel("预试加入码",{exact:true}).fill(p.data.joinCode);await page.getByRole("button",{name:"阅读预试说明",exact:true}).click();await page.locator("#pilot-dialog input[type=checkbox]").check();await page.getByRole("button",{name:"确认并加入",exact:true}).click();await page.getByText(/参与编号：P-/).waitFor();await page.locator("#pilot-dialog").getByRole("button",{name:"稍后继续",exact:true}).click();await page.locator('[data-view="learn"]').first().click();
  assert.equal(await page.locator(".pilot-probe:visible").count(),0,"前测不能出现预试探针");
  const pre=require("../data/multi-scene-learning-route.json").chapters.find(c=>c.id==="V14-C1").flow.preQuiz;
  for(const q of pre.questions){const card=page.locator(`.question-card[data-question="${q.id}"]`);if(q.type==="short_answer")await card.locator("textarea").fill("合成回答：区分点值与附近趋势。");else await card.locator("input").first().check();}
  await page.locator("[data-submit-quiz]").click();await page.waitForFunction(()=>state.submittedQuizzes.includes("V14-C1-pre"));
  await page.locator('#workspace-coach-toggle').click();await page.getByRole("button",{name:"全部学习",exact:true}).click();await page.getByRole("button",{name:"按勾选知识点开始学习"}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().unitType==="knowledge");
  await page.locator(".pilot-probe-notice button").click({timeout:45000});await page.locator(".pilot-probe").waitFor({timeout:45000});await page.locator(".pilot-probe").scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#pilot-probe-dialog').evaluate(n=>n.matches(':modal')),false,'研究抽样应为用户打开的任务内记录，不应锁住整个学习页面');
  const student=await page.evaluate(()=>state.authToken);
  const during=await api("/api/learning/assistant/ask",{question:"帮我",unitId:"GH-01-K01",chapterId:"V14-C1"},student);assert.equal(during.status,409);
  await page.locator(".pilot-probe").getByRole("button",{name:"不确定",exact:true}).click();await page.getByText("补充困难、打扰程度或拒绝原因（可不填）",{exact:true}).click();await page.getByLabel("刚才主要卡在哪里，或正在做什么？（可不填）").fill("合成反馈：正在独立比较输入和输出");
  await page.screenshot({path:path.join(out,"预试学习记录.png"),fullPage:false});await page.getByRole("button",{name:"保存这次记录",exact:true}).click();await page.waitForFunction(()=>!PilotStudyUI.active(KnowledgeAssistant.designSpaceSnapshot()));
  let exportData=(await api("/api/admin/pilot/export?project=pilot-browser")).data;assert.equal(exportData.answers[0].need,"uncertain");assert.equal(exportData.opportunities.find(o=>o.id===exportData.answers[0].opportunityId).stratum,"silent");
  await page.locator('[data-workspace-canvas="interactive"]').click();await page.locator('[data-knowledge-scene="simulation"]').click();
  const native=page.frameLocator('iframe[data-courseware-frame]');await native.locator('#input_x-slider').waitFor();
  // Wait across the configured measurement gap; typing blocks periodic sampling.
  await page.locator('#auth-menu-toggle').click();await page.locator('#account-pilot-status').click();await page.waitForTimeout(31000);await page.locator('#pilot-dialog').getByRole('button',{name:'稍后继续',exact:true}).click();
  for(const key of ['ArrowRight','ArrowRight','ArrowRight']){await native.locator('#input_x-slider').press(key);await page.waitForTimeout(700);}
  await page.waitForFunction(()=>PilotStudyUI.active(KnowledgeAssistant.designSpaceSnapshot()),null,{timeout:25000});
  exportData=(await api('/api/admin/pilot/export?project=pilot-browser')).data;
  assert.ok(exportData.opportunities.some(o=>o.stratum==='triggered'&&o.sampled),'真实课件事件产生主动候选抽样');
  await page.locator('.pilot-probe-notice button').click();await page.locator('#pilot-probe-dialog').getByRole('button',{name:'这次不答，继续学习',exact:true}).click();await page.waitForFunction(()=>!PilotStudyUI.active(KnowledgeAssistant.designSpaceSnapshot()));
  for(const scope of Object.keys(require('../lib/support-goals').CURRICULUM)){
    const result=await api('/api/learning/pilot/opportunity',{scope,unitId:scope,sceneType:'textbook',foreground:true,active:true,interactionBusy:true},student);
    assert.equal(result.status,200,'六个知识点接受有效上下文');
  }
  const rater=(await api("/api/admin/pilot/rater",{project:"pilot-browser",name:"独立教师甲"})).data;
  const staff=await browser.newPage();await staff.goto(base+"/pilot-workbench.html");await staff.locator("#pilot-role").selectOption("rater");await staff.locator("#pilot-token").fill(rater.token);await staff.locator("#pilot-login-button").click();await staff.locator("article").first().waitFor();
  assert.ok(!(await staff.locator("#pilot-workspace").textContent()).includes("合成反馈"));
  await staff.locator("article").first().locator('[name="note"]').fill("独立记录：当前证据不足，不判断动机。");await staff.getByRole("button",{name:"保存标注版本",exact:true}).first().click();await staff.getByText(/已标注，可修订/).first().waitFor();
  await staff.screenshot({path:path.join(out,"教师独立标注.png")});await staff.setViewportSize({width:390,height:844});assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#auth-menu-toggle').click();await page.locator('#account-pilot-status').click();await page.getByText("结束本次预试并填写问卷",{exact:true}).click();await page.getByRole("button",{name:"提交结束问卷",exact:true}).click();await page.getByText("本次预试已结束。",{exact:true}).waitFor();
  await page.reload();await page.locator("#app-loader.hidden").waitFor({state:"attached"});assert.equal((await api("/api/learning/pilot",null,student)).data.enrollment.status,"finished");
  exportData=(await api("/api/admin/pilot/export?project=pilot-browser")).data;assert.equal(exportData.annotations.length,1);assert.equal(exportData.enrollments[0].finalSurvey.burden,null);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,"预试浏览器验收.json"),JSON.stringify({synthetic:true,passed:true,opportunities:exportData.opportunities.length,answers:exportData.answers.length,annotations:exportData.annotations.length,checks:["真实注册与常规学习","知情加入","前测保护","静默抽样","缺失与不确定分离","帮助顺序保护","教师盲化","标注保存","窄屏","结束问卷","刷新恢复"]},null,2));
  console.log("预试浏览器与API验收通过：常规入口、静默抽样、学生反馈、教师盲评、结束问卷和持久化。");
 }finally{await browser?.close();server.kill();fs.closeSync(logs);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
