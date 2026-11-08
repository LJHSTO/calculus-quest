'use strict';
// Uses a prepared synthetic account on an isolated real server; never changes its DB directly.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
const fixturePath=process.env.REGULATION_UI_FIXTURE_FILE;assert(fixturePath,'REGULATION_UI_FIXTURE_FILE is required');
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8').replace(/^\uFEFF/,''));
const base=process.env.STUDENT_UX_BASE_URL||fixture.base||fixture.url;assert.match(base,/^http:\/\/127\.0\.0\.1:/);
const mode=process.env.REGULATION_UI_TEST_MODE||'finish',account=fixture[mode]||fixture.ui||fixture.account||fixture;
assert(account.nickname&&account.password,'prepared synthetic account is required');
const out=path.resolve(__dirname,'../output/playwright/r11-regulation-guard');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 const login=async who=>{await page.locator('#login-identifier').fill(who.nickname);await page.locator('#login-password').fill(who.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});};
 const enterLearning=async()=>{if(await page.locator('#learn-view.active').count())return;if(await page.locator('#regulation-transfer-dialog').isVisible())await page.getByRole('button',{name:'保存并关闭',exact:true}).click();await page.locator('[data-view=learn]').first().click();};
 const isLocked=()=>page.evaluate(()=>({protected:document.body.hasAttribute('data-regulation-protected'),inert:document.querySelector('.core-learning-workspace').inert,hidden:document.querySelector('.core-learning-workspace').getAttribute('aria-hidden'),display:getComputedStyle(document.querySelector('.core-learning-workspace')).display,unit:getUnit()?.id,run:ThreeArmStudyUI.run?.id}));
 try{
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await login(account);await enterLearning();
  await page.waitForFunction(()=>Boolean(ThreeArmStudyUI.run));
  await page.evaluate(()=>{if(!RegulationTransferUI.active&&!ThreeArmStudyUI.run?.regulationActive)selectUnit('GH-01-K01');});
  const original=await isLocked();
  await page.evaluate(()=>RegulationTransferUI.open());
  const start=page.getByRole('button',{name:'开始14分钟任务',exact:true});if(await start.isVisible())await start.click();
  await page.waitForFunction(()=>document.body.hasAttribute('data-regulation-protected'));
  const active=await isLocked();assert(active.inert&&active.hidden==='true'&&active.display==='none');assert.equal(active.run,original.run);
  await page.getByRole('button',{name:'保存并关闭',exact:true}).click();await page.locator('#regulation-transfer-dialog').waitFor({state:'hidden'});
  await page.locator('#regulation-course-guard').waitFor({state:'visible'});
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('.core-learning-workspace'))),false,'keyboard cannot enter old course');}
  const blocked=await page.locator('#lesson-rail [data-unit]').first().click({timeout:600}).then(()=>false,()=>true);assert(blocked,'old course click is not actionable');
  assert.equal(await page.evaluate(()=>selectUnit('GH-01-K02')),false,'central navigation rejects a different old lesson');
  assert.equal((await isLocked()).unit,original.unit);
  await page.locator('#regulation-transfer-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('#regulation-transfer-dialog').waitFor({state:'hidden'});
  await page.locator('#regulation-course-guard button').focus();await page.keyboard.press('Enter');await page.locator('#regulation-transfer-dialog').waitFor({state:'visible'});
  await page.getByRole('button',{name:'保存并关闭',exact:true}).click();
  const widths=[];for(const width of [1400,1366,1024,390]){await page.setViewportSize({width,height:900});const box=await page.locator('#regulation-course-guard').evaluate(n=>({width:innerWidth,doc:document.documentElement.scrollWidth,right:n.getBoundingClientRect().right,visible:n.checkVisibility()}));assert(box.visible&&box.doc<=width+1&&box.right<=width+1);widths.push(box);await page.screenshot({path:path.join(out,`${mode}-已保存继续-${width}.png`)});}
  await page.setViewportSize({width:1400,height:900});await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#auth-gate').waitFor({state:'hidden'});await enterLearning();
  await page.waitForFunction(()=>document.body.hasAttribute('data-regulation-protected'));
  const restored=await isLocked();assert(restored.inert&&restored.display==='none');assert.equal(restored.run,original.run);
  if(mode==='switch'){
   if(await page.locator('#regulation-transfer-dialog').isVisible())await page.getByRole('button',{name:'保存并关闭',exact:true}).click();
   await page.locator('#auth-menu-toggle').click();await page.locator('#auth-logout').click();await page.locator('#auth-gate').waitFor({state:'visible'});
   await page.waitForFunction(()=>!document.body.hasAttribute('data-regulation-protected'));
   let other=fixture.other;
   if(!other){other={nickname:'账号隔离验证'+Date.now(),password:'Synthetic-reg-other-r11'};const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Arm':'B'},body:JSON.stringify(other)});assert.equal(r.status,200);}
   await login(other);await page.waitForFunction(()=>!document.body.hasAttribute('data-regulation-protected'));
   assert.equal(await page.evaluate(()=>document.querySelector('.core-learning-workspace').inert),false);
   assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#regulation-transfer-dialog')?.open)),false);
  }else if(mode==='expire'){
   // The dedicated fixture has a short remaining server deadline; the normal 840s rule is unchanged.
   await page.waitForFunction(()=>!document.body.hasAttribute('data-regulation-protected'),null,{timeout:70000});
   await page.evaluate(()=>RegulationTransferUI.open());await page.getByRole('heading',{name:'本次时间已到',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>RegulationTransferUI.context?.status),'expired');
   assert.equal((await isLocked()).unit,restored.unit);assert.equal((await isLocked()).inert,false);
  }else{
   if(!await page.locator('#regulation-transfer-dialog').isVisible())await page.locator('#regulation-course-guard button').click();
   await page.locator('#regulation-transfer-dialog').waitFor({state:'visible'});
   const begin=page.getByRole('button',{name:'我了解了，进入第一个任务',exact:true});if(await begin.isVisible()){await begin.click();await page.locator('.reg-progress').waitFor();}
   for(let i=0;i<4;i++){
    const skip=page.getByRole('button',{name:'本任务暂不作答',exact:true});if(!await skip.isVisible())break;
    const previous=await page.locator('.reg-progress').textContent();await skip.click();
    await page.waitForFunction(text=>!document.querySelector('#regulation-transfer-dialog')?.hasAttribute('aria-busy')&&document.querySelector('.reg-progress')?.textContent!==text,previous);
   }
   await page.getByRole('button',{name:'完成本次任务',exact:true}).click();await page.getByRole('heading',{name:'已完成',exact:true}).waitFor();
   await page.waitForFunction(()=>!document.body.hasAttribute('data-regulation-protected'));
   assert.equal(await page.evaluate(()=>RegulationTransferUI.context?.status),'submitted');assert.equal((await isLocked()).inert,false);assert.equal((await isLocked()).unit,restored.unit);
   await page.keyboard.press('Escape');assert(await page.locator('.core-learning-workspace').isVisible());
  }
  assert.deepEqual(errors,[]);const report={passed:true,mode,scope:'真实平台鉴权、预置资格的隔离合成账号、实际主API与浏览器；不是人为加速真实参与者任务',checks:['未答调节任务原课件inert与aria-hidden','关闭后可见继续入口','旧导航点击/键盘隔离','中央selectUnit拒绝并回任务','Enter和Esc恢复','刷新保持本run保护',mode==='finish'?'提交完成后仅恢复当前run页面':mode==='expire'?'真实服务器期限到达后解除本run保护':'退出与新账号不继承遮罩'],widths,errors};fs.writeFileSync(path.join(out,`${mode}-保护回归.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){await page.screenshot({path:path.join(out,`${mode}-失败诊断.png`)}).catch(()=>{});throw error;}finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
