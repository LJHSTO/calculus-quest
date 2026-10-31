'use strict';
const assert=require('node:assert/strict'),{createStore}=require('../lib/support-cycle'),{defaults}=require('../lib/research-controls');
(async()=>{
 const SQL=await require('sql.js')(),database=new SQL.Database();let time=Date.parse('2026-10-31T12:00:00Z'),sequence=0;
 const store=createStore({db:{getDbSync:()=>database,saveNow(){},insertEvent(){}},clock:()=>time,experimentId:'synthetic-timing'});
 const profile={...defaults,supportInquiryEnabled:true,cooldownSeconds:60,ttlSeconds:900};
 function args(extra={}){return {profile,profileRevision:1,sceneType:'game',signal:{kind:'task_difficulty'},decisionId:'test-'+(++sequence),evidence:{confirmedGapCount:0,sceneAttemptFailures:2,assistedTaskFailures:2,naturalBoundary:true,boundaryEventType:'courseware_challenge_result',evidenceRefs:[1,2].map(n=>({id:`attempt-${sequence}-${n}`,sourceType:'interaction',eventType:'courseware_challenge_result',serverRechecked:true,capturedAt:new Date(time-2+n).toISOString()}))},...extra};}
 for(let i=0;i<4;i++){
  const input=args();assert.equal(store.blocksAutomatic('fast','GH-01-K01',1,input),false,'服务器总闸也允许新的连续错误');const cycle=store.invite('fast','GH-01-K01',1,input);
  assert.ok(cycle,`普通频率第${i+1}次新的连续错误应及时询问`);
  store.act('fast',cycle.id,1,{action:'close'},{});time+=1000;
  assert.equal(store.invite('fast','GH-01-K01',1,input),null,'相同错误记录不能重复询问');
 }
 let input=args({profile:{...profile,cooldownSeconds:180}}),c=store.invite('quiet','GH-01-K01',1,input);store.act('quiet',c.id,1,{action:'close'},{});time+=1000;
 assert.equal(store.invite('quiet','GH-01-K01',1,args({profile:input.profile})),null,'少打扰的三分钟间隔仍有效');
 time+=180001;assert.ok(store.invite('quiet','GH-01-K01',1,args({profile:input.profile})));
 c=store.invite('decline','GH-01-K01',1,args());store.act('decline',c.id,1,{action:'decline'},{});time+=1000;
 assert.equal(store.invite('decline','GH-01-K01',1,args()),null,'拒绝后本知识点暂停两分钟');
 assert.ok(store.invite('decline','GH-02-K01',1,args()),'上一知识点的拒绝不拦住新知识点的连续错误');
 console.log('通过：连续新错误及时响应、同证据去重、少打扰间隔、拒绝暂停与知识点隔离。');
})().catch(e=>{console.error(e);process.exitCode=1;});
