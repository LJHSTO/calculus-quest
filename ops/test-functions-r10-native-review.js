'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
assert.ok(process.env.OPENMAIC_ROOT,'请设置 OPENMAIC_ROOT，指向已安装依赖的 OpenMAIC 源码目录');
assert.ok(process.env.FUNCTIONS_R10_BASE_ROOT,'请设置 FUNCTIONS_R10_BASE_ROOT，指向 8c1a2ac 原版 Git checkout');
const base=path.resolve(process.env.FUNCTIONS_R10_BASE_ROOT),baseCommit='8c1a2ac107a41f1b41617dcfdd9ce245df6973d2';
assert.notEqual(fs.realpathSync(base),fs.realpathSync(path.resolve(__dirname,'..')),'原版基线不能使用当前 r10 项目目录');
let actualBaseCommit;try{actualBaseCommit=require('node:child_process').execFileSync('git',['-C',base,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();}catch{throw Error('无法读取原版基线版本；请提供有效的原版 Git checkout 与可用的 git 命令');}
assert.equal(actualBaseCommit,baseCommit,'原版基线必须为 8c1a2ac107a41f1b41617dcfdd9ce245df6973d2');
// 同一 HEAD 的工作区仍可能已被打过补丁，必须同时检查暂存区和工作区的已跟踪改动。
try{require('node:child_process').execFileSync('git',['-C',base,'diff','--quiet','HEAD','--'],{windowsHide:true,stdio:'ignore'});}catch(error){throw Error(error.status===1?'原版基线含已跟踪文件改动；请提供干净的 8c1a2ac 原版 checkout':'无法检查原版基线是否干净；请提供可读取的原版 Git checkout');}
const {createRequire}=require('node:module'),up=createRequire(path.resolve(process.env.OPENMAIC_ROOT,'package.json')),ts=up('typescript');
const {chromium}=require('playwright-core'),model=require('../lib/courseware/functions-limits-r10/native-model');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sources=['lib/courseware/functions-limits-r9/model.js','lib/courseware/functions-limits-r10/native-model.js','lib/courseware/functions-limits-r10/native-runtime.js'].map(read);
const style=read('lib/courseware/functions-limits-r9/style.css');
function terrainFixture(){
 const original=fs.readFileSync(path.join(base,'resources/open-maic/GH-01-函数、坐标与图像读法入门/interactive/17_图像的上升、下降与变化方向：空间视角.html'),'utf8');
 const r7=require('./functions-r7-scene-patches').patch(original,'GH-01-K03-visualization3d').html;
 const patched=require('./functions-r10-scene-patches').patch(r7,'GH-01-K03-visualization3d'),functions=[];
 for(const match of patched.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)){
  const source=ts.createSourceFile('terrain.js',match[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  function visit(n){if(ts.isFunctionDeclaration(n)&&['getTerrainHeight','updateSection'].includes(n.name?.text))functions.push(n.getText(source));ts.forEachChild(n,visit);}visit(source);
 }
 assert.equal(functions.length,2);
 const elements=Object.fromEntries(['r7-first','r7-second','r7-pair','status-x','status-fx','status-dir'].map(id=>[id,{value:0,textContent:''}]));
 const sandbox={document:{getElementById:id=>elements[id]},window:{dispatchEvent(){}},Event:function(){},THREE:{Vector3:function(x,y,z){Object.assign(this,{x,y,z});}},sectionGeometry:{setFromPoints(){}},firstMarker:{position:{set(){}}},ball:{position:{set(){}}},ballState:{},ballRadius:.25,isSliding:false,terrainHeightScale:.5};
 vm.createContext(sandbox);vm.runInContext(functions.join('\n'),sandbox);
 return (a,b,scale)=>{elements['r7-first'].value=a;elements['r7-second'].value=b;sandbox.terrainHeightScale=scale;sandbox.updateSection();return {text:elements['r7-pair'].textContent,state:{a,b,scale}};};
}
async function main(){
 const terrain=terrainFixture(),rising=terrain(0,.1,.5),equal=terrain(-7,7,3),falling=terrain(-.1,0,.5);
 assert.match(rising.text,/f\(x₁\)≈-0\.500000.*f\(x₂\)≈-0\.499844.*f\(x₁\) < f\(x₂\)/);
 for(const [row,symbol] of [[equal,' = '],[falling,' > ']])assert.ok(row.text.includes('f(x₁)'+symbol+'f(x₂)'));
 for(const [row,correct]of [[rising,false],[equal,true],[falling,true]])assert.equal(model.evaluate('GH-01-K03-visualization3d',row.state).correct,correct);
 console.log('通过：实际地形补丁保留精确比较，近零、对称、下降读数与判定一致');
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,channel:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?undefined:(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL||'chrome'),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>'+style+'.r8-guidance{width:1000px;margin:20px;font:14px sans-serif;max-height:600px}.r9-content{max-height:500px}.r7-guide{color:#222}</style><section class="r8-guidance"><p class="r7-guide"></p></section>');
  await page.evaluate(()=>{window.R7_TASK_ID='GH-01-K02-mindMap';window.auditEvents=[];window.OpenMaicLearningEvidence={emit:(kind,data)=>window.auditEvents.push({kind,data})};});
  for(const content of sources)await page.addScriptTag({content});
  const exposed=()=>page.evaluate(()=>window.auditEvents.filter(e=>e.kind==='authored_feedback_exposed'));
  const wrong=page.getByRole('button',{name:'按草稿画实际点值',exact:true}),right=page.getByRole('button',{name:'保留未定义，不补点',exact:true});
  await wrong.click();await page.waitForFunction(()=>window.auditEvents.filter(e=>e.kind==='authored_feedback_exposed').length===1);
  await right.click();await page.waitForFunction(()=>window.auditEvents.filter(e=>e.kind==='authored_feedback_exposed').length===2);
  const rows=await exposed();assert.match(rows[0].data.parameters.state.feedback,/不能/);assert.match(rows[1].data.parameters.state.feedback,/保留空点/);
  assert.ok(rows[1].data.parameters.state.feedback_version>rows[0].data.parameters.state.feedback_version);
  await right.click();await page.waitForTimeout(150);assert.equal((await exposed()).length,2);
  await page.evaluate(()=>{document.querySelector('.r8-guidance').style.transform='translateY(1000px)';[...document.querySelectorAll('button')].find(n=>n.textContent==='按草稿画实际点值').click();});await page.waitForTimeout(150);assert.equal((await exposed()).length,2);
  await page.evaluate(()=>{document.querySelector('.r8-guidance').style.transform='';});await page.waitForFunction(()=>window.auditEvents.filter(e=>e.kind==='authored_feedback_exposed').length===3);
  console.log('通过：同位置第二条反馈有独立曝光，重复内容不重复，移出视口不冒充已见');
  const slider=page.getByRole('slider',{name:'准备画的f(2)',exact:true});await slider.press('Home');
  for(let value=-2;value<=5;value++){
   if(value>-2)await slider.press('ArrowRight');
   const box=await page.locator('.r9-plot text').filter({hasText:'草稿'}).evaluate(n=>{const r=n.getBBox();return{x:r.x,y:r.y,right:r.x+r.width,bottom:r.y+r.height};});
   assert.ok(box.x>=0&&box.y>=0&&box.right<=320&&box.bottom<=140,'草稿值'+value+'的标签应完整');
   const hole=await page.locator('.r9-plot text').filter({hasText:'空点'}).evaluate(n=>{const r=n.getBBox();return{x:r.x,y:r.y,right:r.x+r.width,bottom:r.y+r.height};});
   assert.ok(box.right<=hole.x||box.x>=hole.right||box.bottom<=hole.y||box.y>=hole.bottom,'草稿标签不应与空点标签重叠');
  }
  assert.deepEqual(errors,[]);console.log('通过：定义域全部8个草稿值的坐标标签均在SVG范围内；浏览器无报错');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
