'use strict';
const assert=require('node:assert/strict');
// Traverse the actual visible lecture pages; do not seed completion state.
module.exports=async page=>{
  await page.locator('[data-openmaic-state=ready]').first().waitFor();
  const tab=page.locator('[data-workspace-canvas=interactive]');
  if(await tab.getAttribute('aria-disabled')==='true'){
    await tab.click({force:true});
    assert.equal(await page.locator('.multi-scene-slide-panel').isVisible(),true,'未浏览全部讲解时应留在讲解');
  }
  const primary=page.locator('[data-learning-primary-action]');
  for(let i=0;i<20;i++){
    await page.waitForFunction(()=>!document.querySelector('[data-learning-primary-action]')?.disabled);
    const label=await primary.innerText();
    if(!/下一讲解页|进入互动探索/.test(label))break;
    const old=await page.locator('[data-openmaic-page]').first().getAttribute('data-openmaic-page');
    await primary.click();
    if(/下一讲解页/.test(label))await page.waitForFunction(old=>{const h=document.querySelector('[data-openmaic-page]');return h?.dataset.openmaicPage!==old&&['ready','fallback'].includes(h?.dataset.openmaicState);},old);
    else break;
  }
  assert.equal(await page.locator('.multi-scene-scene-panel').isVisible(),true,'浏览讲解后可进入互动');
};
