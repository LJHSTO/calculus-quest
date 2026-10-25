"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output','OpenMAIC实包与六维控制-2026-10-18');
const results=[];
async function main(){
 for(const enabled of [true,false]){
  const dir=fs.mkdtempSync(path.join(root,'output','control-browser-'));
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const base=`http://127.0.0.1:${port}`,env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'test.db'),LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'isolated-control-test',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'control,treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r2',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-retention-r4',RESEARCH_CONTROLS_ENABLED:String(enabled),RESEARCH_CONTROLS_DEMO:String(enabled)};
  const server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:'ignore'});let browser;
  try{
   let ok=false;for(let n=0;n<100;n++){try{ok=(await fetch(base+'/api/health')).ok;}catch{}if(ok)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ok);
   browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().includes('/api/auth/') && r.status()>=400){const p=await r.json().catch(()=>({}));console.log(JSON.stringify({status:r.status(),message:p.message}));}});
   await page.goto(base+'/?research=1');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-auth-mode="register"]').click();await page.locator('#nickname').fill('六维核验'+Date.now());await page.locator('#register-password').fill('control-browser-synthetic');await page.locator('#register-password-confirm').fill('control-browser-synthetic');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
   await page.locator('[data-view="learn"]').first().click();await page.getByRole('button',{name:'六维观察台',exact:true}).click();
   assert.equal(await page.locator('#proactive-observatory [data-dimension]').count(),6);
   assert.equal(await page.locator('#proactive-observatory form,#proactive-observatory input,#proactive-observatory select').count(),0);
   await page.getByRole('button',{name:'收起观察台'}).click();await page.locator('#learner-preferences-button').click();await page.locator('#learner-setup').waitFor();
   if(enabled){
    await page.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();await page.getByRole('button',{name:'保存并开始学习',exact:true}).click();await page.locator('#learner-setup').waitFor({state:'hidden'});await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().researchControls?.revision===1);
    assert.equal((await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot())).locked,true,'前测仍保护');
    await page.reload();await page.locator('[data-view="learn"]').first().click();await page.locator('#learner-preferences-button').click();await page.locator('#learner-setup .learner-steps').waitFor();
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    results.push({name:'观察台只读，普通入口保存六维偏好、刷新恢复、前测保护与窄屏',passed:true});
   }else{
    assert.ok((await page.locator('#learner-setup').innerText()).includes('尚未开放'));
    const rejected=await page.evaluate(async()=>{try{await KnowledgeAssistant.researchControlRequest(KnowledgeAssistant.designSpaceSnapshot().researchControls.profile,0);return '';}catch(e){return e.message;}});assert.match(rejected,/只读/);
    results.push({name:'网址参数不能解锁未开放的设置',passed:true});
   }
   assert.deepEqual(errors,[]);
  }catch(error){if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){console.log((await p.locator('#auth-gate').innerText()).slice(0,1600));await p.screenshot({path:path.join(output,'失败诊断.png')});}}throw error;}finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>server.once('exit',resolve));}
 }
 fs.writeFileSync(path.join(output,'六维控制浏览器验收.json'),JSON.stringify({generatedAt:new Date().toISOString(),synthetic:true,passed:true,results},null,2));console.log('六维控制浏览器与接口验收通过');
}
main().catch(e=>{fs.writeFileSync(path.join(output,'六维控制浏览器验收.json'),JSON.stringify({generatedAt:new Date().toISOString(),synthetic:true,passed:false,results,error:e.message},null,2));console.error(e);process.exitCode=1;});
