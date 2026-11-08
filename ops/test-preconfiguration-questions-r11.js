'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core'),registry=require('../lib/assessments/functions-limits-registry');
const base=process.argv.find(x=>x.startsWith('http:'))||'http://127.0.0.1:53657';assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const out=path.resolve(__dirname,'../tmp/preconfiguration-questions-r11');fs.mkdirSync(out,{recursive:true});
async function main(){
 const nickname='前测后提问合成'+Date.now(),password='Synthetic-preconfig-question-123';let token='',runId='';const checks=[],errors=[];
 const api=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(token?{Authorization:'Bearer '+token}:{}),...(runId&&!route.startsWith('/api/auth/')?{'X-Study-Run':runId}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let payload;try{payload=JSON.parse(text);}catch{payload={stream:text};}return {status:r.status,payload};};
 const registration=await api('/api/auth/register',{nickname,password});assert.equal(registration.status,200);token=registration.payload.token;
 const run=(await api('/api/study/state')).payload.data.run;runId=run.id;const bank=registry.forVersion(run.assessmentVersion);assert(bank);
 const survey=(await api('/api/study/survey?stage=baseline')).payload.data;
 assert.equal((await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,3]))})).status,200);
 const concept={chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'slide',question:'什么是函数？请说明允许的输入与输出之间的关系。',contextRef:{kind:'unit',scope:'lesson',unitId:'GH-01-K01',chapterId:'V14-C1'}};
 const before=await api('/api/learning/assistant/ask',concept);checks.push({name:'前测未提交仍保护普通概念提问',passed:before.status===409,status:before.status,code:before.payload.code});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(18000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#login-identifier').fill(nickname);await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view="learn"]').first().click();await page.waitForTimeout(600);
  checks.push({name:'前测未提交时真实输入框保持禁用',passed:await page.locator('#knowledge-question-input').isDisabled()});
  const submit=await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:bank.questions('pre',run.assessmentOrder[0]).map(q=>({questionId:q.id,response:q.type==='short_answer'?'合成前测回答，保留人工批改。':q.answer[0]}))});assert.equal(submit.status,200,JSON.stringify(submit.payload));
  const preparation=(await api('/api/study/state')).payload.data;assert.equal(preparation.preparation.stage,'configuration');assert.equal(preparation.run.configuredAt,null);
  const after=await api('/api/learning/assistant/ask',concept);checks.push({name:'前测已提交但未配置时，普通概念HTTP能作答',passed:after.status===200&&String(after.payload.stream||'').includes('"done"'),status:after.status,code:after.payload.code});
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();await page.waitForTimeout(800);
  if(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded')==='false')await page.locator('#workspace-tools-toggle').click();
  const input=page.locator('#knowledge-question-input'),usable=await input.isVisible()&&!await input.isDisabled();checks.push({name:'前测完成页未配置时，真实知点输入框可用',passed:usable});
  checks.push({name:'保护测验不出现逐题讲解入口',passed:await page.locator('.question-task-review:visible').count()===0});
  let replyId='';
  if(usable){
   await input.fill(concept.question);const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/learning/assistant/ask'));await page.locator('[data-knowledge-send]').click();const response=await responsePromise,text=await response.text(),request=response.request().postDataJSON();
   checks.push({name:'实际发送走课程概念上下文并获得完整回复',passed:response.status()===200&&request.unitId==='GH-01-K01'&&text.includes('"done"'),status:response.status(),unitId:request.unitId});
   replyId=text.split(/\r?\n/).map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(e=>e?.type==='done')?.message?.id||'';
   checks.push({name:'概念请求没有携带前测题号或题目摘录',passed:request.contextRef?.scope==='lesson'&&!request.contextRef.questionId&&!request.contextRef.excerpt&&request.contextRef.unitId==='GH-01-K01'});
   await page.waitForTimeout(300);
  }
  await page.screenshot({path:path.join(out,'前测已交未配置知点.png')});
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();
  if(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded')==='false')await page.locator('#workspace-tools-toggle').click();
  const restored=replyId?await page.locator(`[data-message-id="${replyId}"]`).waitFor({state:'visible',timeout:10000}).then(()=>true,()=>false):false;
  checks.push({name:'刷新并重新打开知点后仍能看到同一条课程概念回复',passed:restored});
  checks.push({name:'提问没有自动标记首知识点完成',passed:await page.evaluate(()=>!state.completed.includes('GH-01-K01'))});
  await page.screenshot({path:path.join(out,'刷新后课程概念回复仍在.png')});
  const final=(await api('/api/study/state')).payload.data;checks.push({name:'提问不会替学生确认六维配置',passed:final.run.configuredAt===null});
  const policy=(await api('/api/learning/proactive/state?chapterId=V14-C1')).payload.data;checks.push({name:'配置确认前主动帮助仍关闭',passed:policy.researchControls.profile.proactivity==='reactive'});
  const report={passed:checks.every(c=>c.passed)&&!errors.length,checks,errors,visibleText:(await page.locator('body').innerText()).slice(-1800)};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks,errors}));if(!report.passed)process.exitCode=1;
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
