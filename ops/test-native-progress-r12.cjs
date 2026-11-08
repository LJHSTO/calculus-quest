'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=process.env.COURSEWARE_QA_OUT||path.join(root,'tmp/native-progress-r12'),model=require('../lib/courseware/functions-limits-r10/native-model');
const points=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints);
(async()=>{
 fs.mkdirSync(out,{recursive:true});const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js',String(port)],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',DB_PATH:path.join(out,'synthetic-native-'+Date.now()+'.db'),LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',PROACTIVE_POLICY_MODE:'off'}});let browser;
 const checks=[],errors=[];
 try{
  const base='http://127.0.0.1:'+port;let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.goto(base);await page.setContent('<style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><main id="lesson-player"><iframe sandbox="allow-scripts allow-forms"></iframe></main>');await page.addScriptTag({path:path.join(root,'app/main/courseware-context.js')});
  await page.evaluate(()=>{window.meta={unitId:'GH-01-K01',sceneType:'mindMap'};window.scope={owner:'synthetic-native-resume',generation:1,runId:'native-r12'};window.events=[];addEventListener('message',e=>{if(e.data?.type==='maic_learning_event')events.push(e.data.payload);});window.controller=CoursewareContextCore.createBrowserController({window,document,root:document.querySelector('main'),getCourseMeta:()=>window.meta,getProgressScope:()=>window.scope});});
  async function load(id){const point=id.slice(0,9),type=id.slice(10),candidate=points.find(p=>p.id===point).resourceCandidates.find(c=>c.type===type);await page.evaluate(({point,type})=>window.meta={unitId:point,sceneType:type},{point,type});const navigation=page.waitForEvent('framenavigated',{predicate:f=>decodeURI(f.url()).includes(candidate.file)});await page.locator('iframe').evaluate((n,src)=>n.src=src,base+'/resources/'+encodeURI(candidate.root+'/'+candidate.file));const frame=await navigation;await frame.waitForFunction(()=>window.CQNativeProgress?.get);await frame.waitForTimeout(700);return frame;}
  async function slider(f,label,value){const input=f.getByRole('slider',{name:label,exact:true});await input.fill(String(value));}
  for(const [id,task] of Object.entries(model.tasks)){
   let f=await load(id);
   if(task.kind==='mapping'){await f.getByRole('button',{name:'连接输入-1与输出0',exact:true}).click();await f.getByRole('button',{name:'连接输入-1与输出1',exact:true}).click();await f.getByRole('button',{name:'采用这组连线',exact:true}).click();}
   if(task.kind==='domain'){await f.getByRole('button',{name:'切换：是否另给点值',exact:true}).click();await slider(f,'准备画的f(2)',3);await f.getByRole('button',{name:'按草稿画实际点值',exact:true}).click();}
   if(task.kind==='counterexample'){await slider(f,'左标记x₁',-1);await slider(f,'右标记x₂',-.5);await f.getByRole('button',{name:'保留这个反例',exact:true}).click();}
   if(task.kind==='neighborhood'){await slider(f,'倍率k',4);await slider(f,'邻近范围δ',.1);await f.getByRole('button',{name:'换成误差0.05',exact:true}).click();await f.getByRole('button',{name:'采用这个邻近范围',exact:true}).click();}
   if(task.kind==='sides'){await f.locator('#sim-left').fill('2');await f.locator('#sim-right').fill('4');await f.locator('.sim-btn').click();}
   if(task.kind==='repair'){await f.getByRole('button',{name:'两侧跳跃',exact:true}).click();await slider(f,'准备采用的f(0)',4);await f.getByRole('button',{name:'应用点值修复',exact:true}).click();}
   if(task.kind==='mapping_observe'){await slider(f,'固定输入x',2);await f.getByRole('button',{name:'保留这条映射',exact:true}).click();}
   if(task.kind==='signed_pillar'){await f.locator('#func-select').selectOption('linear');await f.getByRole('spinbutton',{name:'生成立柱的输入',exact:true}).fill('-3');await f.locator('#r7-create-pillar').click();await f.getByRole('button',{name:'收集刚生成的立柱',exact:true}).click();}
   if(task.kind==='terrain'){await f.locator('#r7-first').fill('-2');await f.locator('#r7-second').fill('-1');await f.getByRole('button',{name:'保留这对截面证据',exact:true}).click();}
   if(task.kind==='tail'){await f.getByRole('button',{name:'换一条误差带',exact:true}).click();await f.locator('#x-slider').fill('30');await f.getByRole('button',{name:'采用这个门槛X',exact:true}).click();}
   if(task.kind==='projection'){await f.locator('#preset-top').click();await f.getByRole('button',{name:'保留当前投影观察',exact:true}).click();await f.locator('#preset-side').click();await f.getByRole('button',{name:'保留当前投影观察',exact:true}).click();}
   if(task.kind==='point_observe'){const b=f.getByRole('button',{name:'保留点值与附近趋势',exact:true});await b.click();}
   await f.waitForTimeout(200);const before=await f.evaluate(()=>CQNativeProgress.get());assert(before.feedback||before.snapshots.length,id+' must reach a non-initial feedback/record state');const count=await page.evaluate(()=>events.length);f=await load(id);const after=await f.evaluate(()=>CQNativeProgress.get());assert.deepEqual(after,before,id+' native draft/feedback/record restoration');const extra=await page.evaluate(count=>events.slice(count).filter(e=>['challenge_result','attempt_submitted','parameter_commit','authored_feedback_exposed'].includes(e.event_type)),count);assert.deepEqual(extra,[],id+' restore emits no artificial progress');checks.push({id,kind:task.kind,before,after,extraEvents:extra.length});await page.screenshot({path:path.join(out,id+'-记录与反馈恢复.png')});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'12个原生构建任务恢复.json'),JSON.stringify({passed:true,synthetic:true,checks,errors,scope:'12个真实原生任务的构建选择、草稿、记录、反馈、去重键恢复；不恢复WebGL任意动画轨迹、相机连续位置或全部历史立柱'},null,2));console.log('12个原生构建任务恢复通过');
 }catch(e){fs.writeFileSync(path.join(out,'原生恢复失败.json'),JSON.stringify({passed:false,error:e.message,checks,errors},null,2));throw e;}
 finally{if(browser)await browser.close();child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
