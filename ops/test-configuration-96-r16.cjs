'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core'),registry=require('../lib/assessments/functions-limits-registry');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cq-placement-r15-')),out=path.resolve(process.env.CONFIG_MATRIX_OUTPUT||path.join(root,'output/playwright/r16-matrix'));fs.mkdirSync(out,{recursive:true});
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base=`http://127.0.0.1:${port}`;
 const log=fs.openSync(path.join(dir,'server.log'),'w'),env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),LOCAL_ADMIN_AUTH_BYPASS:'true',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r16',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'false',RATE_LIMIT_MAX:'10000'};
 const server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log]});let browser;const checks=[],errors=[];
 try{
  for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const evidence of ['standard','cautious'])for(const timing of ['boundary','quiet'])for(const followup of ['stop','followup'])for(const placement of ['inline','sidebar'])for(const authority of ['ask','cue'])for(const depth of ['hint','guided','example']){
   const nickname=`组合${checks.length+1}`,password='synthetic-placement-password';let token='';
   const api=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();assert.equal(r.status,200,route+': '+p.message);return p;};
   token=(await api('/api/auth/register',{nickname,password})).token;
   const run=(await api('/api/study/state')).data.run,items=(await api('/api/study/survey?stage=baseline')).data.items;
   await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(items.map(q=>[q.id,q.type==='text'?'合成回答':3]))});
   const bank=registry.forVersion(run.assessmentVersion);await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:bank.questions('pre',run.assessmentOrder[0]).map(q=>({questionId:q.id,response:q.type==='short_answer'?'__unknown__':q.answer[0]}))});
   const pref=(await api('/api/learning/learner-preferences')).data,answers=pref.record.answers;answers.D1.value=evidence;answers.D2.value=timing;answers.D6.value=followup;answers.D4.value=placement;answers.D5.value=authority;answers.D3.value=depth;
   await api('/api/learning/learner-preferences',{answers,expectedRevision:pref.record.revision});
   const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(base+'/?study=B');await page.locator('#login-identifier').fill(nickname);await page.locator('#login-password').fill(password);await page.locator('#login-submit').click();await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view=learn]').first().click();
    await page.evaluate(async()=>{ensureAgenticPath().pendingPlan=null;agenticUnlockUnit('GH-01-K02','synthetic_r15_fixture');selectUnit('GH-01-K02');await syncLearningSnapshot('synthetic_r15_fixture');await KnowledgeAssistant.reloadLearnerPolicy();});
    await require('./visit-lecture-r19.cjs')(page);await page.locator('[data-workspace-canvas=interactive]').click();await page.locator('[data-knowledge-scene=mindMap]').click();const frame=page.frameLocator('iframe[data-courseware-frame][data-context-scene-type=mindMap]');await frame.locator('.r9-native').waitFor();
    await frame.locator('body').evaluate(()=>new Promise(resolve=>{const ready=()=>{if(document.readyState==='complete'&&window.CQNativeProgress&&!window.__cqRestoringProgress)resolve();else setTimeout(ready,50);};ready();}));
    await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().taskReady===true&&KnowledgeAssistant.designSpaceSnapshot().sceneType==='mindMap');
    await page.locator('iframe[data-courseware-frame]').evaluate(f=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();await page.evaluate(()=>analyticsFlushUntilSettled(20000));
    await frame.getByRole('slider',{name:'准备画的f(2)',exact:true}).press('ArrowUp');await frame.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();await page.evaluate(()=>analyticsFlushUntilSettled(20000));
    if(evidence==='cautious'){
      await page.waitForTimeout(500);const cautious=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());assert.equal(cautious.offer,null,'单一类别的错误线索应保持谨慎');assert.notEqual(cautious.supportCycle?.status,'awaiting_confirmation');
      await page.evaluate(()=>SupportCycleUI.openManual());if(placement==='sidebar')await page.evaluate(()=>KnowledgeAssistant.open());
      const manual=page.locator(placement==='inline'?'.task-support-panel':'.learning-support-surface[data-placement=sidebar]');await manual.getByRole('button',{name:'概念或步骤没弄懂',exact:true}).click();await manual.getByRole('button',{name:'开始帮助',exact:true}).click();await page.waitForFunction(()=>['offered','engaged'].includes(KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status));
    }else await page.waitForFunction(authority=>{const s=KnowledgeAssistant.designSpaceSnapshot();return authority==='ask'?s.supportCycle?.status==='awaiting_confirmation':Boolean(s.offer);},authority,{timeout:30000});
    if(placement==='sidebar'&&await page.locator('#workspace-support-notice').isVisible())await page.locator('#workspace-support-notice').click();
    let s=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());assert.equal(s.view.placement,placement);assert.equal(s.researchControls.profile.initialSupportLevel,{hint:'L2',guided:'L3',example:'L5'}[depth]);
    const host=page.locator(placement==='inline'?'.task-support-panel':'.learning-support-surface[data-placement=sidebar]');await host.waitFor({state:'visible'});
    if(evidence==='cautious'){assert.equal(s.supportCycle.plan.knowledgeScaffoldLevel,{hint:'L2',guided:'L3',example:'L5'}[depth]);}
    else if(authority==='ask'){assert.equal(s.supportCycle.content,null);await host.getByRole('button',{name:'请知点讲一下',exact:true}).click();await page.waitForFunction(()=>['offered','engaged'].includes(KnowledgeAssistant.designSpaceSnapshot().supportCycle?.status));s=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());assert.equal(s.supportCycle.plan.knowledgeScaffoldLevel,{hint:'L2',guided:'L3',example:'L5'}[depth]);}
    else{assert.equal(s.offer.supportLevel,{hint:'L2',guided:'L3',example:'L5'}[depth]);await host.locator('.knowledge-proactive-inline-offer-detail').waitFor({state:'visible'});assert.equal(await host.locator('.support-inquiry').count(),0);}
    assert.equal(s.researchControls.profile.cooldownSeconds,timing==='quiet'?180:60);assert.equal(s.researchControls.profile.supportFollowups,followup==='followup'?1:0);
    assert(await host.locator('.support-reasoning summary').count()>0,'帮助理由入口存在');
    if(placement==='sidebar'){
     const identity=s.offer?.decisionId||s.supportCycle?.id;await frame.getByRole('slider',{name:'准备画的f(2)',exact:true}).press('ArrowDown');await page.evaluate(()=>analyticsFlushUntilSettled(20000));await page.waitForTimeout(350);const retained=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());assert.equal(retained.offer?.decisionId||retained.supportCycle?.id,identity,'继续操作课件不能撤掉帮助');await host.waitFor({state:'visible'});
    }
    if(placement==='inline'){
     const offerId=s.offer?.decisionId,cycleId=s.supportCycle?.id;
     for(const open of [true,false]){
      await page.evaluate(open=>open?KnowledgeAssistant.open():KnowledgeAssistant.close(),open);await page.evaluate(()=>analyticsFlushUntilSettled(20000));await page.waitForTimeout(400);
      await host.waitFor({state:'visible'});const after=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot());assert.equal(after.offer?.decisionId,offerId,'侧栏开关及异步事件不得结束任务帮助');assert.equal(after.supportCycle?.id,cycleId);
      assert(await host.evaluate(n=>{const r=n.getBoundingClientRect();return r.width>100&&r.height>100&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth;}),'帮助仍在电脑视口内');
     }
    }
    const label=`${evidence}-${timing}-${followup}-${placement}-${authority}-${depth}`;if(evidence==='cautious'||timing==='quiet')await page.screenshot({path:path.join(out,'组合-'+label+'.png')});checks.push(label);console.log('通过：'+label);
   }catch(e){fs.writeFileSync(path.join(out,'placement-failure.json'),JSON.stringify({evidence,timing,followup,placement,authority,depth,snapshot:await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot())},null,2));await page.screenshot({path:path.join(out,'帮助位置-失败.png')}).catch(()=>{});throw e;}finally{await page.close();}
  }
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}fs.closeSync(log);fs.writeFileSync(path.join(out,'placement-result.json'),JSON.stringify({checks,errors,synthetic:true},null,2));}
 if(checks.length===96&&!errors.length)for(const file of ['placement-failure.json','帮助位置-失败.png'])fs.rmSync(path.join(out,file),{force:true});
 console.log(JSON.stringify({passed:true,combinations:checks.length,errors}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
