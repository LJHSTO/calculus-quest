'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=process.env.COURSEWARE_QA_OUT||path.join(root,'tmp/courseware-r12');
const route=require('../data/multi-scene-learning-route.json');
const points=route.chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints||[]);
async function main(){
 fs.mkdirSync(out,{recursive:true}); const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
 const child=spawn(process.execPath,['server.js',String(port)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',DB_PATH:path.join(out,'synthetic.db'),LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',PROACTIVE_POLICY_MODE:'off',ADMIN_TOKEN:'r12-courseware-synthetic'}});let log='';child.stderr.on('data',b=>log+=b);child.stdout.on('data',b=>log+=b);
 let browser;const results=[];
 try{
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready,log.slice(-2000));
  const height=Number(process.env.COURSEWARE_QA_HEIGHT||550);
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1280,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);await page.setContent('<style>html,body{margin:0;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts allow-forms allow-pointer-lock"></iframe>');
  const selected=process.env.COURSEWARE_QA_POINT?points.filter(p=>p.id===process.env.COURSEWARE_QA_POINT):points;
  for(const p of selected)for(const c of p.resourceCandidates||[]){
   const url=`http://127.0.0.1:${port}/resources/${c.root}/${c.file}`;await page.locator('iframe').evaluate((f,url)=>f.src=url,url);let frame;for(let i=0;i<80;i++){frame=page.frames().find(f=>decodeURI(f.url()).includes(c.file));if(frame)break;await page.waitForTimeout(50);}assert(frame,url);await frame.waitForLoadState('load');await frame.waitForFunction(id=>document.body.dataset.activityPoint===id,p.id);await frame.evaluate(()=>Promise.resolve(document.fonts?.ready).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
   if(p.id==='GH-01-K02'&&c.type==='simulation')await page.waitForTimeout(3000);
   const start=frame.getByRole('button',{name:'开始挑战',exact:true});if(await start.isVisible().catch(()=>false))await start.click();
   for(const width of (process.env.COURSEWARE_QA_POINT?[1280]:[1280,1024,390])){
    await page.setViewportSize({width,height});await page.waitForTimeout(150);
    const geometry=await frame.evaluate(()=>({title:document.title,viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],nodes:[...document.querySelectorAll('#game-screen > *,#input-section > *,#out-a,#out-b,.rule-card,.points-display')].filter(n=>n.getBoundingClientRect().height>0).map(n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return {tag:n.tagName,id:n.id,class:n.className,text:n.textContent.slice(0,90),rect:[b.x,b.y,b.width,b.height],display:s.display,position:s.position,grid:[s.gridColumn,s.gridRow]};})}));
    geometry.canvases=await frame.locator('canvas').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {id:n.id,width:n.width,height:n.height,rect:[b.x,b.y,b.width,b.height],display:getComputedStyle(n).display};}));
    await page.screenshot({path:path.join(out,`${p.id}-${c.type}-${width}.png`)});results.push({point:p.id,type:c.type,width,path:`resources/${c.root}/${c.file}`,geometry});
   }
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'布局审计.json'),JSON.stringify({at:new Date().toISOString(),results,errors,scope:'真实服务注入与沙盒；资源初始及开始挑战状态，未冒称所有任务阶段'},null,2)); console.log(JSON.stringify({results:results.length,errors,output:out}));
 }finally{if(browser)await browser.close();child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
