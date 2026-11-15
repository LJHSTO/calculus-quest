'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core'),registry=require('../lib/assessments/functions-limits-registry'),adapter=require('../lib/proactive-policy/adapters/functions-limits-r16');
const base=process.env.STUDENT_UX_BASE_URL,live=process.argv.includes('--assert-live'),sidebar=process.argv.includes('--sidebar'),out=path.resolve(process.env.HELP_FLOW_OUTPUT||'output/playwright/r16-'+(live?'live-':'')+(sidebar?'sidebar-':'')+'flow');assert.match(base||'',/^http:\/\/127\.0\.0\.1:\d+$/);fs.mkdirSync(out,{recursive:true});
const pointLimit=Number(process.env.HELP_FLOW_POINT_LIMIT||6);assert(Number.isInteger(pointLimit)&&pointLimit>=1&&pointLimit<=6);
if(live)require('../lib/llm'); // Load only this machine's configured model name, never print credentials.
async function main(){
 let token='';const api=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();assert.equal(r.status,200,route+': '+p.message);return p;};
 const nickname='完整帮助合成'+Date.now(),password='Synthetic-help-r16';token=(await api('/api/auth/register',{nickname,password})).token;
 const run=(await api('/api/study/state')).data.run,items=(await api('/api/study/survey?stage=baseline')).data.items;
 await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(items.map(q=>[q.id,q.type==='text'?'合成回答':3]))});
 const bank=registry.forVersion(run.assessmentVersion);await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:bank.questions('pre',run.assessmentOrder[0]).map(q=>({questionId:q.id,response:'__unknown__'}))});
 const pref=(await api('/api/learning/learner-preferences')).data;if(sidebar)pref.record.answers.D4={value:'sidebar',reason:'fit',note:''};await api('/api/learning/learner-preferences',{answers:pref.record.answers,expectedRevision:pref.record.revision});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot()),replies=[];
 async function received(promise){const r=await promise;assert.equal(r.status(),200);const done=(await r.text()).trim().split(/\r?\n/).map(s=>JSON.parse(s)).find(e=>e.type==='done');assert(done);if(live){assert(['openai-compatible','course-math-guard'].includes(done.message.provider));assert.equal(done.fallback,done.message.provider==='course-math-guard');assert.equal(done.message.modelAudit.reportedModel,process.env.LEARNING_ASSISTANT_MODEL);}replies.push({inputOrigin:done.message.contextRef?.inputOrigin,inputActionLabel:done.message.contextRef?.inputActionLabel,questionId:done.message.contextRef?.questionId,text:done.message.content,provider:done.message.provider,modelAudit:done.message.modelAudit,fallback:done.fallback});await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().busy);if(!live)await page.waitForTimeout(3100);}
 try{
  await page.goto(base+'/?study=B');await page.locator('#login-identifier').fill(nickname);await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view=learn]').first().click();
  for(let index=0;index<pointLimit;index++){
   if(index===3){await page.evaluate(()=>ThreeArmStudyUI.openReview());const dialog=page.locator('#three-arm-dialog');await dialog.getByLabel('先保持当前设置').check();assert.equal(await dialog.locator('[data-study-question]').count(),0);await page.screenshot({path:path.join(out,'中段回顾.png')});await dialog.getByRole('button',{name:'保存回顾并继续',exact:true}).click();await dialog.waitFor({state:'hidden'});}

   const point=`GH-0${index<3?1:2}-K0${index%3+1}`,unit=point+'-formative',questions=registry.formative(index,bank.version);
   await page.evaluate(async id=>{ensureAgenticPath().pendingPlan=null;agenticUnlockUnit(id,'synthetic-r16-review');selectUnit(id);await syncLearningSnapshot('synthetic-r16-review');await KnowledgeAssistant.reloadLearnerPolicy();},unit);
   await page.locator('.question-card').first().waitFor();for(const q of questions){const wrong=q.options.find(o=>!q.answer.includes(o.value));await page.locator(`.question-card[data-question="${q.id}"] input[value="${wrong.value}"]`).check();}
   await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().offer?.questionId));
   const offer=(await snap()).offer;assert.equal(offer.contentVersion,'formative-scaffolds-r16-20261113');assert.equal(await page.getByRole('button',{name:'查看简短提示',exact:true}).count(),0,'邀请只保留一个打开入口');if(sidebar)await page.evaluate(()=>KnowledgeAssistant.open());
   await page.getByRole('button',{name:'看看知点的提示',exact:true}).first().click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().policyState?.lifecycle?.phase==='accepted_pending_response');
   const request=page.waitForResponse(r=>r.url().endsWith('/api/learning/assistant/ask'));const choice=page.locator('.knowledge-proactive-reply-options button').first();
   if(await choice.count())await choice.click();else{await page.locator('.task-response-form textarea').last().fill('请讲清我刚才的回答错在哪里，并给出一个可以继续尝试的小步骤。');await page.getByRole('button',{name:'发送我的想法',exact:true}).last().click();}
   await received(request);
   assert.equal(await page.locator('.task-conversation-scroll .task-message-actions').count(),0,'下一步操作不放进回答滚动区');
   let releaseStale=null;
   if(index===0){
    let capture;const captured=new Promise(r=>capture=r),hold=new Promise(r=>releaseStale=r);let first=true;
    await page.route('**/api/learning/proactive/state?*',async route=>{if(!first){await route.continue();return;}first=false;const response=await route.fetch();capture();await hold;await route.fulfill({response});});
    await page.evaluate(()=>{void KnowledgeAssistant.reloadLearnerPolicy();});await captured;
   }
   const started=page.waitForResponse(r=>r.url().endsWith('/api/learning/proactive/check')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'用一道题独立检验',exact:true}).click();const startResponse=await started;assert.equal(startResponse.status(),200,await startResponse.text());releaseStale?.();await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().check));
   if(index===0)await page.unroute('**/api/learning/proactive/state?*');
   if(sidebar){assert.equal(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded'),'true','独立检查期间保留侧栏');await page.locator('.learning-support-surface[data-placement=sidebar]').waitFor({state:'visible'});}const check=(await snap()).check;assert.equal(check.sourceQuestionId,offer.questionId,'独立检查对准刚才的卡点');const wrong=check.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:point,supportLevel:check.supportLevel,checkId:check.id,response:o.value})?.correct===false);assert(wrong);
   await page.getByRole('radiogroup').getByRole('radio').nth(check.options.indexOf(wrong)).click();await page.getByRole('button',{name:'提交检查',exact:true}).click();await page.getByText('这道检查题还需要再看看',{exact:true}).first().waitFor();
   assert.equal(await page.locator('.support-other-questions').evaluate(n=>n.tagName),'SECTION','其他错题始终展开');
   const follow=page.waitForResponse(r=>r.url().endsWith('/api/learning/assistant/ask'));await page.getByRole('button',{name:'还没弄懂，继续讲解',exact:true}).first().click();await received(follow);
   await page.screenshot({path:path.join(out,point+'-补充讲解.png')});
   assert((await snap()).taskMessages.some(m=>m.role==='user'&&m.content.includes('刚才的独立检查')),'继续帮助必须真的接着解释');
   if(process.argv.includes('--check-followup')){
    assert.equal(replies.at(-1).modelAudit.contextAudit.activeCheckId,check.id,'明确讨论已完成检查');
    assert.equal(replies.at(-1).inputOrigin,'action_button');assert.equal(replies.at(-1).inputActionLabel,'还没弄懂，继续讲解');
    const continuing=page.waitForResponse(r=>r.url().endsWith('/api/learning/assistant/ask'));
    await page.locator('.task-response-form textarea').last().fill('第二步我还是不懂，能用具体数值讲清吗？');await page.getByRole('button',{name:'发送我的想法',exact:true}).last().click();await received(continuing);
    assert.equal(replies.at(-1).modelAudit.contextAudit.activeCheckId,check.id,'未重复题名的追问仍属于刚才检查');
    assert.equal(replies.at(-1).inputOrigin,'manual_submit');
   }
   const next=questions.find(q=>q.id!==offer.questionId),nextRequest=page.waitForResponse(r=>r.url().endsWith('/api/learning/assistant/ask'));await page.getByRole('button',{name:/下一题：讲解第/}).click();await received(nextRequest);
   if(live){const audit=replies.at(-1).modelAudit.contextAudit;assert.equal(audit.questionId,next.id);assert.equal(audit.retainedHistoryMessages,0,'下一题首次讲解不带上一题的对话');assert(audit.excludedOtherQuestionMessages>=2,'原题历史仍在数据库，但不混入新题提示');}
   const panel=page.locator(sidebar?'.learning-support-surface[data-placement=sidebar]':'.task-support-panel');if(!sidebar)assert.equal(await panel.evaluate(n=>n.closest('.question-card').dataset.question),next.id);
   const context=await panel.locator('.support-question-context').innerText();assert.match(context,/正在讲解：本次检测第/);assert(!context.includes('未作答'),'显示学生已提交的答案');assert(context.length>50,'保留原题完整上下文');assert.equal(await panel.locator('.support-check-verdict').count(),0,'上一题检查不混入下一题');
   const position=await panel.locator('.task-conversation-scroll').evaluate(n=>{const a=n.querySelector('.knowledge-message.assistant');return a?Math.abs(a.getBoundingClientRect().top-n.getBoundingClientRect().top):999;});assert(position<100,'新回答从开头显示：'+position);
   await page.screenshot({path:path.join(out,point+'-下一题.png')});await page.getByRole('button',{name:'结束本次讨论',exact:true}).click();assert.equal(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded'),'false');checks.push({point,firstQuestion:offer.questionId,nextQuestion:next.id,checkId:check.id,context,answerStartOffset:position});console.log('通过完整帮助流程：'+point);
  }
  assert.deepEqual(errors,[]);
 }catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.message,snapshot:await snap(),errors},null,2));await page.screenshot({path:path.join(out,'failure.png')});throw e;}finally{const passed=checks.length===pointLimit&&!errors.length;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed,expectedPoints:pointLimit,checks,replies,live,sidebar,errors,synthetic:true},null,2));if(passed)for(const file of ['failure.json','failure.png'])fs.rmSync(path.join(out,file),{force:true});await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
