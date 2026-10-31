// Legacy conversation component coverage uses the test seam; rehearsal entry is agent initiated.
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
    PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r4",PROACTIVE_ASSIGNMENT_SALT:"isolated-student-flow-fixture",
    PROACTIVE_EXPERIMENT_ARMS:"treatment_full",PROACTIVE_DISPLAY_ARMS:"treatment_full",PROACTIVE_PUBLIC_CHAPTER_ONLY:"true",
    PROACTIVE_RETENTION_DELAY_HOURS:"72",PROACTIVE_RETENTION_CLOSE_HOURS:"0",RATE_LIMIT_MAX:"5000"};
  const startServer=()=>{
    const stdout=fs.openSync(path.join(dir,"server.stdout.log"),"a");
    const stderr=fs.openSync(path.join(dir,"server.stderr.log"),"a");
    try{return spawn(process.execPath,["server.js",String(port)],{cwd:root,windowsHide:true,stdio:["ignore",stdout,stderr],env:serverEnv});}
    finally{fs.closeSync(stdout);fs.closeSync(stderr);}
  };
  let server=startServer();
  let browser,page;
  const record=(name,detail={})=>{results.push({name,passed:true,...detail});console.log(`通过：${name}`);};
  try {
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`${base}/api/health`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,"隔离学生测试启动失败");
    browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--use-angle=swiftshader","--enable-webgl"]});
    page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:"reduce"});page.setDefaultTimeout(20000);
    page.on("pageerror",e=>issues.push(e.message));
    await page.addInitScript(()=>{
      window.__taskMessages=[];
      window.addEventListener('message',event=>{const m=event.data;if(m?.type==='cq:task-control')window.__taskMessages.push({type:m.type,kind:m.kind,id:m.id,revision:m.revision,length:String(m.value||'').length});});
      document.addEventListener("mousemove",event=>{
        window.__observedPointer={x:event.clientX,y:event.clientY,target:event.target.id,at:performance.now()};
      },true);
      const arc=CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){
        if(this.canvas.id==='gameCanvas'&&r===22)window.__observedCollector={x,y};
        return arc.call(this,x,y,r,...rest);
      };
    });
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
    assert.equal(await page.locator(".task-assessment-note").count(),chapter.flow.preQuiz.questions.length,"前测逐题关闭帮助");
    await answerQuiz(chapter.flow.preQuiz,false);await page.waitForFunction(()=>state.submittedQuizzes.includes("V14-C1-pre"));
    await page.screenshot({path:path.join(output,"01-前测与待复核.png")});record("前测独立作答与提交",{shortAnswerProvider:"mock-manual-review"});
    assert.equal(await page.locator('.is-coach-surface').count(),0,'前测提交后应留在结果页');
    assert.equal(await page.locator(".question-task-review").count(),chapter.flow.preQuiz.questions.length);
    const review=page.locator(".question-task-review").first();await review.locator("summary").click();
    await review.locator("textarea").fill("我想核对这道题的第一步。");
    const reviewed=page.waitForResponse(r=>r.url().includes("/assistant/ask")&&r.request().method()==="POST");
    await review.getByRole("button",{name:"发送我的想法"}).click();assert.equal((await reviewed).status(),200);
    await page.waitForFunction(()=>document.querySelector(".task-review-reply")?.textContent.includes("知点的回应"));
    assert.equal(await review.getByRole("button",{name:"发送我的想法"}).isEnabled(),true);
    record("前测提交后原题旁复盘与重复发送可用");
    await page.locator("#workspace-coach-toggle").click();
    await page.getByRole("button",{name:"全部学习",exact:true}).click();await page.getByRole("button",{name:"按勾选知识点开始学习"}).click();record("学生确认六知识点学习路径");
    for(const [index,point] of points.entries()){
      await page.waitForFunction(id=>currentUnitId===id,point.id);
      if(index===0){
        await page.locator('[data-openmaic-state="ready"]').waitFor({state:'visible'});
        const canvas=await page.locator('.multi-scene-slide-fullscreen-stage').boundingBox();
        assert.ok(canvas.height>=480,'讲解页不能被帮助面板挤小');
        await page.getByTitle('播放讲解',{exact:true}).click();
        await page.waitForFunction(()=>LessonPlayback.snapshot(document.querySelector('.multi-scene-slide-panel'))?.elapsed>.2);
        const caption=await page.locator('#classroom-lecture-text').innerText();
        assert.ok(caption.includes('本场景'),'原有无音频首段同样播放');
        await page.screenshot({path:path.join(output,'02-完整讲解与聚光.png')});
        await page.getByTitle('暂停讲解',{exact:true}).click();
        assert.equal(await page.evaluate(()=>LessonPlayback.snapshot(document.querySelector('.multi-scene-slide-panel')).status),'paused');
        record('原课件完整讲解、文字回退与暂停，讲解画布不受求助区挤压');
      }
      await page.locator('[data-workspace-canvas="interactive"]').click();
      assert.equal(await page.locator('iframe[data-courseware-frame]').count(),0);
      await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().taskReady===false);
      assert.equal(await page.locator('.task-support-panel:visible,.learning-support-surface:visible').count(),0,'待选页无任务内帮助');
      record(`${point.id}待选页无错误介入`);
      for(const type of ["simulation","game","mindMap","visualization3d"]){
        await page.locator(`.workspace-canvas-toolbar [data-knowledge-scene="${type}"]`).click();
        const frameNode=page.locator("iframe[data-courseware-frame]");await frameNode.waitFor({state:"visible"});
        await page.locator(".iframe-loader").waitFor({state:"hidden"});
        const box=await frameNode.boundingBox();assert.ok(box.width>300&&box.height>=300,`${point.id}/${type}课件尺寸`);
        const frame=await(await frameNode.elementHandle()).contentFrame();
        if(point.id==='GH-01-K02'&&type==='game'&&await frame.locator('#gameCanvas').count()){
          await frame.getByRole('button',{name:/开始/}).first().press('Enter');
          for(const full of [false,true]){
            if(full){await page.getByTitle('全屏课件',{exact:true}).click();await page.waitForFunction(()=>{const host=document.fullscreenElement;const r=document.querySelector('iframe[data-courseware-frame]')?.getBoundingClientRect();return host?.classList.contains('core-learning-workspace')&&r&&r.left>=0&&r.top>=0&&r.right<=innerWidth+2&&r.bottom<=innerHeight+2&&r.width>=innerWidth*.7&&r.height>=300;});}
            const game=frame.locator('#gameCanvas');
            const sizes=await game.evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),w:innerWidth,h:innerHeight}));
            assert.ok(Math.abs(sizes.rect.width-sizes.w)<2&&Math.abs(sizes.rect.height-sizes.h)<2,'游戏填满实际视口');
            const b=await frameNode.boundingBox();
            for(const [side,x,y] of [['left',2,b.height/2],['right',b.width-2,b.height/2],['top',b.width/2,2],['bottom',b.width/2,b.height-2]]){
              // Hover waits for the canvas to settle after fullscreen reparenting.
              // A raw page mouse move can be dropped while Chrome switches surfaces.
              await game.hover({position:{x,y}});
              try{
                await frame.waitForFunction(side=>{const p=window.__observedCollector;return p&&(side==='left'?p.x<8:side==='right'?p.x>innerWidth-8:side==='top'?p.y<8:p.y>innerHeight-8);},side);
              }catch(error){
                const diagnostic=await frame.evaluate(()=>({pointer:window.__observedPointer,collector:window.__observedCollector,
                  canvas:{width:document.querySelector("#gameCanvas").width,height:document.querySelector("#gameCanvas").height},
                  viewport:{width:innerWidth,height:innerHeight}}));
                throw new Error(`游戏边缘操作失败：${JSON.stringify({full,side,frame:b,diagnostic})}`,{cause:error});
              }
            }
            await page.screenshot({path:path.join(output,`03-游戏四边-${full?'全屏':'常规'}.png`)});
            if(full)await page.keyboard.press('Escape');
          }
          record('坐标游戏常规与全屏填满、四边真实鼠标可达');
        }
        const embedded=frame.locator('[data-cq-embedded-help="task"]');
        if(!await embedded.count()&&!await page.locator('.task-support-panel:visible').count())await page.evaluate(()=>SupportCycleUI.openManual());
        await Promise.any([embedded.waitFor({state:"attached"}),page.locator('.task-support-panel').waitFor({state:"attached"})]);
        if(type==="simulation"){
          await embedded.waitFor({state:"visible"});
          await embedded.locator("summary").click();
          await embedded.locator("textarea").fill(`我在学习${point.name}，先观察哪些关系？`);
          let reply;
          try { [reply]=await Promise.all([page.waitForResponse(r=>r.url().includes("/assistant/ask")&&r.request().method()==="POST"),embedded.getByRole("button",{name:"发送我的想法"}).click()]); }
          catch(error){const diagnostic=await page.evaluate(()=>({messages:window.__taskMessages,snapshot:KnowledgeAssistant.designSpaceSnapshot()}));fs.writeFileSync(path.join(output,'嵌入求助诊断.json'),JSON.stringify(diagnostic,null,2));throw error;}
          assert.equal(reply.status(),200);
          await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().busy);
          await embedded.getByText('知点的回应',{exact:true}).waitFor({state:'visible'});
          await frame.waitForFunction(()=>document.querySelector('[data-cq-embedded-help="task"]')?.shadowRoot.querySelector('textarea')?.value==='');
          const after=await frameNode.boundingBox();assert.equal(after.width,box.width,"嵌入提示不能压缩课件宽度");assert.equal(after.height,box.height,"嵌入提示不能压缩课件高度");
          assert.equal(await page.locator('.core-learning-workspace').evaluate(e=>e.classList.contains('tools-collapsed')),true,"任务内回复不自动展开聊天侧栏");
          record(`${point.id}课件内部真实问答与尺寸保持`);
        }
        if(await frame.locator('input[type="range"]:visible').count()){
          const slider=frame.locator('input[type="range"]:visible').first();await slider.focus();await slider.press("ArrowRight");
        }else{
          const start=frame.getByRole("button",{name:/开始|启动|进入/}).filter({visible:true}).first();
          if(await start.count())await start.press('Enter');
          else if(await frame.locator("svg .node-group:visible, svg #nodesGroup > g[data-id]:visible").count())await frame.locator("svg .node-group:visible, svg #nodesGroup > g[data-id]:visible").first().click();
        }
        if(type==='game'){
          const resource=point.resourceCandidates.find(r=>r.type===type);
          if(resource?.teachingActions){
            const narration=page.locator('[data-knowledge-audio-slot="scene-game"]');
            await narration.getByText(resource.teachingActions[0].text,{exact:true}).waitFor({state:'attached'});
            await page.getByText(resource.teachingActions[0].text,{exact:true}).filter({visible:true}).waitFor();
            assert.equal(await narration.locator('[data-audio-src]').count(),0,'替换活动不能播放旧活动的录音');
          }
        }
        await page.screenshot({path:path.join(output,`${point.id}-${type}.png`)});
      }
      record(`${point.id}的四类互动课件`);
      const common=page.locator('#common-learning-task');
      await common.getByRole('button',{name:/^(开始判断与验证|开始本知识点)$/}).click();
      await common.locator('input[name="response"][value="unknown"]').check();
      await common.locator('textarea').fill('我先区分函数规则、点值与附近趋势。');
      await common.getByRole('button',{name:'提交判断',exact:true}).click();
      await common.getByRole('button',{name:'观察完成，独立再试',exact:true}).click();
      await common.locator('input[name="response"][value="unknown"]').check();
      await common.getByRole('button',{name:'提交判断',exact:true}).click();
      await common.getByRole('button',{name:'关闭并独立试一题',exact:true}).click();
      await common.locator('input[name="response"][value="unknown"]').waitFor();
      assert.equal(await page.locator('.multi-scene-knowledge-resource').isVisible(),false,'独立题隐藏答案材料');
      assert.equal(await page.locator('.task-support-panel:visible,.learning-support-surface:visible').count(),0,'独立共同题关闭帮助');
      await common.locator('input[name="response"][value="unknown"]').check();
      await common.getByRole('button',{name:'提交判断',exact:true}).click();
      await common.getByRole('button',{name:'跳过问卷并完成',exact:true}).click();
      await page.waitForFunction(()=>!CommonLearning.protects());
      record(`${point.id}常规入口共同判断、观察、独立复查和迁移，帮助自动关闭`);
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
    // Hold a pre-submission outcome response so the refresh race is reproducible.
    let releaseOldOutcome, markOldOutcome;
    const oldOutcomeHeld=new Promise(resolve=>{markOldOutcome=resolve;});
    const oldOutcomeRelease=new Promise(resolve=>{releaseOldOutcome=resolve;});
    let holdOneOutcome=true;
    await page.route('**/api/learning/proactive/outcomes?*',async route=>{
      if(!holdOneOutcome)return route.continue();
      holdOneOutcome=false;
      const response=await route.fetch();markOldOutcome();
      await oldOutcomeRelease;await route.fulfill({response});
    });
    await page.evaluate(()=>{void KnowledgeAssistant.reloadLearnerPolicy();});
    await oldOutcomeHeld;
    const postStateRefresh=page.waitForResponse(r=>r.url().includes('/api/learning/proactive/state?'));
    await answerQuiz(chapter.flow.postQuiz,false);await page.waitForFunction(()=>state.submittedQuizzes.includes("V14-C1-post"));
    await postStateRefresh;releaseOldOutcome();
    await page.screenshot({path:path.join(output,"08-后测提交.png")});record("后测独立作答与提交");
    assert.equal(await page.locator(".question-task-review").count(),chapter.flow.postQuiz.questions.length,"后测逐题复盘");
    const memory=await page.evaluate(async()=>{const r=await fetch('/api/learning/proactive/state?chapterId=V14-C1',{headers:{Authorization:`Bearer ${state.authToken}`}});return (await r.json()).data.learningMemory;});
    assert.equal(memory.points.length,6);assert.ok(memory.points.every(p=>p.sources.length>0));record("六知识点带来源学习记忆生成");
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
    assert.equal((await submitted).status(),200);record("迁移测量UI与后测提交期间旧请求刷新",{items:groups.length});
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
    let restarted=false;for(let i=0;i<300;i++){if(server.exitCode!==null)throw new Error(`隔离服务重启退出，代码 ${server.exitCode}`);try{if((await fetch(`${base}/api/health`)).ok){restarted=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(restarted,'隔离服务重启未通过健康检查');
    await page.reload();await page.locator("#app-loader").waitFor({state:"hidden"});await page.locator('[data-view="learn"]').first().click();
    const restored=await page.evaluate(async()=>{const r=await fetch('/api/learning/proactive/state?chapterId=V14-C1',{headers:{Authorization:`Bearer ${state.authToken}`}});return (await r.json()).data.learningMemory;});
    assert.equal(restored.generation,memory.generation);assert.deepEqual(restored.points.map(p=>[p.correct,p.incorrect,p.pending]),memory.points.map(p=>[p.correct,p.incorrect,p.pending]));record("服务重启与跨时段恢复学习记忆");
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
    if(page){await page.screenshot({path:path.join(output,"失败现场.png")}).catch(()=>{});fs.writeFileSync(path.join(output,"失败界面.txt"),await page.locator("body").innerText().catch(()=>""),"utf8");
      const diagnostic=await page.evaluate(async()=>({unitId:currentUnitId,submittedQuizzes:state.submittedQuizzes,
        outcomes:await fetch('/api/learning/proactive/outcomes?chapterId=V14-C1',{headers:{Authorization:`Bearer ${state.authToken}`}}).then(r=>r.json())})).catch(()=>null);
      fs.writeFileSync(path.join(output,'测量入口诊断.json'),JSON.stringify(diagnostic,null,2),'utf8');}
    results.push({name:"学生流程未完成",passed:false,error:error.message});throw error;
  }finally{
    fs.writeFileSync(path.join(output,"验收结果.json"),JSON.stringify({generatedAt:new Date().toISOString(),passed:results.length>0&&results.every(r=>r.passed),navigation:"真实UI，无学习进度注入",models:"mock",results,issues},null,2),"utf8");
    await browser?.close();server.kill();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
