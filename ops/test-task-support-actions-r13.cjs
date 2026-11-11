'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=process.env.SUPPORT_R13_OUTPUT;
assert(out,'请通过 SUPPORT_R13_OUTPUT 指定私有证据目录');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('http://support-fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="zh-CN"><meta charset="utf-8"><body><main class="multi-scene-scene-panel"><div data-knowledge-scene-stage>原课件</div></main></body></html>'}));
  await page.goto('http://support-fixture.test/');
  await page.addStyleTag({path:path.join(root,'app/main/learning-workspace.css')});
  await page.evaluate(()=>{
   window.SupportCycleUI={active:c=>c?.status==='engaged',deferInquiry:()=>false,manualOpen:()=>false};
   window.KnowledgeAssistant={
    createSupportContent(){return document.createDocumentFragment();},
    createTaskMessage(message,{actionable}={}){window.receivedMessage=message;const n=document.createElement('article');n.className='assistant-content';n.textContent=message.content;if(actionable){const b=document.createElement('button');b.textContent='下一道待回看';b.onclick=()=>window.nextClicked=true;n.append(b);}return n;},
    refreshSupportSurface(){TaskSupport.sync(taskSnapshot);},observeSupportOffer(){},trackSupportSurface(){},
   };
   window.taskSnapshot={ownerKey:'synthetic-r13',generation:0,learningGeneration:1,runId:'run-one',scopeKey:'GH-01-K01',unitId:'GH-01-K01',sceneType:'slide',unitType:'knowledge',signedIn:true,active:true,locked:false,taskReady:true,view:{placement:'inline',modality:'tip'},supportCycle:{id:'cycle',status:'engaged'},taskMessages:[{id:'user',role:'user',content:'请解释这题'},{id:'answer',role:'assistant',content:'先比较输入和输出。',contextRef:{questionId:'q1'},guidance:{focusQuestionId:'q1',quizReviewProgress:{reviewIndex:0,reviewTotal:2}}}]};
  });
  await page.addScriptTag({path:path.join(root,'app/main/task-support.js')});await page.evaluate(()=>TaskSupport.sync(taskSnapshot));
  assert.equal(await page.getByRole('button',{name:'下一道待回看',exact:true}).count(),1,'任务旁必须保留消息操作，不能只呈现正文');
  assert.equal(await page.evaluate(()=>receivedMessage.guidance.quizReviewProgress.reviewTotal),2,'不能丢失服务器复盘状态');
  await page.getByRole('button',{name:'下一道待回看',exact:true}).click();assert.equal(await page.evaluate(()=>nextClicked),true);
  await page.addStyleTag({path:path.join(root,'app/main/knowledge-assistant.css')});
  await page.addStyleTag({content:'.fixture-scroll{position:fixed;inset:60px 0 54px;overflow:auto}.classroom-footer{position:fixed;bottom:0;left:0;right:0;height:54px;background:#fff;border-top:1px solid #ccc}.task-support-panel{padding:12px}.question-card{margin:0 12px}'});
  await page.evaluate(()=>{
    TaskSupport.clear();document.body.innerHTML='<div id="learn-view"><main class="fixture-scroll"><article class="question-card" data-question="q1"><h3>第1题</h3></article><article class="question-card" data-question="q2"><h3>第2题</h3></article></main><footer class="classroom-footer">课程底栏</footer></div>';
    window.quizRecordsForUnit=()=>[{questionId:'q1',isCorrect:false},{questionId:'q2',isCorrect:false}];
    KnowledgeAssistant.createTaskMessage=message=>{const article=document.createElement('article');article.className='knowledge-message assistant';const body=document.createElement('div');body.className='assistant-content';body.textContent=message.content.repeat(15);article.append(body);return article;};
    taskSnapshot={...taskSnapshot,unitType:'quiz',quizSubmitted:true,supportCycle:null,replyQuestionId:'q1',quizResourceUnitId:'GH-01-K01',taskMessages:Array.from({length:6},(_,i)=>[{id:'u'+i,role:'user',content:'我想继续核对输入输出。'},{id:'a'+i,role:'assistant',content:'先看同一个输入是否只有一个输出。',contextRef:{questionId:'q1'}}]).flat()};TaskSupport.sync(taskSnapshot);TaskSupport.openConversation('q1');
  });
  const layouts=[];
  for(const width of [1440,1024,390]){await page.setViewportSize({width,height:900});await page.evaluate(()=>TaskSupport.locate());await page.waitForTimeout(100);const layout=await page.evaluate(()=>{const send=document.querySelector('.task-response-form button[type=submit]').getBoundingClientRect(),footer=document.querySelector('.classroom-footer').getBoundingClientRect(),input=document.querySelector('.task-response-form textarea').getBoundingClientRect();return{sendBottom:send.bottom,sendTop:send.top,footerTop:footer.top,inputBottom:input.bottom};});layouts.push({width,...layout});assert(layout.sendBottom<=layout.footerTop+1,'发送按钮不能落入固定课程底栏：'+JSON.stringify({width,...layout}));assert(layout.sendTop>=0);await page.screenshot({path:path.join(out,'局部布局-'+width+'.png')});}
  fs.writeFileSync(path.join(out,'输入发送局部几何.json'),JSON.stringify({passed:true,fixture:true,layouts},null,2));
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'消息操作回归.json'),JSON.stringify({passed:true,checks:['任务旁复用完整消息渲染','服务器复盘状态保留','下一题操作可点击'],errors},null,2));
  console.log('r13 消息操作回归通过');
 }catch(error){await page.screenshot({path:path.join(out,'消息操作失败.png')});fs.writeFileSync(path.join(out,'消息操作失败.json'),JSON.stringify({passed:false,message:error.message,errors},null,2));throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
