'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=process.env.NARROW_COURSEWARE_OUT||path.join(root,'tmp/narrow-courseware-r12'),baseline=process.argv.includes('--baseline');
const points=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints||[]);
async function main(){
 fs.mkdirSync(out,{recursive:true});const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js',String(port)],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',DB_PATH:path.join(out,'synthetic-'+Date.now()+'.db'),LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',PROACTIVE_POLICY_MODE:'off'}});let browser;const records=[],errors=[];
 try{
  const base='http://127.0.0.1:'+port;let ready=false;for(let i=0;i<200;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,'隔离服务未启动');
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:550}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.setContent('<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts allow-forms allow-pointer-lock"></iframe>');
  const all=points.flatMap(p=>p.resourceCandidates.map(c=>({point:p.id,...c}))),representatives=[['GH-01-K02','simulation'],['GH-01-K01','mindMap'],['GH-02-K02','mindMap']];
  const cases=(baseline?all.filter(c=>representatives.some(([p,t])=>c.point===p&&c.type===t)):all).filter(c=>!process.env.NARROW_CASES||process.env.NARROW_CASES.split(',').includes(c.point+'/'+c.type)),resizeDesktop=new Map();
  for(const c of cases){
   const widths=baseline?[390]:[390,...(representatives.slice(0,2).some(([p,t])=>c.point===p&&c.type===t)?[1280]:[])];
   for(const width of widths){
    await page.setViewportSize({width,height:550});const source=base+'/resources/'+c.root+'/'+c.file;await page.locator('iframe').evaluate((f,src)=>f.src=src,source);let frame;for(let i=0;i<100;i++){frame=page.frames().find(f=>decodeURI(f.url()).includes(c.file));if(frame)break;await page.waitForTimeout(30);}assert(frame);await frame.waitForLoadState('load');await frame.waitForFunction(id=>document.body.dataset.activityPoint===id,c.point);await frame.evaluate(()=>Promise.resolve(document.fonts?.ready));await page.waitForTimeout(900);
    await frame.evaluate(()=>scrollTo(0,0));
    const measure=await frame.evaluate(()=>{const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {id:n.id,tag:n.tagName,class:typeof n.className==='string'?n.className:'svg',x:r.x,y:r.y,w:r.width,h:r.height,display:s.display,position:s.position,flex:s.flex,height:s.height,minHeight:s.minHeight,overflow:s.overflow};};const figure=document.querySelector('.r8-figure'),graphic=document.querySelector('.r8-graphic'),guidance=document.querySelector('.r8-guidance');return {body:rect(document.body),figure:rect(figure),graphic:rect(graphic),guidance:rect(guidance),parent:rect(figure?.parentElement),sidebar:rect(document.querySelector('#sidebar,.sidebar,#instruction-panel')),canvas:rect(document.querySelector('canvas,svg')),doc:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],controls:[...document.querySelectorAll('button,input,select,textarea')].filter(n=>n.checkVisibility()).map(n=>({id:n.id,tag:n.tagName,label:n.getAttribute('aria-label')||n.textContent.slice(0,35),rect:rect(n)}))};});
    await page.screenshot({path:path.join(out,c.point+'-'+c.type+'-'+width+'.png')});const violations=[];
    if(width<=700&&['simulation','mindMap'].includes(c.type)){
     if(!measure.graphic||measure.graphic.h<220)violations.push('图形高度不足220');
     if(!baseline&&measure.graphic?.h>300&&(!measure.canvas||measure.canvas.h<220||measure.canvas.h>300))violations.push('图形未按窄屏纵向布局恢复');
     if(measure.graphic&&measure.guidance&&measure.graphic.y+measure.graphic.h>measure.guidance.y+1)violations.push('说明与图形重叠');
     if(measure.graphic&&measure.sidebar&&measure.sidebar.h>0&&measure.sidebar.y<measure.graphic.y+measure.graphic.h-1)violations.push('侧栏覆盖图形');
     if(!baseline&&measure.guidance&&measure.doc[1]<measure.guidance.y+measure.guidance.h-1)violations.push('长说明超出整页滚动范围');
     if(!baseline&&c.point==='GH-01-K03'&&c.type==='mindMap'&&measure.controls.some(n=>['btn-prev','btn-next'].includes(n.id)&&n.rect.y<measure.canvas.y+measure.canvas.h-1))violations.push('关系图导航遮挡图形');
    }
    if(measure.doc[0]>width+2)violations.push('整页横向溢出');
    const targets=measure.controls.length?[measure.controls[0],measure.controls.at(-1)]:[];
    const reach=[];for(const target of targets){const index=measure.controls.indexOf(target);const visible=frame.locator('button,input,select,textarea').filter({visible:true});const loc=visible.nth(index);await loc.scrollIntoViewIfNeeded();reach.push(await loc.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:n.id,hit:hit===n||n.contains(hit),x:r.x,y:r.y,w:r.width,h:r.height};}));}
    if(reach.some(r=>!r.hit))violations.push('首末控件无法滚动点击');
    const key=c.point+'-'+c.type;
    if(!baseline&&width===390&&widths.includes(1280)){
     await page.setViewportSize({width:1280,height:550});await page.waitForTimeout(1000);await frame.evaluate(()=>scrollTo(0,0));
     const restored=await frame.evaluate(()=>{const r=document.querySelector('.r8-graphic').getBoundingClientRect();return {w:r.width,h:r.height,inlineHeight:document.querySelector('.r8-graphic').style.height,nodes:[document.documentElement,document.body,document.querySelector('.r8-figure').parentElement,document.querySelector('.r8-figure'),document.querySelector('.r8-graphic')].map(n=>({tag:n.tagName,id:n.id,css:n.style.cssText,h:n.getBoundingClientRect().height,display:getComputedStyle(n).display}))};});
     resizeDesktop.set(key,restored);if(restored.inlineHeight==='260px')violations.push('恢复桌面后残留窄屏固定图高');
     await page.screenshot({path:path.join(out,key+'-390转1280.png')});
    }
    if(width===1280&&resizeDesktop.has(key)){const restored=resizeDesktop.get(key);if(Math.abs(restored.w-measure.graphic.w)>2||Math.abs(restored.h-measure.graphic.h)>2)violations.push('同页恢复桌面与新开桌面布局不一致');}
    records.push({point:c.point,type:c.type,width,measure,reach,resizeDesktop:resizeDesktop.get(key),violations});
   }
  }
 }finally{if(browser)await browser.close();if(child.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}}
 const passed=errors.length===0&&records.every(r=>r.violations.length===0);fs.writeFileSync(path.join(out,'窄屏布局核验.json'),JSON.stringify({at:new Date().toISOString(),baseline,passed,records,errors,scope:'真实本机服务、实际资源与沙盒；初始/开始状态及首末控件可达性，不是全部关卡或真人可用性'},null,2));console.log(JSON.stringify({passed,baseline,cases:records.length,errors,violations:records.filter(r=>r.violations.length).map(r=>({point:r.point,type:r.type,width:r.width,violations:r.violations,graphic:r.measure.graphic})),output:out}));if(!passed&&!baseline)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
