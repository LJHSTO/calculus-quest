"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto");
const {spawn}=require("node:child_process"),{chromium}=require("playwright-core"),m=require("../lib/research-sites/materials");
const root=path.resolve(__dirname,".."),out=path.join(root,"output/多研究网站与阈值依据-2026-10-23/布局验收");
(async()=>{
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,"合成运行-"));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});const base=`http://127.0.0.1:${port}/calculus_quest`;
 const log=fs.openSync(path.join(dir,"server.log"),"w"),server=spawn(process.execPath,["server.js",String(port)],{cwd:root,windowsHide:true,stdio:["ignore",log,log],env:{...process.env,NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"/calculus_quest",DB_PATH:path.join(dir,"synthetic.db"),ADMIN_TOKEN:"synthetic-layout",RESEARCH_SITES_CONFIG_FILE:"",LLM_PROVIDER:"mock",GRADING_LLM_PROVIDER:"mock",RATE_LIMIT_MAX:"10000",PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r4"}});
 let browser;const results=[],errors=[];
 const req=async(url,body,token)=>{const r=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();assert.ok(r.ok,d.message||url);return d.data||d;};
 async function fixture(point,study="authorization",deferOffer=false){
  const token=(await req("/api/auth/register",{nickname:"布局合成"+crypto.randomUUID().slice(0,8),password:crypto.randomUUID()})).token;
  let s=await req(`/api/research-sites/${study}/start`,{requestId:crypto.randomUUID(),consent:{acknowledged:true}},token);
  const act=async(action,extra={})=>s=await req(`/api/research-sites/${study}/action`,{action,requestId:crypto.randomUUID(),revision:s.session.revision,fingerprint:s.protocol.fingerprint,...(action==="probe_submit"?{probeId:s.session.probe.id}:{}),...extra},token);
  await act("baseline_submit",{responses:{}});await act("quiz_submit",{responses:Object.fromEntries(m.publicQuiz("pre").items.map(q=>[q.id,"__unknown__"]))});
  for(let i=0;i<=point;i++){
   await act("probe_submit",{response:"unknown",confidence:30});
   if(i===point)break;
   await new Promise(r=>setTimeout(r,1050));await act("begin_t1");await act("probe_submit",{response:"unknown",confidence:30});await act("begin_outcome");await act("probe_submit",{response:"unknown",confidence:30});await act("next_point");
  }
  if(deferOffer)return {token,study};
  await act("context",{context:{visible:true,idleMs:5000,typing:false,dragging:false,busy:false}});assert.equal(s.session.offer.status,"inquiry");
  await act("accept",{opportunityId:s.session.offer.id});return {token,placement:s.session.offer.placement,study};
 }
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+"/api/health")).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:"chrome",headless:true});
  const active=await fixture(0,"authorization",true),dragContext=await browser.newContext({viewport:{width:1366,height:900}});
  await dragContext.addInitScript(token=>sessionStorage.setItem("calculus-quest-auth-token-v1",token),active.token);const dragPage=await dragContext.newPage();
  await dragPage.goto(base+"/studies/authorization/");await dragPage.getByLabel("学习材料",{exact:true}).selectOption("0");
  const slider=dragPage.frameLocator("#canvas iframe").locator('input[type="range"]').first();await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();
  await dragPage.mouse.move(box.x+box.width/2,box.y+box.height/2);await dragPage.mouse.down();await dragPage.waitForTimeout(6500);
  assert.equal((await req("/api/research-sites/authorization/state",undefined,active.token)).session.offer,null,"dragging inside a courseware frame must postpone an inquiry");
  await dragPage.mouse.up();await dragPage.getByRole("button",{name:"现在需要",exact:true}).waitFor({timeout:13000});await dragContext.close();
  async function inspect(f,point){
   const context=await browser.newContext({viewport:{width:1366,height:900}});await context.addInitScript(token=>sessionStorage.setItem("calculus-quest-auth-token-v1",token),f.token);
   const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));await page.goto(base+`/studies/${f.study}/`);await page.locator("#canvas iframe").waitFor();
   for(const size of [{width:1920,height:1080},{width:1366,height:900},{width:768,height:1024}]){
    await page.setViewportSize(size);
    for(let type=-1;type<4;type++){
     await page.getByLabel("学习材料",{exact:true}).selectOption(String(type));await page.waitForTimeout(500);
     const frame=page.frameLocator("#canvas iframe");
     if(type>=0)await frame.locator("body").waitFor();
     const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,frame:{w:document.querySelector("iframe").clientWidth,h:document.querySelector("iframe").clientHeight},body:document.querySelector("[data-support-text]")?.textContent}));
     assert.ok(layout.scroll<=layout.width+2,JSON.stringify(layout));assert.ok(layout.frame.w>=400&&layout.frame.h>=300,JSON.stringify(layout));
     await page.getByRole("button",{name:"查看学习支持",exact:true}).click();await page.getByRole("button",{name:"定位学习支持",exact:true}).click();
     const innerBodies=await frame.locator("[data-support-body]").count();
     if(innerBodies){assert.match(layout.body,/线索已放在课件/);assert.equal(innerBodies,1);}
     else assert.doesNotMatch(layout.body,/线索已放在课件/);
     results.push({point,study:f.study,placement:f.placement,viewport:size,resource:type,frame:layout.frame,embedded:innerBodies===1});
     if(size.width===1366&&point===0){await page.screenshot({path:path.join(dir,`${f.study}-${f.placement}-${type}.png`)});}
    }
   }
   await page.setViewportSize({width:1366,height:900});await page.getByLabel("学习材料",{exact:true}).selectOption("0");await page.getByRole("button",{name:"全屏学习",exact:true}).click();assert.ok(await page.evaluate(()=>Boolean(document.fullscreenElement)));
   await page.getByRole("button",{name:"查看学习支持",exact:true}).click();assert.ok(await page.getByRole("button",{name:"收起这条支持",exact:true}).isVisible());
   await page.getByRole("button",{name:"暂停主动帮助",exact:true}).click();await page.getByRole("button",{name:"恢复主动帮助",exact:true}).waitFor();assert.equal(await page.locator("[data-support-text]").count(),0);
   if(point===0&&f.study==="authorization"){
    await page.route("**/process?mode=demo",route=>route.abort());await page.setViewportSize({width:1400,height:900});await page.waitForTimeout(700);
    assert.ok(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith("research-process-v1:")&&JSON.parse(sessionStorage.getItem(k)).length>0)),"failed process events remain pending");
    await page.reload();await page.locator("#canvas iframe").waitFor();assert.ok(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith("research-process-v1:"))),"queue survives reload");
    await page.unroute("**/process?mode=demo");await page.evaluate(()=>dispatchEvent(new Event("online")));
    await page.waitForFunction(()=>!Object.keys(sessionStorage).some(k=>k.startsWith("research-process-v1:")&&JSON.parse(sessionStorage.getItem(k)).length>0),null,{timeout:10000});
   }
   await context.close();
  }
  for(let i=0;i<6;i++)await inspect(await fixture(i),i);
  let sidebar;for(let i=0;i<12;i++){const f=await fixture(0,"placement");if(f.placement==="sidebar"){sidebar=f;break;}}assert.ok(sidebar,"随机化样本中需获得侧栏条件");await inspect(sidebar,0);
  assert.deepEqual(errors,[]);const report={passed:true,cases:results.length,results,errors};fs.writeFileSync(path.join(dir,"结果.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,cases:results.length,output:dir}));
 }finally{await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once("exit",r));server.kill();await done;}fs.closeSync(log);}
})().catch(e=>{console.error(e);process.exitCode=1;});
