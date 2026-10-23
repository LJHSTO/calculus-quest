"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto");
const {spawn}=require("node:child_process"),{chromium}=require("playwright-core");
(async()=>{
 const root=path.resolve(__dirname,".."),dir=fs.mkdtempSync(path.join(root,"output/cross-entry-auth-"));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=`http://127.0.0.1:${port}/calculus_quest`,checks=[];
 const server=spawn(process.execPath,["server.js",String(port)],{cwd:root,windowsHide:true,stdio:"ignore",env:{...process.env,NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"/calculus_quest",DB_PATH:path.join(dir,"synthetic.db"),LLM_PROVIDER:"mock",GRADING_LLM_PROVIDER:"mock",MAIN_LEARNING_PROTOCOL_FILE:"",RESEARCH_SITES_CONFIG_FILE:"",PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r4",RATE_LIMIT_MAX:"5000"}});
 let browser,page;
 const post=async(route,body)=>{const r=await fetch(base+route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();};
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+"/api/health")).ok)break;}catch{}if(server.exitCode!==null)throw Error("隔离服务启动失败");await new Promise(r=>setTimeout(r,100));}
  const password=crypto.randomUUID(),a=await post("/api/auth/register",{nickname:"跨入口甲"+Date.now(),password}),b=await post("/api/auth/register",{nickname:"跨入口乙"+Date.now(),password});
  browser=await chromium.launch({channel:"chrome",headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(base+"/studies/authorization/");
  await page.evaluate(token=>sessionStorage.setItem("calculus-quest-auth-token-v1",token),a.token);
  await page.goto(base+"/");await page.locator("#auth-gate").waitFor({state:"hidden"});
  assert.equal(await page.evaluate(()=>state.participant.participantId),a.participant.participantId);checks.push("仅有研究入口令牌时恢复原站身份");
  await page.evaluate(()=>{state.quizDrafts={"A-only":{marker:"甲的未提交草稿"}};persistStateLocally();});
  await page.evaluate(token=>sessionStorage.setItem("calculus-quest-auth-token-v1",token),b.token);await page.reload();await page.locator("#auth-gate").waitFor({state:"hidden"});
  assert.equal(await page.evaluate(()=>state.participant.participantId),b.participant.participantId);
  assert.equal(await page.evaluate(()=>state.quizDrafts["A-only"]),undefined);
  assert.ok(await page.evaluate(pid=>JSON.parse(localStorage.getItem(`calculus-quest-openmaic-v14-player-v1:${pid}`)).quizDrafts["A-only"],a.participant.participantId));checks.push("账号切换不混入另一人的草稿，原草稿仍保留");
  await page.evaluate(()=>sessionStorage.setItem("calculus-quest-auth-token-v1","invalid-synthetic-token"));await page.reload();await page.waitForFunction(()=>!sessionStorage.getItem("calculus-quest-auth-token-v1"));
  assert.ok(await page.locator("#auth-gate").isVisible());assert.equal(await page.evaluate(()=>state.participant),null);checks.push("过期令牌清除，不恢复旧账号");
  await page.goto(base+"/studies/authorization/");await page.getByLabel("账号或邮箱",{exact:true}).fill(a.participant.nickname);await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"登录并继续",exact:true}).click();await page.getByRole("button",{name:"开始",exact:true}).waitFor();
  await page.goto(base+"/");await page.locator("#auth-gate").waitFor({state:"hidden"});assert.equal(await page.evaluate(()=>state.participant.participantId),a.participant.participantId);checks.push("研究页实际登录后返回原站无需重新注册或登录");
  fs.writeFileSync(path.join(dir,"结果.json"),JSON.stringify({passed:true,synthetic:true,checks},null,2));console.log(JSON.stringify({passed:true,checks,output:dir}));
 }catch(error){await page?.screenshot({path:path.join(dir,"失败.png")}).catch(()=>{});throw error;}
 finally{await browser?.close();if(server.exitCode===null){const ended=new Promise(r=>server.once("exit",r));server.kill();await ended;}}
})().catch(error=>{console.error(error);process.exitCode=1;});
