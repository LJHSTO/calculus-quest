"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/全功能与学习界面验收-2026-10-22');
const scopes=Object.keys(require('../lib/support-goals').CURRICULUM),results=[];
async function main(){
 fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,'合成浏览器-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const external=process.env.WEB_ACCEPTANCE_BASE;
 const base=external||`http://127.0.0.1:${port}`,admin='synthetic-web-acceptance',project='web-acceptance-'+Date.now();
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:'false',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-web-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r2',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-retention-r4',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',RATE_LIMIT_MAX:'10000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=external?null:spawn(process.execPath,['server.js',String(port)],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});let browser,page;
 async function api(route,body,token=admin){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
 async function geometry(label){
  const value=await page.evaluate(()=>{const frame=document.querySelector('.multi-scene-scene-panel:not([hidden]) iframe[data-courseware-frame]')||document.querySelector('.multi-scene-slide-panel:not([hidden]) iframe[data-openmaic-slide]'),r=frame?.getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,canvas:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};});
  assert.ok(value.overflow<=1,label+' 页面不能横向溢出');assert.ok(value.canvas?.width>=300&&value.canvas.height>=400,label+' 画布不能缩成不可操作的小窗：'+JSON.stringify(value));results.push({label,...value});
 }
 async function notice(){await page.locator('#workspace-support-notice').waitFor();await page.waitForFunction(()=>{const b=document.querySelector('#workspace-support-notice'),r=b?.getBoundingClientRect();return r&&r.width>0&&r.top>=0&&r.bottom<=innerHeight&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});}
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-auth-mode="register"]').click();await page.locator('#nickname').fill('网页验收'+Date.now());await page.locator('#register-password').fill('Synthetic-web-2026-only');await page.locator('#register-password-confirm').fill('Synthetic-web-2026-only');await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view="learn"]').first().click();
  assert.equal(await page.locator('#workspace-support-notice:visible').count(),0,'前测不显示帮助通知');
  const pre=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').flow.preQuiz;
  for(const q of pre.questions){const card=page.locator(`.question-card[data-question="${q.id}"]`);if(q.type==='short_answer')await card.locator('textarea').fill('合成测试：先判断函数值和附近趋势。');else await card.locator('input').first().check();}
  await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));await page.getByRole('button',{name:'全部学习',exact:true}).click();await page.getByRole('button',{name:'按勾选知识点开始学习'}).click();await page.locator('[data-openmaic-state="ready"]').waitFor({timeout:30000});
  await page.locator('[data-workspace-canvas="interactive"]').click();await page.locator('[data-knowledge-scene="simulation"]').click();const frame=()=>page.frameLocator('iframe[data-courseware-frame]');
  const nativeFrame=await (await page.locator('iframe[data-courseware-frame]').elementHandle()).contentFrame();
  await nativeFrame.waitForFunction(()=>window.__cqTaskSupport&&window.__calculusQuestContextBridge);
  for(let i=0;i<5;i++){await frame().locator('#input_x-slider').press('ArrowRight');await page.waitForTimeout(1000);}
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status==='awaiting_confirmation',null,{timeout:25000});await notice();await page.locator('#workspace-support-notice').click();await frame().getByRole('button',{name:'暂时不需要',exact:true}).click();await page.waitForFunction(()=>!['awaiting_confirmation','offered','engaged'].includes(KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status));assert.equal(await page.locator('#workspace-support-notice:visible').count(),0);
  results.push({label:'真实学习事件触发询问，通知可见、能定位并拒绝',passed:true});
  for(const scope of scopes){
   // Only the first knowledge point is reached normally; this seam enumerates layouts.
   await page.evaluate(id=>{currentUnitId=id;currentChapterId='V14-C1';const p=ensureAgenticPath();if(!p.unlocked.includes(id))p.unlocked.push(id);switchView('learn');renderAll();KnowledgeAssistant.sync();},scope);
   await page.locator('[data-workspace-canvas="slide"]').click();await page.locator('[data-openmaic-state="ready"]').waitFor({timeout:30000});
   await page.evaluate(()=>KnowledgeAssistant.supportCycleRequest({action:'report',confirmed:true,need:'concept',note:'合成布局验收'}));
   for(const viewport of [{width:1366,height:768},{width:1093,height:614}]){
    await page.setViewportSize(viewport);await page.locator('[data-workspace-canvas="slide"]').click();await notice();await page.locator('#workspace-support-notice').click();assert.equal(await page.locator('.task-support-panel:visible').count(),1,'切回讲解后帮助须迁入可见面板');await page.getByRole('button',{name:'返回课件操作',exact:true}).click();await geometry(scope+'-讲解-'+viewport.width);
    await page.locator('[data-workspace-canvas="interactive"]').click();
    for(const scene of ['simulation','game','mindMap','visualization3d']){
     await page.locator(`[data-knowledge-scene="${scene}"]`).click();await page.waitForTimeout(500);await notice();await geometry(scope+'-'+scene+'-'+viewport.width);
     if(viewport.width===1366){await page.locator('[data-classroom-action="fullscreen"]').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement||document.querySelector('.is-local-fullscreen-target')));await notice();await page.locator('#workspace-support-notice').click();await page.waitForTimeout(200);
      await Promise.any([
        frame().locator('[data-cq-embedded-help="task"]').waitFor({state:'attached'}),
        page.locator('.task-support-panel').waitFor({state:'visible'})
      ]);
      const inside=await frame().locator('[data-cq-embedded-help="task"]').count();
      if(inside)await frame().getByRole('button',{name:'返回课件操作',exact:true}).click();
      else assert.equal(await page.locator('.task-support-panel:visible').count(),1,scope+'-'+scene+' 全屏支持必须可达');
      await page.screenshot({path:path.join(out,`${scope}-${scene}-全屏.png`)});await page.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
     }
    }
   }
   await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{const c=KnowledgeAssistant.designSpaceSnapshot().supportCycle;return KnowledgeAssistant.supportCycleRequest({action:'close',id:c.id});});
  }
  // Exercise the actual serialized iframe questionnaire and its exposure receipt.
  const created=await api('/api/admin/pilot/version',{project,title:'合成网页验收',reason:'自动化',responsible:'合成负责人',contact:'测试',reviewReference:'非真人数据',retention:'隔离保存',withdrawal:'随时退出',sampling:{silentProbability:1,intervalSeconds:30,minGapSeconds:30}});assert.equal(created.status,200);
  await page.locator('[data-knowledge-scene="simulation"]').click();await page.locator('#pilot-entry-button').click();await page.getByLabel('预试加入码',{exact:true}).fill(created.data.joinCode);await page.getByRole('button',{name:'阅读预试说明',exact:true}).click();await page.locator('#pilot-dialog input[type=checkbox]').check();await page.getByRole('button',{name:'确认并加入',exact:true}).click();await page.getByText(/参与编号：P-/).waitFor();await page.locator('#pilot-dialog').getByRole('button',{name:'关闭',exact:true}).click();
  await page.waitForFunction(()=>PilotStudyUI.active(KnowledgeAssistant.designSpaceSnapshot()),null,{timeout:45000});await notice();await page.locator('#workspace-support-notice').click();await frame().getByRole('button',{name:'不确定',exact:true}).click();await frame().getByRole('group',{name:'现在插入一句帮助合适吗？1 很不合适 — 5 很合适'}).count();assert.ok(await frame().locator('fieldset').count()>=2,'iframe不得丢失问题分组');
  await page.waitForTimeout(6000);let exported=(await api('/api/admin/pilot/export?project='+project)).data;assert.ok(exported.events.some(e=>e.type==='probe_shown'),'实际可见的 iframe 探针须保存 shown 回执');
  await frame().getByRole('button',{name:'保存这次记录',exact:true}).click();await page.waitForFunction(()=>!PilotStudyUI.active(KnowledgeAssistant.designSpaceSnapshot()));exported=(await api('/api/admin/pilot/export?project='+project)).data;assert.equal(exported.answers.at(-1).need,'uncertain');
  await page.locator('[data-classroom-action="fullscreen"]').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));
  await frame().getByRole('button',{name:'打开完整对话',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);await page.locator('#knowledge-assistant-panel').waitFor({state:'visible'});await page.locator('#workspace-tools-toggle').click();
  results.push({label:'全屏打开完整对话会恢复可见侧栏',passed:true});
  await page.setViewportSize({width:390,height:844});await page.locator('[data-workspace-canvas="slide"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok((await page.locator('iframe[data-openmaic-slide]').boundingBox()).width>=800,'窄屏课件默认保持可读尺寸');await page.getByRole('button',{name:'查看课件整页',exact:true}).click();assert.ok((await page.locator('iframe[data-openmaic-slide]').boundingBox()).width<400);await page.getByRole('button',{name:'放大阅读课件',exact:true}).click();await page.screenshot({path:path.join(out,'窄屏学习.png'),fullPage:true});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'网页学习验收.json'),JSON.stringify({passed:true,synthetic:true,source:external?'server-candidate':'local-fixture',results,errors},null,2));console.log('网页学习验收通过：六知识点60种布局、24次全屏、主动询问和课件内预试表单。');
 }catch(e){if(page)await page.screenshot({path:path.join(out,'失败诊断.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'网页学习验收.json'),JSON.stringify({passed:false,synthetic:true,results,error:String(e.stack)},null,2));throw e;}
 finally{await browser?.close();server?.kill();fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
