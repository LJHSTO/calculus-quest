'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async function(page,dir,arm){
 const tour=page.locator('#workspace-operation-tour[open]');await tour.waitFor();
 assert.equal(await page.locator('#learner-setup[open]').count(),0,'导览必须在六维配置前出现');
 const original=await page.evaluate(()=>({unit:currentUnitId,completed:[...state.completed],scene:{...state.selectedKnowledgeScenes}}));
 await tour.getByRole('button',{name:'稍后继续',exact:true}).click();
 assert.equal(await page.locator('#learner-setup[open]').count(),0,'暂停导览不得偷偷进入配置');
 await page.locator('[data-quiz-path-action=pilot-next]').last().click();await tour.waitFor();
 const actions=[()=>tour.locator('[data-tour-target=path] button').click(),()=>tour.locator('[data-tour-page]').click(),()=>tour.locator('.tour-scenes button').nth(1).click(),()=>tour.locator('[data-tour-assistant]').click(),()=>tour.locator('[data-tour-notes]').click()];
 for(let i=0;i<7;i++){
  assert.equal(await tour.locator('.is-tour-target').count(),1,'每步恰好一个高亮模块');
  if(i<5){assert.equal(await tour.locator('[data-guide-next]').isEnabled(),false);await actions[i]();}
  if([1,3,4].includes(i))await page.screenshot({path:path.join(dir,arm+'组-操作指引-'+i+'.png')});
  if(i===1){const size=page.viewportSize();await page.setViewportSize({width:500,height:900});assert.equal(await tour.evaluate(n=>n.scrollWidth>n.clientWidth+1),false,'窄屏导览不能横向溢出');await page.screenshot({path:path.join(dir,arm+'组-窄屏操作指引.png')});await page.setViewportSize(size);}
  if(i===4){await tour.getByRole('button',{name:'粉色',exact:true}).click();assert.match(await tour.locator('.tour-practice').getAttribute('style'),/rgb\(255, 240, 246\)|#fff0f6/);}
  if(i===6){const current=await page.evaluate(()=>({unit:currentUnitId,completed:[...state.completed],scene:{...state.selectedKnowledgeScenes}}));assert.deepEqual(current,original,'操作演练不改变学习进度或场景');}
  await tour.locator('[data-guide-next]').click();
 }
 await tour.waitFor({state:'hidden'});
};
