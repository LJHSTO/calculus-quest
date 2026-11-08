'use strict';
// Controlled browser reproducer: actual UI modules and real in-memory support store; no platform service or real participant data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),deps=require,{chromium}=require('playwright-core');
const goals=require(root+'/lib/support-goals'),{createStore}=require(root+'/lib/support-cycle'),{defaults}=require(root+'/lib/research-controls'),adapter=require(root+'/lib/proactive-policy/adapters/functions-limits-r10');
const out=path.join(root,'tmp/support-state-r11-browser');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(root+'/app/main/knowledge-assistant.js','utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const section=(a,b)=>{const x=source.indexOf(a),y=source.indexOf(b,x+1);assert(x>=0&&y>x);return source.slice(x,y);};
const checks=[];const observe=(name,expected,actual,details={})=>checks.push({name,expected,actual,passed:actual===expected,...details});
async function origin(page,body){await page.route('http://support-fixture.test/**',route=>route.fulfill({contentType:'text/html',body}));await page.goto('http://support-fixture.test/');}
async function main(){
 const SQL=await deps('sql.js')(),database=new SQL.Database(),events=[],db={getDbSync:()=>database,saveNow(){},insertEvent:e=>events.push(e)},store=createStore({db,experimentId:'r11-repro-only'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];let current;
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await origin(page,'<html lang="zh-CN"><meta charset="utf-8"><body><div id="learn-view"><aside id="lesson-rail" style="position:absolute;width:230px;left:0;top:0">本章路径：当前知识点</aside><main class="multi-scene-scene-panel" style="margin-left:240px"><div class="multi-scene-selected-resource has-resource"><div data-knowledge-scene-stage>原课件区域</div></div></main><section data-quiz-support-host></section><div id="quiz-cards"></div></div></body></html>');
  await page.addStyleTag({path:root+'/app/main/learning-workspace.css'});
  await page.addScriptTag({path:root+'/app/main/support-cycle.js'});
  await page.addScriptTag({path:root+'/app/main/task-support.js'});
  await page.exposeFunction('applyRealCycle',command=>{current=store.act('synthetic',current.id,1,command,{adapter});return current;});
  current=store.report('synthetic','GH-01-K02',1,{need:'concept',confirmed:true},{...defaults,boundaryOnly:false,initialSupportLevel:'L2'},0);
  current=await store.advance('synthetic','GH-01-K02',1,{guard:()=>({profileRevision:0,protected:false,boundary:true,disabled:false,occupied:false}),generate:input=>goals.generateSupport(input,{live:false})});
  await page.addScriptTag({content:`
    const global=window,state={participant:{participantId:'synthetic'}},exposureGeneration=1;
    let proactiveCheckFeedback=null;const courseMeta=()=>window.fixture,proactiveScopeKey=m=>m.scopeKey,isSignedInNow=()=>true;
    const proactiveStudy={agentRuntime:{memory:[]},policyStates:[]};Object.defineProperty(proactiveStudy,'supportCycles',{get:()=>window.fixture?[fixture.supportCycle].filter(Boolean):[]});
    const setQuestionMathContent=(node,value)=>node.textContent=value;
    const render=()=>KnowledgeAssistant.refreshSupportSurface();
    ${section('  function feedbackStorageKey(','  function designSpaceSnapshot(')}
    ${section('  function proactiveCheckFeedbackNode(','  function proactiveInlineOfferNode(')}
  `});
  await page.evaluate(c=>{
   window.fixture={ownerKey:'synthetic',generation:1,scopeKey:c.scope,unitId:c.scope,sceneType:'slide',unitType:'knowledge',signedIn:true,active:true,locked:false,check:null,taskReady:true,researchControls:{enabled:true},view:{placement:'inline',modality:'tip',format:'plain'},supportCycle:c,taskMessages:[],busy:false};
   window.LearningWorkspace={showTask(){}};
   window.KnowledgeAssistant={
    createSupportContent(){const f=document.createDocumentFragment();f.append(SupportCycleUI.render(fixture));if(fixture.feedback)f.append(proactiveCheckFeedbackNode(fixture.feedback));return f;},
    refreshSupportSurface(){fixture.feedback=currentCheckFeedback(fixture);fixture.supportBusy=SupportCycleUI.busy;TaskSupport.sync(fixture);},
    async supportCycleRequest(command){fixture.supportCycle=await applyRealCycle(command);this.refreshSupportSurface();},
    observeSupportOffer(){},trackSupportSurface(){},askInTask:async()=>true
   };KnowledgeAssistant.refreshSupportSurface();
  },current);
  await page.getByRole('button',{name:'做一次独立检查',exact:true}).click();
  await page.waitForFunction(()=>fixture.supportCycle.status==='awaiting_check'&&!SupportCycleUI.busy);
  const rail=await page.locator('#lesson-rail').evaluate(n=>getComputedStyle(n).visibility);
  observe('检查中路径栏应可见且锁定，而不是整栏隐去','visible',rail);
  await page.screenshot({path:out+'/检查中路径栏.png'});
  const answer=current.check.options.find(x=>adapter.gradeVerificationCheck({knowledgePointId:current.scope,supportLevel:'L1',checkId:current.check.id,response:x.value})?.correct);
  await page.getByRole('button',{name:answer.label,exact:true}).click();
  await page.getByRole('button',{name:'提交独立检查',exact:true}).click();
  await page.waitForFunction(()=>fixture.supportCycle.status==='closed'&&!SupportCycleUI.busy);
  const result=await page.evaluate(()=>({text:document.body.innerText,panels:document.querySelectorAll('.task-support-panel').length,cycle:fixture.supportCycle.status,correct:fixture.supportCycle.checkResult.correct}));
  observe('真实存储已收到正确检查结果后，任务面板保留可见反馈',true,/本轮检查通过/.test(result.text),{serverClosed:current.status==='closed',serverProtects:store.protects('synthetic',1),panelCount:result.panels});
  await page.screenshot({path:out+'/检查提交后反馈消失.png'});
  await page.evaluate(()=>{window.completedFixture=fixture;fixture={...fixture,unitId:'other',scopeKey:'other',supportCycle:null};KnowledgeAssistant.refreshSupportSurface();});
  observe('切换知识点不把上一题反馈挂到新知识点',0,await page.locator('.knowledge-proactive-check-feedback').count());
  await page.evaluate(c=>{fixture={...completedFixture,supportCycle:c};KnowledgeAssistant.refreshSupportSurface();},store.current('synthetic','GH-01-K02',1));
  observe('返回原知识点从持久记录恢复反馈',true,await page.getByText('本轮检查通过',{exact:true}).isVisible());
  await page.getByRole('button',{name:'收起结果，继续学习',exact:true}).click();
  observe('明确收起后不再占据学习区',0,await page.locator('.knowledge-proactive-check-feedback').count());
  observe('收起只确认已读，历史解释仍可回看',true,await page.evaluate(()=>Boolean(checkFeedbackHistory(fixture)[0]?.explanation)));
  await page.evaluate(()=>{
   document.getElementById('quiz-cards').innerHTML='<article class="question-card" data-question="q1"><h3>第一题</h3></article><article class="question-card" data-question="q2"><h3>第二题</h3></article>';
   fixture={...fixture,ownerKey:'quiz-fixture',unitType:'quiz',unitId:'quiz-unit',scopeKey:'quiz-scope',sceneType:'quiz',supportCycle:null,quizSubmitted:true,researchControls:{enabled:false},supportBusy:false};KnowledgeAssistant.refreshSupportSurface();
  });
  await page.locator('.question-card[data-question="q2"]').getByRole('button',{name:'和知点讨论这道题',exact:true}).click();
  const anchor=await page.evaluate(()=>({inTarget:!!document.querySelector('.question-card[data-question="q2"] .task-support-panel'),inTopHost:!!document.querySelector('[data-quiz-support-host] .task-support-panel')}));
  observe('第二题求助应附着第二题而不是全局顶端',true,anchor.inTarget,anchor);
  await page.close();

  // Execute the actual message renderer and public workspace snapshot together.
  const sidebar=await browser.newPage();sidebar.on('pageerror',e=>errors.push(e.message));await origin(sidebar,'<html lang="zh-CN"><meta charset="utf-8"><body><button id="open">打开知点</button><div id="messages"></div></body></html>');
  const renderer=section('  function renderMessages() {','  function renderProactiveOutcomeEntry() {');
  const workspace=section('    workspaceSnapshot() {','    editWorkspaceNote(').trim().replace(/^workspaceSnapshot\(\)/,'function workspaceSnapshot()').replace(/,\s*$/,'');
  await sidebar.addScriptTag({content:`
   let messagesRenderKey='',messages=[],pendingProactivePrompt=null,loadingHistory=false,isOpen=true,proactiveCheckSelection='',proactiveCheckSubmitting=false,openMessageSourceId='',supportView={placement:'inline',modality:'tip'},noteSyncState='synced';
   const pendingIndependentCheck=()=>null,checkFeedbackHistory=()=>[],designSpaceSnapshot=()=>({offer:proactiveDecision,supportCycle:null});const meta={unitId:'quiz',unitLabel:'检测',chapterId:'V14-C1',sceneType:'quiz'},state={participant:{participantId:'synthetic',nickname:'合成'}},proactiveStudy={loaded:false};let proactiveStudyKey='';
   const proactiveDecision={unitId:'quiz',sceneType:'quiz',serverIssued:true},els={messages:document.getElementById('messages'),empty:document.createElement('div')};els.empty.textContent='可以在这里提问';
   const scheduleDesignSpaceSync=()=>{},courseMeta=()=>meta,syncProactiveCheckState=()=>null,currentCheckFeedback=()=>null,supportSurfaceOwnsContent=()=>true,quizAssistantLocked=()=>false,proactiveVerificationCheck=()=>null,activeProactiveOutcomeSession=()=>null,isSignedInNow=()=>true,proactiveStudyManaged=()=>true,Notes={notesFor:()=>[]},noteOwnerKey=()=>'';
   ${renderer}\n${workspace}\nwindow.getWorkspace=workspaceSnapshot;document.getElementById('open').onclick=renderMessages;
  `});
  await sidebar.getByRole('button',{name:'打开知点',exact:true}).click();
  const empty=await sidebar.evaluate(()=>({pending:getWorkspace().pendingSupport,text:document.getElementById('messages').innerText,children:document.getElementById('messages').childNodes.length}));
  observe('知点显示有待办时，打开应有内容或明确定位入口',true,!empty.pending||empty.text.trim().length>0,empty);
  await sidebar.screenshot({path:out+'/徽标有待办但侧栏空白.png'});await sidebar.close();

  // Legacy feedback expires after six seconds without an acknowledgement.
  const legacy=await browser.newPage();legacy.on('pageerror',e=>errors.push(e.message));await origin(legacy,'<html lang="zh-CN"><meta charset="utf-8"><body><button id="submit">提交检查</button><div id="feedback"></div></body></html>');
  const submit=section('  async function submitProactiveVerification(','  function proactiveVerificationNode(');
  const currentFeedback=section('  function feedbackStorageKey(','  function designSpaceSnapshot(');
  await legacy.addScriptTag({content:`
   const global=window,state={authToken:'synthetic',participant:{participantId:'synthetic'}},exposureGeneration=1,proactiveStudy={supportCycles:[],agentRuntime:{memory:[]},policyStates:[]},meta={unitId:'quiz',chapterId:'V14-C1',knowledgePointId:'GH-01-K02',sceneType:'quiz',isQuiz:true};
   let proactiveCheckSubmitting=false,proactiveCheckSelection='1',proactiveCheckStartedAt=0,proactiveCheckFeedback=null,proactiveDecision=null,proactiveCandidateId='';
   let now=100000;Date.now=()=>now;const timers=[];window.setTimeout=(fn,ms)=>{timers.push({fn,at:now+ms});return timers.length;};
   const courseMeta=()=>meta,proactiveScopeKey=()=>meta.knowledgePointId,track=()=>{},renderMessages=()=>{},serverAuthorizedProactiveDecision=()=>false,applyProactiveStudy=()=>{};
   const render=()=>{document.getElementById('feedback').textContent=currentCheckFeedback()?.text||'';};
   window.fetch=async()=>({ok:true,json:async()=>({ok:true,checkResult:{status:'correct'},decision:{intervene:false}})});window.TaskSupport={leaveConversation(){}};
   ${currentFeedback}\n${submit}\nwindow.advanceFeedback=ms=>{now+=ms;for(const t of timers.splice(0))if(t.at<=now)t.fn();};document.getElementById('submit').onclick=()=>submitProactiveVerification({id:'synthetic-check'});
  `});
  await legacy.getByRole('button',{name:'提交检查',exact:true}).click();await legacy.waitForFunction(()=>document.getElementById('feedback').textContent.includes('判断正确'));
  await legacy.evaluate(()=>advanceFeedback(12000));
  observe('旧介入检查反馈应保留至学生确认，不应六秒后消失',true,(await legacy.locator('#feedback').innerText()).includes('判断正确'));
  const isolated=await legacy.evaluate(async()=>{
    proactiveCheckFeedback=null;let release;
    window.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({ok:true,checkResult:{status:'correct'},decision:{intervene:false}})});});
    const request=submitProactiveVerification({id:'late-synthetic-check'});state.authToken='different-synthetic-owner';release();
    return {accepted:await request,feedback:proactiveCheckFeedback};
  });
  observe('切换账号后迟到的检查响应不能进入新账号反馈',true,isolated.accepted===false&&isolated.feedback===null);
  await legacy.close();
  assert.deepEqual(errors,[],'浏览器fixture本身不应有脚本错误');
  const report={passed:checks.every(x=>x.passed),expectedBaselineFailures:false,checks,errors,scope:'实际浏览器UI模块+真实SQL支持cycle；旧介入renderer使用受控传输，非平台HTTP完整端到端',sourceHashes:Object.fromEntries(['app/main/support-cycle.js','app/main/task-support.js','app/main/knowledge-assistant.js','app/main/learning-workspace.css','lib/support-cycle.js'].map(f=>[f,sha(f)]))};
  fs.writeFileSync(out+'/regression-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
 }finally{await browser.close();database.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
