'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SUPPORT_R12_OUTPUT||path.join(root,'tmp/support-drafts-r12'));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
 const snapshot={ownerKey:'synthetic-drafts',generation:0,learningGeneration:1,runId:'run-one',scopeKey:'GH-01-K01',unitId:'GH-01-K01',sceneType:'slide',unitType:'knowledge',signedIn:true,active:true,locked:false,taskReady:true,researchControls:{enabled:true},view:{format:'plain'},supportCycle:null};
 const mount=async snap=>{await page.goto('http://draft-fixture.test/');await page.addScriptTag({path:path.join(root,'app/main/support-cycle.js')});await page.evaluate(s=>{window.snap=s;window.KnowledgeAssistant={refreshSupportSurface(){document.body.replaceChildren(SupportCycleUI.render(snap));},supportCycleRequest:async()=>{}};SupportCycleUI.sync(snap);SupportCycleUI.openManual();KnowledgeAssistant.refreshSupportSurface();},snap);};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://draft-fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="zh-CN"><meta charset="utf-8"><body></body></html>'}));
 try{
  await mount(snapshot);await page.getByRole('button',{name:'概念或步骤没弄懂',exact:true}).click();
  await page.getByText('补充一句（选填）',{exact:true}).click();await page.getByLabel('想补充的目标或困难',{exact:true}).fill('我想区分输入与输出，先保留这句话。');
  await mount(snapshot);assert.equal(await page.getByLabel('想补充的目标或困难',{exact:true}).inputValue(),'我想区分输入与输出，先保留这句话。','刷新应恢复尚未提交的帮助说明');
  assert.equal(await page.getByRole('button',{name:'概念或步骤没弄懂',exact:true}).getAttribute('aria-pressed'),'true');
  for(const change of [{ownerKey:'other'},{learningGeneration:2},{runId:'run-two'}]){await mount({...snapshot,...change});assert.equal(await page.getByLabel('想补充的目标或困难',{exact:true}).inputValue(),'','不能跨账号、学习代次或实验轮次恢复草稿');}
  const check={...snapshot,supportCycle:{id:'cycle-one',status:'awaiting_check',check:{id:'check-one',prompt:'选择一个回答',options:[{value:'A',label:'输入'},{value:'B',label:'输出'}]}}};
  await mount(check);await page.getByRole('button',{name:'输出',exact:true}).click();await mount(check);assert.equal(await page.getByRole('button',{name:'输出',exact:true}).getAttribute('aria-pressed'),'true','待答检查选项刷新后恢复');
  await mount({...check,supportCycle:{...check.supportCycle,check:{...check.supportCycle.check,id:'check-two'}}});assert.equal(await page.getByRole('button',{name:'输出',exact:true}).getAttribute('aria-pressed'),'false','新检查不能沿用上一题选项');
  const source=fs.readFileSync(path.join(root,'app/main/knowledge-assistant.js'),'utf8');
  const section=(a,b)=>{const x=source.indexOf(a),y=source.indexOf(b,x+1);assert(x>=0&&y>x);return source.slice(x,y);};
  await page.goto('http://draft-fixture.test/');
  await page.addScriptTag({content:`
    const global=window,state={participant:{participantId:'owner-one'}},Core={normalizeContextRef:x=>x};
    let learningSnapshotGeneration=1,exposureGeneration=0,composerDraftKey='',activeContext=null;
    let meta={chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'slide'};
    window.ThreeArmStudyUI={run:{id:'run-one'}};
    document.body.innerHTML='<textarea id="composer"></textarea>';
    const els={input:document.getElementById('composer')},isSignedInNow=()=>true,courseMeta=()=>meta,resizeComposer=()=>{};
    ${section('  function learnerDraftKey(','  function supportSurfaceOwnsContent(')}
    restoreComposerDraft();els.input.oninput=saveComposerDraft;
    window.inspectDraft=()=>({text:els.input.value,context:activeContext,key:composerDraftKey});
    window.changeDraftScope=changes=>{saveComposerDraft();Object.assign(meta,changes);restoreComposerDraft();};
    window.restoreDraft=()=>{composerDraftKey='';els.input.value='';restoreComposerDraft();};
    window.changeDraftIdentity=changes=>{saveComposerDraft();if(changes.owner)state.participant.participantId=changes.owner;if(changes.generation)learningSnapshotGeneration=changes.generation;if(changes.run)ThreeArmStudyUI.run.id=changes.run;restoreComposerDraft();};
  `});
  await page.locator('#composer').fill('还有一半问题没有发出去');await page.evaluate(()=>restoreDraft());assert.equal(await page.locator('#composer').inputValue(),'还有一半问题没有发出去');
  await page.evaluate(()=>changeDraftScope({sceneType:'game'}));assert.equal(await page.locator('#composer').inputValue(),'还有一半问题没有发出去');await page.evaluate(()=>changeDraftScope({unitId:'GH-01-K02'}));assert.equal(await page.locator('#composer').inputValue(),'');await page.locator('#composer').fill('另一个知识点的问题');await page.evaluate(()=>changeDraftScope({unitId:'GH-01-K01'}));assert.equal(await page.locator('#composer').inputValue(),'还有一半问题没有发出去');
  for(const identity of [{owner:'owner-two'},{generation:2},{run:'run-two'}]){await page.evaluate(change=>changeDraftIdentity(change),identity);assert.equal(await page.locator('#composer').inputValue(),'');}
  await page.goto('http://draft-fixture.test/');await page.evaluate(()=>{document.body.innerHTML='<main class="multi-scene-scene-panel"><div data-knowledge-scene-stage>原课件</div></main>';window.SupportCycleUI={active:()=>false,deferInquiry:()=>false,manualOpen:()=>false};window.KnowledgeAssistant={createSupportContent(){const n=document.createElement('article');n.className='knowledge-proactive-check-feedback';n.innerHTML='<h4>首次检查结果：仍需巩固</h4><p>原始反馈应始终可读。</p>';return n;},refreshSupportSurface(){TaskSupport.sync(window.taskSnapshot);},observeSupportOffer(){},trackSupportSurface(){}};window.taskSnapshot={ownerKey:'synthetic-feedback',generation:0,learningGeneration:1,runId:'run-one',scopeKey:'GH-01-K01',unitId:'GH-01-K01',sceneType:'slide',unitType:'knowledge',signedIn:true,active:true,locked:false,taskReady:true,view:{placement:'inline',modality:'tip'},supportCycle:{id:'known-cycle',status:'engaged'},taskMessages:[{role:'user',content:'请解释一下'},{role:'assistant',content:'可以从输入输出关系入手'}],feedback:{id:'known-result',tone:'warning'}};});
  await page.addScriptTag({path:path.join(root,'app/main/task-support.js')});await page.evaluate(()=>TaskSupport.sync(taskSnapshot));
  assert.equal(await page.locator('.knowledge-proactive-check-feedback').evaluate(n=>Boolean(n.closest('.task-conversation-scroll'))),false,'检查结果不能包进自动滚到底的聊天历史容器');
  assert.equal(await page.locator('.task-conversation-scroll .task-conversation-reply').count(),1);
  await page.evaluate(()=>{const cards=document.createElement('div');cards.innerHTML='<article class="question-card" data-question="q1"></article><article class="question-card" data-question="q2"></article>';document.body.append(cards);TaskSupport.openConversation('q2');});
  await page.addScriptTag({content:`const global=window,setQuestionMathContent=(n,s)=>n.textContent=s,courseMeta=()=>({isQuiz:true,quizSubmitted:true}),getUnit=()=>null,acknowledgeCheckFeedback=()=>{};${section('  function proactiveCheckFeedbackNode(','  function proactiveInlineOfferNode(')}window.testFeedback=proactiveCheckFeedbackNode;`});
  const result=await page.evaluate(()=>({old:testFeedback({id:'saved',questionId:'q1',tone:'warning',text:'已保存的旧题结果'}).tagName,current:testFeedback({id:'current',questionId:'q2',tone:'warning',text:'当前题首次结果'}).tagName}));assert.equal(result.old,'DETAILS');assert.equal(result.current,'ARTICLE');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'帮助草稿刷新回归.json'),JSON.stringify({passed:true,checks:['说明与需要选择刷新恢复','账号/代次/run隔离','待答检查选项恢复','新题不继承旧选择','实际聊天草稿函数读取恢复','聊天换场景保留、不同知识点隔离恢复','检查反馈保留在聊天滚动区之外'],errors},null,2));console.log('r12 帮助草稿浏览器回归通过');
 }catch(e){await page.screenshot({path:path.join(out,'帮助草稿失败.png')});fs.writeFileSync(path.join(out,'帮助草稿失败.json'),JSON.stringify({passed:false,message:e.message,errors},null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
