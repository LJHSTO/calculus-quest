'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
module.exports=async function frontendClassroom({clients,base,dir}){
 const browser=await chromium.launch({channel:'chrome',headless:true}),pages=[],errors=[],metrics=[],networkFailures=[],pending=new Map();let peakOpen=0;
 try{
  for(let offset=0;offset<clients.length;offset+=5){
   const results=await Promise.allSettled(clients.slice(offset,offset+5).map(async c=>{
    const page=await browser.newPage({viewport:{width:1366,height:900}});pages.push(page);peakOpen=Math.max(peakOpen,pages.length);page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push({worker:c.worker,message:e.message}));
    page.on('request',r=>pending.set(r,{worker:c.worker,path:new URL(r.url()).pathname,startedAt:Date.now()}));page.on('requestfinished',r=>pending.delete(r));page.on('requestfailed',r=>{networkFailures.push({...pending.get(r),error:r.failure()?.errorText});pending.delete(r);});
    const started=performance.now();await page.goto(base+'/?study='+c.arm);await page.locator('#login-identifier').fill(c.nickname);await page.locator('#login-password').fill(c.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view=learn]').first().click();
    await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().signedIn&&Boolean(document.querySelector('.core-learning-workspace'))&&Boolean(window.ThreeArmStudyUI?.run?.id));metrics.push({worker:c.worker,loginAndLessonMs:performance.now()-started});
    const identity=await page.evaluate(()=>ThreeArmStudyUI.run.id);assert.equal(identity,c.runId);
    // Prepared fixtures must enter actual course content. Staying on the
    // submitted pretest only exercises the workspace shell, not lesson assets.
    const lessonStarted=performance.now();
    await page.evaluate(async unitId=>{ensureAgenticPath().pendingPlan=null;agenticUnlockUnit(unitId,'synthetic_classroom_fixture');selectUnit(unitId);await syncLearningSnapshot('synthetic_classroom_fixture');},c.unitId);
    await page.waitForFunction(unitId=>currentUnitId===unitId&&Boolean(document.querySelector('.multi-scene-slide-panel')),c.unitId);
    const scene=c.worker%5===0?['simulation','mindMap','visualization3d','game'][Math.floor(c.worker/5)%4]:'slide';
    if(scene!=='slide'){
     await require('./visit-lecture-r19.cjs')(page);await page.locator(`[data-knowledge-scene="${scene}"]`).click();
     await page.frameLocator(`iframe[data-courseware-frame][data-context-scene-type="${scene}"]`).locator('.r9-concept').waitFor();
    }
    metrics.push({worker:c.worker,unitId:c.unitId,scene,lessonLoaded:true,lessonLoadMs:performance.now()-lessonStarted});
   }));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;console.log('浏览器学习会话已打开 '+pages.length+'/'+clients.length);
  }
  const interactions=await Promise.allSettled(pages.map(async(page,i)=>{const started=performance.now();await page.locator('#lesson-rail-toggle').click();await page.evaluate(()=>analyticsFlushUntilSettled(60000));return {worker:i,interactionMs:performance.now()-started,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)};}));
  const failures=interactions.filter(r=>r.status==='rejected');assert.equal(failures.length,0,failures.map(r=>r.reason.message).join('\n'));assert.deepEqual(errors,[]);
  assert.equal(peakOpen,100);assert.equal(interactions.filter(r=>r.value?.overflow).length,0);
  await pages[0].screenshot({path:path.join(dir,'100会话同时在线-电脑端.png')});
  assert.equal(metrics.filter(r=>r.lessonLoaded).length,clients.length);assert.equal(metrics.filter(r=>r.lessonLoaded&&r.scene!=='slide').length,20);
  fs.writeFileSync(path.join(dir,'前端百会话.json'),JSON.stringify({passed:true,synthetic:true,peakOpen,errors,metrics,interactions:interactions.map(r=>r.value),scope:'单机Chrome的100个隔离浏览器上下文同时进入实际知识点；80个讲解页、20个互动课件（四种形式各5个），逐批登录后同时操作与保存日志；合成准备阶段解锁目标知识点，不等于100台终端或生产网络测试'},null,2));
 }catch(e){fs.writeFileSync(path.join(dir,'前端百会话失败.json'),JSON.stringify({error:e.message,peakOpen,errors,metrics,networkFailures,pending:[...pending.values()].slice(-100)},null,2));throw e;}finally{await browser.close();}
};
