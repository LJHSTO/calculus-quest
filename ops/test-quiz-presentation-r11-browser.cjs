'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
const base=process.env.STUDENT_UX_BASE_URL||'',version=process.env.STUDY_UI_ASSESSMENT_VERSION||'r11';
assert.match(base,/^http:\/\/127\.0\.0\.1:/);assert(['r10','r11'].includes(version));
const out=path.resolve(__dirname,'../output/playwright/r11-quiz');fs.mkdirSync(out,{recursive:true});
const figures=require('../lib/assessments/assessment-figures-r11');
async function main(){
 const account={nickname:'测量界面验证'+Date.now(),password:'Synthetic-quiz-r11-only'};
 const api=async(url,body)=>{const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(account.token?{Authorization:'Bearer '+account.token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,200,url+':'+(data.message||''));return data;};
 account.token=(await api('/api/auth/register',account)).token;
 const preferences=(await api('/api/learning/learner-preferences')).data;
 const baseline=(await api('/api/study/survey?stage=baseline')).data;
 await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(baseline.items.map(q=>[q.id,3]))});
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 try{
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});
  await page.locator('#login-identifier').fill(account.nickname);await page.locator('#login-password').fill(account.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('[data-view=learn]').first().click();await page.locator('.question-card').first().waitFor();
  // The r10 diagnostic service predates API figure projection; exercise the same public figure object explicitly there.
  if(version==='r10')await page.evaluate(figure=>{const unit=getUnit();unit.scene.content.questions[2].figure=figure;renderQuiz(unit);},figures.publicFigure(preferences.study.assessmentOrder[0].toLowerCase()+'-point-membership'));
  assert.equal(await page.locator('[data-choice-answer][value="__skip__"]').count(),0,'omission is not an answer option');
  assert.equal(await page.locator('[data-short-skip]').count(),0,'short answer omission is not a second checkbox');
  const questions=await page.locator('.question-card').evaluateAll(cards=>cards.map(n=>({id:n.dataset.question,short:!!n.querySelector('[data-short-answer]')})));
  const first=page.locator('.question-card').nth(0),second=page.locator('.question-card').nth(1);
  await first.locator('[value="__unknown__"]').check();await first.locator('[data-quiz-omission]').click();
  assert(await first.locator('[value="__unknown__"]').isDisabled());assert.equal(await first.locator('[value="__unknown__"]').isChecked(),false);
  await first.getByRole('button',{name:'返回作答',exact:true}).click();assert(await first.locator('[value="__unknown__"]').isChecked());
  await first.locator('[data-quiz-omission]').click();await second.locator('[value="__unknown__"]').check();
  const short=page.locator('.question-card').filter({has:page.locator('[data-short-answer]')}).first();
  await short.locator('[data-short-answer]').fill('先比较两个允许输入的结果。');await short.locator('[data-quiz-omission]').click();await short.locator('[data-quiz-omission]').click();
  assert.equal(await short.locator('[data-short-answer]').inputValue(),'先比较两个允许输入的结果。','returning before submission preserves the current draft');
  for(let i=2;i<questions.length;i++)await page.locator('.question-card').nth(i).locator('[data-quiz-omission]').click();
  const figuresShown=await page.locator('.assessment-figure img').count();assert(figuresShown>0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.assessment-figure img')].every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.evaluate(()=>renderAssessmentFigure({src:'https://example.com/remote.svg'})), '');
  assert.equal(await page.evaluate(()=>renderAssessmentFigure({src:'assets/assessment/functions-limits-r11/../secret.svg'})), '');
  const layouts=[];for(const width of [1366,1024,390]){await page.setViewportSize({width,height:900});const figure=page.locator('.assessment-figure').first();await figure.scrollIntoViewIfNeeded();const layout=await figure.evaluate(n=>({viewport:innerWidth,document:document.documentElement.scrollWidth,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right}));assert(layout.document<=width+1);assert(layout.width<=width);layouts.push(layout);await page.screenshot({path:path.join(out,`测量嵌图与遗漏-${width}.png`)});}
  await page.evaluate(()=>syncLearningSnapshot('quiz-omission-refresh'));
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view=learn]').first().click();
  assert.equal(await page.locator('.question-card').first().locator('[data-quiz-omission]').textContent(),'返回作答');
  await page.locator('.question-card').first().locator('[data-quiz-omission]').click();assert(await page.locator('.question-card').first().locator('[value="__unknown__"]').isEnabled());
  await page.locator('.question-card').first().locator('[data-quiz-omission]').click();
  await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));
  const results=await page.evaluate(()=>state.quizResults.filter(row=>row.unitId==='V14-C1-pre').map(({questionId,response,status,isCorrect})=>({questionId,response,status,isCorrect})));
  assert.equal(results.find(r=>r.questionId===questions[0].id).response,'__skip__');
  assert.equal(results.find(r=>r.questionId===questions[1].id).response,'__unknown__');
  assert(results.every(row=>row.status==='submitted'&&row.isCorrect===null),'independent measurement receipts must retain response kinds without exposing answers or correctness');
  await page.waitForFunction(()=>document.querySelectorAll('[data-quiz-omission]:enabled').length===0);
  assert.deepEqual(errors,[]);
  const report={synthetic:true,version,figureProjection:version==='r11'?'real_api':'explicit_public_figure_fixture',figuresShown,layouts,results,errors};fs.writeFileSync(path.join(out,'嵌图与遗漏回归.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
