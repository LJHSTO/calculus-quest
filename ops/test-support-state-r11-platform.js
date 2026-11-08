'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{chromium}=require('playwright-core'),bank=require('../lib/assessments/functions-limits-r11');
const out=path.resolve(__dirname,'../tmp/support-state-r11-platform'),base=(process.argv.slice(2).find(arg=>/^https?:\/\//.test(arg))||process.env.STUDENT_UX_BASE_URL||'http://127.0.0.1:54049').replace(/\/$/,''),expiryOnly=process.argv.includes('--expiry-only');fs.mkdirSync(out,{recursive:true});assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/,'本回归只在显式隔离的本机服务创建合成账号');
async function main(scenario,foreignOffer){const startedAt=Date.now();const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,channel:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?undefined:(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL||'chrome'),headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[],decisions=[],layoutEvidence=[],coursewareDocuments=[];let resourceEvidence=null;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().endsWith('/api/learning/assistant/intervention')){try{const b=await r.json();decisions.push({status:r.status(),body:b});}catch{}}});
 const scenarioLabel={decline:'拒绝',change:'换场景',check:'独立检查',range:'误差示例',expiry:'真实到期'}[scenario];
 const snapshot=()=>page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());
 const api=(url,body)=>page.evaluate(async({url,body})=>{const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+state.authToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const b=await r.json();if(!r.ok)throw Error(url+' '+r.status+' '+b.message);return b;},{url,body});
 const select=async(point,type)=>{await page.evaluate(async id=>{ensureAgenticPath().pendingPlan=null;agenticUnlockUnit(id,'synthetic_r10_validation');selectUnit(id);await syncLearningSnapshot('synthetic_r10_unit');},point);await page.locator('[data-workspace-canvas="interactive"]').click();await page.locator('[data-knowledge-scene="'+type+'"]').click();await page.frameLocator('iframe[data-courseware-frame]').locator('.r9-native').waitFor();return page.frameLocator('iframe[data-courseware-frame]');};
 const flush=()=>page.evaluate(()=>analyticsFlushUntilSettled(20000));
 try{
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-auth-mode="register"]').click();await page.locator('#nickname').fill('直接提示交互合成'+Date.now());await page.locator('#register-password').fill('Synthetic-r9-course-123');await page.locator('#register-password-confirm').fill('Synthetic-r9-course-123');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view="learn"]').first().click();
  const survey=(await api('api/study/survey?stage=baseline')).data;await api('api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,q.options?.find(o=>o.value===3)?.value??3]))});
  if(await page.locator('#three-arm-dialog[open]').count())await page.locator('#three-arm-dialog').getByRole('button',{name:'稍后继续',exact:true}).click();
  await page.waitForTimeout(2200);if(await page.getByRole('button',{name:'进入知识前测',exact:true}).isVisible())await page.getByRole('button',{name:'进入知识前测',exact:true}).click();
  await page.locator('[data-view="learn"]').first().click();await page.locator('.question-card').first().waitFor({state:'visible'});
  assert.equal(await page.locator('.support-inquiry:visible').count(),0);checks.push('前测期间没有主动帮助');
  const questions=[...bank.questions('pre','X'),...bank.questions('pre','Y')],cards=page.locator('.question-card');for(let i=0;i<await cards.count();i++){const card=cards.nth(i),id=await card.getAttribute('data-question'),q=questions.find(q=>q.id===id);assert.ok(q,id);if(q.type==='short_answer')await card.locator('textarea').fill('这是合成工程验收回答，保留人工批改状态。');else await card.locator('input[value="'+q.answer[0]+'"]').check();}
  await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));
  await page.waitForTimeout(1200);if(await page.getByRole('button',{name:'开始学习',exact:true}).first().isVisible())await page.getByRole('button',{name:'开始学习',exact:true}).first().click();
  if(await page.locator('[data-guide-pause]').isVisible())await page.locator('[data-guide-pause]').click();
  const prefs=(await api('api/learning/learner-preferences')).data,answers=prefs.record.answers;for(const a of Object.values(answers))a.reason='default';answers.D5.value=process.argv.includes('--cycle')||process.argv.includes('--skip')?'ask':'cue';if(scenario==='range')answers.D3.value='example';await api('api/learning/learner-preferences',{answers,expectedRevision:prefs.record.revision,selectionSource:'synthetic_r10_browser_fixture'});
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();
  // Fixture opens each target unit; task interactions and support delivery use the real UI and API.
  await page.waitForTimeout(1200);if(await page.locator('[data-guide-pause]').isVisible())await page.locator('[data-guide-pause]').click();
  if(await page.locator('[data-quiz-path-action="pilot-next"]').first().isVisible())await page.locator('[data-quiz-path-action="pilot-next"]').first().click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().unitType==='knowledge');

  if(process.argv.includes('--cycle')||process.argv.includes('--skip')){
  const frame=await select('GH-01-K02','mindMap');
  await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();await frame.getByRole('slider',{name:'准备画的f(2)',exact:true}).press('ArrowUp');await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();await flush();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation',null,{timeout:25000});
  await page.getByRole('button',{name:'请老师讲一下',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='offered');
  await page.getByRole('button',{name:'做一次独立检查',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_check');
  const c=(await snapshot()).supportCycle;assert.equal(await page.evaluate(()=>KnowledgeAssistant.pendingIndependentCheck().source),'cycle');
  // An attempt to start the other pipeline must not create a second unanswered item.
  const protectedLegacy=await page.evaluate(async c=>{const r=await fetch('api/learning/proactive/check',{method:'POST',headers:{Authorization:'Bearer '+state.authToken,'Content-Type':'application/json'},body:JSON.stringify({action:'start',unitId:c.scope,scopeKey:c.scope,chapterId:'V14-C1',sceneType:c.sceneType})});return r.status;},c);assert.equal(protectedLegacy,409);
  if(process.argv.includes('--skip')){
    await page.evaluate(async()=>{agenticUnlockUnit('GH-01-K03','synthetic_r11_orphan_fixture');currentUnitId='GH-01-K03';renderAll();await syncLearningSnapshot('synthetic_r11_old_pending_context');await KnowledgeAssistant.reloadLearnerPolicy();});
    assert.ok(await page.evaluate(()=>KnowledgeAssistant.pendingIndependentCheck()));
    await page.evaluate(()=>ThreeArmStudyUI.openReview());await page.getByRole('dialog').getByRole('button',{name:'返回独立检查',exact:true}).click();
    await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().scopeKey==='GH-01-K02'&&KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_check');
    assert.equal((await snapshot()).sceneType,'mindMap');
    await page.evaluate(()=>ThreeArmStudyUI.openReview());await page.getByRole('button',{name:'暂不检查，查看学习回顾',exact:true}).click();
    await page.waitForFunction(()=>!KnowledgeAssistant.pendingIndependentCheck());
    const complete=(await snapshot()).supportCycle;assert.equal(complete.checkResult.status,'skipped');assert.equal(complete.checkResult.correct,null);
    const memory=(await api('api/learning/agent-runtime')).data.memory.find(row=>row.payload.outcome.checkId===c.check.id);assert.equal(memory.payload.outcome.success,null);
    assert.match(await page.getByRole('dialog').innerText(),/继续完成本阶段/);checks.push('离开旧待答知识点后仍可通过回顾返回原题；明确暂不检查解除保护；跳过为null而非错误；未完成阶段有清楚说明');
    await page.screenshot({path:path.join(out,'未答检查恢复与跳过.png')});assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'recovery-regression.json'),JSON.stringify({passed:true,checks,result:complete.checkResult,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors}));return;
  }  const adapter=require('../lib/proactive-policy/adapters/functions-limits-r10'),wrong=c.check.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:c.scope,supportLevel:'L1',checkId:c.check.id,response:o.value})?.correct===false);
  await page.getByRole('button',{name:wrong.label,exact:true}).click();await page.getByRole('button',{name:'提交独立检查',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='closed');
  assert.equal((await snapshot()).feedback.tone,'warning');assert.equal(await page.evaluate(()=>KnowledgeAssistant.pendingIndependentCheck()),null);
  const saved=(await snapshot()).supportCycle;const replay=await api('api/learning/support-cycle',{action:'submit_check',id:c.id,scope:c.scope,unitId:c.scope,sceneType:c.sceneType,checkId:c.check.id,response:wrong.value});assert.equal(replay.data.cycle.revision,saved.revision);assert.deepEqual(replay.data.cycle.checkResult,saved.checkResult);
  await page.waitForTimeout(7000);assert.equal((await snapshot()).feedback.checkId,c.check.id);
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().feedback?.tone==='warning');
  await page.getByRole('button',{name:'收起结果，继续学习',exact:true}).click();assert.equal((await snapshot()).feedback,null);
  if(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded')==='false')await page.locator('#workspace-tools-toggle').click();await page.getByText('回看独立检查结果',{exact:true}).click();assert.ok(await page.locator('.knowledge-proactive-check-feedback:visible').count());
  await page.screenshot({path:path.join(out,'结构化帮助闭环.png')});
  checks.push('D5先询问→真实确认→支架→独立题答错→反馈；跨管线start被保护；重复提交无新revision；7秒与刷新保留；主动收起后历史可见');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'cycle-regression.json'),JSON.stringify({passed:true,checks,result:saved.checkResult,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors}));

