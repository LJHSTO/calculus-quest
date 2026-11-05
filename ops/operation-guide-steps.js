'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(page,dir,arm){
 const tour=page.locator('#workspace-operation-tour');await tour.waitFor();
 assert.equal(await tour.evaluate(n=>n.tagName),'SECTION','导览必须嵌入真实页面，不能复制一套弹窗课件');
 assert.equal(await page.locator('#learner-setup[open]').count(),0);
 assert.equal(await page.evaluate(()=>currentUnitId),'GH-01-K01');
 const original=await page.evaluate(()=>({completed:[...state.completed],quizzes:[...state.submittedQuizzes]}));
 await tour.getByRole('button',{name:'稍后继续',exact:true}).click();await page.waitForFunction(()=>currentUnitId==='V14-C1-pre');
 assert.equal(await page.locator('#learner-setup[open]').count(),0);
 await page.locator('[data-quiz-path-action=pilot-next]').last().click();await tour.waitFor();
 for(let i=0;i<7;i++){
  await page.waitForFunction(()=>document.querySelectorAll('.operation-guide-target').length===1);
  if(i<5)assert.equal(await tour.locator('[data-guide-next]').isEnabled(),false);
  if(i===0){await page.locator('#lesson-rail-toggle').click();await page.locator('#lesson-rail-toggle').click();}
  if(i===1){await page.locator('.multi-scene-slide-panel:not([hidden]) [data-openmaic-state=ready]').waitFor();await page.locator('[data-classroom-action=play]').click();await page.waitForFunction(()=>document.querySelector('[data-classroom-action=play]').getAttribute('aria-label').includes('暂停'));}
  if(i===2){await page.locator('[data-knowledge-scene=simulation]').click();await page.locator('iframe[data-courseware-frame]').waitFor({state:'visible'});assert.match(await page.locator('iframe[data-courseware-frame]').getAttribute('data-context-id'),/GH-01-K01:simulation/);}
  if(i===3){await page.locator('#workspace-tools-toggle').click();if(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded')!=='true')await page.locator('#workspace-tools-toggle').click();assert.equal(await page.locator('#workspace-tools-toggle').getAttribute('aria-expanded'),'true');}
  if(i===4){await page.locator('[data-classroom-action=note]').click();const editor=page.locator('[data-knowledge-note-editor]');await editor.waitFor({state:'visible'});await page.locator('[data-knowledge-note-colors] [data-note-color=pink]').click();assert.equal(await editor.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 237, 245)');await page.screenshot({path:path.join(dir,arm+'组-真实笔记换色.png')});await page.locator('[data-knowledge-note-cancel]').click();}
  if([1,2,4,6].includes(i))await page.screenshot({path:path.join(dir,arm+'组-真实页面导览-'+i+'.png')});
  if(i===1||i===6){const size=page.viewportSize();await page.setViewportSize({width:500,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'窄屏不能横向溢出');await page.screenshot({path:path.join(dir,arm+'组-真实导览窄屏-'+i+'.png')});await page.setViewportSize(size);}
  if(i===6){assert.equal(await tour.locator('[data-guide-settings] li').count(),6);assert.deepEqual(await page.evaluate(()=>({completed:[...state.completed],quizzes:[...state.submittedQuizzes]})),original,'真实操作不能提前完成知识点或检测');}
  await tour.locator('[data-guide-next]').click();
 }
 await tour.waitFor({state:'hidden'});assert.equal(await page.locator('.operation-guide-target').count(),0);
};
