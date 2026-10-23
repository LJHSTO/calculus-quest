"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto");
const {spawn}=require("node:child_process"),{chromium}=require("playwright-core"),m=require("../lib/research-sites/materials");
const root=path.resolve(__dirname,".."),out=path.join(root,"output/多研究网站与阈值依据-2026-10-23/接口验收");
(async()=>{
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,"合成运行-")),configuration={protocols:{timing:{id:"synthetic-api-protocol",institution:"仅合成测试",responsiblePerson:"测试进程",contact:"fixture@example.invalid",retentionPolicy:"隔离测试记录",withdrawalPolicy:"排除已退出记录",approvalReference:"SYNTHETIC-NOT-ACTUAL-APPROVAL",reviewedBy:"synthetic-fixture",reviewedAt:"2026-10-23",consentVersion:"fixture-v1",analysisPlanVersion:"fixture-v1",expectedDuration:"合成时长",compensationPolicy:"合成测试",aiProcessingInfo:"合成模型说明",approvalStatus:"approved",materialFingerprint:m.fingerprint,status:"recruiting"}}};
 const configFile=path.join(dir,"synthetic-config.json");fs.writeFileSync(configFile,JSON.stringify(configuration));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});const base=`http://127.0.0.1:${port}`;
 const admin="synthetic-api-admin",log=fs.openSync(path.join(dir,"server.log"),"w"),server=spawn(process.execPath,["server.js",String(port)],{cwd:root,windowsHide:true,stdio:["ignore",log,log],env:{...process.env,NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"",DB_PATH:path.join(dir,"synthetic.db"),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:"false",RESEARCH_SITES_CONFIG_FILE:configFile,LLM_PROVIDER:"mock",GRADING_LLM_PROVIDER:"mock",RATE_LIMIT_MAX:"5000",PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r4"}});
 let token,browser;const api=async(route,body,auth=token)=>{const r=await fetch(base+route,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:`Bearer ${auth}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,...await r.json()};};
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+"/api/health")).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  token=(await api("/api/auth/register",{nickname:"接口合成"+Date.now(),password:crypto.randomUUID()})).token;
  let s=(await api("/api/research-sites/timing/start?mode=formal",{requestId:crypto.randomUUID(),consent:{acknowledged:true,version:"fixture-v1",adult:true,eligible:true,externalModel:true,futureBenchmark:true}})).data;
  const input={action:"baseline_submit",requestId:crypto.randomUUID(),revision:s.session.revision,fingerprint:s.protocol.fingerprint,responses:{}};
  const concurrent=await Promise.all([api("/api/research-sites/timing/action?mode=formal",input),api("/api/research-sites/timing/action?mode=formal",{...input,requestId:crypto.randomUUID()})]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);s=concurrent.find(r=>r.status===200).data;
  const answers=Object.fromEntries(m.publicQuiz("pre").items.map(q=>[q.id,q.type==="short_answer"?"合成回答，用于验证评分权限，不是真实学生回答。":"__unknown__"]));
  s=(await api("/api/research-sites/timing/action?mode=formal",{action:"quiz_submit",requestId:crypto.randomUUID(),revision:s.session.revision,fingerprint:s.protocol.fingerprint,responses:answers})).data;
  assert.equal(s.session.phase,"t0");assert.equal((await api("/api/research-sites/timing/chat?mode=formal",{message:"请代答当前题"})).status,403);
  assert.equal((await api("/api/admin/research-sites/timing/reviews?mode=formal")).status,403);
  const credential=(await api("/api/admin/research-sites/timing/raters?mode=formal",{name:"合成教师甲"},admin)).data;
  const queue=(await api("/api/research-sites/timing/rater?mode=formal",undefined,credential.token)).data;
  assert.equal(queue.items.length,2);assert.ok(queue.items.every(i=>i.allocation===undefined&&i.userId===undefined&&i.phase===undefined));
  assert.equal((await api("/api/admin/research-sites/timing/export?mode=formal",undefined,credential.token)).status,403);
  assert.equal((await api("/api/research-sites/value/rater?mode=formal",undefined,credential.token)).status,403);
  browser=await chromium.launch({channel:"chrome",headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto(base+"/research-rater.html");await page.getByLabel("研究方向",{exact:true}).selectOption("timing");await page.getByLabel("评分凭据或管理员密码",{exact:true}).fill(credential.token);await page.getByRole("button",{name:"打开记录",exact:true}).click();
  await page.locator("#review article").first().waitFor();const first=page.locator("#review article").first();await first.locator('input[type="number"]').fill("4");await first.getByLabel("评分依据").fill("合成验收：需核对另一侧极限存在且相等。");await first.getByRole("button",{name:"记录独立评分"}).click();await first.getByRole("button",{name:"本次评分已保存"}).waitFor();
  await page.screenshot({path:path.join(dir,"教师盲评页面.png"),fullPage:false});
  const other=(await api("/api/admin/research-sites/timing/raters?mode=formal",{name:"合成教师乙"},admin)).data;
  assert.ok((await api("/api/research-sites/timing/rater?mode=formal",undefined,other.token)).data.items.every(i=>i.reviews.length===0));
  const exported=(await api("/api/admin/research-sites/timing/export?mode=formal",undefined,admin)).data;assert.equal(exported.reviews.length,1);
  assert.ok(!JSON.stringify(exported).includes(token));assert.ok(!JSON.stringify(exported).includes(credential.token));
  assert.equal((await fetch(base+"/lib/research-sites/materials.js")).status,403);
  const result={passed:true,concurrentMutations:true,independentAssessmentProtected:true,raterCannotExportOrCrossProtocol:true,independentRatingUi:true,privateAnswerSourcesBlocked:true};
  fs.writeFileSync(path.join(dir,"结果.json"),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,output:dir}));
 }finally{await browser?.close();if(server.exitCode===null){const done=new Promise(r=>server.once("exit",r));server.kill();await done;}fs.closeSync(log);}
})().catch(e=>{console.error(e);process.exitCode=1;});
