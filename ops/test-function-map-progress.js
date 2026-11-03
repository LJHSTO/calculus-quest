'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
async function main(){
 const root=path.resolve(__dirname,'..'),file='resources/open-maic/GH-01-函数、坐标与图像读法入门/interactive/04_输入、输出和函数规则：关系图.html',base=process.env.CQ_TEST_URL;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const checks=[];
 try{const page=await browser.newPage({viewport:{width:1100,height:540}});
  await page.addInitScript(()=>{window.mapNodeEvidence=[];window.addEventListener('message',event=>{const data=event.data;if(data?.type==='maic_learning_event'&&data.payload?.event_type==='exploration_observed')window.mapNodeEvidence.push(data.payload.parameters.value);});});
  await page.goto(base?base+'/'+file.split('/').map(encodeURIComponent).join('/')+'?cqContextBridge=1':pathToFileURL(path.join(root,file)).href);
  let current=1;
  async function check(expected){
   assert.equal(await page.locator('.node-group.revealed').count(),expected,'显示节点数');
   assert.equal(Number((await page.locator('#step-indicator').innerText()).match(/\d+/)[0]),expected,'进度必须与实际展开节点一致');
   assert.equal(await page.locator('#btn-prev').isDisabled(),expected===0);
   assert.equal(await page.locator('#btn-next').isDisabled(),expected===4,'最后节点必须关闭下一步');
   const misplaced=await page.locator('.node-group.revealed').evaluateAll(nodes=>nodes.filter(node=>{const authored=node.transform.baseVal.consolidate().matrix,painted=new DOMMatrix(getComputedStyle(node).transform);return Math.abs(authored.e-painted.e)>.1||Math.abs(authored.f-painted.f)>.1;}).length);
   assert.equal(misplaced,0,'展开动画不能覆盖节点坐标或把节点移到左上角');
   for(const id of ['#btn-prev','#btn-next']){const box=await page.locator(id).boundingBox();assert.ok(box.y>=0&&box.y+box.height<=540,'翻页保持首屏可见');}
   checks.push(expected);current=expected;
   if(base&&(checks.length===1||expected===4))await page.screenshot({path:path.join(root,'output/学生体验修复-20261102',expected===4?'关系图进度-公网-全部展开.png':'关系图进度-公网-初始.png')});
  }
  await check(1);
  for(const expected of [2,3,4,3,2,1,0,1,2]){await page.locator(expected>current?'#btn-next':'#btn-prev').click();await page.waitForTimeout(250);await check(expected);if(base&&expected>0)assert.equal(await page.evaluate(()=>mapNodeEvidence.at(-1)),`n${expected}`,'探索证据应对应实际展开节点');}
  await page.locator('#btn-restart').click();await page.waitForTimeout(250);await check(1);
  const out=path.join(root,'output/学生体验修复-20261102',base?'关系图进度-公网.json':'关系图进度-本地.json');fs.writeFileSync(out,JSON.stringify({passed:true,checkedAt:new Date().toISOString(),base:base||'local',checks},null,2));
  console.log('通过：初始、前进到末尾、退回零节点、重开和翻页首屏可见');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
