"use strict";
// Explicit release check: creates one clearly synthetic demo account on the
// selected deployed server. Never starts a formal protocol or resets data.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {chromium}=require("playwright-core");
(async()=>{
 assert.equal(process.env.RESEARCH_RELEASE_SMOKE,"1","公网合成检查需显式启用");
 const base=String(process.env.RESEARCH_RELEASE_BASE||"").replace(/\/$/,"");assert.match(base,/^https:\/\//);
 const out=path.resolve(process.env.RESEARCH_RELEASE_OUTPUT||"output/多研究网站与阈值依据-2026-10-23/发布后验收");fs.mkdirSync(out,{recursive:true});
 let token,browser;const report={base,synthetic:true,formalSessionsStarted:0,sites:[]},errors=[];
 async function api(route,body){const r=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();assert.ok(r.ok,d.message||route);return d.data||d;}
 try{
  report.health=await api("/api/health");assert.equal(report.health.appVersion,"2.0.0-research-sites-20261023");
  const nickname="发布合成验收"+crypto.randomUUID().slice(0,8),password=crypto.randomBytes(24).toString("hex");
  token=(await api("/api/auth/register",{nickname,password})).token;assert.ok(token);report.syntheticAccount=nickname;
  token=(await api("/api/auth/login",{identifier:nickname,password})).token;assert.ok(token);
  const catalog=await api("/api/research-sites");assert.equal(catalog.sites.length,9);
  browser=await chromium.launch({channel:"chrome",headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(token=>sessionStorage.setItem("calculus-quest-auth-token-v1",token),token);const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/studies/index/");await page.getByRole("heading",{name:"主动学习支持研究入口"}).waitFor();assert.equal(await page.locator(".study-list article").count(),9);await page.screenshot({path:path.join(out,"研究入口.png"),fullPage:true});
  for(const study of catalog.sites){
   const endpoint=`/api/research-sites/${study.id}`;
   let s=await api(endpoint+"/start",{requestId:crypto.randomUUID(),consent:{acknowledged:true,externalModel:study.id==="authorization",futureBenchmark:false}});
   const act=async(action,extra={})=>s=await api(endpoint+"/action",{action,requestId:crypto.randomUUID(),revision:s.session.revision,fingerprint:s.protocol.fingerprint,...extra});
   await act("baseline_submit",{responses:{}});
   if(study.id!=="design-space"){
    await act("quiz_submit",{responses:Object.fromEntries(s.session.quiz.items.map(q=>[q.id,"__unknown__"]))});
    await act("probe_submit",{probeId:s.session.probe.id,response:"unknown",confidence:20});
   }
   if(study.id==="authorization"){
    s=await api(endpoint+"/chat",{message:"这是发布后的合成检查。请用一句话说明函数为何要求同一输入只有一个输出，不提供任何测验答案。"});assert.ok(s.session.conversation.at(-1).response.length>5);report.liveDialogue=true;
   }
   await page.goto(base+`/studies/${study.id}/`);
   if(study.id==="design-space"){await page.locator(".case-box").first().waitFor();assert.equal(await page.locator(".case-box").count(),4);}
   else {
    const lecture=page.frameLocator("#canvas iframe");
    await lecture.locator("#slide .text").first().waitFor({state:"visible"});
    assert.ok((await lecture.locator("#slide").innerText()).trim().length>30,"讲解内容须实际渲染，不能只检查空画布容器");
    const f=await page.locator("#canvas iframe").boundingBox();assert.ok(f.width>500&&f.height>400);
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   if(study.id==="authorization")await page.screenshot({path:path.join(out,"上线学习页.png")});
   report.sites.push({id:study.id,phase:s.session.phase,passed:true});
   console.log(JSON.stringify({study:study.id,passed:true}));
   // Pace this cross-site batch; keep the production API rate limit unchanged.
   await new Promise(resolve=>setTimeout(resolve,8000));
  }
  await page.goto(base+"/studies/authorization/?mode=formal");await page.getByText("该方向尚未开放正式参与。",{exact:false}).waitFor();assert.ok(await page.getByRole("button",{name:"开始",exact:true}).isDisabled());report.formalRecruitmentClosed=true;
  await page.goto(base+"/research-rater.html");await page.getByLabel("研究方向",{exact:true}).waitFor();report.raterPage=true;
  await page.goto(base+"/");await page.locator("#app-loader.hidden").waitFor({state:"attached"});
  // The startup shell can finish before the saved login request resolves.
  await page.locator("#auth-gate").waitFor({state:"hidden",timeout:15000});
  assert.equal(await page.locator("#auth-gate:visible").count(),0);report.originalRouteAndSession=true;
  assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;fs.writeFileSync(path.join(out,"结果.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,sites:report.sites.length,liveDialogue:true,output:out}));
 }finally{await browser?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
