'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),course=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
async function main(){
 const remote=process.env.STUDENT_UX_BASE_URL||'';
 if(remote&&process.env.STUDENT_UX_ALLOW_TEST_ACCOUNT!=='1')throw Error('远端验收需要明确允许创建合成体验账号');
 const output=path.join(root,'output/新用户体验验收');fs.mkdirSync(output,{recursive:true});const dir=fs.mkdtempSync(path.join(output,'浏览器-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=remote.replace(/\/$/,'')||`http://127.0.0.1:${port}`,log=fs.openSync(path.join(dir,'server.log'),'w');
 const server=remote?null:spawn(process.execPath,['server.js',String(port)],{cwd:root,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r2',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-retention-r4',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',RATE_LIMIT_MAX:'5000'}});
 let browser,page;const results={};
 try{
  for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
  page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(remote?60000:20000);
  results.errors=[];page.on('pageerror',error=>results.errors.push(error.message));
  await page.addInitScript(()=>{const original=window.setInterval;window.setInterval=function(fn,...args){if(fn.name==='tickHelpEntry')window.tickHelpEntryTest=fn;return original.call(this,fn,...args);};});
  await page.goto(base+'/?study=B');await page.locator('[data-auth-mode=register]').click();
  await page.locator('#nickname').fill('合成新用户'+Date.now());await page.locator('#register-password').fill('synthetic-browser-password');await page.locator('#register-password-confirm').fill('synthetic-browser-password');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});
  await page.locator('[data-view=learn]').first().click();await page.locator('#three-arm-dialog[open]').waitFor();
  for(const field of await page.locator('#three-arm-dialog [data-study-question]').all())await field.locator('input[value="3"]').check();
  await page.locator('#three-arm-dialog').getByRole('button',{name:'保存并继续',exact:true}).click();await page.waitForFunction(()=>currentUnitId==='V14-C1-pre');
  assert.equal(await page.locator('#workspace-operation-tour[open]').count(),0,'前测期间不弹出导览');
  const ask=unit=>page.evaluate(async unit=>{const r=await fetch('api/learning/assistant/ask',{method:'POST',headers:{Authorization:`Bearer ${state.authToken}`,'Content-Type':'application/json'},body:JSON.stringify({unitId:unit,chapterId:'V14-C1',sceneType:'quiz',question:'请帮我理解函数输入与输出之间的关系'})});return {status:r.status,body:await r.text()};},unit);
  results.beforeSubmit=await ask('V14-C1-pre');assert.notEqual(results.beforeSubmit.status,200);
  for(const q of course.flow.preQuiz.questions)await page.locator(`[data-question="${q.id}"] ${q.type==='short_answer'?'[data-short-unknown]':'input[value="__unknown__"]'}`).check();
  await page.locator('[data-submit-quiz="V14-C1-pre"]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));
  results.afterSubmit=await ask('V14-C1-pre');
  if(remote){const done=results.afterSubmit.body.trim().split(/\r?\n/).map(line=>JSON.parse(line)).find(row=>row.type==='done');assert.ok(done);assert.equal(done.fallback,false,'真实模型不能以备用解析冒充通过');assert.equal(done.message.modelAudit.requestedModel,'gpt-5.4-2026-03-05');results.model=done.message.modelAudit;}
  results.otherUnitBeforeSetup=await ask('GH-01-K01');assert.notEqual(results.otherUnitBeforeSetup.status,200);
  assert.equal(results.afterSubmit.status,200,'已交前测但未配置时可主动提问');
  await page.locator('[data-quiz-path-action=pilot-next]').last().click();await require('./operation-guide-steps')(page,dir,'B');results.guide=true;await page.locator('#learner-setup[open]').waitFor();
  await page.locator('#learner-setup').getByRole('button',{name:'先使用全部默认设置',exact:true}).click();
  await page.locator('#learner-setup').getByRole('button',{name:/保存.*学习/}).click();await page.waitForFunction(()=>currentUnitId==='GH-01-K01');await page.locator('[data-openmaic-state=ready]').first().waitFor();
  results.elements=await page.locator('#lesson-player').evaluate(n=>[...n.querySelectorAll('[data-context-id],.slide-element,iframe')].slice(0,10).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80)})));
  results.frames=page.frames().map(f=>f.url());
  const frame=page.frames().find(f=>f.url().includes('/openmaic-classroom/frame.html'));
  async function selectText(){return frame.evaluate(()=>{
   const host=[...document.querySelectorAll('[data-element-id],p,h1,h2')].find(n=>n.textContent.trim().length>8&&n.getBoundingClientRect().width>5);
   if(!host)return null;const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let text;while((text=walker.nextNode())&&text.textContent.trim().length<5){}
   const range=document.createRange();range.setStart(text,0);range.setEnd(text,Math.min(8,text.length));const s=getSelection();s.removeAllRanges();s.addRange(range);host.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return range.getBoundingClientRect().toJSON();
  });}
  results.positions=[];
  for(const width of [1440,500,1920]){
   await page.setViewportSize({width,height:960});await page.waitForTimeout(150);
   const selection=await selectText();assert.ok(selection,'真实 PPT 必须有可选择文本');
   await page.locator('[data-knowledge-selection-toolbar]').waitFor({state:'visible'});await page.waitForTimeout(50);
   const toolbar=await page.locator('[data-knowledge-selection-toolbar]').boundingBox(),bounds=await (await frame.frameElement()).boundingBox();
   const center=bounds.x+selection.x+selection.width/2;
   assert.ok(Math.abs(toolbar.x-Math.max(8,Math.min(width-toolbar.width-8,center-toolbar.width/2)))<3,'选区菜单水平方向紧邻选区');
   assert.ok(Math.min(Math.abs(toolbar.y+toolbar.height-(bounds.y+selection.top)),Math.abs(toolbar.y-(bounds.y+selection.bottom)))<16,'选区菜单垂直方向紧邻选区');
   results.positions.push({width,toolbar,selection,bounds});
   if(width!==1920)await frame.evaluate(()=>getSelection().removeAllRanges());
  }
  {
   await page.locator('[data-knowledge-selection-note]').click();results.colors={};
   for(const c of ['amber','mint','blue','pink']){await page.locator(`[data-knowledge-note-colors] [data-note-color="${c}"]`).click();results.colors[c]=await page.locator('[data-knowledge-note-editor]').evaluate(n=>({background:getComputedStyle(n).background,border:getComputedStyle(n).borderColor}));}
   assert.equal(new Set(Object.values(results.colors).map(c=>c.background)).size,4,'四种主题实际改变窗口背景');
   await page.locator('[data-knowledge-note-input]').fill('合成笔记：同一输入对应唯一输出');
   await page.screenshot({path:path.join(dir,'笔记与定位.png')});await page.locator('[data-knowledge-note-save]').click();await page.locator('[data-knowledge-note-editor]').waitFor({state:'hidden'});
  }
  await page.locator('#auth-menu-toggle').click();await page.locator('#account-operation-guide').click();await page.locator('#workspace-operation-tour[open]').waitFor();await page.locator('#workspace-operation-tour').getByRole('button',{name:'稍后继续',exact:true}).click();results.guideReplay=true;
  await page.evaluate(()=>KnowledgeAssistant.close());await frame.evaluate(()=>getSelection().removeAllRanges());await page.locator('#workspace-tools-toggle').focus();
  results.pause=await page.evaluate(()=>{const original=Date.now;let time=original();Date.now=()=>time;try{for(let i=0;i<52;i++){time+=5000;tickHelpEntryTest();}return {shown:!document.getElementById('workspace-pause-entry').hidden,snapshot:KnowledgeAssistant.designSpaceSnapshot()};}finally{Date.now=original;}});
  assert.equal(results.pause.shown,true,'课件长时间无操作可见求助入口提醒');delete results.pause.snapshot;
  await page.locator('[data-pause-help]').click();await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().assistantOpen);assert.equal(await page.locator('#workspace-pause-entry').isVisible(),false);
  assert.deepEqual(results.errors,[]);results.passed=true;console.log('通过：前测讨论边界、新用户指引与重看、三种宽度的 PPT 选区定位、四色笔记窗口、停顿提醒的真实点击');
 }finally{fs.writeFileSync(path.join(dir,'验收.json'),JSON.stringify(results,null,2));console.log(dir);await browser?.close();server?.kill();fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
