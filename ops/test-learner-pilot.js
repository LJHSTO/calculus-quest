'use strict';
const assert=require('node:assert/strict');
const C=require('../app/shared/learner-preferences'),controls=require('../lib/research-controls');
async function main(){
 const SQL=await require('sql.js')();let d=new SQL.Database();const db={getDbSync:()=>d,saveNow(){}};
 const store=require('../lib/pilot-study').createStore({db}),prefs=require('../lib/learner-preferences').createStore({db});
 const a=C.defaults();assert.throws(()=>C.validate(a));for(const v of Object.values(a))v.reason='default';
 for(const dimension of C.dimensions)for(const [value]of dimension.options){const x=structuredClone(a);x[dimension.id].value=value;assert.doesNotThrow(()=>controls.validate(C.profile(x,controls.defaults)));}
 assert.equal(C.profile(a,controls.defaults).supportInquiryEnabled,true);const x=structuredClone(a);x.D5.value='request';assert.equal(C.profile(x,controls.defaults).proactivity,'reactive');x.D3.reason='other';assert.throws(()=>C.validate(x));x.D3.note='先观察例子';assert.doesNotThrow(()=>C.validate(x));
 const goals=require('../lib/support-goals');for(const scope of Object.keys(goals.CURRICULUM)){const hint=goals.selectPlan({need:'concept'},C.profile(a,controls.defaults));const ex=structuredClone(a);ex.D3.value='example';const example=goals.selectPlan({need:'concept'},C.profile(ex,controls.defaults));assert.equal(example.knowledgeScaffoldLevel,'L5');assert.notEqual(goals.fallbackFor({scope,plan:hint}).message,goals.fallbackFor({scope,plan:example}).message);assert.match(goals.promptFor({scope,need:{need:'concept'},plan:example}).system,/局部示例/);}
 const created=store.createVersion({design:'learner-configurable-20-v1',project:'synthetic-pilot-20',title:'合成20人测试',reason:'测试',responsible:'合成负责人',contact:'合成',reviewReference:'隔离测试',retention:'合成数据',withdrawal:'合成退出'});
 assert.equal(created.version.capacity,20);assert.ok(!JSON.stringify(store.preview(created.joinCode)).includes('schedule'));assert.match(created.version.consentText,/随机/);
 const baseline=Object.fromEntries(C.surveys.baseline.map(([k])=>[k,3])),counts={control:0,configurable:0};let configured;
 for(let n=0;n<20;n++){const user='synthetic-'+n;const started=store.start(user,1,{joinCode:created.joinCode,versionHash:created.version.hash,consent:true},{});assert.equal(started.enrollment.arm,null);
  assert.equal(store.observe(user,1,{scope:'GH-01-K01'}),null);assert.throws(()=>store.action(user,1,{action:'baseline',survey:{}}));const before=store.action(user,1,{action:'baseline',survey:baseline});assert.equal(before.enrollment.stage,'pretest');assert.equal(before.enrollment.arm,null);assert.throws(()=>store.configure(user,1,{profile:{}}));store.recordPretest(user,1,['server-result-'+n]);const s=store.state(user,1);counts[s.enrollment.arm]++;
  assert.equal(store.action(user,1,{action:'baseline',survey:baseline}).enrollment.arm,s.enrollment.arm);
  if(s.enrollment.arm==='control')assert.throws(()=>store.configure(user,1,{profile:{}}),/不允许/);
  else {const r=prefs.save(user,{answers:a,expectedRevision:0,elapsedMs:100});store.configure(user,1,r);assert.equal(store.state(user,1).enrollment.stage,'ready');assert.throws(()=>prefs.save(user,{answers:a,expectedRevision:0}),/另一页面/);configured=user;}
  assert.equal(store.observe(user,1,{source:'candidate',scope:'GH-01-K01'}),null,'两组均只按共同周期抽样');
 }
 assert.deepEqual(counts,{control:10,configurable:10});assert.throws(()=>store.start('extra',1,{joinCode:created.joinCode,versionHash:created.version.hash,consent:true},{}),/20/);
 const completed=Array.from({length:20},(_,n)=>'synthetic-'+n).find(user=>user!=='synthetic-0'&&store.state(user,1).enrollment.arm==='control');
 const final=Object.fromEntries(C.surveys.final.map(([k])=>[k,4]));
 const ended=store.action(completed,1,{action:'finish',survey:final}).enrollment;
 assert.equal(ended.status,'finished');assert.equal(Date.parse(ended.followupEndsAt)-Date.parse(ended.endedAt),168*3600000);
 assert.equal(ended.finalSurvey.subscales.autonomySatisfaction.mean,4);
 assert.equal(store.action(completed,1,{action:'withdraw'}).enrollment.status,'withdrawn');
 store.action('synthetic-0',1,{action:'withdraw'});assert.throws(()=>store.start('extra',1,{joinCode:created.joinCode,versionHash:created.version.hash,consent:true},{}),/20/);
 const old=store.state(configured,1).enrollment.configuration;
 d=new SQL.Database(d.export());const again=require('../lib/pilot-study').createStore({db});assert.deepEqual(again.state(configured,1).enrollment.configuration,old);
 assert.equal(again.members(created.version.project).length,20);console.log('20人预试核心通过：选项全映射、理由校验、并发版本、随机10/10、名额上限、共同抽样、控制组锁定、退出不补位、持久化。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
