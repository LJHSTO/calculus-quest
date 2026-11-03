'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright-core'),games=require('./openmaic-game-steps');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=process.env.GAME_LAYOUT_OUTPUT||path.join(root,'output/学生体验修复-20261102/原游戏逐关核验'),base=process.env.GAME_LAYOUT_BASE_URL?.replace(/\/$/,'');fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[],results=[];let passed=false;
 try{
  const page=await browser.newPage({viewport:{width:1100,height:540},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
  for(const id of ['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03']){
   await page.goto(base?base+'/resources/open-maic/'+encodeURIComponent('函数极限-OpenMAIC修订')+'/'+id+'.html':pathToFileURL(path.join(root,'resources/open-maic/函数极限-OpenMAIC修订',id+'.html')).href);
   if(id==='GH-01-K03')assert.ok((await page.getByRole('button',{name:'开始游戏',exact:true}).boundingBox()).height<=64,'开始按钮不能拉成长条');
   await games.start(page,id);
   await page.screenshot({path:path.join(dir,id+'-开始.png')});
   const outside=await page.evaluate(()=>[...document.querySelectorAll('.screen.active :is(button,input,select),.game-main :is(button,input,select)')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({label:e.innerText||e.getAttribute('aria-label')||e.id,r:e.getBoundingClientRect()})).filter(({r})=>r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth).map(({label,r})=>({label,x:r.x,y:r.y,bottom:r.bottom})));
   results.push({id,outside});assert.deepEqual(outside,[],id+' 关键操作不能藏在首屏之外');
   await games.finish(page,id);await page.screenshot({path:path.join(dir,id+'-完成.png')});console.log('通过：'+id+' 首屏操作与全部关卡');
  }
  assert.deepEqual(errors,[]);passed=true;
 }finally{fs.writeFileSync(path.join(dir,'布局与通关结果.json'),JSON.stringify({passed,base,results,errors},null,2));await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
