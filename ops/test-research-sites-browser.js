"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), net = require("node:net");
const { spawn } = require("node:child_process"), { chromium } = require("playwright-core");
const { listStudies } = require("../lib/research-sites/catalog");
const root = path.resolve(__dirname,".."), out = path.join(root,"output/多研究网站与阈值依据-2026-10-23/浏览器验收");
(async()=>{
  fs.mkdirSync(out,{recursive:true}); const dir=fs.mkdtempSync(path.join(out,"合成运行-"));
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const base=`http://127.0.0.1:${port}/calculus_quest`, admin="synthetic-research-sites-admin", password="Synthetic-Course-Only-42!";
  const log=fs.openSync(path.join(dir,"server.log"),"w");
  const server=spawn(process.execPath,["server.js",String(port)],{cwd:root,windowsHide:true,stdio:["ignore",log,log],env:{...process.env,
    NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"/calculus_quest",DB_PATH:path.join(dir,"synthetic.db"),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:"false",
    LLM_PROVIDER:"mock",GRADING_LLM_PROVIDER:"mock",RESEARCH_SITES_CONFIG_FILE:"",ASSESSMENT_LLM_ENABLED:"false",COACH_NARRATION_LLM_ENABLED:"false",
    RATE_LIMIT_MAX:"20000",RATE_LIMIT_WINDOW_MS:"1000",PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r4"}});
  let browser, token; const errors=[], results=[];
  const api=async(route,body,auth=token)=>{const r=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:`Bearer ${auth}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,...await r.json()};};
  try{
    for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error(fs.readFileSync(path.join(dir,"server.log"),"utf8"));try{if((await fetch(base+"/api/health")).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.equal((await api("/api/research-sites")).data.sites.length,9);
    assert.equal((await api("/api/research-sites/timing/state")).status,401);
    const nickname="研究站合成验收"+Date.now(); const registered=await api("/api/auth/register",{nickname,password}); assert.equal(registered.ok,true);token=registered.token;
    assert.equal((await api("/api/admin/research-sites/timing/export")).status,403);
    browser=await chromium.launch({channel:"chrome",headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(base+"/studies/index/");await page.getByRole("heading",{name:"主动学习支持研究入口"}).waitFor();assert.equal(await page.locator(".study-list article").count(),9);
    await page.goto(base+"/studies/authorization/");await page.getByLabel("账号或邮箱").fill(nickname);await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"登录并继续"}).click();
    async function phase(expected){await page.waitForFunction(p=>document.querySelector("#stage")?.dataset.phase===p,expected,{timeout:20000});}
    async function survey(){for(const select of await page.locator(".survey-row select").all())await select.selectOption("skip");await page.getByRole("button",{name:"保存并继续",exact:true}).click();}
    async function quiz(){for(const q of await page.locator(".question").all())await q.getByLabel("我不会",{exact:true}).check();await page.getByRole("button",{name:"提交本次测验",exact:true}).click();}
    async function probe(){await page.locator(".question").getByLabel("我不会",{exact:true}).check();await page.getByRole("button",{name:"保存判断并继续",exact:true}).click();}
    async function checkLayout(){const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,frames:[...document.querySelectorAll("iframe")].map(f=>({width:f.clientWidth,height:f.clientHeight}))}));assert.ok(layout.scroll<=layout.width+2,JSON.stringify(layout));for(const f of layout.frames){assert.ok(f.width>=300);assert.ok(f.height>=300);}}
    for(const study of listStudies()){
      if(study.id!=="authorization")await page.goto(base+`/studies/${study.id}/`);
      await page.getByLabel("我已阅读说明，愿意开始这次流程。",{exact:true}).check();await page.getByRole("button",{name:"开始",exact:true}).click();await phase("baseline");await survey();
      if(study.id==="design-space") {
        await phase("case_coding");for(const box of await page.locator(".case-box").all()){await box.getByLabel("D1",{exact:true}).check();await box.getByLabel("分类依据与遗漏",{exact:true}).fill("合成验收：操作少不是缺乏动机的证据，案例覆盖不等于框架完整。");}
        await page.getByRole("button",{name:"保存案例编码",exact:true}).click();await phase("design_task");await page.getByLabel("策略设计",{exact:true}).fill("先根据独立证据提出询问，允许拒绝，并用后续独立表现检查结果。");await page.getByRole("button",{name:"保存策略设计",exact:true}).click();await phase("survey");await survey();await phase("complete");
        const report=(await api(`/api/admin/research-sites/${study.id}/export?mode=demo`,undefined,admin)).data;assert.equal(report.sessions[0].caseResponses.length,4);assert.deepEqual(report.sessions[0].quizzes,{});
        results.push({study:study.id,phase:"complete",events:report.events.length,framework:true});console.log("通过框架使用研究流程："+study.id);continue;
      }
      await phase("pre");
      const pre=(await api(`/api/research-sites/${study.id}/state`)).data; assert.equal(pre.session.quiz.items.length,12);assert.ok(pre.session.quiz.items.every(q=>q.answer===undefined&&q.rubric===undefined));await quiz();
      for(let i=0;i<6;i++){
        await phase("t0");await probe();await phase("explore");await page.locator("#canvas iframe").waitFor();
        await page.frameLocator("#canvas iframe").locator(".slide-canvas, #slide").first().waitFor();
        await checkLayout();
        if(i===0){await page.getByRole("button",{name:"全屏学习",exact:true}).click();assert.ok(await page.evaluate(()=>Boolean(document.fullscreenElement)));await page.getByRole("button",{name:"全屏学习",exact:true}).click();}
        const select=page.getByLabel("学习材料",{exact:true});await select.selectOption(String(i%4));await page.locator("#canvas iframe").waitFor();
        if(i===0&&!["memory","recheck"].includes(study.id)){
          await page.waitForTimeout(6500);
          if(await page.getByRole("button",{name:"现在需要",exact:true}).count()){
            if(study.id==="clarification"&&await page.getByLabel("你现在更需要哪种支持？").count())await page.getByLabel("你现在更需要哪种支持？").selectOption("motivational");
            await page.getByRole("button",{name:"现在需要",exact:true}).click();await page.getByRole("heading",{name:"这一步的学习支持"}).waitFor();
            await page.screenshot({path:path.join(dir,study.id+"-支持.png"),fullPage:false});
          }
        }
        await page.getByRole("button",{name:"完成探索，独立检查",exact:true}).click();await phase("t1");
        assert.equal(await page.locator("iframe").count(),0);assert.equal(await page.getByRole("button",{name:"现在需要",exact:true}).count(),0);
        await probe();await phase("after_t1");
        if(i===0&&study.id==="recheck"){await page.waitForTimeout(6500);await page.getByRole("button",{name:"暂时不需要",exact:true}).click();}
        await page.getByRole("button",{name:"继续独立练习",exact:true}).click();await phase("outcome");await probe();await phase("between");
        if(i===0){await page.locator('select[data-item-id="need"]').selectOption("不需要");await page.locator('select[data-item-id="timing"]').selectOption("4");await page.getByRole("button",{name:"保存这两项反馈",exact:true}).click();await page.getByText("这段学习的反馈已保存。",{exact:true}).waitFor();}
        await page.getByRole("button",{name:i<5?"进入下一个知识点":"继续后续流程",exact:true}).click();
      }
      if(study.id==="memory"){
        await phase("return_wait");await page.getByRole("button",{name:"进入下一次测量",exact:true}).click();
        for(let i=0;i<6;i++){await phase("return_probe");await probe();await phase("explore_return");await page.getByRole("button",{name:"继续独立练习",exact:true}).click();await phase("return_outcome");assert.equal(await page.locator("iframe").count(),0);await probe();await phase("between");await page.getByRole("button",{name:i<5?"进入下一个知识点":"继续后续流程",exact:true}).click();}
      }
      await phase("post");await quiz();await phase("transfer");await quiz();await phase("survey");await survey();
      if(study.id==="design-space"){
        await phase("case_coding");for(const box of await page.locator(".case-box").all()){await box.getByLabel("D1",{exact:true}).check();await box.getByLabel("分类依据与遗漏",{exact:true}).fill("合成验收：证据不足不能推断心理动机。此记录不是研究者编码结果。");}
        await page.getByRole("button",{name:"保存案例编码",exact:true}).click();await phase("design_task");await page.getByLabel("策略设计",{exact:true}).fill("合成验收：先询问是否需要，尊重拒绝并记录下一次独立表现，不能以一次正确宣称掌握。");await page.getByRole("button",{name:"保存策略设计",exact:true}).click();
      }
      await phase("retention_wait");await page.getByRole("button",{name:"进入下一次测量",exact:true}).click();await phase("retention");await quiz();await phase("complete");
      const report=(await api(`/api/admin/research-sites/${study.id}/export?mode=demo`,undefined,admin)).data;
      assert.equal(report.sessions[0].phase,"complete");assert.equal(report.sessions[0].units.length,6);assert.equal(report.sessions[0].quizzes.retention.results.length,18);
      assert.ok(report.events.some(e=>e.record.type==="randomized"));assert.ok(report.process.some(e=>e.record.type==="resource_open"));assert.equal(report.sessions[0].units[0].commonFeedback[0].responses.need,"不需要");
      results.push({study:study.id,phase:"complete",events:report.events.length,process:report.process.length});console.log("通过完整网页流程："+study.id);
    }
    await page.goto(base+"/studies/placement/?mode=formal");await page.getByText("该方向尚未开放正式参与。",{exact:false}).waitFor();assert.ok(await page.getByRole("button",{name:"开始",exact:true}).isDisabled());
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(dir,"结果.json"),JSON.stringify({passed:true,results,errors},null,2));console.log(JSON.stringify({passed:true,sites:results.length,output:dir}));
  }finally{await browser?.close();if(server.exitCode===null){const stopped=new Promise(r=>server.once("exit",r));server.kill();await stopped;}fs.closeSync(log);}
})().catch(e=>{console.error(e);process.exitCode=1;});
