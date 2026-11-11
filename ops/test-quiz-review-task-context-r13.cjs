'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=process.env.SUPPORT_R13_OUTPUT;
assert(out,'请通过 SUPPORT_R13_OUTPUT 指定私有证据目录');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'app/main/knowledge-assistant.js'),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,'源函数边界必须存在：'+start);return source.slice(a,b);}
const reviewSource=section('  function setMessageQuizReviewProgress(','  function taskMessageActions(');
const askSource=section('    async askInTask(question, questionId="") {','    async supportAction(').trim().replace(/^async askInTask\(/,'async function askInTask(').replace(/,\s*$/,'');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.route('http://review-context.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body><main id="learn-view"><article class="question-card" data-question="q1"><h3>第1题</h3></article><article class="question-card" data-question="q2"><h3>第2题</h3></article></main><aside hidden><textarea id="legacy-composer"></textarea></aside></body></html>'}));
  await page.goto('http://review-context.test/');
  await page.addStyleTag({path:path.join(root,'app/main/learning-workspace.css')});
  await page.addStyleTag({path:path.join(root,'app/main/knowledge-assistant.css')});
  await page.addScriptTag({path:path.join(root,'app/main/task-support.js')});
  await page.evaluate(({reviewSource,askSource})=>{
   window.SupportCycleUI={active:()=>false,deferInquiry:()=>false,manualOpen:()=>false};
   window.quizRecordsForUnit=()=>[{questionId:'q1',isCorrect:false},{questionId:'q2',isCorrect:false}];
   new Function('global',`
    const meta={chapterId:'chapter',unitId:'quiz',unitType:'quiz',sceneType:'slide',isQuiz:true,quizSubmitted:true,supported:true};
    const state={authToken:'synthetic-browser-only'};
    const els={input:document.getElementById('legacy-composer')};
    const Core={normalizeContextRef:ref=>ref};
    let activeContext={kind:'quiz',scope:'quiz',questionId:'q1'},isAsking=false,activeConversationId='synthetic-conversation';
    let pendingAssistantIntent='',pendingGeneratedDraft='',pendingProactivePrompt=null,currentQuestion='q1';
    const submissions=[],statuses=[],requests=[];
    let messages=[{id:'u1',role:'user',content:'请解释第1题'},{id:'a1',role:'assistant',content:'先看输入与输出。',contextRef:{questionId:'q1'},guidance:{quizReviewProgress:{status:'awaiting_choice',reviewIndex:0,reviewTotal:2}}}];
    const courseMeta=()=>meta,supportSurfaceOwnsContent=()=>true,resizeComposer=()=>{},track=()=>{};
    const setStatus=(text,tone)=>statuses.push({text,tone});
    const fetch=async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);if(body.action==='next')currentQuestion='q2';return{ok:true,json:async()=>({progress:{status:body.action==='stop'?'stopped':'prompted',reviewIndex:body.action==='next'?1:0,targetReviewIndex:body.action==='next'?1:0,reviewTotal:2},prompt:{interventionId:'intervention-'+currentQuestion,questionId:currentQuestion,content:'请判断'+currentQuestion+'的关系。'}})};};
    function designSpaceSnapshot(){return{...meta,ownerKey:'synthetic-browser-review',generation:1,learningGeneration:1,runId:'fixture',scopeKey:'quiz',signedIn:true,active:true,locked:false,taskReady:true,busy:isAsking,view:{placement:'inline',modality:'tip'},replyQuestionId:messages.filter(m=>m.role==='assistant').at(-1)?.contextRef?.questionId||'',taskMessages:messages,prompt:pendingProactivePrompt};}
    function render(){global.TaskSupport.sync(designSpaceSnapshot());}
    async function submitQuestion(){submissions.push({question:els.input.value,questionId:activeContext?.questionId,interventionId:pendingProactivePrompt?.interventionId||''});messages.push({id:'u'+(messages.length+1),role:'user',content:els.input.value},{id:'a'+(messages.length+2),role:'assistant',content:'已收到当前题理解。',contextRef:activeContext});els.input.value='';pendingProactivePrompt=null;render();}
    ${reviewSource}
    ${askSource}
    global.KnowledgeAssistant={designSpaceSnapshot,askInTask,refreshSupportSurface:render,observeSupportOffer(){},trackSupportSurface(){},createSupportContent(){const fragment=document.createDocumentFragment();if(pendingProactivePrompt){const prompt=document.createElement('p');prompt.textContent=pendingProactivePrompt.content;fragment.append(prompt);}return fragment;},createTaskMessage(message,options){const article=document.createElement('article');article.className='knowledge-message assistant';const body=document.createElement('p');body.textContent=message.content;article.append(body);const followUp=quizReviewFollowUpNode(message,{actionable:options.actionable});if(followUp)article.append(followUp);return article;}};
    global.__reviewFixture={submissions,statuses,requests,get pendingPrompt(){return pendingProactivePrompt;},get messages(){return messages;}};
    render();global.TaskSupport.openConversation('q1');
   `)(window);
  },{reviewSource,askSource});
  assert.equal(await page.evaluate(()=>TaskSupport.selectedQuestion),'q1');
  await page.getByRole('button',{name:'下一题',exact:true}).click();
  await page.waitForFunction(()=>__reviewFixture.pendingPrompt?.questionId==='q2');
  assert.equal(await page.evaluate(()=>TaskSupport.selectedQuestion),'q2','下一题成功后必须同步任务旁题号');
  assert.equal(await page.locator('.task-support-panel').evaluate(node=>node.parentElement.dataset.question),'q2','帮助面板必须移到下一题');
  await page.waitForFunction(()=>document.activeElement?.matches('.task-response-form textarea'));
  const input=page.locator('.task-response-form textarea');
  assert.match(await input.getAttribute('data-task-draft-key'),/:conversation:q2$/,'草稿必须属于下一题');
  await input.fill('我认为第二题要比较输入与输出的对应关系。');
  await page.getByRole('button',{name:'发送我的想法',exact:true}).click();
  await page.waitForFunction(()=>__reviewFixture.submissions.length===1);
  const evidence=await page.evaluate(()=>({submissions:__reviewFixture.submissions,selectedQuestion:TaskSupport.selectedQuestion,requests:__reviewFixture.requests,statuses:__reviewFixture.statuses}));
  assert.equal(evidence.submissions[0].questionId,'q2','继续交流不能回到旧题');
  assert.equal(evidence.submissions[0].interventionId,'intervention-q2','下一题的服务器复盘上下文不能被旧题清掉');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'错题切换上下文.png')});
  fs.writeFileSync(path.join(out,'错题切换上下文.json'),JSON.stringify({passed:true,fixture:true,scope:'真实浏览器、真实任务旁脚本及提取的复盘和提问函数；网络与模型采用桩，不代表平台API验收',checks:['下一题同步所选题号','帮助面板随题移动','当前任务输入获得焦点','下一题草稿独立保存','继续交流保留新题号与复盘上下文'],...evidence,errors},null,2),'utf8');
  console.log('r13 错题切换上下文回归通过');
 }catch(error){await page.screenshot({path:path.join(out,'错题切换上下文失败.png')});fs.writeFileSync(path.join(out,'错题切换上下文失败.json'),JSON.stringify({passed:false,message:error.message,errors},null,2),'utf8');throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
