'use strict';
const assert=require('node:assert/strict');
const button=(f,name)=>f.getByRole('button',{name,exact:true});
async function start(f,id){
 const names={'GH-01-K01':'开始挑战','GH-01-K02':'开始审核','GH-01-K03':'开始游戏','GH-02-K01':'开始挑战','GH-02-K02':'开始诊断','GH-02-K03':'开始修复'};
 await button(f,names[id]).click();
 if(id==='GH-02-K02')assert.ok(await f.locator('#step1').getByText('当前规则：',{exact:false}).isVisible(),'开始预测后仍须能看到分段函数规则');
 assert.equal(await f.locator('#cq-visible-feedback').isVisible(),false,'未操作时不展示提示答案');
}
async function wrong(f,id){
 if(id==='GH-01-K01'){
  await f.locator('#input-grid').getByRole('button',{name:'2',exact:true}).click();
  await f.locator('#out-a').fill('5');await f.locator('#out-b').fill('5');await button(f,'比较并提交').click();
 }else if(id==='GH-01-K02')await button(f,'提交审核').click();
 else if(id==='GH-01-K03')await button(f,'提交构造').click();
 else if(id==='GH-02-K01'){
  await f.locator('#candidate-grid').getByRole('button',{name:'-1',exact:true}).click();await button(f,'预计输出不同').click();await button(f,'提交观测点').click();
 }else if(id==='GH-02-K02'){
  if(await f.locator('#pred-left').isVisible()){
   await f.locator('#pred-left').fill('2');await f.locator('#pred-right').fill('4');await button(f,'提交预测').click();await button(f,'进入诊断').click();
  }
  await f.locator('[onclick="selectOption(3, \'B\', event)"]').click();
 }else{
  const prefix=id==='GH-02-K02'?'#pred-':'#';
  await f.locator(id==='GH-02-K02'?prefix+'left':'#left-pred').fill('0');
  await f.locator(id==='GH-02-K02'?prefix+'right':'#right-pred').fill('0');
  await button(f,'提交预测').click();
  if(await f.getByRole('button',{name:'关闭提示'}).isVisible())await f.getByRole('button',{name:'关闭提示'}).click();
 }
}
async function finish(f,id){
 if(id==='GH-01-K01'){
  for(const [x,a,b]of [[2,5,7],[0,-1,1]]){
   await f.locator('#input-grid').getByRole('button',{name:String(x),exact:true}).click();
   await f.locator('#out-a').fill(String(a));await f.locator('#out-b').fill(String(b));await button(f,'比较并提交').click();await f.locator('#options-container button').first().click();
  }
 }else if(id==='GH-01-K02'){
  for(const [values,on]of [[[3,5,-1,-3],[true,false,true,true]],[[5,2,6,1],[true,true,false,true]]]){
   await f.locator('#game-screen.active').waitFor();
   for(let i=0;i<4;i++){await f.locator('#calc-'+i).fill(String(values[i]));await f.locator(on[i]?'#on-'+i:'#on-'+i+' + button').click();}
   await button(f,'提交审核').click();
   if(values[0]===3)await f.locator('#level-indicator').filter({hasText:'x + 4'}).waitFor();
  }
  await f.locator('[onclick="selectReasoning(\'A\', event)"]').click();await button(f,'确认选择').click();
 }else if(id==='GH-01-K03'){
  for(const [i,values]of [[-4,-1,-3],[4,2,3]].entries()){
   await f.locator('#level-info').filter({hasText:String(i+1)}).waitFor();
   for(const [j,n]of values.entries())await f.locator('#input-controls input').nth(j).fill(String(n));
   await button(f,'提交构造').click();
  }
  await f.locator('[onclick="checkExplanation(\'B\')"]').click();
  for(const [j,n]of [1,3,3,2].entries())await f.locator('#input-controls input').nth(j).fill(String(n));
  await button(f,'提交构造').click();await f.locator('#target-text').filter({hasText:'全部构造完成'}).waitFor();return;
 }else if(id==='GH-02-K01'){
   for(const [round,x] of [3,1].entries()){
    await f.locator('#candidate-grid').getByRole('button',{name:String(x),exact:true}).click();await button(f,'预计输出不同').click();await button(f,'提交观测点').click();await f.locator(`[onclick="checkConclusion('${round?'B':'A'}')"]`).click();
  }
 }else if(id==='GH-02-K02'){
  if(await f.locator('#pred-left').isVisible()){await f.locator('#pred-left').fill('2');await f.locator('#pred-right').fill('4');await button(f,'提交预测').click();await button(f,'进入诊断').click();}
  await f.locator('[onclick="selectOption(3, \'A\', event)"]').click();await button(f,'继续').click();
  await f.locator('[onclick="selectOption(4, \'A\', event)"]').click();await button(f,'换数据再判断').click();
  for(const n of ['left','right','fix'])await f.locator('#new-'+n).fill('3');await f.locator('#new-reason').selectOption('A');await button(f,'提交第二轮').click();
 }else{
  await f.locator('#left-pred').fill('2');await f.locator('#right-pred').fill('4');await button(f,'提交预测').click();
  await f.locator('[onclick="selectOption(\'A\', event)"]').click();await button(f,'提交判断').click();
  await f.locator('[onclick="selectReason(0, event)"]').click();await button(f,'提交理由').click();
  for(const n of ['left','right','fix'])await f.locator('#l4-'+n).fill('3');await button(f,'提交修复方案').click();
  await f.locator('[onclick="selectFinal(0, event)"]').click();await button(f,'提交总结').click();
 }
 await f.locator('#result-screen.active').waitFor();
}
module.exports={start,wrong,finish};
