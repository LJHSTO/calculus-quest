"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const chapter = require("../data/multi-scene-learning-route.json").chapters.find(c=>c.id==="V14-C1");
const points = chapter.modules.flatMap(m=>m.knowledgePoints);
const root = path.resolve(__dirname,"..");
const output = path.join(root,"output","六维网站验收","学生全流程");
fs.mkdirSync(output,{recursive:true});
const results = [], issues = [];
async function main() {
  const port = await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const base = `http://127.0.0.1:${port}`;
  const dir=fs.mkdtempSync(path.join(root,"output","student-flow-"));
  const serverEnv={...process.env,
    NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"",DB_PATH:path.join(dir,"test.db"),
    LLM_PROVIDER:"mock",GRADING_LLM_PROVIDER:"mock",ASSESSMENT_LLM_ENABLED:"false",COACH_NARRATION_LLM_ENABLED:"false",
    PROACTIVE_POLICY_MODE:"active",PROACTIVE_PARTICIPATION_MODE:"implicit-pilot",PROACTIVE_EXPERIMENT_ID:path.basename(dir),
    PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_ADAPTER_VERSION:"functions-limits-adapter-r2",
    PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r3",PROACTIVE_ASSIGNMENT_SALT:"isolated-student-flow-fixture",
    PROACTIVE_EXPERIMENT_ARMS:"treatment_full",PROACTIVE_DISPLAY_ARMS:"treatment_full",PROACTIVE_PUBLIC_CHAPTER_ONLY:"true",
    PROACTIVE_RETENTION_DELAY_HOURS:"72",PROACTIVE_RETENTION_CLOSE_HOURS:"0",RATE_LIMIT_MAX:"5000"};
  const startServer=()=>spawn(process.execPath,["server.js",String(port)],{cwd:root,windowsHide:true,stdio:"ignore",env:serverEnv});
  let server=startServer();
  let browser,page;
  const record=(name,detail={})=>{results.push({name,passed:true,...detail});console.log(`通过：${name}`);};
  try {
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`${base}/api/health`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,"隔离学生测试启动失败");
    browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--use-angle=swiftshader","--enable-webgl"]});
    page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:"reduce"});page.setDefaultTimeout(20000);
    page.on("pageerror",e=>issues.push(e.message));
    await page.goto(base);await page.locator('[data-auth-mode="register"]').click();
    await page.locator("#nickname").fill(`学生完整学习${Date.now()}`);await page.locator("#register-password").fill("student-flow-synthetic-password");
    await page.locator("#register-password-confirm").fill("student-flow-synthetic-password");await page.locator("#login-submit").click();
    await page.locator("#auth-gate").waitFor({state:"hidden"});record("学生注册与登录");
    await page.locator('[data-view="learn"]').first().click();
    async function answerQuiz(quiz,correct) {
      for(const q of quiz.questions){
        const card=page.locator(`.question-card[data-question="${q.id}"]`);
        if(!await card.count())continue;
        if(q.type==="short_answer"){await card.locator("textarea").fill("我会检查左右两侧的趋势是否相同，再区分该点的函数值与附近变化。");continue;}
        const values=correct ? q.answer : [q.options[0].value];
        for(const v of values)await card.locator(`input[value="${v}"]`).check();
      }
      const response=page.waitForResponse(r=>r.url().includes("/api/learning/quiz/submit")&&r.request().method()==="POST");
      await page.locator("[data-submit-quiz]").click();assert.equal((await response).status(),200);
    }
    assert.equal(await page.locator(".support-display-settings:visible").count(),0,"前测不能显示帮助设置");
    await answerQuiz(chapter.flow.preQuiz,false);await page.waitForFunction(()=>state.submittedQuizzes.includes("V14-C1-pre"));
    await page.screenshot({path:path.join(output,"01-前测与待复核.png")});record("前测独立作答与提交",{shortAnswerProvider:"mock-manual-review"});
    await page.getByRole("button",{name:"全部学习",exact:true}).click();await page.getByRole("button",{name:"按勾选知识点开始学习"}).click();record("学生确认六知识点学习路径");
    for(const [index,point] of points.entries()){
      await page.waitForFunction(id=>currentUnitId===id,point.id);
      await page.locator('[data-workspace-canvas="interactive"]').click();
      for(const type of ["simulation","game","mindMap","visualization3d"]){
        await page.locator(`.workspace-canvas-toolbar [data-knowledge-scene="${type}"]`).click();
        const frameNode=page.locator("iframe[data-courseware-frame]");await frameNode.waitFor({state:"visible"});
        await page.locator(".iframe-loader").waitFor({state:"hidden"});
        const box=await frameNode.boundingBox();assert.ok(box.width>300&&box.height>=300,`${point.id}/${type}课件尺寸`);
        const frame=await(await frameNode.elementHandle()).contentFrame();
        if(await frame.locator('input[type="range"]:visible').count()){
          const slider=frame.locator('input[type="range"]:visible').first();await slider.focus();await slider.press("ArrowRight");
        }else{
          const start=frame.getByRole("button",{name:/开始|启动|进入/}).filter({visible:true}).first();
          if(await start.count())await start.click();
          else if(await frame.locator("svg .node-group:visible, svg #nodesGroup > g[data-id]:visible").count())await frame.locator("svg .node-group:visible, svg #nodesGroup > g[data-id]:visible").first().click();
        }
        await page.screenshot({path:path.join(output,`${point.id}-${type}.png`)});
      }
      record(`${point.id}的四类互动课件`);
      await page.getByRole("button",{name:"完成本节并选择下一步",exact:true}).click();
      await page.getByRole("button",{name:"做小题测一测",exact:true}).click();
      await page.waitForFunction(id=>currentUnitId===`${id}-formative`,point.id);
      assert.equal(await page.locator(".learning-support-surface:visible").count(),0,"未提交诊断期间暂停帮助");
      await answerQuiz({questions:[point.formativeQuiz.questions[0]]},true);
      await page.waitForFunction(id=>state.submittedQuizzes.includes(`${id}-formative`),point.id);
      await page.screenshot({path:path.join(output,`${point.id}-形成性检查.png`)});
      record(`${point.id}的可选形成性检查`);
      await page.getByRole("button",{name:"下一节",exact:true}).click();
    }
    await page.waitForFunction(()=>currentUnitId==="V14-C1-post");
    await answerQuiz(chapter.flow.postQuiz,false);await page.waitForFunction(()=>state.submittedQuizzes.includes("V14-C1-post"));
    await page.screenshot({path:path.join(output,"08-后测提交.png")});record("后测独立作答与提交");
    // Use the course's public research measurement entry; no progress injection.
    const available=page.locator(".outcome-path-step.is-available");await available.first().click();
    await page.locator(".knowledge-outcome-stage.is-available > button").first().click();
    const active=page.locator(".knowledge-outcome-active");await active.waitFor({state:"visible"});
    assert.equal(await page.locator(".learning-support-surface:visible").count(),0);
    const groups=await active.locator("input[type=radio]").evaluateAll(es=>[...new Set(es.map(e=>e.name))]);
    for(const name of groups)await active.locator(`input[name="${name}"]`).first().check();
    assert.equal(groups.length,12,"先开放12题迁移测量，保持测量须等待72小时");
    await page.screenshot({path:path.join(output,"09-独立迁移测量.png")});
    const submitted=page.waitForResponse(r=>r.url().includes("/proactive/outcomes/submit"));await active.locator(".knowledge-outcome-submit").click();
    assert.equal((await submitted).status(),200);record("迁移测量UI",{items:groups.length});
    await page.getByRole("button",{name:"返回任务列表",exact:true}).click();
    assert.equal(await page.locator(".knowledge-outcome-stage.is-available").count(),0,"72小时前保持测量未开放");
    record("保持测量72小时前锁定");
    // Simulate elapsed time only in this owned, isolated fixture database.
    // Learning progress and all responses are still created through the UI.
    const exited=new Promise(resolve=>server.once("exit",resolve));server.kill();await exited;
    const dbPath=path.join(dir,"test.db");assert.ok(path.resolve(dbPath).startsWith(path.join(root,"output")+path.sep));
    const SQL=await require("sql.js")();const database=new SQL.Database(fs.readFileSync(dbPath));
    database.run("UPDATE quiz_results SET created_at = ? WHERE phase = 'post'",[new Date(Date.now()-73*3600000).toISOString()]);
    fs.writeFileSync(dbPath,Buffer.from(database.export()));database.close();server=startServer();
    for(let i=0;i<100;i++){try{if((await fetch(`${base}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    await page.reload();await page.locator("#app-loader").waitFor({state:"hidden"});await page.locator('[data-view="learn"]').first().click();
    await page.locator(".outcome-path-step.is-available").filter({hasText:"保持测量"}).click();
    await page.locator(".knowledge-outcome-stage.is-available > button").first().click();
    await active.waitFor({state:"visible"});
    const transferGroups=await active.locator("input[type=radio]").evaluateAll(es=>[...new Set(es.map(e=>e.name))]);
    for(const name of transferGroups)await active.locator(`input[name="${name}"]`).first().check();
    assert.equal(transferGroups.length,18,"保持测量18题");
    await page.screenshot({path:path.join(output,"10-独立保持测量.png")});
    const transferred=page.waitForResponse(r=>r.url().includes("/proactive/outcomes/submit"));await active.locator(".knowledge-outcome-submit").click();
    assert.equal((await transferred).status(),200);record("保持测量UI",{items:transferGroups.length,elapsedTimeFixture:"仅将隔离测试库的后测时间提前73小时"});
    assert.equal(issues.length,0,`页面脚本错误：${issues.join("；")}`);
    record("浏览器无未捕获脚本错误");
  }catch(error){
    if(page){await page.screenshot({path:path.join(output,"失败现场.png")}).catch(()=>{});fs.writeFileSync(path.join(output,"失败界面.txt"),await page.locator("body").innerText().catch(()=>""),"utf8");}
    results.push({name:"学生流程未完成",passed:false,error:error.message});throw error;
  }finally{
    fs.writeFileSync(path.join(output,"验收结果.json"),JSON.stringify({generatedAt:new Date().toISOString(),passed:results.length>0&&results.every(r=>r.passed),navigation:"真实UI，无学习进度注入",models:"mock",results,issues},null,2),"utf8");
    await browser?.close();server.kill();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
