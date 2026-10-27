'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),M=require('../resources/open-maic/主动探索证据/exploration-model'),route=require('../data/multi-scene-learning-route.json');
const base=process.env.CQ_TEST_URL||'http://127.0.0.1:59225',out=path.join(root,'output/课件语义与完整流程验收-2026-10-27');
async function main(){fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(12000);const results=[];
 try{for(const module of route.chapters.find(c=>c.id==='V14-C1').modules)for(const p of module.knowledgePoints)for(const r of p.resourceCandidates){
  const task=M.get(p.id,r.type);if(!task)continue;
  await page.goto(base+'/resources/'+r.root+'/'+r.file+'?cqContextBridge=1');
  const d=page.locator('.concept-exploration');await d.waitFor({state:'attached'});
  if(!await d.isVisible()||await d.evaluate(n=>Boolean(n.closest('.collapsed')))){
   const toggles=page.locator('#sidebarToggle,#toggle-sidebar,#sidebar-toggle,.sidebar-toggle,#toggleSidebar');
   if(await toggles.count()&&await toggles.first().isVisible())await toggles.first().click();
  }
  await d.locator('summary').first().click();
  assert.ok((await d.locator('label span').first().boundingBox()).width>=160,`${p.id}:${r.type}选项不能挤成竖排`);
  await page.evaluate(()=>{window.__conceptEvents=[];window.addEventListener('message',e=>{if(e.data?.type==='maic_learning_event')window.__conceptEvents.push(e.data.payload);});});
  const wrong=task.options.map((_,i)=>i).filter(i=>i!==task.answer);
  for(const response of [...wrong,task.answer]){await d.locator(`input[value="${response}"]`).check();await d.locator('button[type=submit]').click();await d.locator('.concept-result').waitFor({state:'visible'});}
  await page.waitForFunction(()=>window.__conceptEvents.filter(x=>x.event_type==='challenge_result').length===3);
  const events=await page.evaluate(()=>window.__conceptEvents.filter(x=>x.event_type==='challenge_result'));
  assert.equal(events.length,3,`${p.id}:${r.type}需要真实上报三次不同判断`);
  assert.deepEqual(events.map(e=>e.is_correct),[false,false,true]);assert.ok(events.every(e=>e.independent===false));
  assert.ok(await d.locator('.concept-result').innerText().then(t=>t.includes('成立')));
  await page.screenshot({path:path.join(out,`${p.id}-${r.type}.png`)});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=2,`${p.id}:${r.type}横向溢出${overflow}`);
  await d.getByRole('button',{name:'收起，继续探索',exact:true}).click();assert.equal(await d.getAttribute('open'),null);
  results.push({point:p.id,scene:r.type,events:events.length,serverRulesRechecked:events.every(e=>M.grade(e,p.id)===e.is_correct),overflow});
 }assert.equal(results.length,18);console.log('18个非game课件：真实控件、三次判断上报、数学规则复判、恢复探索与桌面布局全部通过');}
 finally{fs.writeFileSync(path.join(out,'18课件浏览器验收.json'),JSON.stringify({synthetic:true,passed:results.length===18,results},null,2));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
