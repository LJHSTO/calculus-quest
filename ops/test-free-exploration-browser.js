'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright-core'),M=require('../resources/open-maic/主动探索证据/free-exploration');
const root=path.resolve(__dirname,'..'),route=require('../data/multi-scene-learning-route.json'),out=path.join(root,'output/自由探索触发核验-2026-10-27');
async function main(){fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(15000);const results=[];
try{for(const module of route.chapters.find(c=>c.id==='V14-C1').modules)for(const p of module.knowledgePoints)for(const r of p.resourceCandidates){
 const config=M.get(p.id,r.type);if(!config)continue;
 await page.goto((process.env.CQ_TEST_URL||'http://127.0.0.1:59225')+'/resources/'+r.root+'/'+r.file+'?cqContextBridge=1');await page.locator('.free-exploration-guide').waitFor({state:'attached'});
 await page.evaluate(()=>{window.__freeEvents=[];window.addEventListener('message',e=>{if(e.data?.type==='maic_learning_event'&&e.data.payload.event_type==='exploration_observed')window.__freeEvents.push({payload:e.data.payload,at:Date.now()});});});
 const [channel,b]=Object.entries(config.bindings)[0];
 if(r.type==='mindMap'){
  const next=page.locator('#btn-next,#nextBtn').first();
  for(let i=0;i<3;i++){await next.click();if(i<2)await page.waitForTimeout(3500);}
 }else if(b.values){
  const loc=page.locator(b.selector);if(b.event==='change'){await loc.focus();await loc.press('End');await loc.press('Tab');await page.waitForTimeout(3500);await loc.focus();await loc.press('Home');await loc.press('Tab');}
  else if(channel==='gap'){await loc.click();await page.waitForTimeout(3500);await loc.click();}
  else{await loc.nth(0).click();await page.waitForTimeout(3500);await loc.nth(1).click();}
 }else if(b.read){
  const box=await page.locator(b.selector).boundingBox();for(const fraction of [.3,.7]){await page.mouse.move(box.x+box.width*fraction,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*(fraction+.05),box.y+box.height*.5,{steps:8});await page.mouse.up();await page.waitForTimeout(3500);}
 }else{
  const slider=page.locator(b.selector);await slider.focus();await slider.press(p.id==='GH-02-K03'&&r.type==='simulation'?'Home':'End');await slider.press('Tab');await page.waitForTimeout(3500);await slider.focus();
  if(p.id==='GH-02-K03'&&r.type==='simulation'){for(let i=0;i<80;i++)await slider.press('ArrowRight');}else await slider.press('Home');await slider.press('Tab');
 }
 await page.waitForTimeout(700);
 const events=await page.evaluate(()=>window.__freeEvents),rows=events.map((e,i)=>({id:'ui-'+i,created_at:new Date(e.at).toISOString(),payload:{eventType:'courseware_exploration_observed',data:e.payload}}));
 const opportunity=M.collect(rows,p.id,r.type,Date.now());assert.ok(opportunity,p.id+':'+r.type+' 未形成真实探索比较：'+JSON.stringify(events));
 if(config.bindings.input&&config.bindings.rule){const slider=page.locator(config.bindings.input.selector);await slider.focus();await slider.press('End');await slider.press('Tab');await page.waitForTimeout(3500);await slider.focus();await slider.press('Home');await slider.press('Tab');await page.waitForTimeout(300);
  const inputs=await page.evaluate(()=>window.__freeEvents.filter(e=>e.payload.parameters.channel==='input'));
  assert.ok(inputs.length>=2&&inputs.every(e=>M.verify(e.payload,p.id)),p.id+' 输入变化必须关联实际函数规则');
 }
 const speed=page.locator('#speed-slider,#drag_speed-slider,#gravity-slider').first();
 if(await speed.count()&&await speed.isVisible()){const count=await page.evaluate(()=>window.__freeEvents.length);await speed.focus();await speed.press('ArrowRight');await speed.press('Tab');await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__freeEvents.length),count,'速度、重力不进入探索证据');}
 assert.equal(await page.locator('.concept-exploration[open]').count(),0,'全程不做可选核对');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=2);
 await page.screenshot({path:path.join(out,p.id+'-'+r.type+'.png')});results.push({point:p.id,scene:r.type,events:events.length,opportunity:opportunity.text,optionalChecks:0,overflow});console.log(p.id+' '+r.type+' 已核验');
}assert.equal(results.length,18);}finally{fs.writeFileSync(path.join(out,'18场景自由探索浏览器核验.json'),JSON.stringify({synthetic:true,passed:results.length===18,results},null,2));await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
