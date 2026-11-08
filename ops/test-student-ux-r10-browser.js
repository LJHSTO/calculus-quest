'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),course=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
const reviewItems=require('../lib/assessments/three-arm-design-v1').surveys.filter(q=>['review_understanding','review_action'].includes(q.id));
const games=require('./openmaic-game-steps-r10');
const courseVersion='functions-limits-integrated-r10-20261106',helpOnly=process.env.STUDENT_UX_HELP_ONLY==='1';
const chosenArms=process.env.TEST_ARMS?process.env.TEST_ARMS.split(','):process.env.TEST_ARM?[process.env.TEST_ARM]:['A','B','C'];
assert.ok(chosenArms.length>0&&chosenArms.every(a=>['A','B','C'].includes(a))&&new Set(chosenArms).size===chosenArms.length,'验收组别必须为不重复的A/B/C');
async function main(){
 const remote=process.env.STUDENT_UX_BASE_URL||'';
 if(remote&&process.env.STUDENT_UX_ALLOW_TEST_ACCOUNT!=='1')throw Error('公网验收需要明确允许创建合成体验账号');
 const output=process.env.STUDENT_UX_OUTPUT_BASE?path.resolve(process.env.STUDENT_UX_OUTPUT_BASE):path.join(root,'output/综合课程-r10-20261106/完整学生流程');fs.mkdirSync(output,{recursive:true});const dir=fs.mkdtempSync(path.join(output,remote?'候选帮助-':'三组浏览器-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const base=remote.replace(/\/$/,'')||`http://127.0.0.1:${port}`;
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r10',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-delayed-r10',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'5000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=remote?{exitCode:0}:spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});
 let browser,page,arm='',registered=false;const errors=[],checks=[],timings=[],networkErrors=[],httpErrors=[];
 const account='r10路径'+Date.now()+require('node:crypto').randomUUID().slice(0,5);assert.ok(account.length<=24,'合成昵称不能被注册控件截短');
 const pass=text=>{checks.push(text);console.log('通过：'+text);};
 const shot=name=>page.screenshot({path:path.join(dir,arm+'组-'+name+'.png')});
 async function answer(unit,questions){
  await page.waitForFunction(id=>currentUnitId===id,unit);
  const cards=page.locator('.question-card[data-question]');assert.equal(await cards.count(),questions.length,'本阶段题量必须完整');
  for(const card of await cards.all()){const id=await card.getAttribute('data-question');assert.match(id,unit.endsWith('-formative')?/probe-r10/:/fl-r10/,'实际界面必须使用r10题库');const short=card.locator('[data-short-unknown]');await (await short.count()?short:card.locator('input[value="__unknown__"]')).check();}
  const t=Date.now();await page.locator(`[data-submit-quiz="${unit}"]`).click();await page.waitForFunction(id=>state.submittedQuizzes.includes(id),unit);timings.push({arm,event:'提交独立检测',unit,ms:Date.now()-t});
 }
 async function next(label){await page.getByRole('button',{name:label,exact:true}).last().click();}
 async function quizSupport(point){
  await page.evaluate(()=>{if(window.__bodyExposureEvents)return;window.__bodyExposureEvents=[];const original=analyticsTrack;analyticsTrack=function(type,payload){if(type==='proactive_surface_visible'&&payload?.data?.exposureKind==='support_content')window.__bodyExposureEvents.push(payload.data);return original.apply(this,arguments);};});
  await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().offer),null,{timeout:30000});
  const selector=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().view.placement==='sidebar'?'.learning-support-surface':'.task-support-panel');
  const sidebar=process.env.STUDENT_UX_QUIZ_SIDEBAR==='1'&&selector==='.learning-support-surface';
  const teacher=page.locator(selector),support=teacher.filter({has:page.locator('.knowledge-proactive-inline-offer')});
  await support.waitFor({state:'visible'});await page.waitForTimeout(800);
  const questionContext=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().offer.questionContext);
  assert.ok(questionContext?.questionId&&questionContext?.question&&questionContext.position>0,'形成测帮助必须包含服务端核对的原题上下文');
  await support.locator('.support-question-context').waitFor({state:'visible'});
  assert.match(await support.locator('.support-question-context').innerText(),/你提交的回答/);
  if(sidebar){
   await teacher.getByRole('button',{name:'收起',exact:true}).click();assert.equal(await teacher.locator('.knowledge-proactive-inline-offer').isVisible(),false,'收起必须实际隐藏帮助内容');
   await teacher.getByRole('button',{name:'展开帮助',exact:true}).click();await teacher.locator('.knowledge-proactive-inline-offer').waitFor({state:'visible'});
  }
  await page.waitForFunction(selector=>{const n=document.querySelector(selector+':has(.knowledge-proactive-inline-offer)');if(!n)return false;const r=n.getBoundingClientRect(),header=document.querySelector('.player-top').getBoundingClientRect();return r.height>0&&r.top>=header.bottom-1&&r.top<innerHeight-200;},selector,{timeout:2500});
  if(process.env.STUDENT_FLOW_V7==='1' && !sidebar)assert.equal(await support.evaluate(n=>Boolean(n.closest('.question-card'))),false,'老师应在测验层级，不默认挂在第一题下面');
  const position=await support.evaluate(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight,headerBottom:document.querySelector('.player-top').getBoundingClientRect().bottom};});
  timings.push({arm,event:'检测后帮助初始位置',point,position});await shot(point+'检测后帮助初始位置');
  assert.ok(position.top>=position.headerBottom-1&&position.top<position.viewport-200,'检测后应自动定位老师卡片：'+JSON.stringify(position));
  const peek=support.getByRole('button',{name:'查看简短提示',exact:true});
  if(await peek.count()){
   const decisionId=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().offer.decisionId);
   assert.equal(await support.locator('.knowledge-proactive-inline-offer-detail').isVisible(),false);await page.waitForTimeout(1300);
   assert.equal(await page.evaluate(id=>window.__bodyExposureEvents.filter(e=>e.decisionId===id).length,decisionId),0,'折叠正文不记内容曝光');
   await peek.click();assert.equal(await support.locator('.knowledge-proactive-inline-offer-detail').isVisible(),true);
   await page.waitForFunction(id=>window.__bodyExposureEvents.some(e=>e.decisionId===id),decisionId,{timeout:5000});
   await support.getByRole('button',{name:'收起简短提示',exact:true}).click();
  }
  if(point==='GH-01-K01'){
   await support.getByRole('button',{name:'这次先不看',exact:true}).click();await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().offer);
   await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().muted),false,'稍后只推迟本条，不关闭知识点');return;
  }
  if(point==='GH-01-K03'){
   await support.getByRole('button',{name:'关闭本知识点主动提醒',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().muted);
   await teacher.getByRole('button',{name:'恢复本知识点提醒',exact:true}).click();await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().muted);return;
  }
  await support.locator('.knowledge-proactive-inline-offer footer .is-primary').click();
  await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().prompt));
  assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().prompt.questionContext?.questionId),questionContext.questionId,'接受后仍围绕同一题');
  await page.waitForTimeout(1000);
  if(sidebar)assert.equal(await page.locator('.workspace-chat-pane .knowledge-composer').isVisible(),false,'老师对话期间不能重复显示第二个输入框');
  const review=await page.evaluate(async()=>{const r=await fetch('api/study/review',{headers:{Authorization:`Bearer ${state.authToken}`}});return {status:r.status,...await r.json()};});
  fs.writeFileSync(path.join(dir,arm+'组-'+point+'检测后接受提示再回顾.json'),JSON.stringify({point,position,review},null,2));
  assert.equal(review.status,point==='GH-01-K02'?409:200,'回顾应在第三个知识点检测后开放，交流本身不属于独立测量：'+JSON.stringify(review));
  assert.ok(position.top>=position.headerBottom-1&&position.top<position.viewport-200,'检测后应自动定位老师卡片：'+JSON.stringify(position));
  if(point==='GH-02-K02'){
   await page.locator('#auth-menu-toggle').click();await page.locator('#three-arm-review').click();await page.locator('.study-review-results').waitFor();
   assert.equal(await page.locator('#three-arm-dialog input,#three-arm-dialog textarea').count(),0,'固定节点之外回顾只读');await shot('头像菜单历史回顾只读');await page.locator('#three-arm-dialog').getByRole('button',{name:'返回学习',exact:true}).click();
   if(process.env.STUDENT_FLOW_V7==='1'){
    const second=page.locator('.question-card[data-question]').nth(1);await second.getByRole('button',{name:'和知点讨论这道题',exact:true}).click();
    assert.equal(await page.evaluate(()=>TaskSupport.selectedQuestion),await second.getAttribute('data-question'),'讨论入口选择第二题');
    const transcript=[];
    for(const question of ['请从第2题的第一步带我判断','我愿意','4','7','好的我知道了','现在看这道题，第一步该看什么？']){
     if(transcript.length===5){
      const third=page.locator('.question-card[data-question]').nth(2);await third.getByRole('button',{name:'和知点讨论这道题',exact:true}).click();
      assert.equal(await page.evaluate(()=>TaskSupport.selectedQuestion),await third.getAttribute('data-question'),'第三题入口必须切换当前题');
     }
     await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).fill(question);
     // A recovery banner can push Send below the viewport; finish intentional scrolling before measuring redraws.
     await teacher.getByRole('button',{name:'发送我的想法',exact:true}).scrollIntoViewIfNeeded();
     await page.evaluate(selector=>{window.flowPanel=document.querySelector(selector);window.flowLostPanel=0;window.flowPositions=[];window.flowObserving=true;const record=()=>{if(!window.flowObserving)return;const p=document.querySelector(selector);if(p!==window.flowPanel||!p?.isConnected)window.flowLostPanel++;if(p)window.flowPositions.push(p.getBoundingClientRect().top);requestAnimationFrame(record);};record();},selector);
     const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/api/learning/assistant/ask'));
     const capturedCount=await page.evaluate(()=>uxAssistantResponses.length);
     const sentAt=Date.now();
     await teacher.getByRole('button',{name:'发送我的想法',exact:true}).click();assert.equal((await response).status(),200);
     await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().busy);
     await page.waitForTimeout(250);
     const trace=await page.evaluate(()=>{window.flowObserving=false;return {lost:window.flowLostPanel,range:Math.max(...flowPositions)-Math.min(...flowPositions),reply:KnowledgeAssistant.designSpaceSnapshot().reply,questionId:KnowledgeAssistant.designSpaceSnapshot().replyQuestionId,check:KnowledgeAssistant.designSpaceSnapshot().check};});
     await page.waitForFunction(n=>uxAssistantResponses.length>n,capturedCount);
     const done=await page.evaluate(n=>uxAssistantResponses[n],capturedCount);
     trace.elapsedMs=Date.now()-sentAt;trace.provider=done.message.provider;trace.modelAudit=done.message.modelAudit;trace.fallback=done.fallback;
     if(remote){assert.equal(done.fallback,false,'真实模型验收不能靠备用解析通过');if(process.env.STUDENT_EXPECT_MODEL&&done.message.provider!=='conversation-control')assert.equal(done.message.modelAudit.requestedModel,process.env.STUDENT_EXPECT_MODEL);}
     assert.equal(await page.locator('#study-experience-prompt:visible').count(),0,'交流期间不能弹出反馈卡遮住输入与发送');
     fs.appendFileSync(path.join(dir,arm+'组-对话过程.jsonl'),JSON.stringify({question,...trace})+'\n');
     assert.equal(trace.lost,0,'发送期间老师区不能删除重建');assert.ok(trace.range<4,'对话过程中老师区不能上下跳：'+trace.range);assert.equal(Boolean(trace.check),false,'聊天不能自动追加独立检查');
     const history=await teacher.locator('.task-conversation-scroll').evaluate(n=>({top:n.scrollTop,bottom:n.scrollHeight-n.scrollTop-n.clientHeight}));
     assert.ok(history.bottom<4,'最新回复必须在对话区内可见：'+JSON.stringify(history));trace.history=history;
     assert.doesNotMatch(trace.reply.text,/已经掌握|理解到位|要不要.*新题|再给.*小练习/);
     transcript.push({question,...trace});
    }
    assert.equal(new Set(transcript.slice(0,4).map(t=>t.questionId)).size,1,'多轮复盘不能漂移到第一题');
    assert.equal(transcript[5].questionId,await page.locator('.question-card[data-question]').nth(2).getAttribute('data-question'),'从第三题入口进入后回答必须围绕第三题');
    fs.writeFileSync(path.join(dir,arm+'组-连续对话与位置.json'),JSON.stringify(transcript,null,2));await shot('稳定的老师对话区');
   }
  }
  await teacher.getByRole('button',{name:'回到本知识点课件',exact:true}).click();
  await page.waitForFunction(id=>currentUnitId===id,point);
  await page.locator('iframe[data-courseware-frame]').waitFor();
  assert.equal(await page.evaluate(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().prompt)),false,'检测提示不能残留到课件');
  await page.getByRole('button',{name:'返回测验',exact:true}).click();
  await page.waitForFunction(id=>currentUnitId===id+'-formative',point);
  await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().prompt));
  if(point==='GH-02-K02'&&process.env.STUDENT_UX_CLOSED_LOOP==='1')await require('./test-support-journey-steps')({page,teacher,dir,arm,remote,point});
  if(point==='GH-02-K03'&&sidebar){
   await teacher.getByRole('button',{name:'改为自由提问',exact:true}).click();
   await page.locator('.workspace-chat-pane .knowledge-composer').waitFor({state:'visible'});
   assert.equal(await teacher.locator('.task-response-form').isVisible(),false,'自由提问只保留一个输入入口');
  }
  if(point==='GH-02-K01'){
   await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).fill('极限描述输入靠近时输出的趋势，需要与该点的函数值区分。');
   await teacher.getByRole('button',{name:'发送我的想法',exact:true}).click();await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().busy&&Boolean(KnowledgeAssistant.designSpaceSnapshot().reply?.text));
   assert.equal(await page.evaluate(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().check)),false,'交流不能自动进入独立检查');
   await teacher.getByRole('button',{name:'用一题检查',exact:true}).click();await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().check));
   assert.equal(await page.locator('#three-arm-review').isEnabled(),false,'实际独立检查时菜单提前禁用回顾');
   const blocked=await page.evaluate(async()=>{const r=await fetch('api/study/review',{headers:{Authorization:`Bearer ${state.authToken}`}});return r.status;});assert.equal(blocked,409,'真正的独立检查期间仍保护作答');
   await teacher.getByRole('button',{name:'暂不检查',exact:true}).click();await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().check);
   const recovered=await page.evaluate(async()=>{const r=await fetch('api/study/review',{headers:{Authorization:`Bearer ${state.authToken}`}});return r.status;});assert.equal(recovered,200,'跳过检查后立即恢复回顾，不残留测量锁');
   assert.equal(await page.locator('#three-arm-review').isEnabled(),true,'独立检查结束后菜单恢复');
  }
 }
 async function closeProbe(){const invite=page.locator('#study-experience-prompt');await invite.waitFor({timeout:15000});assert.equal(await page.locator('dialog[open]').count(),0,'体验反馈不能自动打开模态问卷');assert.equal(await invite.locator('form').isVisible(),false);const box=await invite.boundingBox();assert.ok(box.height<80,'反馈邀请保持一行');assert.equal(await invite.evaluate(n=>n.parentElement.classList.contains('classroom-footer')),true,'反馈占据独立布局空间，不覆盖课件');const lessonBottom=await page.locator('#lesson-player').evaluate(n=>n.getBoundingClientRect().bottom);assert.ok(lessonBottom<=box.y+1,'反馈邀请不能盖住课件');await shot('可忽略的体验反馈');await invite.getByRole('button',{name:'反馈一下',exact:true}).click();await invite.locator('form').waitFor();assert.equal(await page.locator('dialog[open]').count(),0);await shot('主动展开体验反馈');await invite.getByRole('button',{name:'关闭',exact:true}).click();}
 async function saveSettings(sidebar){
  await page.locator('#learner-setup[open]').waitFor();
  if(await page.getByRole('button',{name:'下一项',exact:true}).isVisible())await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();
  if(sidebar){await page.locator('#learner-setup [data-dimension=D4] button').click();await page.locator('input[name=D4-placement][value=sidebar]').check();await page.locator('select[name=preference-reason]').selectOption({index:1});await page.locator('#learner-setup .learner-steps button').last().click();await page.getByRole('button',{name:'核对选择',exact:true}).click();}
  await page.locator('#learner-setup').getByRole('button',{name:/保存.*学习/}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});
 }
 try{
  let ready=false;for(let i=0;i<120;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,channel:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?undefined:(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL||'chrome'),headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
  for(arm of chosenArms){
   const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(remote?60000:20000);page.on('pageerror',e=>errors.push({arm,message:e.message}));
   page.on('requestfailed',r=>networkErrors.push({arm,path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
   page.on('response',async r=>{
    const pathname=new URL(r.url()).pathname,status=r.status();if(status<400||!pathname.includes('/api/')||pathname.includes('/auth/'))return;
    const row={arm,path:pathname,status,contentType:r.headers()['content-type'],injectedFault:['review-retry','assistant-retry','quiz-receipt'].includes(r.headers()['x-synthetic-fault'])};httpErrors.push(row);
    try{const payload=await r.json();row.code=payload?.code;row.message=payload?.message;}catch{}
    fs.writeFileSync(path.join(dir,'接口异常响应.json'),JSON.stringify(httpErrors,null,2));
   });
   await page.addInitScript(()=>{window.uxLongTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.uxLongTasks.push({at:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:true});window.uxScrollTrace=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.uxScrollTrace.push({at:performance.now(),target:this.className,options,stack:new Error().stack});window.uxScrollTrace=window.uxScrollTrace.slice(-30);return original.call(this,options);};});
   await page.addInitScript(()=>{
    const original=window.fetch;window.uxAssistantResponses=[];
    window.fetch=async(...args)=>{const response=await original(...args);if(new URL(response.url,location.href).pathname.endsWith('/api/learning/assistant/ask'))response.clone().text().then(body=>{const done=body.trim().split(/\r?\n/).map(line=>JSON.parse(line)).find(row=>row.type==='done');uxAssistantResponses.push(done||{captureError:'缺少完成事件'});}).catch(error=>uxAssistantResponses.push({captureError:error.message}));return response;};
   });
   await page.goto(base+'/?study='+arm);
   const bundled=await page.locator('script[src^="assets/learning-runtime.js"]').count();
   if(remote){assert.equal(bundled,1,'发布页必须使用与源码匹配的运行时包');assert.equal(await page.locator('link[href^="assets/learning-runtime.css"]').count(),1,'发布样式不能回退到旧缓存文件');}
   else if(!bundled)assert.ok(await page.locator('script[src^="app/main/"]').count()>10,'隔离开发回归可读取当前源脚本，不能空载');
   timings.push({arm,event:'运行时载入',mode:bundled?'verified_bundle':'source_runtime_isolated_development'});
   if(!registered){await page.locator('[data-auth-mode=register]').click();await page.locator('#nickname').fill(account);await page.locator('#register-password').fill('synthetic-browser-password');await page.locator('#register-password-confirm').fill('synthetic-browser-password');}
   else{await page.locator('#login-identifier').fill(account);await page.locator('#login-password').fill('synthetic-browser-password');}
   const authentication=page.waitForResponse(r=>/\/api\/auth\/(register|login)$/.test(new URL(r.url()).pathname));await page.locator('#login-submit').click();const auth=await authentication;assert.equal(auth.status(),200,'认证接口应成功');await page.locator('#auth-gate').waitFor({state:'hidden'});registered=true;
   await page.locator('[data-view=learn]').first().click();await page.locator('#three-arm-dialog[open]').waitFor();
   for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="3"]').check();
   await page.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();
   await answer('V14-C1-pre',course.flow.preQuiz.questions);
   await page.locator('[data-quiz-path-action=pilot-next]').last().click();
   await require('./operation-guide-steps-r10')(page,dir,arm);
   if(arm!=='A')await saveSettings(arm==='B'&&(process.env.STUDENT_UX_QUIZ_SUPPORT!=='1'||process.env.STUDENT_UX_QUIZ_SIDEBAR==='1'));
   await page.waitForFunction(()=>currentUnitId==='GH-01-K01');assert.equal(await page.locator('#learner-setup[open]').count(),0);
   await page.locator('[data-openmaic-state=ready]').first().waitFor();
   assert.equal(await page.locator('#three-arm-review').isEnabled(),false,'学习过程中不能提前打开阶段回顾');
   for(const width of [1280,1366,1440,1920]){
    await page.setViewportSize({width,height:900});
    const header=await page.locator('.player-top').evaluate(n=>{
     const boxes=[...n.children].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
     return {overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)),overflow:n.scrollWidth>n.clientWidth+1};
    });assert.deepEqual(header,{overlap:false,overflow:false},width+' 顶部控件不能重叠或溢出');
   }
   await page.setViewportSize({width:1440,height:960});
   if(process.env.STUDENT_GUIDE_ONLY==='1'){
    await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('.scene-tour-tip').waitFor();
    assert.equal(await page.locator('.scene-tour-highlight [data-knowledge-scene]').count(),4);
    await shot('首次场景高亮');await page.locator('[data-knowledge-scene=simulation]').click();await page.locator('.scene-tour-tip').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().taskReady),true);
    pass(arm+'组前测后导览、演练不记进度、初始配置与首次场景高亮');await context.close();continue;
   }
   assert.ok(await page.locator('.player-top').evaluate(n=>n.getBoundingClientRect().height)<80,'桌面顶部一行');
   assert.equal(await page.locator('#learner-preferences-button').isVisible(),false,'主界面不重复放置偏好入口');
   assert.equal(await page.locator('.player-top #three-arm-review').count(),0,'回顾收进头像菜单');
   await page.locator('#auth-menu-toggle').click();await page.getByRole('button',{name:'问卷与后续任务',exact:true}).click();
   const tasks=page.locator('#three-arm-dialog[open]');await tasks.getByRole('heading',{name:'问卷与后续任务',exact:true}).waitFor();
   assert.equal(await tasks.getByRole('button',{name:/学习回顾/}).count(),0,'后续任务不能再放第二个学习回顾入口');
   assert.equal(await tasks.getByRole('button',{name:'查看保持与迁移测验',exact:true}).isEnabled(),false,'未到三天的测验不能提前点击');
   await tasks.getByRole('button',{name:'返回学习',exact:true}).click();
   await page.locator('#auth-menu-toggle').click();await page.locator('#account-learning-preferences').click();await page.locator('#learner-setup[open]').waitFor();assert.equal(await page.locator('#learner-setup input').count(),0,'学习中只能查看');await page.locator('#learner-setup').getByRole('button',{name:'返回学习',exact:true}).click();
   pass(arm+'组前测接续、A直接进课、B/C初始配置及学习中只读');
   if(helpOnly){
   await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=simulation]').click();
   const exploration=page.frameLocator('iframe[data-courseware-frame]');await exploration.locator('body[data-exploration-point]').waitFor();
   assert.equal(await exploration.locator('.free-exploration-guide,.concept-exploration').count(),0,'首次进入没有自动线索或附加练习');
   const presets=exploration.locator('[onclick^="applyPreset"]');await presets.nth(0).click();await page.waitForTimeout(3500);await presets.nth(1).click();await page.waitForTimeout(1800);
   assert.ok(!['awaiting_confirmation','offered'].includes(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status)),'正常比较不应触发主动帮助');
   pass(arm+'组正常比较保持安静，首屏无附加线索和练习');
   await page.locator('[data-knowledge-scene=game]').click();
   const frame=page.frameLocator('iframe[data-courseware-frame]');await games.start(frame,'GH-01-K01');
   await page.locator('[data-classroom-action=fullscreen]').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));
   assert.equal(await page.locator('.player-top').isVisible(),false,'全屏隐藏头部');
   assert.equal(await page.locator('#classroom-lecture').isVisible(),true,'全屏保留字幕区');
   assert.equal(await page.locator('#classroom-lecture-text').isVisible(),true,'全屏字幕文字必须真正显示');
   await shot('全屏课件就绪');
   await frame.locator('body').evaluate(n=>n.dataset.uxIdentity='same-iframe');
   await page.evaluate(()=>renderAll());assert.equal(await frame.locator('body').getAttribute('data-ux-identity'),'same-iframe','后台进度刷新不能重载已开始的课件');
   const t=Date.now();for(let i=0;i<2;i++){await games.wrong(frame,'GH-01-K01');await page.waitForTimeout(350);}
   await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation');timings.push({arm,event:'两次游戏错误后出现询问',ms:Date.now()-t});
   const support=page.locator(arm==='B'?'.learning-support-surface':'.task-support-panel');await support.getByRole('button',{name:'请老师讲一下',exact:true}).waitFor();
   if(!(await support.isVisible()))await page.locator('#workspace-support-notice').click();
   if(process.env.STUDENT_UX_CANCEL_HELP==='1'){
    let releaseResponse,responseDelivered;
    const held=new Promise(resolve=>releaseResponse=resolve);
    const delivered=new Promise(resolve=>responseDelivered=resolve);
    await page.route('**/api/learning/support-cycle',async route=>{
     if(route.request().postDataJSON()?.action!=='report')return route.continue();
     const response=await route.fetch();await held;await route.fulfill({response});responseDelivered();
    });
    await support.getByRole('button',{name:'请老师讲一下',exact:true}).click();
    const cancel=support.getByRole('button',{name:'取消讲解，继续学习',exact:true});
    await cancel.waitFor({timeout:3000});assert.equal(await cancel.isEnabled(),true,'生成中也应允许取消');
    await cancel.click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='closed');
    let deliveryTimeout;releaseResponse();try{await Promise.race([delivered,new Promise((_,reject)=>deliveryTimeout=setTimeout(()=>reject(Error('迟到响应未完成')),65000))]);}finally{clearTimeout(deliveryTimeout);}await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status),'closed','迟到的生成结果不能重开已关闭帮助');
    await page.unroute('**/api/learning/support-cycle');await shot('生成中取消后继续学习');pass(arm+'组生成中取消、迟到响应不重开、课件仍可操作');
    await context.close();continue;
   }
   assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true,'点击帮助不退出全屏');assert.equal(await page.locator('.fullscreen-support-notice').count(),0,'全屏不重复入口');
   if(arm!=='B'){
    await support.getByRole('button',{name:'课件小窗',exact:true}).click();
    const scaled=await page.locator('iframe[data-courseware-frame]').evaluate(n=>({width:n.getBoundingClientRect().width,layout:n.clientWidth,transform:getComputedStyle(n).transform}));
    assert.equal(scaled.layout,1280);assert.ok(scaled.width<=330&&scaled.width>=200);assert.notEqual(scaled.transform,'none');
    const mini=await page.locator('[data-knowledge-scene-stage]').evaluate(n=>{const r=n.getBoundingClientRect(),h=n.parentElement.getBoundingClientRect();return {rightGap:h.right-r.right,topGap:r.top-h.top};});
    assert.ok(mini.rightGap<24&&mini.topGap<60,'课件小窗应停靠工作区右上角：'+JSON.stringify(mini));
    assert.equal(await frame.locator('body').getAttribute('data-ux-identity'),'same-iframe');await shot('全屏课件小窗');
    await support.getByRole('button',{name:'放大课件',exact:true}).click();assert.equal(await frame.locator('body').getAttribute('data-ux-identity'),'same-iframe');
   }
   await shot('全屏老师询问');await support.getByRole('button',{name:'请老师讲一下',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered');
   await page.waitForFunction(()=>document.querySelector('#workspace-support-notice').hidden,'老师卡片可见时隐藏重复定位提示');
   if(remote){const audit=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle.content.audit);assert.equal(audit.fallback,false,'精确模型验收不使用备用讲解通过');assert.equal(audit.provider,'openai-compatible');if(process.env.STUDENT_EXPECT_MODEL)assert.equal(audit.model?.requestedModel,process.env.STUDENT_EXPECT_MODEL);timings.push({arm,event:'真实模型帮助',contentSource:'真实模型讲解',audit});}
   await support.locator('[data-support-body]').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().supportCycle?.exposure),null,{timeout:15000});
   const visibleHelp=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle);
   assert.ok(visibleHelp.exposure.visibleMs>=1000&&visibleHelp.exposure.minimumFraction>=.5,'真实正文须有服务器确认的合格可见回执');
   fs.writeFileSync(path.join(dir,arm+'组-真实帮助与可见回执.json'),JSON.stringify({scope:visibleHelp.scope,sceneType:visibleHelp.sceneType,plan:visibleHelp.plan,content:visibleHelp.content,exposure:visibleHelp.exposure},null,2));
   timings.push({arm,event:'帮助正文实际可见',receipt:visibleHelp.exposure});
   await support.getByRole('textbox',{name:'继续交流（选填）',exact:true}).waitFor();
   assert.equal(await support.getByRole('button',{name:'继续问老师',exact:true}).count(),0,'帮助后直接呈现工作区输入框');
   if(arm==='B'){
    for(const width of [1366,1440,1920]){
     await page.setViewportSize({width,height:960});
     await page.waitForFunction(w=>innerWidth===w,width);
     await shot('全屏老师讲解-'+width);
     const layout=await page.evaluate(()=>{
      const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,width:r.width,right:r.right};};
      return {viewport:innerWidth,course:box('.core-learning-workspace>.player'),teacher:box('.learning-workspace-tools')};
     });
     assert.ok(layout.teacher.width>=300&&layout.teacher.width<=361,'老师侧栏宽度稳定，不随长回复扩张：'+JSON.stringify(layout));
     assert.ok(layout.course.width>layout.teacher.width*2,'课件保留主要画布');
     assert.ok(layout.course.right<=layout.teacher.x+1&&layout.teacher.right<=layout.viewport+1,'课件与老师不重叠、不超出视口');
     timings.push({arm,event:'全屏长回复布局',...layout});
    }
    await page.setViewportSize({width:1440,height:960});
   }
   const question='两个样本的输出相同，是否就说明两条规则相同？';
   await page.evaluate(()=>{window.uxComposerEvents=[];for(const type of ['pointerdown','pointerup','click','submit'])document.addEventListener(type,event=>{const b=document.querySelector('.task-response-form button');window.uxComposerEvents.push({type,tag:event.target.tagName,cls:event.target.className,text:event.target.textContent.slice(0,80),x:event.clientX,y:event.clientY,rect:b?.getBoundingClientRect().toJSON(),defaultPrevented:event.defaultPrevented});},true);});
   await support.getByRole('textbox',{name:'继续交流（选填）',exact:true}).fill(question);
   const helpResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/api/learning/assistant/ask')),helpSentAt=Date.now(),helpCount=await page.evaluate(()=>uxAssistantResponses.length);
   await support.getByRole('button',{name:'发送我的想法',exact:true}).click();
   assert.equal(await page.locator('#workspace-support-notice').isVisible(),false,'帮助区可见时不能插入重复入口并遮挡发送按钮');
   try{await support.locator('.task-conversation-reply').getByText(question,{exact:true}).waitFor();}catch(error){console.error('工作区发送事件：'+JSON.stringify(await page.evaluate(()=>window.uxComposerEvents)));throw error;}
   assert.equal((await helpResponse).status(),200);await page.waitForFunction(n=>uxAssistantResponses.length>n,helpCount);
   const helpDone=await page.evaluate(n=>uxAssistantResponses[n],helpCount);
   await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().busy&&Boolean(KnowledgeAssistant.designSpaceSnapshot().reply?.text));
   if(remote){assert.equal(helpDone.fallback,false);if(process.env.STUDENT_EXPECT_MODEL)assert.equal(helpDone.message.modelAudit.requestedModel,process.env.STUDENT_EXPECT_MODEL);timings.push({arm,event:'真实模型对话',fallback:helpDone.fallback,modelAudit:helpDone.message.modelAudit});}
   fs.writeFileSync(path.join(dir,arm+'组-课件帮助真实回复.json'),JSON.stringify({elapsedMs:Date.now()-helpSentAt,...helpDone},null,2));
   assert.equal(await support.getByRole('textbox',{name:'继续交流（选填）',exact:true}).inputValue(),'','发送成功后清空草稿并保留工作区对话');
   const conversation=await support.locator('.has-task-conversation').evaluate(n=>{const h=n.querySelector('.task-conversation-scroll'),input=n.querySelector('textarea').getBoundingClientRect();return {bottom:h.scrollHeight-h.scrollTop-h.clientHeight,inputBottom:input.bottom,panelBottom:n.getBoundingClientRect().bottom};});
   assert.ok(conversation.bottom<3&&conversation.inputBottom<=conversation.panelBottom,'新回复自动进入视野，输入框保持可见：'+JSON.stringify(conversation));
   assert.equal(await page.locator('#study-experience-prompt:visible').count(),0,'继续交流时体验邀请保持抑制');
   await shot('全屏老师讲解');await support.getByRole('button',{name:'结束这轮帮助',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='closed');
   assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true,'关闭帮助本身不退出全屏');
   await page.locator('[data-classroom-action=fullscreen]').click();await page.waitForFunction(()=>!document.fullscreenElement);
   await page.locator('[data-workspace-canvas=slide]').click();await closeProbe();
   await page.locator('[data-workspace-canvas=interactive]').click();
   // Repeated-error cooldown policies have dedicated current-server tests; this run checks one complete help episode.
   await page.setViewportSize({width:390,height:844});await shot('窄屏课程');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'窄屏无横向溢出');await page.locator('[data-workspace-canvas=slide]').click();await page.locator('[data-workspace-canvas=interactive]').click();await page.setViewportSize({width:1440,height:960});
   await page.locator('[data-workspace-canvas=slide]').click();
   assert.equal(await page.locator('.task-conversation-reply:visible').count(),0,'游戏里的对话不能进入讲解页');
   assert.equal(await page.evaluate(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().prompt)),false,'旧场景提示不能进入讲解页');
   await page.locator('[data-workspace-canvas=interactive]').click();
   pass(arm+'组真实错误及时询问、工作区直接对话、跨课件隔离、全屏保留、课件状态保留及窄屏适配');
   if(process.env.STUDENT_UX_HELP_ONLY==='1'){await context.close();continue;}
   }
   await page.reload();await page.waitForFunction(()=>ThreeArmStudyUI.run?.arm===new URLSearchParams(location.search).get('study'));await page.waitForTimeout(5500);assert.equal(await page.locator('#three-arm-dialog[open]').count(),0,'刷新不重复体验询问');
   for(const module of require('../app/shared/study-stages').stages.map(s=>({...s,knowledgePoints:s.points.map(id=>course.modules.flatMap(m=>m.knowledgePoints).find(p=>p.id===id))}))){
    for(const point of module.knowledgePoints){
     await page.waitForFunction(id=>currentUnitId===id,point.id);
     {
      await page.locator('[data-workspace-canvas=slide]').click();await page.locator('.multi-scene-slide-panel:not([hidden]) [data-openmaic-state=ready]').waitFor();
      await shot(point.id+'讲解与配音');
      assert.equal(await page.locator('.task-support-panel:visible,.learning-support-surface:visible').count(),0,'新讲解页不能提前展开帮助');
     }
     await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=game]').click();
     const game=page.frameLocator('iframe[data-courseware-frame]');await games.start(game,point.id);
     if(helpOnly&&point.id!=='GH-01-K01'&&process.env.STUDENT_UX_QUIZ_SUPPORT!=='1'){
      for(let i=0;i<2;i++){await games.wrong(game,point.id);await page.waitForTimeout(350);}
      await page.waitForFunction(id=>{const c=KnowledgeAssistant.designSpaceSnapshot().supportCycle;return c?.scope===id&&c.status==='awaiting_confirmation';},point.id);
      const help=page.locator(arm==='B'?'.learning-support-surface':'.task-support-panel');
      if(arm==='B'&&!(await help.isVisible()))await page.locator('#workspace-support-notice').click();
      await help.getByRole('button',{name:'我先自己试',exact:true}).click();
     }
     await games.finish(game,point.id);await shot(point.id+'原课件通关');
     await next('完成学习，进入三题检测');await answer(point.id+'-formative',point.formativeQuiz.questions);
     if(process.env.STUDENT_UX_QUIZ_SUPPORT==='1')await quizSupport(point.id);
     assert.equal(await page.locator('#workspace-coach-toggle').isVisible(),false,'无旧回看路径门');
     if(point.id!==module.points.at(-1))await next('下一节');
    }
    if(!module.review){await next('进入独立后测');continue;}
    await page.waitForTimeout(5500);assert.equal(await page.locator('#three-arm-dialog[open]').count(),0,'阶段回顾不自行弹出');
    if(module.id==='S1'){
     await page.route('**/api/study/review',r=>r.fulfill({status:503,headers:{'x-synthetic-fault':'review-retry'},contentType:'application/json',body:JSON.stringify({ok:false,message:'合成网络故障，请重试'})}));
     await next('完成本段，查看学习回顾');await page.getByRole('button',{name:'重新加载',exact:true}).waitFor();
     await page.locator('#three-arm-dialog').getByRole('button',{name:'返回学习',exact:true}).click();
     await page.unroute('**/api/study/review');
    }
    await next('完成本段，查看学习回顾');await page.locator('#three-arm-dialog[open]').waitFor();await page.getByText('这次回顾对你有帮助吗？',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-linked-feedback]').count(),arm==='B'?1:0);await shot(module.id+'阶段回顾');
    for(const item of reviewItems)assert.equal(await page.locator(`[data-study-question="${item.id}"] legend`).innerText(),item.text,'导出的问卷题文应与学生实际看到的一致');
    for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="4"]').check();
    if(arm!=='A')await page.locator('input[name=review-decision][value=change]').check();
    await page.locator('#three-arm-dialog').getByRole('button',{name:'保存回顾并继续',exact:true}).click();
    if(arm!=='A'){await page.locator('#learner-setup[open]').waitFor();assert.equal(await page.locator('#learner-setup [data-dimension]').count(),6);await saveSettings(process.env.STUDENT_UX_QUIZ_SIDEBAR==='1');}
   }
   await answer('V14-C1-post',course.flow.postQuiz.questions);await page.getByRole('button',{name:'下一步：填写学习体验问卷',exact:true}).click();await page.locator('#three-arm-dialog[open]').waitFor();
   const finalSurvey=require('../lib/assessments/three-arm-design-v1').surveys.filter(q=>q.time==='即时后测后'&&q.group.split(' ').includes(arm));
   assert.deepEqual(await page.locator('#three-arm-dialog [data-study-question]').evaluateAll(ns=>ns.map(n=>n.dataset.studyQuestion)),finalSurvey.map(q=>q.id),'后问卷题号与当前冻结契约逐项一致');
   for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="4"]').check();
   await page.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();await page.getByText('学习体验已保存。',{exact:true}).waitFor();await shot('完成学习与三天任务');
   assert.equal(await page.getByRole('button',{name:'开始配置判断',exact:true}).isEnabled(),false);
   await page.getByRole('button',{name:arm==='B'?'比较两阶段的配置与学习经历':'回顾两阶段学习结果',exact:true}).click();
   await page.locator('#three-arm-dialog').getByRole('heading',{name:arm==='B'?'学习回顾与配置关联':'学习回顾',exact:true}).waitFor();
   if(arm==='B'){
    assert.equal(await page.locator('[data-study-phase]').count(),2);assert.match(await page.locator('[data-study-phase=S1]').innerText(),/第 1 版配置/);assert.match(await page.locator('[data-study-phase=S2]').innerText(),/第 2 版配置/);
    assert.match(await page.locator('.study-review-reading').innerText(),/怎样理解这次学习/);assert.doesNotMatch(await page.locator('.study-review-reading').innerText(),/再观察下一段|调整一两项/,'结束后的回顾不能引导进入不存在的下一学习阶段');
    for(const width of [1366,500]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#three-arm-dialog').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);await shot('后测两阶段对比-'+width);await page.locator('.study-review-reading').scrollIntoViewIfNeeded();await shot('后测两阶段对比下半部-'+width);await page.locator('#three-arm-dialog').evaluate(n=>n.scrollTop=0);}
   }else assert.equal(await page.locator('[data-linked-feedback]').count(),0,'A/C不提前接受B组的关联回顾干预');
   timings.push({arm,event:'学习期间长任务',items:await page.evaluate(()=>window.uxLongTasks)});pass(arm+'组六个知识点、三知识点后一次配置窗口、后测问卷和两阶段回顾');
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(networkErrors.filter(e=>e.error!=='net::ERR_ABORTED'),[],'正常切课取消之外的网络错误');assert.deepEqual(httpErrors.filter(e=>e.status>=500&&!e.injectedFault),[],'实际接口或网关错误不得作为验收通过');const finalReport={passed:true,at:new Date().toISOString(),courseVersion,synthetic:true,armsTested:chosenArms,model:remote?'remote_recorded_audit':'mock',base,progressInjection:false,answerPolicy:'独立测验通过界面选择我不会；课内挑战按规则完成。用于验证流程，不表示学习成效。',scope:helpOnly?'真实课件帮助与继续交流':'真实UI前测→六知识点挑战→18共同题→中段回顾→后测与问卷；所有进度由正常UI产生',quizSupport:process.env.STUDENT_UX_QUIZ_SUPPORT==='1',quizSidebar:process.env.STUDENT_UX_QUIZ_SIDEBAR==='1',helpOnly:process.env.STUDENT_UX_HELP_ONLY==='1',checks,errors,networkErrors,httpErrors,timings};fs.writeFileSync(path.join(dir,'验收结果.json'),JSON.stringify(finalReport,null,2));fs.writeFileSync(path.join(output,helpOnly?('r10帮助流程验收'+(chosenArms.length===3?'':'-'+chosenArms.join(''))+'.json'):'r10完整学生流程验收.json'),JSON.stringify(finalReport,null,2));
 }catch(e){console.error('页面错误：'+JSON.stringify(errors));if(page&&!page.isClosed()){await shot('失败现场').catch(()=>{});fs.writeFileSync(path.join(dir,'失败状态.json'),JSON.stringify({errors,networkErrors,...await page.evaluate(()=>({unit:typeof currentUnitId==='undefined'?null:currentUnitId,study:window.ThreeArmStudyUI?.run,snapshot:window.KnowledgeAssistant?.designSpaceSnapshot?.(),scrollTrace:window.uxScrollTrace,panels:[...document.querySelectorAll(".task-support-panel")].map(n=>({rect:n.getBoundingClientRect().toJSON(),host:n.parentElement.className})),body:document.body.innerText.slice(-10000)})).catch(()=>({}))},null,2));}throw e;}
 finally{await browser?.close();if(server.exitCode===null){const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}fs.closeSync(log);console.log('浏览器证据：'+dir);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
