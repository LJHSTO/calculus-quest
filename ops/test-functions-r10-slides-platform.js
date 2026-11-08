'use strict';
// Existing shared dependency checkout: set NODE_PATH=../calculus-quest-proactive-test/node_modules if this checkout has no node_modules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright-core'),bank=require('../lib/assessments/functions-limits-r10');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/playwright/functions-r10/原生讲解平台验收'),base=(process.argv.slice(2).find(arg=>/^https?:\/\//.test(arg))||process.env.STUDENT_UX_BASE_URL||'http://127.0.0.1:53535').replace(/\/$/,'');
const route=require('../data/multi-scene-learning-route.json'),points=route.chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints);
const sizes=[{width:1366,height:768},{width:390,height:844}];
const norm=s=>String(s).replace(/\s+/g,'');
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,channel:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?undefined:(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL||'chrome'),headless:true});
 const page=await browser.newPage({viewport:sizes[0]}),errors=[],failedRequests=[],navigationAborts=[],rows=[],layoutFailures=[],checks=[];
 let noteEvidence=null;
 page.setDefaultTimeout(18000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('requestfailed',request=>{
  if(!/openmaic-classroom|learning-runtime|multi-scene-learning-route/.test(request.url()))return;
  const failure={url:request.url(),error:request.failure()?.errorText};
  if(failure.error==='net::ERR_ABORTED'&&request.isNavigationRequest())navigationAborts.push({...failure,frame:request.frame()});
  else failedRequests.push(failure);
 });
 await page.addInitScript(()=>{window.__observedSlideRenders=[];addEventListener('message',event=>{if(event.data?.type==='cq:openmaic-rendered')window.__observedSlideRenders.push({slideId:event.data.slideId,at:Date.now()});});});
 const api=(url,body)=>page.evaluate(async({url,body})=>{const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+state.authToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(url+' '+r.status+' '+data.message);return data;},{url,body});
 async function prepare(){
  await page.goto(base+'/?study=B');await page.locator('#app-loader.hidden').waitFor({state:'attached'});
  await page.locator('[data-auth-mode="register"]').click();await page.locator('#nickname').fill('讲解页验收合成'+Date.now());
  await page.locator('#register-password').fill('Synthetic-r10-slides-123');await page.locator('#register-password-confirm').fill('Synthetic-r10-slides-123');await page.locator('#login-submit').click();
  await page.locator('#auth-gate').waitFor({state:'hidden'});await page.locator('[data-view="learn"]').first().click();
  const survey=(await api('api/study/survey?stage=baseline')).data;
  await api('api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,q.options?.find(o=>o.value===3)?.value??3]))});
  if(await page.locator('#three-arm-dialog[open]').count())await page.locator('#three-arm-dialog').getByRole('button',{name:'稍后继续',exact:true}).click();
  await page.waitForTimeout(2200);
  if(await page.getByRole('button',{name:'进入知识前测',exact:true}).isVisible())await page.getByRole('button',{name:'进入知识前测',exact:true}).click();
  await page.locator('[data-view="learn"]').first().click();await page.locator('.question-card').first().waitFor({state:'visible'});
  const available=[...bank.questions('pre','X'),...bank.questions('pre','Y')],cards=page.locator('.question-card');
  for(let i=0;i<await cards.count();i++){
   const card=cards.nth(i),id=await card.getAttribute('data-question'),q=available.find(q=>q.id===id);assert.ok(q,id);
   if(q.type==='short_answer')await card.locator('textarea').fill('合成工程验收回答，不作为真人学习成绩。');else await card.locator('input[value="'+q.answer[0]+'"]').check();
  }
  await page.locator('[data-submit-quiz]').click();await page.waitForFunction(()=>state.submittedQuizzes.includes('V14-C1-pre'));
  await page.getByRole('button',{name:'开始学习',exact:true}).first().click();await page.waitForTimeout(600);
  const prefs=(await api('api/learning/learner-preferences')).data,answers=prefs.record.answers;
  for(const a of Object.values(answers))a.reason='default';
  await api('api/learning/learner-preferences',{answers,expectedRevision:prefs.record.revision,selectionSource:'synthetic_r10_slides_fixture'});
  await page.reload();await page.locator('#app-loader.hidden').waitFor({state:'attached'});await page.locator('[data-view="learn"]').first().click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().unitType==='knowledge'||document.querySelector('[data-quiz-path-action="pilot-next"]'));
  if(await page.locator('[data-quiz-path-action="pilot-next"]').count())await page.locator('[data-quiz-path-action="pilot-next"]').first().click();
  await page.waitForFunction(()=>KnowledgeAssistant.designSpaceSnapshot().unitType==='knowledge');
  checks.push('新建合成账号；基线、前测提交及配置准备经现有界面/API完成');
 }
 async function openUnit(id){
  // This fixture changes navigation eligibility only. It does not inject slides, notes or renderer replies.
  await page.evaluate(async id=>{ensureAgenticPath().pendingPlan=null;agenticUnlockUnit(id,'synthetic_r10_slide_validation');selectUnit(id);await syncLearningSnapshot('synthetic_r10_slide_unit');},id);
  await page.locator('[data-workspace-canvas="interactive"]').click();await page.locator('[data-knowledge-scene="simulation"]').click();await page.locator('iframe[data-courseware-frame]').waitFor({state:'visible'});
  await page.locator('[data-workspace-canvas="slide"]').click();await page.locator('.multi-scene-slide-panel [data-openmaic-state="ready"]').waitFor();
 }
 async function buttonEvidence(selector){
  return page.locator(selector).evaluate(node=>{
   const r=node.getBoundingClientRect(),points=[[.5,.5],[.2,.5],[.8,.5],[.5,.25],[.5,.75]];
   const samples=points.map(([x,y])=>{const hit=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);return {x:r.left+r.width*x,y:r.top+r.height*y,clear:hit===node||node.contains(hit),hit:hit?.tagName,hitId:hit?.id||'',hitClass:typeof hit?.className==='string'?hit.className:''};});
   const style=getComputedStyle(node),visible=style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0;
   return {text:node.textContent.trim(),rect:r.toJSON(),visible,inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,disabled:node.disabled,samples,unobscured:samples.every(s=>s.clear)};
  });
 }
 async function examine(point,index,size){
  const expected=point.slide.pages[index],iframe=page.locator('iframe[data-openmaic-slide]');
  await page.waitForFunction(id=>document.querySelector('iframe[data-openmaic-slide]')?.dataset.openmaicSlide===id,expected.id);
  await page.waitForFunction(id=>window.__observedSlideRenders.some(r=>r.slideId===id),expected.id);
  const frame=await(await iframe.elementHandle()).contentFrame();
  const expectedTexts=await page.evaluate(elements=>elements.filter(e=>e.type==='text').map(e=>({id:e.id,text:new DOMParser().parseFromString(e.content,'text/html').body.textContent})),expected.elements);
  await frame.waitForFunction(text=>document.body.textContent.replace(/\s+/g,'').includes(text),norm(expectedTexts[0].text));
  await page.waitForTimeout(160);
  const actual=await frame.locator('body').innerText(),actualNormalized=norm(actual);
  const matches=expectedTexts.map(e=>({elementId:e.id,text:e.text,present:actualNormalized.includes(norm(e.text))}));
  assert.ok(matches.every(m=>m.present),point.id+' page '+(index+1)+' rendered text mismatch: '+JSON.stringify(matches.filter(m=>!m.present)));
  assert.ok(!actual.includes('\uFFFD'));
  assert.equal(await iframe.getAttribute('data-openmaic-slide'),expected.id);
  const controls={previous:await buttonEvidence('.openmaic-page-nav button:first-child'),next:await buttonEvidence('.openmaic-page-nav button:last-child'),complete:await buttonEvidence('[data-learning-primary-action]')};
  assert.match(controls.complete.text,/完成学习|完成.*检测|继续下一节/);
  assert.equal(controls.complete.disabled,false);
  assert.equal(controls.previous.disabled,index===0);assert.equal(controls.next.disabled,index===2);
  for(const [control,evidence]of Object.entries(controls))if(!evidence.visible||!evidence.inViewport||!evidence.unobscured)layoutFailures.push({point:point.id,page:index+1,viewport:size,control,evidence});
  const pageLayout=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,scrollY,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id)}));
  if(pageLayout.documentWidth>size.width+1)layoutFailures.push({point:point.id,page:index+1,viewport:size,control:'document',evidence:pageLayout});
  const screenshot=point.id+'-'+(index+1)+'-'+size.width+'x'+size.height+'.png';await page.screenshot({path:path.join(out,screenshot)});
  rows.push({point:point.id,page:index+1,viewport:size,expectedCanvasId:expected.id,actualCanvasId:await iframe.getAttribute('data-openmaic-slide'),rendererAcknowledged:true,expectedTextMatches:matches,actualText:actual,controls,pageLayout,screenshot});
  return frame;
 }
 async function noteFromNewSlide(){
  await page.setViewportSize(sizes[0]);await openUnit('GH-01-K02');await page.getByRole('button',{name:'下一讲解页',exact:true}).click();
  const iframe=page.locator('iframe[data-openmaic-slide]'),frame=await(await iframe.elementHandle()).contentFrame();
  await frame.getByText('仅在x≠3时约去x−3，得到g(x)=x+3。',{exact:false}).waitFor();
  await iframe.scrollIntoViewIfNeeded();
  const selectedRange=await frame.evaluate(()=>{
   const host=[...document.querySelectorAll('p')].find(n=>n.textContent.includes('仅在x≠3时约去'));
   const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let text;
   while((text=walker.nextNode())&&!text.textContent.includes('仅在x≠3时约去')){}
   const start=text.textContent.indexOf('仅在'),end=Math.min(start+14,text.length),range=document.createRange();range.setStart(text,start);range.setEnd(text,end);
   return {rect:range.getBoundingClientRect().toJSON(),expected:text.textContent.slice(start,end)};
  });
  const bounds=await iframe.boundingBox(),r=selectedRange.rect;
  await page.mouse.move(bounds.x+r.left+1,bounds.y+r.top+r.height/2);await page.mouse.down();await page.mouse.move(bounds.x+r.right-1,bounds.y+r.top+r.height/2,{steps:15});await page.mouse.up();
  const actualSelection=await frame.evaluate(()=>getSelection().toString());assert.ok(actualSelection.includes('x≠3'),'真实鼠标拖选应包含新讲解的定义域文字');
  await page.locator('[data-knowledge-selection-toolbar]').waitFor({state:'visible'});await page.screenshot({path:path.join(out,'新讲解-真实文字划选.png')});
  await page.locator('[data-knowledge-selection-note]').click();const editor=page.locator('[data-knowledge-note-editor]');await editor.waitFor({state:'visible'});
  const excerpt=await editor.locator('blockquote').innerText();assert.equal(norm(excerpt),norm(actualSelection));
  const note='合成验收笔记：约分只在原定义域内成立，不能自动补上缺失点。';await page.locator('[data-knowledge-note-input]').fill(note);
  const savedResponse=page.waitForResponse(response=>response.request().method()==='PUT'&&/\/api\/learning\/notes\//.test(response.url()));
  await page.locator('[data-knowledge-note-save]').click();const response=await savedResponse;assert.equal(response.status(),200);const saved=await response.json();
  await editor.waitFor({state:'hidden'});
  const readback=await api('api/learning/notes?unitId=GH-01-K02'),savedNote=(readback.notes||readback.data?.notes||[]).find(n=>n.note===note);assert.ok(savedNote,'独立GET应读回真实保存的笔记');
  assert.equal(norm(savedNote.excerpt),norm(actualSelection));
  assert.equal(savedNote.contextRef?.scope,'slide');assert.equal(savedNote.contextRef?.unitId,'GH-01-K02');
  assert.equal(savedNote.contextRef?.semanticId,'slide:GH-01-K02-r10-example-1:GH-01-K02-r10-example-1-step-1');
  await frame.waitForFunction(()=>CSS.highlights.get('note-amber')?.size>0);
  await page.screenshot({path:path.join(out,'新讲解-笔记保存后高亮.png')});
  noteEvidence={point:'GH-01-K02',canvasId:await iframe.getAttribute('data-openmaic-slide'),selectionMethod:'real_mouse_drag',expectedSubstring:selectedRange.expected,actualSelection,editorExcerpt:excerpt,note,saveStatus:response.status(),returnedNoteId:saved.note?.id||savedNote.id,readbackExcerpt:savedNote.excerpt,contextRef:savedNote.contextRef||savedNote.context,highlightPresent:true};
  checks.push('补充讲解页真实鼠标选中文本→记一笔→填写保存→HTTP 200→独立GET读回及原文高亮');
 }
 try{
  await prepare();
  for(const size of sizes){
   await page.setViewportSize(size);
   for(const point of points){
    await openUnit(point.id);
    for(let index=0;index<3;index++){
     await examine(point,index,size);
     if(index<2)await page.getByRole('button',{name:'下一讲解页',exact:true}).click();
    }
    // Also exercise reverse navigation, not only the next button.
    await page.getByRole('button',{name:'上一讲解页',exact:true}).click();
    await page.waitForFunction(id=>document.querySelector('iframe[data-openmaic-slide]')?.dataset.openmaicSlide===id,point.slide.pages[1].id);
   }
  }
  assert.equal(rows.length,36);assert.equal(new Set(rows.map(r=>r.actualCanvasId)).size,18);
  checks.push('六知识点×三页×两种屏幕：36次实际正文逐元素核对、18个canvas.id及真实renderer回执');
  await noteFromNewSlide();
  const canceledDetachedNavigations=navigationAborts.filter(row=>row.frame.isDetached()).map(({frame,...row})=>({...row,frameDetached:true}));
  for(const {frame,...row} of navigationAborts)if(!frame.isDetached())failedRequests.push({...row,frameDetached:false});
  assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);
  const report={passed:layoutFailures.length===0,at:new Date().toISOString(),base,synthetic:true,fixtureScope:'仅解锁导航；讲解、翻页、选文、笔记保存使用真实平台',checks,routeSha256:crypto.createHash('sha256').update(JSON.stringify(points)).digest('hex'),rows,noteEvidence,layoutFailures,errors,failedRequests,canceledDetachedNavigations,scope:'渲染与交互工程验收；不代表真人学习效果或认知访谈'};
  fs.writeFileSync(path.join(out,'原生讲解平台验收.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,pages:rows.length,uniqueCanvases:18,noteSaved:!!noteEvidence,layoutFailures:layoutFailures.map(f=>({point:f.point,page:f.page,width:f.viewport.width,control:f.control,inViewport:f.evidence.inViewport,unobscured:f.evidence.unobscured})),errors},null,2));
  assert.equal(layoutFailures.length,0,'页面主要按钮必须在视窗内且未被遮挡；详见逐页坐标与命中证据');
 }catch(error){
  await page.screenshot({path:path.join(out,'失败诊断.png')}).catch(()=>{});
  fs.writeFileSync(path.join(out,'失败诊断.json'),JSON.stringify({at:new Date().toISOString(),error:error.stack,body:(await page.locator('body').innerText()).slice(-8000),checks,rows,noteEvidence,layoutFailures,errors,failedRequests},null,2));throw error;
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
