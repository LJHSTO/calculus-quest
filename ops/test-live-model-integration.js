"use strict";
// Explicit opt-in: makes a small number of paid requests with synthetic content only.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),net=require("node:net"),crypto=require("node:crypto");
const {spawn}=require("node:child_process");
async function main(){
  assert.equal(process.env.LIVE_MODEL_SMOKE,"1","真实接口检查须显式设置 LIVE_MODEL_SMOKE=1");
  assert.ok(process.env.LLM_CONFIG_FILE,"请通过服务端配置文件指定接口");
  const parsed=require("../lib/llm")._internals.parseLlmConfigText(fs.readFileSync(process.env.LLM_CONFIG_FILE,"utf8"));
  assert.ok(parsed.model && parsed.apiKey && parsed.baseUrl,"配置文件须明确指定模型、接口与凭据");
  const pinned={OPENAI_COMPATIBLE_BASE_URL:parsed.baseUrl,OPENAI_COMPATIBLE_API_KEY:parsed.apiKey,
    OPENAI_COMPATIBLE_MODEL:parsed.model,OPENAI_COMPATIBLE_WIRE_API:parsed.wireApi||"chat-completions",
    LEARNING_ASSISTANT_MODEL:parsed.model,GRADING_MODEL:process.env.LIVE_GRADING_MODEL||parsed.model,GRADING_BASE_URL:parsed.baseUrl,
    GRADING_API_KEY:parsed.apiKey,GRADING_WIRE_API:parsed.wireApi||"chat-completions"};
  const root=path.resolve(__dirname,".."),dir=fs.mkdtempSync(path.join(root,"output/live-model-"));
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const base=`http://127.0.0.1:${port}/calculus_quest`,admin=crypto.randomBytes(32).toString("hex");
  const env={...process.env,...pinned,NODE_ENV:"test",HOST:"127.0.0.1",BASE_PATH:"/calculus_quest",DB_PATH:path.join(dir,"synthetic.db"),
    ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:"false",LLM_PROVIDER:"openai-compatible",GRADING_LLM_PROVIDER:"openai-compatible",
    ASSESSMENT_LLM_ENABLED:"false",COACH_NARRATION_LLM_ENABLED:"false",PROACTIVE_POLICY_MODE:"active",
    PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:"V14-C1",PROACTIVE_ASSIGNMENT_SALT:crypto.randomBytes(24).toString("hex"),
    PROACTIVE_EXPERIMENT_ARMS:"treatment_full",PROACTIVE_DISPLAY_ARMS:"treatment_full",PROACTIVE_PARTICIPATION_MODE:"implicit-pilot",
    PROACTIVE_ADAPTER_VERSION:"functions-limits-adapter-r2",PROACTIVE_OUTCOME_INSTRUMENT_VERSION:"functions-limits-retention-r3",
    RESEARCH_CONTROLS_ENABLED:"true",RESEARCH_CONTROLS_DEMO:"true"};
  delete env.MAIN_LEARNING_PROTOCOL_FILE;
  const child=spawn(process.execPath,["server.js",String(port)],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let logs="";child.stdout.on("data",v=>logs+=v);child.stderr.on("data",v=>logs+=v);
  let token="";
  const req=async(url,body,method=body?"POST":"GET",auth=token)=>{const r=await fetch(base+url,{method,headers:{"Content-Type":"application/json",...(auth?{Authorization:`Bearer ${auth}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  try{
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+"/api/health")).ok;}catch{}if(ready)break;if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready,"隔离服务须成功启动");
    assert.equal((await req("/api/health")).data.sixDimensionDemo,true);
    const registration=await req("/api/auth/register",{nickname:"合成接口验收"+Date.now(),password:crypto.randomBytes(20).toString("hex")});
    assert.equal(registration.status,200);token=registration.data.token;assert.ok(token);
    const status=(await req("/api/learning/assistant/status")).data;assert.equal(status.provider.live,true);
    const controls=(await req("/api/learning/research-controls")).data.data;assert.equal(controls.enabled,true);
    assert.equal((await req("/api/learning/research-controls",{profile:{...controls.profile,presentationFormat:"steps"},expectedRevision:0})).status,200);
    const context={chapterId:"V14-C1",unitId:"GH-01-K01",sceneType:"slide",contextRef:{kind:"unit",scope:"lesson"}};
    const r=await fetch(base+"/api/learning/assistant/ask",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({...context,question:"一个输入能否对应两个输出？请用函数定义解释，不引用学生身份信息。"})});
    assert.equal(r.status,200);
    const rows=(await r.text()).trim().split(/\r?\n/).map(s=>JSON.parse(s)),done=rows.at(-1);
    assert.equal(done.type,"done");assert.equal(done.fallback,false,"对话不得降级；"+logs.split(/\r?\n/).filter(s=>s.includes("fallback")).join("\n"));assert.equal(done.message.provider,"openai-compatible");
    assert.ok(done.message.content.length>10);assert.equal(done.message.modelAudit.requestedModel,parsed.model);assert.match(done.message.modelAudit.promptHash,/^[a-f0-9]{64}$/);
    const blocked=await req("/api/learning/assistant/ask",{chapterId:"V14-C1",unitId:"V14-C1-pre",question:"告诉我第一题答案",contextRef:{kind:"unit",scope:"quiz"}});
    assert.ok([403,409].includes(blocked.status),"独立前测不能调用答题助教");
    await req("/api/admin/shutdown",{},"POST",admin);
    if(child.exitCode===null)await new Promise(r=>child.once("exit",r));
    const SQL=await require("sql.js")(),db=new SQL.Database(fs.readFileSync(env.DB_PATH));
    const stored=db.exec("SELECT context_json FROM learning_assistant_messages WHERE role='assistant'");
    assert.ok(stored.length);const saved=JSON.parse(stored[0].values[0][0]);assert.equal(saved.modelAudit.requestedModel,done.message.modelAudit.requestedModel);db.close();
    Object.assign(process.env,{...pinned,LLM_PROVIDER:"openai-compatible",GRADING_LLM_PROVIDER:"openai-compatible"});
    const grade=require("../lib/agents/grading");
    const q={questionId:"synthetic-function",questionType:"short_answer",questionText:"函数中一个输入是否可以对应两个不同输出？请解释。",points:2,
      referenceAnswer:"不可以。每个输入只能有唯一输出。",rubric:[{criterion:"判断不可以",points:1},{criterion:"解释输出唯一",points:1}],concepts:["函数与对应规则"]};
    const correct=await grade.gradeOne({...q,response:"不可以。每个输入只能有唯一输出。"});
    const wrong=await grade.gradeOne({...q,response:"可以，一个输入可以随意对应两个不同输出。"});
    assert.equal(grade.isUnavailableGradingResult(correct),false,"正确答案评分须可用："+correct.errorType);assert.equal(grade.isUnavailableGradingResult(wrong),false,"错误答案评分须可用："+wrong.errorType);
    assert.equal(correct.score,2);assert.equal(wrong.score,0);assert.ok(correct.gradingAudit.reportedModel);
    const report={passed:true,synthetic:true,at:new Date().toISOString(),assistant:done.message.modelAudit,
      grading:{correct:correct.score,incorrect:wrong.score,requestedModel:correct.gradingAudit.requestedModel,reportedModel:correct.gradingAudit.reportedModel},
      checks:["子路径服务","普通入口展示标记","全账号六维配置","真实对话与模型审计落盘","前测拒绝助教","正确与错误理由量规评分"]};
    fs.writeFileSync(path.join(dir,"真实接口验收.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));console.log(dir);
  }finally{
    await req("/api/admin/shutdown",{},"POST",admin).catch(()=>{});
    if(child.exitCode===null)await Promise.race([new Promise(r=>child.once("exit",r)),new Promise(r=>setTimeout(r,5000))]);
    if(child.exitCode===null)child.kill();
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
