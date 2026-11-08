'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
async function main(){
 const out=path.join(root,'output/playwright');fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,'formal-entry-r11-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base=`http://127.0.0.1:${port}`;
 const admin=crypto.randomBytes(24).toString('hex'),password=crypto.randomBytes(18).toString('hex');
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:'false',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-formal-entry',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r11',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:'functions-limits-delayed-r11-20261107',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'true',APP_VERSION:'synthetic-formal-entry-r11'};
 const log=fs.openSync(path.join(dir,'server.log'),'w');let server,browser,page;
 const report={synthetic:true,localOnly:true,productionOrCandidateTouched:false,teacherApproval:'本机隔离数据库的测试夹具，不是教师审定',checks:[]};
 async function api(route,body,token,arm='assigned',extra={}){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(arm?{'X-Study-Arm':arm}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,...await response.json()};}
 async function boot(){server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(server.exitCode!==null)throw Error('隔离服务启动失败');await new Promise(r=>setTimeout(r,100));}throw Error('隔离服务未就绪');}
 async function stop(){if(server&&server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}}
 async function formalRuns(){return(await api('/api/admin/three-arm/export',null,admin,'')).data.runs.filter(r=>r.mode==='formal');}
 async function enrollment(p,label){await p.locator('#auth-gate').waitFor({state:'hidden'});await p.locator('#three-arm-dialog[open]').getByRole('heading',{name:'参加本次学习研究',exact:true}).waitFor();assert.equal(await p.locator('#auth-gate').isVisible(),false);await p.screenshot({path:path.join(dir,label+'.png')});}
 async function login(p,nickname){await p.goto(base+'/?study=assigned');await p.locator('#login-identifier').fill(nickname);await p.locator('#login-password').fill(password);await p.locator('#login-submit').click();}
 try{
  await boot();
  const protocol=(await api('/api/admin/three-arm',null,admin,'')).data.protocol;assert.equal(protocol.teacherReview.status,'pending');
  const ownerName='正式入口合成'+Date.now(),registered=await api('/api/auth/register',{nickname:ownerName,password},null);
  assert.equal(registered.status,200);const token=registered.token;
  for(const route of ['/api/study/state','/api/learning/snapshot']){const r=await api(route,null,token);assert.equal(r.status,409,route);assert.equal(r.code,'study_enrollment_required');}
  assert.equal((await api('/api/study/state',null,token,'assigned',{'X-Study-Run':'study-not-owned'})).status,403);
  assert.equal((await api('/api/auth/me',{},token)).status,200);
  assert.equal((await formalRuns()).length,0);report.checks.push('未入组明确409、错误轮次403、身份有效且未创建正式run');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:1400,height:950}});page=await ctx.newPage();page.setDefaultTimeout(15000);
  const secondName='正式注册合成'+Date.now();await page.goto(base+'/?study=assigned');
  await page.locator('[data-auth-mode=register]').click();await page.locator('#nickname').fill(secondName);await page.locator('#register-password').fill(password);await page.locator('#register-password-confirm').fill(password);await page.locator('#login-submit').click();
  await enrollment(page,'首次注册-入组说明');report.checks.push('真实Chrome首次注册到入组说明，无认证门禁遮挡');
  await page.reload();await enrollment(page,'刷新-入组说明');report.checks.push('真实Chrome刷新恢复已验证身份并进入入组说明');
  const loginCtx=await browser.newContext({viewport:{width:1400,height:950}}),loginPage=await loginCtx.newPage();loginPage.setDefaultTimeout(15000);await login(loginPage,ownerName);await enrollment(loginPage,'首次登录-入组说明');await loginCtx.close();report.checks.push('真实Chrome独立会话首次登录进入入组说明');
  const dialog=page.locator('#three-arm-dialog[open]');await dialog.locator('input[type=checkbox]').check();await dialog.getByRole('button',{name:'确认参加并进入学习',exact:true}).click();await dialog.getByRole('status').filter({hasText:'研究负责人尚未确认'}).waitFor();assert.equal((await formalRuns()).length,0);report.checks.push('教师pending时确认参加仍被拒绝，正式run保持0');
  const approved=await api('/api/admin/three-arm/baseline',{reviewer:'仅本机合成审批夹具',confirmed:true,note:'只验证入口状态机，不是实际教师审定'},admin,'');assert.equal(approved.status,200);
  await dialog.getByRole('button',{name:'确认参加并进入学习',exact:true}).click();await page.waitForFunction(()=>window.ThreeArmStudyUI?.run?.mode==='formal');
  await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view=learn]').first().click();await page.locator('#three-arm-dialog[open]').getByRole('heading',{name:'开始前，先了解一下你',exact:true}).waitFor();
  assert.equal((await formalRuns()).length,1);await page.screenshot({path:path.join(dir,'仅合成审批夹具-入组后基线问卷.png')});report.checks.push('仅隔离审批夹具：确认入组创建一个formal run并进入baseline问卷');
  const joinedToken=await page.evaluate(()=>state.authToken);const joinedId=(await formalRuns())[0].id;
  await stop();env.APP_VERSION='synthetic-formal-entry-r11-incompatible';await boot();
  const mismatch=await api('/api/study/state',null,joinedToken);assert.equal(mismatch.status,409);assert.equal(mismatch.code,'study_runtime_mismatch');
  const authMismatch=await api('/api/auth/me',{},joinedToken);assert.equal(authMismatch.status,409);assert.equal(authMismatch.code,'study_runtime_mismatch');
  await page.reload();await page.locator('#auth-gate').waitFor({state:'visible'});await page.locator('#login-feedback').filter({hasText:'请研究负责人恢复对应版本后继续'}).waitFor();assert.equal(await page.evaluate(()=>Boolean(state.authToken)),true);assert.equal(await page.locator('#three-arm-dialog[open]').getByRole('heading',{name:'参加本次学习研究',exact:true}).count(),0);assert.equal((await formalRuns()).length,1);assert.equal((await formalRuns())[0].id,joinedId);await page.screenshot({path:path.join(dir,'既有正式版本不匹配-保护保留.png')});report.checks.push('既有正式版本不匹配仍409，显示联系负责人恢复版本，保留token、不误开入组、不替换既有run');
  report.passed=true;console.log(JSON.stringify({passed:true,dir,checks:report.checks}));
 }catch(error){report.passed=false;report.error=error.message;if(page)await page.screenshot({path:path.join(dir,'失败现场.png')}).catch(()=>{});throw error;}
 finally{if(browser)await browser.close();await stop();fs.closeSync(log);fs.writeFileSync(path.join(dir,'回执.json'),JSON.stringify(report,null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
