'use strict';
// Real browser actions on a disposable study database. No unit unlocks or fabricated mastery.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const base=process.env.STUDENT_UX_BASE_URL,live=process.argv.includes('--assert-live');
assert(base&&process.env.SYNTHETIC_STUDY_DIR,'Run through run-isolated-study-test.cjs');
const out=fs.mkdtempSync(path.resolve('output')+'/r18-journey-');
const arms=(process.env.R18_ARMS||'B').split(','),records=[],failures=[],pending=new Set();
const model=require('../lib/llm').runtimeInfo().model;
const registry=require('../lib/assessments/functions-limits-registry'),adapter=require('../lib/proactive-policy/adapters/functions-limits-r16');
const discussions=[
 ['函数f(x)=(x²−4)/(x−2)与g(x)=x+2是同一个函数吗？请分步骤解释定义域、约分前后的关系，并给一个不同数字的例子。','我把x=2代入约分后的式子得到4，所以原式在2也有定义。我的推理具体错在哪一步？','接着刚才的问题，如果补上f(2)=4，或补上f(2)=5，两种情况下能和g相同吗？分别说明。'],
 ['点P(−2,4)是否一定在y=x²图像上？请把横纵坐标与代入核对过程分开说明。','如果把它写成P(4,−2)，还是原来的点吗？不要只说顺序，实际代入检查。','那么同一横坐标上能出现两个不同纵坐标吗？与两个不同横坐标对应相同高度有什么区别？'],
 ['已知连续函数在0、1、2处的值为0、1、2，为什么不能证明整个区间严格递增？请给一个中间下降的连续折线例子。','你刚才说的反例需要满足哪几个条件？请列出折线中转点并逐一核对。','发现一对a<b而f(a)>f(b)，能证明整个区间严格递减吗？请指出结论与证据的范围。'],
 ['设x趋近2，f(x)=3x+1且x不等于2。要让输出与7的距离小于0.3，输入距离2应小于多少？完整推导。','我取输入距离小于0.3，为什么太宽？给一个满足我的输入要求却不满足输出要求的具体数。','如果把f(2)改为100，刚才的邻近范围和极限会变吗？为什么？'],
 ['x<1时f(x)=2x+2，x>1时f(x)=x+6，且f(1)=9。左右极限、双侧极限和点值分别是什么？按步骤判断。','只把f(1)改成4能修复这里的间断吗？用刚才两侧的规则解释。','如果改成两侧都趋近4且点值为9，这和刚才有什么不同？能通过只改点值变连续吗？'],
 ['给定f(x)=x²在x不等于1时成立，f(1)=3。请依次检查连续性的三个条件，说明哪些满足。','如果我说图像除了一个点都正常，因此它仍连续，错在哪里？请用接近1的数说明。','把点值改成1以后连续吗？连续是否又能说明处处可导？请用绝对值函数作对照。']
];
const save=()=>fs.writeFileSync(path.join(out,'journey.json'),JSON.stringify({base,live,model,arms,records,failures,reviewMinimumSeconds:process.env.THREE_ARM_REVIEW_MIN_SECONDS??180,synthetic:true},null,2));
async function journey(browser,arm){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(18000);
 await page.addInitScript(()=>{window.__journeyMessages=[];window.__journeyClicks=[];window.__journeyDocument=Date.now();addEventListener('message',e=>{if(e.data?.type==='maic_learning_event'||e.data?.type==='cq:interaction')window.__journeyMessages.push(e.data);});for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>window.__journeyClicks.push({type,target:e.target?.textContent?.slice(0,100),tag:e.target?.tagName,cls:e.target?.className,at:Date.now(),restoring:window.__cqRestoringProgress}),true);});
 const row={arm,steps:[],replies:[],errors:[]};records.push(row);
 page.on('framenavigated',f=>{(row.navigations||=[]).push({at:Date.now(),url:f.url()});});
 const step=name=>{row.steps.push({name,at:new Date().toISOString()});save();console.log(arm+' '+name);};
 const requests=new WeakMap();page.on('request',r=>requests.set(r,performance.now()));page.on('pageerror',e=>row.errors.push(e.message));
 page.on('response',r=>{if(!r.url().endsWith('/api/learning/assistant/ask'))return;const task=(async()=>{
  try{const lines=(await r.text()).trim().split(/\r?\n/).map(x=>JSON.parse(x)),done=lines.find(e=>e.type==='done');
   if(done)row.replies.push({ms:performance.now()-requests.get(r.request()),question:r.request().postDataJSON().question,requestContext:r.request().postDataJSON().contextRef,text:done.message.content,fallback:done.fallback,provider:done.message.provider,audit:done.message.modelAudit});
  }catch(e){row.cancelledOrFailed=(row.cancelledOrFailed||0)+1;}save();
 })();pending.add(task);task.finally(()=>pending.delete(task));});
 const snap=()=>page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());
 async function completed(before){const deadline=Date.now()+65000;while(row.replies.length<=before&&Date.now()<deadline)await page.waitForTimeout(50);await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().busy,{},{timeout:65000});await Promise.all([...pending]);assert.equal(row.replies.length,before+1);if(live){const r=row.replies.at(-1);if(r.fallback){assert(process.argv.includes('--allow-math-corrections')&&r.provider==='course-math-guard',r.text);assert(r.audit.responseValidation?.issues?.length);(row.mathCorrections||=[]).push({question:r.question,shown:r.text,original:r.audit.replacedModelText,issues:r.audit.responseValidation.issues});}assert.equal(r.audit.reportedModel,model);assert.equal(r.audit.requestedModel,model);}await page.waitForTimeout(Math.max(0,3200-row.replies.at(-1).ms));}
 async function send(text){const before=row.replies.length;const field=page.locator('.task-response-form textarea:visible').last();if(await field.count()){await field.fill(text);await page.getByRole('button',{name:'发送我的想法',exact:true}).last().click();}else{if(!await page.locator('[data-knowledge-input]').isVisible())await page.locator('#workspace-tools-toggle').click();await page.locator('[data-knowledge-input]').fill(text);await page.locator('[data-knowledge-send]').click();}await completed(before);}
 async function answerCheck(correct){const s=await snap(),check=s.check;assert(check);const option=check.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:s.scopeKey,supportLevel:check.supportLevel,checkId:check.id,response:o.value})?.correct===correct);assert(option);await page.getByRole('radiogroup').getByRole('radio').nth(check.options.indexOf(option)).click();await page.getByRole('button',{name:'提交检查',exact:true}).click();await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().check);}
 try{
  await page.goto(base+'/?study='+arm);await page.locator('[data-auth-mode=register]').click();
  row.nickname='流程验收'+arm+Date.now();await page.locator('#nickname').fill(row.nickname);await page.locator('#register-password').fill('Synthetic-r18-password');await page.locator('#register-password-confirm').fill('Synthetic-r18-password');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('[data-view=learn]').first().click();const dialog=page.locator('#three-arm-dialog[open]');await dialog.waitFor();
  await dialog.getByLabel('参与者完整姓名',{exact:true}).fill('合成流程'+arm);
  await dialog.getByLabel('电子签名（再次输入完整姓名）',{exact:true}).fill('合成流程'+arm);
  for(const checkbox of await dialog.locator('input[type=checkbox]').all())await checkbox.check();
  await dialog.getByRole('button',{name:'签署并继续',exact:true}).click();await dialog.locator('[data-study-question]').first().waitFor();step('阅读并签署知情同意');
  for(const field of await dialog.locator('[data-study-question]').all()){
   if(await field.locator('textarea').count())await field.locator('textarea').fill('希望能解释我具体错在哪一步，并让我自己检验。');
   else await field.locator('input[value="3"]').check();
  }
  await dialog.getByRole('button',{name:'保存并继续',exact:true}).click();await page.waitForFunction(()=>currentUnitId==='V14-C1-pre');
  for(const card of await page.locator('.question-card').all())await card.locator('[data-short-unknown],input[value="__unknown__"]').first().check();
  await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));step('注册、基线问卷、独立前测');
  await page.locator('[data-quiz-path-action=pilot-next]').last().click();
  await require('./operation-guide-steps')(page,out,arm,{desktopOnly:true});step('完成操作指引');
  if(arm!=='A'){
   const setup=page.locator('#learner-setup[open]');await setup.waitFor();
   await setup.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();
   await setup.getByRole('button',{name:/保存.*学习/}).last().click();await setup.waitFor({state:'hidden'});
  }
  await page.waitForFunction(()=>currentUnitId==='GH-01-K01');step('完成首次配置');
  await page.evaluate(()=>{window.__journeyRenders=[];const original=renderAll;renderAll=function(...args){__journeyRenders.push({at:Date.now(),stack:new Error().stack});return original(...args);};});
  if(process.argv.includes('--cancel-probe')){
   assert(!live,'UI race fixture uses a delayed transport; real queue cancellation is tested separately');
   await page.route('**/api/learning/assistant/ask',async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,1800));await route.fulfill({response}).catch(()=>{});});
   const begin=async text=>{if(!await page.locator('[data-knowledge-input]').isVisible())await page.locator('#workspace-tools-toggle').click();await page.locator('[data-knowledge-input]').fill(text);await page.locator('[data-knowledge-send]').click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().responsePending);};
   const original='请解释函数的输入范围。';await begin(original);const at=performance.now();await page.locator('[data-cancel-response]:visible').click();assert.equal((await snap()).responsePending,false);row.cancelVisibleMs=performance.now()-at;assert.equal(await page.locator('[data-knowledge-input]').inputValue(),original);
   const before=row.replies.length;await begin('不同输入可以得到相同输出吗？');await page.waitForTimeout(500);assert.equal((await snap()).responsePending,true,'旧请求的收尾不得解除新请求的等待状态');await completed(before);step('停止等待、草稿保留、立即重问、旧请求不覆盖新请求');
   await begin('请解释为什么同一输入不能对应两个不同输出。');await page.locator('[data-knowledge-new-conversation]').click();assert.equal((await snap()).responsePending,false);await page.waitForTimeout(2000);assert.equal((await snap()).responsePending,false);step('等待中创建新对话，迟到回复不回填');
   await begin('请接着解释刚才的函数问题。');await page.locator('[data-workspace-canvas=interactive]:visible').click();await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().responsePending);step('等待中切换课件，取消旧场景请求');row.passed=true;return;
  }
  if(process.argv.includes('--probe')){
   row.probe=await page.evaluate(()=>({buttons:[...document.querySelectorAll('button')].filter(n=>n.getBoundingClientRect().width).map(n=>({text:n.textContent.trim(),id:n.id,attrs:[...n.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value])})),snapshot:KnowledgeAssistant.designSpaceSnapshot()}));
   await page.screenshot({path:path.join(out,arm+'-lesson.png')});return;
  }
  for(let index=0;index<6;index++){
   const point=`GH-0${index<3?1:2}-K0${index%3+1}`;await page.waitForFunction(id=>currentUnitId===id,point);await page.locator('[data-openmaic-state=ready]').first().waitFor();
   if(!process.argv.includes('--interaction-probe'))for(const text of discussions[index])await send(text);step(point+' 三轮具体数学追问');
   if(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded')==='true')await page.locator('#workspace-tools-toggle').click();
   const primary=page.locator('[data-learning-primary-action]');
   await require('./visit-lecture-r19.cjs')(page);
   await page.locator('[data-knowledge-scene=simulation]:visible').click();let frame=page.frameLocator('iframe[data-courseware-frame]:visible');await frame.locator('.r9-concept').waitFor();
   await page.locator('[data-knowledge-scene=mindMap]:visible').click();await page.locator('iframe[data-courseware-frame][data-context-id$=":mindMap"][data-interaction-ready=true]').waitFor();frame=page.frameLocator('iframe[data-courseware-frame][data-context-id$=":mindMap"]');await frame.locator('.r9-concept').waitFor();await page.locator('.multi-scene-courseware-stage .iframe-loader:not(.hidden)').waitFor({state:'hidden'});
   const actionNames=['采用这组连线','保留未定义，不补点','保留这个反例','采用这个邻近范围','运行判定器','应用点值修复'];
   if(index===4){await frame.locator('#sim-left').fill('4');await frame.locator('#sim-right').fill('7');await frame.locator('.sim-btn').click();}
   else {const action=frame.getByRole('button',{name:actionNames[index],exact:true});row.actionBefore={at:Date.now(),bounds:await action.boundingBox(),document:await action.evaluate(n=>window.__journeyDocument)};await action.click();row.actionAfter={at:Date.now(),bounds:await action.boundingBox(),document:await action.evaluate(n=>window.__journeyDocument)};}
   await primary.getByText('完成学习，进入检测',{exact:true}).waitFor();await primary.click();await page.waitForFunction(id=>currentUnitId===id,point+'-formative');step(point+' 浏览讲解、切换课件、实际提交互动');
   if(process.argv.includes('--interaction-probe')||process.argv.includes('--first-interaction')){row.passed=true;return;}
   const version=await page.evaluate(()=>ThreeArmStudyUI.run.assessmentVersion),questions=registry.formative(index,version);
   for(const q of questions){const wrong=q.options.find(o=>!q.answer.includes(o.value));await page.locator(`.question-card[data-question="${q.id}"] input[value="${wrong.value}"]`).check();}
   await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().offer?.questionId));
   await page.getByRole('button',{name:'看看知点的提示',exact:true}).first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().policyState?.lifecycle?.phase==='accepted_pending_response');
   await send('请根据我的原始作答，说明我漏用了哪个条件，分两步解释，并让我判断下一步。');
   await send('刚才第二步还是不懂。请换一个具体数值例子，不要把原题数字直接换成答案。');
   await page.getByRole('button',{name:'用一道题独立检验',exact:true}).click();await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().check));
   if(index%3===2){await page.getByRole('button',{name:'暂不检查',exact:true}).click();await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().check);}
   else await answerCheck(index%3===1);
   if(index%3===0){const before=row.replies.length;await page.getByRole('button',{name:'还没弄懂，继续讲解',exact:true}).first().click();await completed(before);
    await send('我明白了一部分。请对照我刚才选错的检查选项，把它为什么不成立说清楚，再给一个我能自己判断的小问题。');}
   let before=row.replies.length;await page.getByRole('button',{name:/下一题：讲解第|请知点讲第 2 题/}).first().click();await completed(before);
   if(live)assert.equal(row.replies.at(-1).audit.contextAudit.retainedHistoryMessages,0,'新题不得混入旧题历史');
   await send('这道题和上一题的关键条件有什么不同？请只根据现在这道题完整说明，不要沿用上一道检查题。');
   await page.getByRole('button',{name:'结束本次讨论',exact:true}).click();assert.equal(await page.locator('.task-response-form textarea:visible').count(),0);assert.equal(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded'),'false','结束讨论后收起侧栏');step(point+' 错题多轮、独立检查'+['答错并继续帮助','答对','暂不检查'][index%3]+'、换题、退出');
   await primary.click();
   if(index===2){await dialog.waitFor();if(arm!=='A')await dialog.getByLabel('先保持当前设置').check();await dialog.getByRole('button',{name:'保存回顾并继续',exact:true}).click({timeout:210000});await dialog.waitFor({state:'hidden'});step('完成中段回顾与设置确认');}
  }
  await page.waitForFunction(()=>currentUnitId==='V14-C1-post');for(const card of await page.locator('.question-card').all())await card.locator('[data-short-unknown],input[value="__unknown__"]').first().check();await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-post'));step('独立后测已提交');
  assert.equal(await page.getByRole('button',{name:'正在生成学习建议',exact:true}).count(),0,'后测已提交不显示无任务的等待按钮');
  await page.getByRole('button',{name:'下一步：回顾两阶段学习',exact:true}).last().click();await dialog.getByRole('button',{name:'已回顾，进入学习体验问卷',exact:true}).waitFor();if(arm==='B'){assert.equal(await dialog.locator('.study-linked-card').count(),2);await dialog.locator('.study-round-rail button').last().click();}await page.screenshot({path:path.join(out,arm+'-final-review.png')});await dialog.getByRole('button',{name:'已回顾，进入学习体验问卷',exact:true}).click();await dialog.locator('[data-study-question]').first().waitFor();
  for(const field of await dialog.locator('[data-study-question]').all()){
   if(await field.locator('textarea').count())await field.locator('textarea').fill('这是一条合成验收记录：在错题讲解后继续追问，并分别检查切换与退出。');
   else await field.locator('input[value="3"]').check();
  }
  await dialog.getByRole('button',{name:'保存并继续',exact:true}).click();await dialog.getByText('学习体验已保存。',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'查看保持与迁移测验',exact:true}).isEnabled(),false,'72小时后任务不得提前开放');
  row.run=await page.evaluate(()=>({id:ThreeArmStudyUI.run.id,protocolFingerprint:ThreeArmStudyUI.run.protocolFingerprint,finalSurveyAt:ThreeArmStudyUI.run.finalSurveyAt}));
  await page.screenshot({path:path.join(out,arm+'-completed.png')});await dialog.getByRole('button',{name:'返回学习',exact:true}).click();step('体验问卷已保存、延迟任务锁定正确');
  await page.getByRole('button',{name:'首页',exact:true}).click();await page.locator('#home-pilot-entry').click();await dialog.getByText('学习体验已保存。',{exact:true}).waitFor();assert.equal(await page.locator('#pilot-dialog[open]').count(),0,'实验入口不能误入旧预试加入码');await dialog.getByRole('button',{name:'返回学习',exact:true}).click();step('首页可找回本轮问卷与后续任务');
  await page.locator('#auth-menu-toggle').click();const logoutAt=performance.now();await page.locator('#auth-logout').click();await page.locator('#auth-gate').waitFor();row.logoutVisibleMs=performance.now()-logoutAt;await page.waitForFunction(()=>!authTransitionInProgress);
  await page.locator('#login-identifier').fill(row.nickname);await page.locator('#login-password').fill('Synthetic-r18-password');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.waitForFunction(id=>ThreeArmStudyUI.run?.id===id&&Boolean(ThreeArmStudyUI.run.finalSurveyAt),row.run.id);step('退出登录并恢复同一轮记录');
  row.finalVisible=await page.locator('body').innerText();
  assert.deepEqual(row.errors,[]);row.passed=true;
 }catch(e){row.error=e.message;row.stack=e.stack;row.snapshot=await snap().catch(()=>null);row.visible=await page.locator('body').innerText().catch(()=>null);row.interactions=await page.evaluate(()=>({messages:__journeyMessages.slice(-20),renders:window.__journeyRenders,clicks:window.__journeyClicks.slice(-12),evidence:state.analytics?.interactionEvidence,frames:[...document.querySelectorAll('iframe[data-courseware-frame]')].map(n=>({src:n.src,opacity:getComputedStyle(n).opacity,visible:n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),data:{...n.dataset}}))}));row.frames=await Promise.all(page.frames().filter(f=>f!==page.mainFrame()).map(f=>f.evaluate(()=>({url:location.href,text:document.body.innerText.slice(-1600),restoring:window.__cqRestoringProgress,clicks:window.__journeyClicks,document:window.__journeyDocument})).catch(()=>null)));failures.push({arm,error:e.message});await page.screenshot({path:path.join(out,arm+'-failure.png')});console.error(arm,e.message);}
 finally{await Promise.all([...pending]);save();await context.close();}
}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{if(process.argv.includes('--parallel'))await Promise.all(arms.map(arm=>journey(browser,arm)));else for(const arm of arms)await journey(browser,arm);}finally{await browser.close();save();}console.log(out);if(failures.length)process.exitCode=1;else if(process.argv.includes('--with-evidence')){const result=require('node:child_process').spawnSync(process.execPath,['ops/test-study-timeline-browser-r18.cjs'],{env:process.env,stdio:'inherit',timeout:120000});if(result.status!==0)throw Error('Student evidence acceptance failed');}})().catch(e=>{console.error(e);process.exitCode=1;});
