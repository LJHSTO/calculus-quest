'use strict';
const assert=require('node:assert/strict');
const {createHelpEntryObserver}=require('../app/main/proactive-learning');
const context={key:'synthetic:unit:game',eligible:true,reading:false};
function run(observer,start,end,ctx=context){let signal=null;for(let t=start;t<=end;t+=5000)signal=observer.tick(ctx,t)||signal;return signal;}
let o=createHelpEntryObserver();assert.equal(run(o,1000,176000),null);assert.equal(run(o,181000,181000).kind,'quiet_pause');assert.equal(run(o,186000,361000),null,'同一学习场景一轮只提醒一次');
o=createHelpEntryObserver();assert.equal(run(o,1000,236000,{...context,reading:true}),null);assert.equal(run(o,241000,241000,{...context,reading:true}).kind,'quiet_pause');
o=createHelpEntryObserver();run(o,1000,41000);o.activity('pointer',41000);run(o,46000,51000);o.activity('pointer',51000);run(o,56000,56000);o.activity('pointer',61000);assert.equal(o.tick(context,61000).kind,'pointer_without_action');
o=createHelpEntryObserver();run(o,1000,121000);o.activity('action',122000);assert.equal(run(o,126000,296000),null,'点击输入重新计时');
o=createHelpEntryObserver();run(o,1000,121000);run(o,126000,246000,{...context,eligible:false});assert.equal(run(o,251000,416000),null,'隐藏、测验、忙碌时不累计');
o=createHelpEntryObserver();run(o,1000,121000);assert.equal(o.tick(context,600000),null,'休眠不能算停留');assert.equal(run(o,605000,775000),null);
o=createHelpEntryObserver();run(o,1000,121000);assert.equal(run(o,126000,296000,{...context,key:'new-user:new-unit'}),null,'切场景或换账号不继承计时');
console.log('通过：求助入口提醒的空闲、鼠标活动、输入重置、测量保护、后台与休眠、场景隔离和一次上限');
