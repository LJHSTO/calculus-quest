'use strict';
const assert=require('node:assert/strict'),goals=require('../lib/support-goals');
async function main(){
 for(const scope of ['GH-01-K01','GH-01-K02']){
  const input={scope,sceneType:'simulation',need:{need:'concept',note:''},plan:{primaryGoal:'cognitive',strategy:'concept_hint',dose:'brief',knowledgeScaffoldLevel:'L2'}};
  const make=message=>goals.generateSupport(input,{live:true,complete:async()=>({provider:'synthetic',text:JSON.stringify({message,nextStep:'选择一个输入，观察对应的输出。'})})});
  const bad=await make('先看输入和输出是不是一一对应，再观察函数规则。');
  assert.equal(bad.audit.fallback,true);assert.equal(bad.audit.failure,'ambiguous_function_correspondence');assert.doesNotMatch(bad.message+bad.nextStep,/一一对应/);
  const good=await make('每个输入恰有一个输出，不同输入可以得到同一个输出。');
  assert.equal(good.audit.fallback,false);assert.match(good.message,/不同输入可以/);
 }
 console.log('函数概念表述回归通过：阻止一一对应歧义，保留不同输入可有相同输出的正确讲解。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
