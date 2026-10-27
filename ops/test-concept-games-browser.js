'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{pathToFileURL}=require('url'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/学习交互与游戏体验修复-2026-10-27'),M=require('../resources/open-maic/函数极限混合探索/game-model');
async function main(){fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),cases=[],errors=[];
 try{const p=await browser.newPage({viewport:{width:1120,height:850}});p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.records=[];window.OpenMaicLearningEvidence={recordChallenge:x=>records.push(x),emit:(type,data)=>records.push({type,data})};});
 const ids=['GH-01-K01','GH-01-K02','GH-01-K03','GH-02-K01','GH-02-K02','GH-02-K03'];
 for(const [kind,id]of ids.entries()){
  await p.goto(pathToFileURL(path.join(root,'resources/open-maic/函数极限混合探索',id+'.html')).href);
  for(let round=0;round<M.rounds(kind);round++){
   const state=M.create(kind,round);
   if(kind===0){await p.getByRole('button',{name:'发车检查',exact:true}).click();for(let i=0;i<3;i++){for(const j of state.links[i])await p.locator(`[data-link="${i}-${j}"]`).click();await p.locator(`[data-link="${i}-0"]`).click();}await p.getByRole('button',{name:'发车检查',exact:true}).click();}
   if(kind===1){await p.locator('[data-point="-3,-3"]').click();for(const x of M.targets(state))await p.locator(`[data-point="${x},${M.f(state,x)}"]`).click();}
   if(kind===2){await p.getByRole('button',{name:'让探险车通行',exact:true}).click();for(const [i,v]of M.targetSegments(state).entries()){await p.getByRole('button',{name:new RegExp('^第'+(i+1)+'段：')}).click();await p.getByRole('button',{name:({'1':'↗ 上升坡','0':'→ 水平路','-1':'↘ 下降坡'})[v],exact:true}).click();}await p.getByRole('button',{name:'让探险车通行',exact:true}).click();}
   if(kind===3){await p.getByRole('button',{name:'检查着陆',exact:true}).click();for(let d=1;d>=M.epsilon(state);d/=2)await p.getByRole('button',{name:'再靠近一半',exact:true}).click();await p.getByRole('button',{name:'检查着陆',exact:true}).click();}
   if(kind===4){await p.getByRole('button',{name:'让两侧飞船入港',exact:true}).click();for(const [i,v]of M.sides(state).entries()){const slider=p.getByLabel(i?'右侧泊位':'左侧泊位',{exact:true});await slider.fill(String(v));await slider.dispatchEvent('change');}await p.getByRole('button',{name:'让两侧飞船入港',exact:true}).click();}
   if(kind===5){await p.getByRole('button',{name:'试着过桥',exact:true}).click();for(const label of ['中心铆钉 f(0)',...(round?['右桥接缝高度']:[])]){const slider=p.getByLabel(label,{exact:true});await slider.fill('2');await slider.dispatchEvent('change');}await p.getByRole('button',{name:'试着过桥',exact:true}).click();}
   assert.match(await p.locator('#progress').innerText(),/已完成/);const rec=await p.evaluate(()=>records.filter(x=>x.challenge_id));assert.equal(rec.at(-1).is_correct,true);assert.ok(rec.some(r=>!r.is_correct));assert.ok(rec.every(r=>r.independent===false));
   if(round===0){await p.screenshot({path:path.join(out,id+'-游戏.png'),fullPage:true});await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(out,id+'-窄屏.png'),fullPage:true});await p.setViewportSize({width:1120,height:850});}
   if(round+1<M.rounds(kind))await p.locator('#next-round').click();
  }
  assert.equal(await p.locator('input[type=number],input[type=text]').count(),0);cases.push({id,rounds:M.rounds(kind),wrongAndCorrect:true});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'游戏浏览器验收.json'),JSON.stringify({synthetic:true,passed:true,cases,errors},null,2));console.log('通过：六游戏13关，真实点击失败和通关、反馈事件、桌面与窄屏。');
 }finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