return;
}
  const raw=(decision,command={},extra={})=>page.evaluate(async({decision,command,extra})=>{const r=await fetch('api/learning/proactive/'+decision.decisionId+'/activity',{method:'POST',headers:{Authorization:'Bearer '+state.authToken,'Content-Type':'application/json'},body:JSON.stringify({activityId:decision.activity.id,operation:'select',itemId:decision.activity.items[0]?.id,chapterId:'V14-C1',unitId:decision.unitId,sceneType:decision.sceneType,...command,...extra})});return {status:r.status,body:await r.json()};},{decision,command,extra});
  let frame=await select(scenario==='range'?'GH-02-K01':'GH-01-K02','mindMap');
  if(scenario==='range'){await frame.getByRole('button',{name:'采用这个邻近范围',exact:true}).click();await frame.getByRole('slider',{name:'邻近范围δ',exact:true}).press('ArrowUp');await frame.getByRole('button',{name:'采用这个邻近范围',exact:true}).click();}
  else{await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();await frame.getByRole('slider',{name:'准备画的f(2)',exact:true}).press('ArrowUp');await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();}await flush();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().offer?.activity,null,{timeout:25000});

  let offer=(await snapshot()).offer;assert.equal((await snapshot()).researchControls.profile.authorityLevel,'A2');assert.equal(await page.locator('.support-inquiry:visible').count(),0);
  if(foreignOffer){assert.equal((await raw(foreignOffer)).status,404);checks.push('其他合成账号不能操作这条提示');}
  if(scenario==='range'){
    assert.equal(offer.activity.kind,'range');const slider=page.getByRole('slider',{name:'帮助例子的输入范围半径',exact:true});await slider.press('Home');await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().offer?.activityState?.delta===.01);assert.match((await snapshot()).offer.activityState.feedback,/能保证/);
    await slider.press('End');await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().offer?.activityState?.delta===.3);assert.match((await snapshot()).offer.activityState.feedback,/太宽/);offer=(await snapshot()).offer;checks.push('D3局部示例经D5直接显示，两个半径操作均返回正确的服务器解释');
    assert.equal((await raw(offer,{operation:'range',value:99})).status,400);checks.push('服务器拒绝超出本例范围的参数');
  }else{
    await page.locator('.proactive-support-activity .support-activity-options button').first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().offer?.activityState?.selected);offer=(await snapshot()).offer;assert.equal(offer.activityState.selected,offer.activity.items[0].id);checks.push('D5直接正文无确认询问，受约束活动显示且HTTP操作成功');
    await page.evaluate(()=>KnowledgeAssistant.refreshSupportSurface());assert.equal(await page.locator('.proactive-support-activity .support-activity-options button').first().getAttribute('aria-pressed'),'true');checks.push('帮助区域重新渲染后保留已操作选项和解释');
    assert.equal((await raw(offer,{itemId:'forged'})).status,400);assert.equal((await raw(offer,{}, {unitId:'GH-02-K03'})).status,409);checks.push('伪造选项和错误知识点请求被拒绝');
    const stored=(await raw(offer)).body;assert.equal(stored.data.activityState.selected,offer.activity.items[0].id);assert.equal((await snapshot()).offer.activityState.selected,offer.activity.items[0].id);checks.push('重复状态读取一致，操作不创建独立分数');
  }
  if(!expiryOnly)await page.screenshot({path:path.join(out,'直接提示-'+scenarioLabel+'.png')});
  if(expiryOnly){
    const expiresAt=offer.supportSpec?.expiresAt||decisions.find(d=>d.body.decisionId===offer.decisionId)?.body.decision.supportSpec.expiresAt,expires=Date.parse(expiresAt);assert.ok(Number.isFinite(expires));
    console.log(JSON.stringify({waitingForExpiry:true,decisionId:offer.decisionId,expiresAt,secondsRemaining:Math.ceil((expires-Date.now())/1000)}));
    while(Date.now()<expires-1500)await page.waitForTimeout(Math.min(30000,expires-1500-Date.now()));
    assert.equal((await raw(offer)).status,200);await page.waitForTimeout(Math.max(1,expires+1200-Date.now()));
    assert.equal((await raw(offer)).status,409);assert.equal((await snapshot()).unitId,offer.unitId);assert.equal((await snapshot()).sceneType,offer.sceneType);checks.push('同一知识点和场景保持不变：到期前请求成功，到期后服务器拒绝');
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'D5真实到期检查.json'),JSON.stringify({passed:true,at:new Date().toISOString(),synthetic:true,expiresAt,checks,errors},null,2));console.log(JSON.stringify({passed:true,expiryOnly:true,checks}));return;
  }
  await page.getByRole('button',{name:'接受提示并继续交流',exact:true}).first().click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().policyState?.lifecycle?.phase==='accepted_pending_response');
  await page.getByRole('button',{name:'用一题检查',exact:true}).click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().check);
  const check=(await snapshot()).check,adapter=require('../lib/proactive-policy/adapters/functions-limits-r10');
  const wrong=check.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:offer.unitId,supportLevel:offer.supportLevel,checkId:check.id,response:o.value})?.correct===false);
  await page.getByRole('radiogroup').getByRole('radio').nth(check.options.indexOf(wrong)).click();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/learning/proactive/check')&&r.request().postDataJSON()?.response);
  await page.getByRole('button',{name:'提交检查',exact:true}).click();
  const result=await (await response).json();await page.waitForTimeout(1400);
  let post=await snapshot();
  assert.equal(post.check,null);assert.equal(await page.evaluate(()=>KnowledgeAssistant.pendingIndependentCheck()),null);
  assert.equal(post.policyState.verificationCheck,null);assert.ok(result.checkResult.explanation);assert.ok(result.checkResult.correctLabel);
  const readReview=()=>page.evaluate(async()=>{const r=await fetch('api/study/review',{headers:{Authorization:'Bearer '+state.authToken}});return {status:r.status,body:await r.json()};});
  const firstReview=await readReview();assert.doesNotMatch(firstReview.body.message||'',/独立检查结束/);
  const requestBody={chapterId:'V14-C1',unitId:offer.unitId,scopeKey:offer.unitId,sceneType:offer.sceneType,checkId:check.id,response:wrong.value};
  const replay=await api('api/learning/proactive/check',requestBody);assert.equal(replay.replayed,true);assert.equal(replay.checkResult.attemptId,result.checkResult.attemptId);
  checks.push('第一轮错误答案立即反馈；复提交幂等；完成题不继续锁回顾');
  await page.getByRole('button',{name:'接受提示并继续交流',exact:true}).first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().policyState?.lifecycle?.phase==='accepted_pending_response');
  await page.getByRole('button',{name:'用一题检查',exact:true}).click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().check);
  const second=(await snapshot()).check;assert.notEqual(second.id,check.id);assert.equal((await snapshot()).policyState.lifecycle.activeVerificationCheckId,second.id);
  assert.equal(Object.hasOwn(second,'answer'),false);assert.equal(Object.hasOwn(second,'correctLabel'),false);
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().check);
  assert.equal((await snapshot()).check.id,second.id);assert.equal((await readReview()).status,409);
  checks.push('第二轮实际发新题且ID一致；刷新仍为同一道未答题；未答时回顾受保护');
  const correct=second.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:offer.unitId,supportLevel:second.supportLevel,checkId:second.id,response:o.value})?.correct);
  await page.getByRole('radiogroup').getByRole('radio').nth(second.options.indexOf(correct)).click();
  const secondResponse=page.waitForResponse(r=>r.url().endsWith('/api/learning/proactive/check')&&r.request().postDataJSON()?.response);
  await page.getByRole('button',{name:'提交检查',exact:true}).click();const secondResult=await (await secondResponse).json();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().feedback?.tone==='success');
  assert.equal(await page.evaluate(()=>KnowledgeAssistant.pendingIndependentCheck()),null);
  await page.waitForTimeout(7000);assert.equal((await snapshot()).feedback.tone,'success');
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().feedback?.tone==='success');
  assert.ok((await snapshot()).feedback.explanation);
  checks.push('第二轮正确答案有解释；7秒后及刷新后仍可见，已完成不再保护');
  await page.screenshot({path:path.join(out,'两轮检查完成反馈.png')});
  while(await page.getByRole('button',{name:'收起结果，继续学习',exact:true}).first().isVisible()){await page.getByRole('button',{name:'收起结果，继续学习',exact:true}).first().click();await page.waitForTimeout(80);}
  if(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded')==='false')await page.locator('#workspace-tools-toggle').click();await page.getByText('回看独立检查结果',{exact:true}).click();
  assert.ok(await page.locator('.knowledge-proactive-check-feedback:visible').count()>=2);
  checks.push('主动收起后徽标不再提示未读；侧栏仍能回看两轮结果');
  await page.screenshot({path:path.join(out,'收起后回看历史.png')});
  await page.evaluate(()=>KnowledgeAssistant.close?.());
  // Complete the three stage quizzes via real answer controls; only unlocking is fixture setup.
  for(const point of ['GH-01-K01','GH-01-K02','GH-01-K03']){
    const id=point+'-formative';await page.evaluate(async id=>{agenticUnlockUnit(id,'synthetic_r11_validation');selectUnit(id);await syncLearningSnapshot('synthetic_r11_review_setup');},id);
    const qs=page.locator('.question-card');await qs.first().waitFor({state:'visible'});
    for(let i=0;i<await qs.count();i++){const card=qs.nth(i);await card.locator('input[type=radio]').first().check();}
    await page.locator('[data-submit-quiz]').click();await page.waitForFunction(id=>state.submittedQuizzes.includes(id),id);
  }
  const review=await readReview();assert.equal(review.status,200,review.body.message);checks.push('三处形成性检测实际提交后，学习回顾HTTP200');
  await page.evaluate(()=>ThreeArmStudyUI.openReview());await page.getByRole('dialog',{name:'学习回顾与配置关联',exact:true}).waitFor({state:'visible'});
  await page.screenshot({path:path.join(out,'阶段回顾正常打开.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'regression.json'),JSON.stringify({passed:true,checks,first:result.checkResult,second:secondResult.checkResult,reviewStatus:review.status,errors},null,2));
  console.log(JSON.stringify({passed:true,checks,errors})); }catch(e){fs.writeFileSync(path.join(out,'failed-http-diagnostic.json'),JSON.stringify({errors,decisions,snapshot:await snapshot()},null,2));await page.screenshot({path:path.join(out,'失败诊断.png')}).catch(()=>{});console.error((await page.locator('body').innerText()).slice(-1600));throw e;}finally{await browser.close();}
}
main('check').catch(e=>{console.error(e);process.exitCode=1;});
