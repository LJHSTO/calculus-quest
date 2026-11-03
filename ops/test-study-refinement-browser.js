'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(root,'output/学生体验修复验收/建议复核-'));const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const errors=[];let passed=false;
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'resources/open-maic/函数极限-OpenMAIC修订/GH-02-K01.html')).href);
  assert.equal(await page.locator('#achievement').isVisible(),false,'未开始时不得显示成就');
  await page.getByRole('button',{name:'开始挑战',exact:true}).click();
  await page.locator('#candidate-grid').getByRole('button',{name:'2',exact:true}).click();await page.getByRole('button',{name:'预计输出不同',exact:true}).click();await page.getByRole('button',{name:'提交观测点',exact:true}).click();
  assert.equal(await page.locator('#achievement').isVisible(),false,'未完成时不得显示成就');
  await page.getByRole('button',{name:'查看提示',exact:true}).click();assert.match(await page.locator('#hint-container').innerText(),/不代表输出一定不同/);
  await page.screenshot({path:path.join(dir,'选点提示.png')});
  await page.goto(pathToFileURL(path.join(root,'resources/open-maic/GH-02-极限与连续：直觉探索/interactive/03_从数表观察趋近：拖动实验.html')).href);
  await page.getByRole('button',{name:'◀ 从左侧趋近',exact:true}).click();const first=Number(await page.locator('#x-position-display').innerText());assert.ok(Math.abs(first-.5)<.00001,'换侧保留初始距离');
  await page.getByRole('button',{name:'◀ 从左侧趋近',exact:true}).click();const second=Number(await page.locator('#x-position-display').innerText());assert.ok(Math.abs(second-first-.01)<.00001,'每次靠近使用所选步长');assert.doesNotMatch(await page.locator('#evidence-bar').innerText(),/已稳定趋近/);
  assert.equal(Number(await page.locator('#info-dfx').innerText()),.01,'输出变化与本次步长一致，重绘后不能变成零');
  await page.screenshot({path:path.join(dir,'趋近步长.png')});
  await page.setContent('<main id="support"></main>');
  await page.evaluate(()=>{
   window.testSnapshot={ownerKey:'synthetic',generation:1,scopeKey:'GH-02-K01',sceneType:'slide',unitType:'knowledge',active:true,signedIn:true,view:{format:'plain'},researchControls:{enabled:true},supportCycle:{id:'synthetic-help',status:'offered',rounds:1,profile:{supportFollowups:0},content:{message:'分别看输入与输出。',nextStep:'比较左右两列。',audit:{fallback:true}},plan:{primaryGoal:'cognitive'}}};
   window.KnowledgeAssistant={refreshSupportSurface(){document.getElementById('support').replaceChildren(window.SupportCycleUI.render(window.testSnapshot));},supportCycleRequest(command){return new Promise(resolve=>{window.finishRequest=()=>{window.testSnapshot.supportCycle.status=command.action==='accept'?'engaged':'closed';resolve();};});}};
  });
  await page.addScriptTag({path:path.join(root,'app/main/support-cycle.js')});await page.evaluate(()=>window.KnowledgeAssistant.refreshSupportSurface());
  await page.getByRole('button',{name:'我先试一试',exact:true}).click();assert.match(await page.locator('[role=status]').innerText(),/正在保存/);await page.evaluate(()=>window.finishRequest());
  await page.getByText('再看这条帮助',{exact:true}).waitFor();assert.equal(await page.locator('[data-support-body]').isVisible(),false,'自己尝试时正文折叠');
  await page.getByText('再看这条帮助',{exact:true}).click();assert.equal(await page.locator('[data-support-body]').isVisible(),true,'正文可重新打开');
  await page.getByRole('button',{name:'结束这轮帮助',exact:true}).click();assert.match(await page.locator('[role=status]').innerText(),/正在结束/);assert.doesNotMatch(await page.locator('[role=status]').innerText(),/老师正在准备/);await page.evaluate(()=>window.finishRequest());
  assert.deepEqual(errors,[]);passed=true;console.log('通过：成就仅完成后可见、边界点提示、真实步长、尝试后折叠可再看、保存与结束文案。');
 }finally{fs.writeFileSync(path.join(dir,'验收结果.json'),JSON.stringify({passed,errors},null,2));await browser.close();console.log(dir);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
