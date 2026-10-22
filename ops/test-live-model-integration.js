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
  const root=path.resolve(__dirname,"..");fs.mkdirSync(path.join(root,'output'),{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,"output/live-model-"));
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
    const pre=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').flow.preQuiz;
    const inquirySmoke=process.env.LIVE_SUPPORT_INQUIRY==='1';
    const submitted=await req('/api/learning/quiz/submit',{unitId:'V14-C1-pre',chapterId:'V14-C1',phase:'pre',answers:pre.questions.map(q=>({questionId:q.id,response:q.type==='short_answer'?'__unknown__':inquirySmoke&&q.id===pre.questions[0].id?'B':q.type==='multiple'?q.answer:q.answer[0]}))});
    assert.equal(submitted.status,200,submitted.data.message||'前测提交失败');
    await req('/api/learning/proactive/state?chapterId=V14-C1');
    let inquiry=null;
    if(inquirySmoke){
      const events=[0,1,2].map(i=>{const id=crypto.randomUUID(),value={parameter:'input_x',oldValue:String(i),newValue:String(i+1)};return {eventId:id,type:'interaction',payload:{schemaVersion:1,eventId:id,eventType:'parameter_commit',source:'iframe',chapterId:'V14-C1',unitId:'GH-01-K01',unitType:'knowledge',sceneType:'simulation',value,data:{parameter:'input_x',value},timing:{clientAt:new Date(Date.now()-3000+i*1000).toISOString(),durationMs:400}}};});
      assert.equal((await req('/api/learning/events',{events})).status,200);
      const decision=await req('/api/learning/assistant/intervention',{chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'simulation',signal:{kind:'repeated_parameter',parameter:'input_x',oldValue:'2',newValue:'3'},contextRef:{kind:'interaction',scope:'interactive',state:{parameter:'input_x',oldValue:'2',newValue:'3'}}});
      assert.equal(decision.status,200);inquiry=decision.data.study?.supportCycles?.find(c=>c.status==='awaiting_confirmation');
      assert.ok(inquiry,'合格过程与结果证据须触发系统询问');assert.equal(inquiry.need,null);assert.equal(inquiry.content,null);
    }
    const supportResults=[];
    for(const [need,goal] of [['concept','cognitive'],['monitoring','metacognitive'],['value','motivational'],['frustration','emotional'],['planning','behavioral']]){
      let cycle;const attempts=[];
      for(let attempt=0;attempt<2;attempt++){
        const supported=await req('/api/learning/support-cycle',{action:'report',scope:'GH-01-K01',unitId:'GH-01-K01',sceneType:'slide',confirmed:true,need,...(inquiry&&need==='concept'&&attempt===0?{inquiryId:inquiry.id}:{}),note:'合成验收：正在学习输入、输出和函数规则，请围绕当前知识点提供建议。'});
        assert.equal(supported.status,200,supported.data.message);cycle=supported.data.data.cycle;
        if(inquiry&&need==='concept'&&attempt===0){assert.equal(cycle.id,inquiry.id);assert.equal(cycle.initiation,'agent_initiated_confirmation');assert.equal(cycle.content.audit.fallback,false,'系统询问确认后须验证一次真实生成');}
        attempts.push({fallback:cycle.content.audit.fallback,failure:cycle.content.audit.failure||null,latencyMs:cycle.content.audit.latencyMs});
        if(!cycle.content.audit.fallback)break;
        assert.equal((await req('/api/learning/support-cycle',{action:'close',scope:'GH-01-K01',unitId:'GH-01-K01',sceneType:'slide',id:cycle.id})).status,200);
      }
      assert.equal(cycle.plan.primaryGoal,goal);assert.equal(cycle.content.audit.fallback,false,goal+' 必须使用真实接口');
      assert.equal(cycle.content.audit.promptSnapshot,undefined);
      supportResults.push({goal,provider:cycle.content.audit.provider,model:cycle.content.audit.model,latencyMs:cycle.content.audit.latencyMs,fallback:false,attempts});
      assert.equal((await req('/api/learning/support-cycle',{action:'close',scope:'GH-01-K01',unitId:'GH-01-K01',sceneType:'slide',id:cycle.id})).status,200);
    }
    await req("/api/admin/shutdown",{},"POST",admin);
    if(child.exitCode===null)await new Promise(r=>child.once("exit",r));
    const SQL=await require("sql.js")(),db=new SQL.Database(fs.readFileSync(env.DB_PATH));
    const stored=db.exec("SELECT context_json FROM learning_assistant_messages WHERE role='assistant'");
    const supportRows=db.exec('SELECT payload_json FROM learner_support_cycles')[0].values;
    assert.equal(supportRows.length,supportResults.reduce((n,r)=>n+r.attempts.length,0));
    assert.ok(supportRows.every(([raw])=>JSON.parse(raw).content.audit.promptSnapshot.user));
    assert.ok(stored.length);const saved=JSON.parse(stored[0].values[0][0]);assert.equal(saved.modelAudit.requestedModel,done.message.modelAudit.requestedModel);db.close();
    Object.assign(process.env,{...pinned,LLM_PROVIDER:"openai-compatible",GRADING_LLM_PROVIDER:"openai-compatible"});
    const grade=require("../lib/agents/grading");
    const q={questionId:"synthetic-function",questionType:"short_answer",questionText:"函数中一个输入是否可以对应两个不同输出？请解释。",points:2,
      referenceAnswer:"不可以。每个输入只能有唯一输出。",rubric:[{criterion:"判断不可以",points:1},{criterion:"解释输出唯一",points:1}],concepts:["函数与对应规则"]};
    const correct=await grade.gradeOne({...q,response:"不可以。每个输入只能有唯一输出。"});
    const wrong=await grade.gradeOne({...q,response:"可以，一个输入可以随意对应两个不同输出。"});
    assert.equal(grade.isUnavailableGradingResult(correct),false,"正确答案评分须可用："+correct.errorType);assert.equal(grade.isUnavailableGradingResult(wrong),false,"错误答案评分须可用："+wrong.errorType);
    assert.equal(correct.score,2);assert.equal(wrong.score,0);assert.ok(correct.gradingAudit.reportedModel);
    const report={passed:true,synthetic:true,at:new Date().toISOString(),agentInitiatedInquiry:inquiry?{passed:true,confirmedBeforeGeneration:true,psychologicalState:inquiry.inquiry.psychologicalState}:null,assistant:done.message.modelAudit,multiGoalSupport:supportResults,
      grading:{correct:correct.score,incorrect:wrong.score,requestedModel:correct.gradingAudit.requestedModel,reportedModel:correct.gradingAudit.reportedModel},
      checks:["子路径服务","普通入口展示标记","全账号六维配置","真实对话与模型审计落盘","前测拒绝助教","正确与错误理由量规评分"]};
    fs.writeFileSync(path.join(dir,"真实接口验收.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));console.log(dir);
  }finally{
    await req("/api/admin/shutdown",{},"POST",admin).catch(()=>{});
    if(child.exitCode===null)await Promise.race([new Promise(r=>child.once("exit",r)),new Promise(r=>setTimeout(r,5000))]);
    if(child.exitCode===null)child.kill();
  }
}
main().catch(e=>{console.error(e.message);console.error(String(e.stack||'').split('\n').filter(s=>s.includes('test-live-model-integration')).join('\n'));process.exitCode=1;});
