'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=process.env.COURSEWARE_QA_OUT||path.join(root,'tmp/simulation-interactions-r13');
const points=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints);
const checks=[],errors=[],states=[];
let browser,page,server,base;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html><body></body></html>');}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}if(file.endsWith('.html')){const bridge=fs.readFileSync(path.join(root,'app/main/courseware-bridge.js'),'utf8').replace(/<\/script/gi,'<\\/script');data=Buffer.from(data.toString('utf8').replace('</body>',`<script data-cq-context-bridge="1">${bridge}</script></body>`));}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'application/octet-stream');res.end(data);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.setContent('<style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><main id="lesson-player"><iframe sandbox="allow-scripts allow-forms"></iframe></main>');
 await page.addScriptTag({path:path.join(root,'app/main/courseware-context.js')});
 await page.evaluate(()=>{window.meta={unitId:'GH-01-K01',sceneType:'simulation'};window.scope={owner:'synthetic-simulation-r13',generation:1,runId:'simulation-r13'};window.events=[];addEventListener('message',e=>{if(e.data?.type==='maic_learning_event')events.push(e.data.payload);});window.controller=CoursewareContextCore.createBrowserController({window,document,root:document.querySelector('main'),getCourseMeta:()=>window.meta,getProgressScope:()=>window.scope});});
 async function load(id,fresh=true){
  if(fresh)await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('cq-courseware-progress-r12:'))localStorage.removeItem(key);});
  const c=points.find(p=>p.id===id).resourceCandidates.find(c=>c.type==='simulation');
  await page.evaluate(id=>window.meta={unitId:id,sceneType:'simulation'},id);
  const nav=page.waitForEvent('framenavigated',{predicate:f=>decodeURI(f.url()).includes(c.file)});
  await page.locator('iframe').evaluate((n,src)=>n.src=src,base+'/resources/'+encodeURI(c.root+'/'+c.file));
  const f=await nav;await f.waitForFunction(()=>window.CQSimulationProgress?.get);await f.waitForTimeout(350);return f;
 }
 async function test(label,fn){if(process.env.COURSEWARE_QA_ONLY&&!process.env.COURSEWARE_QA_ONLY.split('|').includes(label))return;try{const actual=await fn();checks.push({label,passed:true,actual});}catch(e){checks.push({label,passed:false,error:e.message,stack:e.stack});await page.screenshot({path:path.join(out,label+'-失败.png')}).catch(()=>{});}}
 async function fill(f,selector,value){const el=f.locator(selector);for(const summary of await el.locator('xpath=ancestor::details[not(@open)]/summary').all())await summary.click();await el.fill(String(value));}
 async function drag(f,selector,coords){const box=await f.locator(selector).boundingBox();assert(box);await page.mouse.move(box.x+coords.from.x,box.y+coords.from.y);await page.mouse.down();await page.mouse.move(box.x+coords.to.x,box.y+coords.to.y,{steps:12});await page.mouse.up();}
 async function restore(id,f){
  await f.waitForTimeout(550);const before=await f.evaluate(()=>CQSimulationProgress.get());
  await page.waitForFunction(saved=>Object.entries(localStorage).some(([k,v])=>{try{return k.startsWith('cq-courseware-progress-r12:')&&JSON.stringify(JSON.parse(v).simulation)===JSON.stringify(saved);}catch{return false;}}),before);
  const count=await page.evaluate(()=>events.length);f=await load(id,false);const after=await f.evaluate(()=>CQSimulationProgress.get());
  assert.deepEqual(after,before,'typed checkpoint round trip');
  const added=await page.evaluate(count=>events.slice(count).filter(e=>['challenge_result','attempt_submitted','parameter_commit','authored_feedback_exposed'].includes(e.event_type)),count);
  assert.deepEqual(added,[],'restore must not add learning submissions');return f;
 }
 let f;
 await test('输入输出-启动暂停预设拖动恢复重置',async()=>{
  f=await load('GH-01-K01');await f.locator('#preset-cubic').click();await fill(f,'#input_x-slider',2);await fill(f,'#speed-slider',1.5);
  const initial=await f.evaluate(()=>state.input_x);await f.locator('#main-btn').click();await f.waitForTimeout(350);await f.locator('#main-btn').click();
  assert.notEqual(await f.evaluate(()=>state.input_x),initial);assert.equal(await f.evaluate(()=>state.paused&&!state.running),true);
  const math=await f.evaluate(()=>({x:state.input_x,y:functions[state.current_rule].rule(state.input_x),text:document.getElementById('output-display')?.textContent||document.getElementById('output-value')?.textContent}));
  f=await restore('GH-01-K01',f);await f.locator('#main-btn').click();await f.waitForTimeout(150);await f.locator('#main-btn').click();await f.locator('#reset-btn').click();assert.equal(await f.evaluate(()=>state.input_x),0);return math;
 });
 await test('坐标图像-真实拖点锁定暂停恢复重置',async()=>{
  f=await load('GH-01-K02');await f.locator('.preset-btn[onclick*="quadratic"]').click();await fill(f,'#num_dots-slider',5);await f.locator('#main-btn').click();
  const coords=await f.evaluate(()=>{const d=state.dots[1];return{from:m2c(d.mx,d.my),to:m2c(d.mx,d.correctMy)};});const layout=await f.evaluate(()=>{const app=document.querySelector('#app-container'),cs=getComputedStyle(app),c=getComputedStyle(container);return{canvasW,canvasH,rect:container.getBoundingClientRect().toJSON(),canvas:canvas.getBoundingClientRect().toJSON(),parent:container.parentElement?.id,chain:[container,container.parentElement,container.parentElement?.parentElement].map(n=>n&&({id:n.id,class:n.className,rect:n.getBoundingClientRect().toJSON(),display:getComputedStyle(n).display,width:getComputedStyle(n).width,gridColumn:getComputedStyle(n).gridColumn})),app:app.getBoundingClientRect().toJSON(),appDisplay:cs.display,columns:cs.gridTemplateColumns,controls:document.querySelector('#controls').getBoundingClientRect().toJSON(),containerCss:{display:c.display,width:c.width,minWidth:c.minWidth,maxWidth:c.maxWidth,gridColumn:c.gridColumn,position:c.position,transform:c.transform,flex:c.flex,margin:c.margin},body:document.body.getBoundingClientRect().toJSON()}});await drag(f,'#canvas',coords);const dotState=await f.evaluate(()=>({lockedCount:state.lockedCount,dots:state.dots.map(d=>({x:d.mx,y:d.my,correctY:d.correctMy,locked:d.locked}))}));assert.equal(dotState.lockedCount,1,JSON.stringify({coords,layout,dotState,errors}));
  await f.locator('#main-btn').click();f=await restore('GH-01-K02',f);assert.equal(await f.evaluate(()=>state.paused&&state.dots[1].locked),true);
  await f.locator('#main-btn').click();assert.equal(await f.evaluate(()=>state.dots[1].locked),true);await f.locator('#reset-btn').click();assert.equal(await f.evaluate(()=>state.dots.length),0);return {lockedDotPreserved:true};
 });
 await test('变化方向-全部预设真实拖动播放暂停恢复重置',async()=>{
  f=await load('GH-01-K03');const presets=await f.evaluate(()=>JSON.parse(document.getElementById('widget-config').textContent).presets);
  for(let i=0;i<presets.length;i++){await f.locator('.preset-btn').nth(i).click();assert.deepEqual((await f.evaluate(()=>CQSimulationProgress.get())).state.vars,presets[i].variables);}
  const bb=await f.locator('#canvas').boundingBox();await drag(f,'#canvas',{from:{x:bb.width*.3,y:bb.height*.5},to:{x:bb.width*.65,y:bb.height*.5}});
  assert((await f.evaluate(()=>CQSimulationProgress.get())).state.trail.length>0);await f.locator('#main-btn').click();await f.waitForTimeout(250);await f.locator('#main-btn').click();
  f=await restore('GH-01-K03',f);assert.equal((await f.evaluate(()=>CQSimulationProgress.get())).state.started,true);await f.locator('#main-btn').click();await f.waitForTimeout(150);await f.locator('#main-btn').click();await f.locator('#reset-btn').click();assert.equal((await f.evaluate(()=>CQSimulationProgress.get())).state.x,0);return{presets:presets.length};
 });
 await test('数表趋近-自动保持原侧且按钮与运行一致',async()=>{
  f=await load('GH-02-K01');await f.locator('#reset-btn').click();const reset=await f.evaluate(()=>({x:state.xPosition,target:state.targetA,funcIndex:state.funcIndex}));await f.locator('#main-btn').click();await f.waitForTimeout(700);
  const actual=await f.evaluate(()=>({running:state.running,x:state.xPosition,target:state.targetA,funcIndex:state.funcIndex,button:document.getElementById('main-btn').textContent,badge:document.getElementById('state-badge').textContent}));states.push({id:'GH-02-K01',reset,...actual});
  assert(actual.x>actual.target,'starting on the right must remain on the right: '+JSON.stringify({reset,actual}));assert.match(actual.button,/暂停/);assert.match(actual.badge,/趋近中/);await f.locator('#main-btn').click();return {reset,...actual};
 });
 await test('数表趋近-手动接管停止自动并保留记录恢复',async()=>{
  f=await load('GH-02-K01');await f.locator('#main-btn').click();await f.waitForTimeout(100);await fill(f,'#x-position-slider',2.5);await f.waitForTimeout(700);
  const actual=await f.evaluate(()=>({running:state.running,x:state.xPosition,fx:document.getElementById('info-fx').textContent,rows:state.records.length}));assert.equal(actual.running,false);assert.equal(actual.x,2.5);assert.equal(actual.fx,'4.500000');
  f=await restore('GH-02-K01',f);await f.locator('#reset-btn').click();assert.equal(await f.locator('#table-body tr').count(),0);return actual;
 });
 await test('左右极限-四预设真实播放暂停恢复与重置',async()=>{
  f=await load('GH-02-K02');const snapshots=[];
  for(let i=0;i<4;i++){await f.locator('.preset-btn').nth(i).click();await f.locator('#mainBtn').click();await f.waitForTimeout(180);await f.locator('#mainBtn').click();const s=await f.evaluate(()=>({type:state.functionType,left:state.leftAntX,right:state.rightAntX,leftText:document.getElementById('leftYVal').textContent,rightText:document.getElementById('rightYVal').textContent,leftExpected:f_eval(state.leftAntX,state.breakpoint,state.functionType),rightExpected:f_eval(state.rightAntX,state.breakpoint,state.functionType)}));assert.equal(s.leftText,s.leftExpected.toFixed(3));assert.equal(s.rightText,s.rightExpected.toFixed(3));snapshots.push(s);}
  f=await restore('GH-02-K02',f);await f.locator('#mainBtn').click();await f.waitForTimeout(150);await f.locator('#mainBtn').click();await f.locator('#resetBtn').click();assert.equal(await f.evaluate(()=>state.leftAntX===state.leftAntStartX&&!state.running),true);return snapshots;
 });
 await test('连续性-启动后读数及双侧真正趋近',async()=>{
  f=await load('GH-02-K03');await f.evaluate(()=>{window.approachSamples=[];const arc=ctx.arc;ctx.arc=function(x,y,r,...rest){if(r===5)window.approachSamples.push({x:toMathX(x),y:toMathY(y)});return arc.call(this,x,y,r,...rest);};});
  await f.locator('#start-btn').click();await f.waitForTimeout(3300);const actual=await f.evaluate(()=>({limit:document.getElementById('limit-display').textContent,value:document.getElementById('f-value-display').textContent,samples:approachSamples}));states.push({id:'GH-02-K03',label:'启动后',...actual});await page.screenshot({path:path.join(out,'连续性-启动后.png')});
  assert.equal(actual.limit,'4.00');assert.equal(actual.value,'2.00');assert(actual.samples.some(p=>p.x>1.8&&p.x<2),'left observation must approach 2');assert(actual.samples.some(p=>p.x>2&&p.x<2.2),'right observation must approach 2');assert(actual.samples.every(p=>Math.abs(p.y-(p.x+2))<1e-7));return{limit:actual.limit,value:actual.value,sampleCount:actual.samples.length};
 });
 await test('连续性-暂停恢复不重置趋近阶段',async()=>{
  f=await load('GH-02-K03');await f.locator('#start-btn').click();await f.waitForTimeout(250);await f.locator('#start-btn').click();const before=await f.evaluate(()=>({phase:state.approachPhase,saved:CQSimulationProgress.get()}));
  assert.equal(before.saved.state.started,true);assert.match(await f.locator('#start-btn').textContent(),/继续/);f=await restore('GH-02-K03',f);assert.equal(await f.evaluate(()=>state.approachPhase),before.phase);
  await f.locator('#start-btn').click();await f.waitForTimeout(100);await f.locator('#start-btn').click();assert((await f.evaluate(()=>state.approachPhase))>before.phase);return before;
 });
 await test('连续性-核对后拖点读数反馈状态同步',async()=>{
  f=await load('GH-02-K03');await fill(f,'#point_y_coordinate-slider',4);await f.locator('#check-btn').click();assert.equal(await f.evaluate(()=>state.continuous),true);
  await drag(f,'#simCanvas',await f.evaluate(()=>({from:{x:toCanvasX(holeX),y:toCanvasY(4)},to:{x:toCanvasX(holeX),y:toCanvasY(3)}})));
  const actual=await f.evaluate(()=>({y:state.point_y_coordinate,value:document.getElementById('f-value-display').textContent,banner:document.getElementById('feedback-banner').textContent,status:document.getElementById('status-text').textContent}));states.push({id:'GH-02-K03',label:'核对后拖点',...actual});assert.equal(actual.value,actual.y.toFixed(2));assert.match(actual.banner,/不连续/);assert.match(actual.status,/不连续/);return actual;
 });
 await test('连续性-三预设滑块核对刷新及重置读数',async()=>{
  f=await load('GH-02-K03');for(const [preset,y]of [['basic',2],['challenge',1.5],['wide',3]]){await f.locator('[data-preset="'+preset+'"]').click();assert.equal(await f.locator('#f-value-display').textContent(),y.toFixed(2));assert.equal(await f.locator('#limit-display').textContent(),'4.00');}
  await fill(f,'#point_y_coordinate-slider',4);await fill(f,'#gap_width-slider',1.25);await f.locator('#check-btn').click();f=await restore('GH-02-K03',f);assert.equal(await f.evaluate(()=>state.checked&&state.continuous),true);
  await page.screenshot({path:path.join(out,'连续性-核对成功.png')});await f.locator('#reset-btn').click();assert.equal(await f.locator('#limit-display').textContent(),'4.00');assert.equal(await f.locator('#f-value-display').textContent(),'2.00');return{presets:3};
 });
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await f.waitForTimeout(150);await page.screenshot({path:path.join(out,'连续性-最终布局-'+width+'.png')});}
 checks.push({label:'页面脚本无未捕获异常',passed:errors.length===0,errors});
 const files=points.map(p=>{const c=p.resourceCandidates.find(c=>c.type==='simulation'),file=path.join('resources',c.root,c.file);return{point:p.id,file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')};});
 const result={passed:checks.every(c=>c.passed),synthetic:true,scope:'6个主要仿真关键操作路径；真实Chrome与sandbox父子桥；不声称全参数穷尽或学习成效',checks,states,errors,files};
 fs.writeFileSync(path.join(out,'六仿真实际交互回归.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,checks:checks.map(c=>({label:c.label,passed:c.passed,error:c.error}))},null,2));if(!result.passed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
