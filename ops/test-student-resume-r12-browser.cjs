'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline'),visualOnly=process.argv.includes('--visual-only');
async function main(){
 const output=process.env.STUDENT_UX_OUTPUT||path.join(root,'output/playwright/r12-ui');fs.mkdirSync(output,{recursive:true});
 const dir=fs.mkdtempSync(path.join(output,baseline?'修复前-':'修复后-')),privateDir=fs.mkdtempSync(path.join(root,'tmp/ui-resume-r12-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base=`http://127.0.0.1:${port}`;
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(privateDir,'synthetic.db'),ADMIN_TOKEN:crypto.randomBytes(24).toString('hex'),LOCAL_ADMIN_AUTH_BYPASS:'false',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(privateDir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-ui-r12',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r12',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-delayed-r12-20261108',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',APP_VERSION:'synthetic-ui-resume-r12'};
 const log=fs.openSync(path.join(privateDir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});
 const report={baseline,synthetic:true,localOnly:true,apiFixture:'使用正常API建立baseline和已交前测，其余导览、设置与暂停均真实浏览器操作',base,serverPid:server.pid,checks:[],errors:[],screenshots:[]};let browser,page;
 const check=(name,passed,observed)=>{report.checks.push({name,passed:Boolean(passed),observed});};
 const capture=async name=>{await page.waitForTimeout(220);const file=path.join(dir,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
 const account={nickname:'恢复合成'+Date.now(),password:crypto.randomBytes(18).toString('hex')};
 async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(account.token?{Authorization:'Bearer '+account.token}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.equal(r.status,200,route+': '+(value.message||r.status));return value;}
 async function login(){await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('#login-identifier').fill(account.nickname);await page.locator('#login-password').fill(account.password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view=learn]').first().click();}
 async function start(){await page.locator('[data-quiz-path-action=pilot-next]').last().click();await page.locator('#workspace-operation-tour').waitFor();}
 async function completeTour(){
  const tour=page.locator('#workspace-operation-tour');
  for(let count=0;count<9&&await tour.count();count++){
   const key=await tour.getAttribute('data-step'),next=tour.locator('[data-guide-next]');
   if(!await next.isEnabled()){
    if(key==='path'){await page.locator('#lesson-rail-toggle').click();await page.locator('#lesson-rail-toggle').click();}
    if(key==='lecture'){await page.locator('[data-openmaic-state=ready]').first().waitFor();await page.locator('[data-classroom-action=play]').click();}
    if(key==='scenes'){await page.locator('[data-knowledge-scene=simulation]').click();await page.locator('iframe[data-courseware-frame]').waitFor({state:'visible'});}
    if(key==='assistant')await page.locator('#workspace-tools-toggle').click();
    if(key==='notes'){await tour.locator('[data-guide-note-blank]').click();await page.locator('[data-knowledge-note-input]').fill('合成操作指引笔记');await page.locator('[data-knowledge-note-save]').click();}
   }
   await next.click();
  }
  await page.locator('#learner-setup[open]').waitFor();
 }
 async function reopenPreferences(){
  const open=page.locator('#learner-setup[open]');if(await open.count())return;
  await page.locator('#auth-menu-toggle').click();
  if(!await open.count())await page.locator('#account-learning-preferences').click().catch(async error=>{if(!await open.count())throw error;});
  await open.waitFor();
 }
 try{
  for(let n=0;n<150;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(server.exitCode!==null)throw Error('隔离服务启动失败，见本机server.log');await new Promise(r=>setTimeout(r,100));}
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.appVersion,env.APP_VERSION);
  console.log(JSON.stringify({phase:'隔离服务已启动',base,pid:server.pid,output:dir}));
  account.token=(await api('/api/auth/register',{nickname:account.nickname,password:account.password})).token;
  const run=(await api('/api/study/state')).data.run,survey=(await api('/api/study/survey?stage=baseline')).data;
  await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,3]))});
  const registry=require('../lib/assessments/functions-limits-registry'),bank=registry.forVersion(registry.versionForRun(run));assert(bank,'server run measurement version must be known');report.assessmentVersion=bank.version;
  await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:bank.questions('pre',run.assessmentOrder[0]).map(q=>({questionId:q.id,response:q.type==='short_answer'?'__unknown__':q.answer[0]}))});
  if(visualOnly){const preferences=(await api('/api/learning/learner-preferences')).data;await api('/api/learning/learner-preferences',{answers:preferences.record.answers,expectedRevision:preferences.record.revision});}
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));report.network=[];
  await page.addInitScript(()=>{window.__uiFetchProbe=[];let limited=false;const original=window.fetch;window.fetch=async function(input,init){const url=typeof input==='string'?input:input.url,watch=String(url).includes('/proactive/state'),stack=watch?new Error('proactive state requested').stack:'';const response=await original.apply(this,arguments);if(watch&&(limited||response.status===429)&&window.__uiFetchProbe.length<8)window.__uiFetchProbe.push({at:Date.now(),status:response.status,stack});if(response.status===429)limited=true;return response;};});
  page.on('response',response=>{const pathname=new URL(response.url()).pathname;if(response.status()>=400||/\/api\/(auth\/login|study\/state|learning\/learner-preferences|learning\/proactive\/state)$/.test(pathname))report.network.push({path:pathname,status:response.status()});
   if(response.status()===429&&!report.rateLimited){report.rateLimited={path:pathname,retryAfter:response.headers()['retry-after']||null};setTimeout(async()=>{try{report.rateLimitProbe=await page.evaluate(()=>window.__uiFetchProbe||[]);await capture('首次429停止现场');await page.close();}catch{}},100);}
  });
  await login();report.runtimeScripts=await page.evaluate(()=>[...document.scripts].map(s=>s.getAttribute('src')).filter(Boolean));
  if(!visualOnly){await start();
  await page.locator('#lesson-rail-toggle').click();await page.locator('#lesson-rail-toggle').click();await page.locator('[data-guide-next]').click();
  await page.locator('[data-openmaic-state=ready]').first().waitFor();await page.locator('[data-classroom-action=play]').click();await page.locator('[data-guide-next]').click();
  assert.equal(await page.locator('#workspace-operation-tour').getAttribute('data-step'),'scenes');await page.locator('[data-guide-pause]').click();
  await start();let actual=await page.locator('#workspace-operation-tour').getAttribute('data-step');check('稍后继续恢复到互动选择步骤',actual==='scenes',actual);await capture('暂停后导览恢复');
  if(actual==='scenes'){await page.locator('[data-guide-back]').click();check('恢复后已真实试听的步骤无需重做',await page.locator('[data-guide-next]').isEnabled());await page.locator('[data-guide-next]').click();}
  await page.locator('[data-guide-pause]').click();await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view=learn]').first().click();await start();
  actual=await page.locator('#workspace-operation-tour').getAttribute('data-step');check('刷新后导览仍恢复原步骤',actual==='scenes',actual);
  await completeTour();
  const dialog=page.locator('#learner-setup'),options=dialog.locator('input[name=D1]'),chosen=await options.nth(1).getAttribute('value');await options.nth(1).check();
  const reason=await dialog.locator('select[name=preference-reason] option').nth(1).getAttribute('value');await dialog.locator('select[name=preference-reason]').selectOption(reason);await dialog.locator('textarea[aria-label=补充说明]').fill('合成草稿：请保留我的学习偏好。');await dialog.getByRole('button',{name:'下一项',exact:true}).click();
  await dialog.getByRole('button',{name:'稍后继续',exact:true}).click();await reopenPreferences();
  let restored=await dialog.locator('nav button[aria-current=step]').innerText();check('六维暂停后恢复到第二维',restored.includes('介入')||await dialog.locator('[data-group=D2]').count()>0,restored);await capture('六维暂停恢复');
  await dialog.getByRole('button',{name:'稍后继续',exact:true}).click();await page.locator('#auth-menu-toggle').click();await page.locator('#auth-logout').click();await page.locator('#auth-gate').waitFor({state:'visible'});await page.waitForFunction(()=>!authTransitionInProgress);await login();await reopenPreferences();
  check('退出重进后六维步骤保留',await dialog.locator('[data-group=D2]').count()>0);await dialog.locator('nav button').first().click();
  const saved={value:await dialog.locator('input[name=D1]:checked').getAttribute('value'),reason:await dialog.locator('select[name=preference-reason]').inputValue(),note:await dialog.locator('textarea[aria-label=补充说明]').inputValue()};
  check('退出重进后未提交配置及理由草稿保留',saved.value===chosen&&saved.reason===reason&&saved.note==='合成草稿：请保留我的学习偏好。',saved);await capture('退出重进后配置草稿');
  await dialog.getByRole('button',{name:'先使用全部默认设置',exact:true}).click();await dialog.getByRole('button',{name:'保存并开始学习',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.locator('[data-openmaic-state=ready]').first().waitFor();
  check('讲解翻页合并在现有工具栏',await page.locator('.classroom-controlbar .openmaic-page-nav').count()===1);
  check('课件上方不再占用独立翻页栏',await page.locator('#lesson-player .openmaic-page-nav').count()===0);
  check('学生看不到分组标签',await page.locator('#three-arm-entry-label:visible').count()===0);
  check('学生看不到现场计时',await page.locator('.first-session-budget:visible').count()===0);
  if(!baseline){
   await page.locator('.openmaic-page-nav').getByRole('button',{name:'下一讲解页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-openmaic-page]')?.dataset.openmaicPage==='2');
   report.cursorBeforeRefresh=await page.evaluate(()=>({cursor:readLearningUiCursor(),run:window.ThreeArmStudyUI?.run?.id,generation:learningSnapshotGeneration}));
   await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view=learn]').first().click();
   await page.waitForFunction(()=>document.querySelector('[data-openmaic-page]')?.dataset.openmaicPage==='2');
   check('讲解第二页刷新后仍为第二页',true);await capture('讲解页码刷新恢复');
   await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=mindMap]').click();await page.locator('iframe[data-courseware-frame]').waitFor({state:'visible'});
   await page.waitForFunction(()=>readLearningUiCursor()?.sceneType==='mindMap');
   await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view=learn]').first().click();
   await page.waitForFunction(()=>document.querySelector('.core-learning-workspace')?.dataset.classroomSurface==='interactive'&&selectedKnowledgeSceneType(getUnit())==='mindMap');
   check('互动选择和所在表面刷新后保留',true);await capture('互动场景刷新恢复');
   await page.locator('#auth-menu-toggle').click();await page.locator('#auth-logout').click();await page.waitForFunction(()=>!authTransitionInProgress);await login();
   await page.waitForFunction(()=>document.querySelector('.core-learning-workspace')?.dataset.classroomSurface==='interactive'&&selectedKnowledgeSceneType(getUnit())==='mindMap');
   check('互动场景退出重进仍保留',true);
   await page.locator('[data-workspace-canvas=slide]').click();await page.waitForFunction(()=>document.querySelector('[data-openmaic-page]')?.dataset.openmaicPage==='2');
   check('退出重进后的讲解页码也保留',true);
  }
  for(const width of [1400,1366,1024,390]){
   await page.setViewportSize({width,height:900});await capture('课件工具栏-'+width);check(width+'课件无横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(process.argv.includes('--chat-layout')){
    if(width<=1180)await page.locator('.workspace-mobile-nav button[data-workspace-pane=assistant]').click();else await page.locator('#workspace-tools-toggle').click();
    const input=page.locator('[data-knowledge-input]');await input.waitFor({state:'visible'});await input.fill('合成排版检查：这个知识点的关键条件是什么？');await input.click();await capture('知点侧栏输入-'+width);
    const measured=await page.evaluate(()=>{const field=document.querySelector('[data-knowledge-input]'),button=document.querySelector('[data-knowledge-send]');const visible=n=>{const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return x>0&&x<innerWidth&&y>0&&y<innerHeight&&n.contains(document.elementFromPoint(x,y));};return {inputVisible:visible(field),sendVisible:visible(button),docWidth:document.documentElement.scrollWidth,viewport:innerWidth};});
    check(width+'知点输入和发送按钮无遮挡',measured.inputVisible&&measured.sendVisible&&measured.docWidth<=width+1,measured);await input.fill('');
    if(width<=1180)await page.locator('.workspace-mobile-nav button[data-workspace-pane=course]').click();else await page.locator('#workspace-tools-toggle').click();
   }
  }
  }
  if(visualOnly||process.argv.includes('--courseware-pages')){
   report.coursewareVisualFixture='已认证合成preview；仅为逐页排版核查，设置currentUnitId并renderAll显示六点，不伪造完成/测验/回顾，不据此声称六点正常学习流程已走完';
   report.coursewarePages=[];
   for(const size of [{width:1400,height:900},{width:1366,height:768}]){
    await page.setViewportSize(size);
    for(const id of ['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03']){
     await page.evaluate(id=>{currentUnitId=id;renderAll();},id);
     await page.locator('[data-workspace-canvas=slide]').click();await page.locator('[data-openmaic-state=ready]').first().waitFor();
     const previous=page.locator('.openmaic-page-nav').getByRole('button',{name:'上一讲解页',exact:true});
     if(await previous.isEnabled())await previous.click();
     for(let index=1;index<=2;index++){
      await page.waitForFunction(index=>document.querySelector('[data-openmaic-page]')?.dataset.openmaicPage===String(index),index);
      await page.locator('[data-openmaic-state=ready]').first().waitFor();
      const frame=await(await page.locator('.multi-scene-slide-panel iframe').elementHandle()).contentFrame();
      await frame.locator('body').waitFor();await frame.evaluate(()=>document.fonts.ready);
      if(index===2&&process.argv.includes('--expanded')){await page.waitForTimeout(180);const reveal=frame.locator('#rv');for(let step=0;step<3&&await reveal.isEnabled();step++){await reveal.click();await page.waitForTimeout(80);}await frame.locator('#concl.on').waitFor();check(`${id}三步推理已实际展开-${size.width}`,await frame.locator('.step.on').count()===3);}
      const typography=await frame.evaluate(()=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),rows=[];let node;while(node=walker.nextNode()){const text=node.textContent.trim();if(!/[\u4e00-\u9fff]{2}/.test(text)||node.parentElement.closest('script,style,svg title,svg desc'))continue;const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect(),style=getComputedStyle(node.parentElement);if(rect.height&&rect.width&&style.visibility==='visible'&&rect.bottom>0&&rect.top<innerHeight)rows.push({text:text.slice(0,32),height:Math.round(rect.height*10)/10,fontSize:style.fontSize});}return {visibleCjkTextNodes:rows.length,smallestCjk:rows.sort((a,b)=>a.height-b.height).slice(0,5)};});
      const layout=await page.evaluate(()=>{const r=document.querySelector('.classroom-controlbar').getBoundingClientRect(),f=document.querySelector('.multi-scene-slide-panel iframe').getBoundingClientRect();return {docWidth:document.documentElement.scrollWidth,viewport:innerWidth,toolbarHeight:r.height,toolbarTop:r.top,frame:{left:f.left,top:f.top,width:f.width,height:f.height},page:document.querySelector('[data-openmaic-page]').dataset.openmaicPage};});
      check(`${id}讲解${index}-${size.width}无横向溢出且工具栏紧凑`,layout.docWidth<=size.width+1&&layout.toolbarHeight<90,{toolbarHeight:layout.toolbarHeight});
      const name=`平台讲解-${id}-${index}-${size.width}x${size.height}`;await capture(name);report.coursewarePages.push({unitId:id,page:index,viewport:size,typography,layout,screenshot:name+'.png'});
      if(index===1)await page.locator('.openmaic-page-nav').getByRole('button',{name:'下一讲解页',exact:true}).click();
     }
    }
   }
  }
 }catch(error){report.failure=error.message;if(page){await capture('失败现场').catch(()=>{});report.uiFailure=await page.evaluate(()=>({unit:currentUnitId,page:document.querySelector('[data-openmaic-page]')?.dataset.openmaicPage,surface:document.querySelector('.core-learning-workspace')?.dataset.classroomSurface,run:window.ThreeArmStudyUI?.run?.id,generation:learningSnapshotGeneration,snapshotReady:learningSnapshotReady,cursor:typeof readLearningUiCursor==='function'?readLearningUiCursor():null,storedCursors:Object.keys(localStorage).filter(k=>k.startsWith('learning-ui-cursor-v1:')).map(k=>({key:k,value:JSON.parse(localStorage.getItem(k))})),support:(()=>{const s=window.KnowledgeAssistant?.designSpaceSnapshot();return s?{loaded:s.loaded,locked:s.locked,scope:s.scopeKey,unit:s.unitId,check:s.check,cycleStatus:s.supportCycle?.status}:null;})()})).catch(()=>null);}}
 finally{if(browser)await browser.close();if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}fs.closeSync(log);}
 report.passed=!report.failure&&!report.errors.length&&report.checks.every(x=>x.passed);report.browserClosed=true;report.serverStopped=true;fs.writeFileSync(path.join(dir,'复现与恢复回执.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,baseline,output:dir,checks:report.checks,errors:report.errors,failure:report.failure}));if(!report.passed&&!baseline)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
