'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),base=process.env.STUDENT_UX_BASE_URL||'',out=path.join(root,'output/playwright/r11-ui');
assert.match(base,/^http:\/\/127\.0\.0\.1:/);fs.mkdirSync(out,{recursive:true});
const assessmentVersion=process.env.STUDY_UI_ASSESSMENT_VERSION||'r11';
assert(['r10','r11'].includes(assessmentVersion));
const bank=require('../lib/assessments/functions-limits-'+assessmentVersion);
async function main(){
 const account={nickname:'界面诊断'+Date.now(),password:'Ui-flow-r11-synthetic'};
 const api=async(url,body)=>{const res=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(account.token?{Authorization:'Bearer '+account.token}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();assert.equal(res.status,200,url+': '+(data.message||res.status));return data;};
 account.token=(await api('/api/auth/register',{nickname:account.nickname,password:account.password})).token;
 let preferences=(await api('/api/learning/learner-preferences')).data;
 const baseline=(await api('/api/study/survey?stage=baseline')).data;
 await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(baseline.items.map(q=>[q.id,3]))});
 await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:bank.questions('pre',preferences.study.assessmentOrder[0]).map(q=>({questionId:q.id,response:q.type==='short_answer'?'__unknown__':q.answer[0]}))});
 preferences=(await api('/api/learning/learner-preferences')).data;
 await api('/api/learning/learner-preferences',{answers:preferences.record.answers,expectedRevision:preferences.record.revision});
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,channel:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?undefined:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 try{
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});
  await page.locator('#login-identifier').fill(account.nickname);await page.locator('#login-password').fill(account.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('[data-view=learn]').first().click();
  const report=[];
  for(const unit of ['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'])for(const scene of ['simulation','mindMap','game','visualization3d']){
   await page.evaluate(unit=>{ensureAgenticPath().pendingPlan=null;agenticUnlockUnit(unit,'ui_contract_fixture');selectUnit(unit);},unit);
   await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene="'+scene+'"]').click();
   const frame=page.frameLocator('iframe[data-courseware-frame]');await frame.locator('input:visible,button:visible,select:visible').first().waitFor({timeout:45000});
   const controls=await frame.locator('button,input,select').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length).map(n=>({tag:n.tagName,type:n.type,id:n.id,label:n.getAttribute('aria-label'),text:n.textContent.trim().replace(/\s+/g,' ').slice(0,65)})));
   await page.evaluate(()=>{window.uiInteractionEvents=[];if(!window.uiObserverSet){window.uiObserverSet=true;addEventListener('cq:learning-signal',e=>{if(/parameter|courseware|interactive/.test(e.detail?.event?.eventType))uiInteractionEvents.push(e.detail.event);});}});
   assert.equal(await page.locator('[data-learning-primary-action]').isDisabled(),true,unit+':'+scene+' requires an attempt');
   const range=async selector=>{await frame.locator(selector).focus();await frame.locator(selector).press('ArrowRight');};
   if(scene==='mindMap')await frame.locator('#btn-next,#nextBtn').click();
   else if(scene==='simulation'){
    if(unit==='GH-01-K02')await frame.getByRole('button',{name:/中等：抛物线/}).click();
    else if(unit==='GH-01-K03'){await frame.locator('#main-btn').click();await frame.locator('#canvas').click({position:{x:150,y:150}});}
    else await range({'GH-01-K01':'#input_x-slider','GH-02-K01':'#x-position-slider','GH-02-K02':'#breakpoint-slider','GH-02-K03':'#point_y_coordinate-slider'}[unit]);
   }else if(scene==='visualization3d'){
    if(unit==='GH-01-K01')await range('input[aria-label="固定输入x"]');
    if(unit==='GH-01-K02'){await frame.locator('#func-select').focus();await frame.locator('#func-select').press('ArrowDown');}
    if(unit==='GH-01-K03')await range('#r7-first');
    if(unit==='GH-02-K01')await range('#x-slider');
    if(unit==='GH-02-K02')await frame.getByRole('button',{name:'保留当前投影观察',exact:true}).click();
    if(unit==='GH-02-K03')await frame.getByRole('button',{name:'保留点值与附近趋势',exact:true}).click();
   }else{
    for(const input of await frame.locator('input[type=number]:visible').all())await input.fill('0');
    if(unit==='GH-01-K01'){await frame.getByRole('button',{name:'2',exact:true}).click();await frame.getByRole('button',{name:'比较并提交',exact:true}).click();}
    if(unit==='GH-01-K02'){for(const input of await frame.locator('[id^="on-"]').all())await input.click();await frame.getByRole('button',{name:'提交审核',exact:true}).click();}
    if(unit==='GH-01-K03')await frame.getByRole('button',{name:'提交构造',exact:true}).click();
    if(unit==='GH-02-K01'){await frame.getByRole('button',{name:'0.1',exact:true}).click();await frame.locator('#pred-yes').click();await frame.locator('#submit-point-btn').click();}
    if(['GH-02-K02','GH-02-K03'].includes(unit))await frame.getByRole('button',{name:'提交预测',exact:true}).click();
   }
   const ready=await page.waitForFunction(({unit,scene})=>Boolean(state.analytics?.interactionEvidence?.[unit]?.coursewareReadiness?.scenes?.[scene]?.attemptedAt),{unit,scene},{timeout:3500}).then(()=>true,()=>false);
   const result={unit,scene,ready,...await page.evaluate(({unit,scene})=>({label:document.querySelector('[data-learning-primary-action]')?.textContent,record:state.analytics?.interactionEvidence?.[unit]?.coursewareReadiness?.scenes?.[scene],events:window.uiInteractionEvents.map(e=>({eventType:e.eventType,source:e.source,data:e.data}))}),{unit,scene})};
   if(!ready)await page.screenshot({path:path.join(out,`互动未解锁-${unit}-${scene}.png`)});
   report.push(result);fs.writeFileSync(path.join(out,'24场景门控回归.json'),JSON.stringify({report,errors},null,2));console.log(JSON.stringify({unit,scene,ready,eventType:result.record?.eventType,label:result.label}));
  }
  assert(report.every(x=>x.ready),'All scenes allow real attempts to continue');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
