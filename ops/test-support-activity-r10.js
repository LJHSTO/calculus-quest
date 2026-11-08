"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const activities=require('../lib/support-activity'),goals=require('../lib/support-goals'),{createStore}=require('../lib/support-cycle'),{defaults}=require('../lib/research-controls');
async function main(){
 const SQL=await require('sql.js')(),database=new SQL.Database(),events=[],db={getDbSync:()=>database,saveNow(){},insertEvent:e=>events.push(e)};
 const store=createStore({db,experimentId:'activity-r10-synthetic'}),scope='GH-02-K01',profile={...defaults,initialSupportLevel:'L5',boundaryOnly:false},guard=()=>({profileRevision:0,protected:false,boundary:true,disabled:false,occupied:false});
 for(const point of Object.keys(goals.CURRICULUM))for(let l=1;l<=5;l++){
  const a=activities.create({scope:point,plan:{primaryGoal:'cognitive',knowledgeScaffoldLevel:'L'+l}});assert.ok(a);assert.equal(a.level,'L'+l);assert.equal(a.independent,false);if(l===1)assert.equal(a.kind,'steps');if(l===3)assert.equal(a.kind,'steps');if(a.kind!=='range')assert.ok(a.items.length>=2);
 }
 const a=activities.create({scope,plan:{primaryGoal:'cognitive',knowledgeScaffoldLevel:'L5'}});
 assert.equal(a.kind,'range');for(const value of [.01,.1,.3])assert.equal(activities.apply(a,null,{activityId:a.id,operation:'range',value}).state.delta,value);
 for(const value of [0,.301,NaN,Infinity,'0.1',.105])assert.throws(()=>activities.apply(a,null,{activityId:a.id,operation:'range',value}));
 assert.throws(()=>activities.apply(a,null,{activityId:'forged',operation:'skip'}));assert.throws(()=>activities.apply(a,null,{activityId:a.id,operation:'select',itemId:'forged'}));
 let c=store.report('alice',scope,1,{need:'concept',confirmed:true},profile,0);
 c=await store.advance('alice',scope,1,{guard,generate:input=>goals.generateSupport(input,{live:false})});assert.equal(c.content.activity.kind,'range');assert.equal(c.activityState,null);const oldCheck=c.checkResult;
 const command={action:'activity',id:c.id,activityId:c.content.activity.id,round:c.rounds,operation:'range',value:.1};
 assert.throws(()=>store.act('bob',c.id,1,command,{adapter:{}}),/不属于/);
 assert.throws(()=>store.act('alice',c.id,2,command,{adapter:{}}),/不属于/);
 assert.throws(()=>store.act('alice',c.id,1,{...command,round:99},{adapter:{}}),/轮次/);
 c=store.act('alice',c.id,1,command,{adapter:{}});assert.equal(c.activityState.delta,.1);assert.match(c.activityState.feedback,/保证要求/);assert.equal(c.checkResult,oldCheck);assert.equal(c.exposure,null);assert.equal(c.status,'offered');const revision=c.revision;
 assert.equal(store.act('alice',c.id,1,command,{adapter:{}}).revision,revision,'相同状态不重复计数');
 c=store.act('alice',c.id,1,{...command,value:.2},{adapter:{}});assert.match(c.activityState.feedback,/太宽/);
 const saved=store.state('alice',1)[0];assert.equal(saved.activityState.delta,.2);
 c=store.act('alice',c.id,1,{action:'close'},{adapter:{}});assert.throws(()=>store.act('alice',c.id,1,command,{adapter:{}}),/先打开/);
 const logs=events.filter(e=>e.payload.eventType==='support_cycle_activity_interaction');assert.equal(logs.length,2);assert.ok(logs.every(e=>e.payload.data.independent===false&&e.payload.data.notMasteryEvidence));
 const out=path.resolve(__dirname,'../output/综合课程-r10-20261106');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'帮助交互核心检查.json'),JSON.stringify({passed:true,version:activities.VERSION,scopeLevelCases:30,activityEvents:logs.length,checks:['五级深度与知识点匹配','非法值及伪造任务拒绝','账号与轮次保护','相同状态去重','状态持久化','操作不产生曝光回执或独立成绩','关闭后不可继续操作']},null,2));
 database.close();console.log('r10 帮助交互核心检查通过。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
