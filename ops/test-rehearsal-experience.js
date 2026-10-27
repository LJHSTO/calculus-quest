'use strict';
const assert=require('node:assert/strict');
const C=require('../app/shared/learner-preferences'),createStore=require('../lib/pilot-study').createStore;
async function main(){
 const SQL=await require('sql.js')();let d=new SQL.Database();const db={getDbSync:()=>d,saveNow(){}};
 let store=createStore({db});const prefs=require('../lib/learner-preferences').createStore({db});
 const created=store.createVersion({design:'learner-configurable-20-v1',useMode:'rehearsal',project:'synthetic-rehearsal',title:'合成功能演练',reason:'隔离测试',responsible:'合成',contact:'合成',reviewReference:'合成',retention:'合成',withdrawal:'合成退出'});
 assert.equal(created.version.allocationMethod,'all_configurable_internal_rehearsal');assert.match(created.version.consentText,/不随机分组/);
 const baseline=Object.fromEntries(C.surveys.baseline.map(([k])=>[k,3])),answers=C.defaults();for(const a of Object.values(answers))a.reason='default';
 for(let i=0;i<20;i++){
  const u='rehearsal-'+i;store.start(u,1,{joinCode:created.joinCode,versionHash:created.version.hash,consent:true},{});
  store.action(u,1,{action:'baseline',survey:baseline});store.recordPretest(u,1,['synthetic-pre-'+i]);
  assert.equal(store.latest(u).arm,'configurable');assert.equal(store.latest(u).stage,'configuration');
  store.configure(u,1,prefs.save(u,{answers,expectedRevision:0,generation:1}));assert.equal(store.latest(u).stage,'ready');
 }
 assert.equal(store.members(created.version.project).filter(e=>e.arm==='configurable').length,20);
 // Emulate a frozen old rehearsal enrollment, without altering the production DB.
 const row=d.exec("SELECT document FROM pilot_enrollments WHERE user_id='rehearsal-0'")[0].values[0][0];
 const old=JSON.parse(row);old.arm='control';old.configuration=null;old.stage='ready';delete old.experiencePolicy;delete old.originalAssignment;
 const raw=JSON.stringify(old);d.run('UPDATE pilot_enrollments SET document=? WHERE id=?',[raw,old.id]);
 const effective=store.latest('rehearsal-0');assert.equal(effective.arm,'configurable');assert.equal(effective.stage,'configuration');assert.equal(effective.originalAssignment.arm,'control');
 assert.equal(d.exec("SELECT document FROM pilot_enrollments WHERE user_id='rehearsal-0'")[0].values[0][0],raw,'读取旧记录不应改写历史');
 assert.equal(store.preview(created.joinCode).hash,created.version.hash,'旧加入码及冻结版本仍有效');
 const record=prefs.read('rehearsal-1');store.configure('rehearsal-0',1,record);
 d=new SQL.Database(d.export());store=createStore({db});assert.equal(store.latest('rehearsal-0').stage,'ready');assert.equal(store.latest('rehearsal-0').originalAssignment.arm,'control');
 const exported=store.exportData(created.version.project);assert.equal(exported.enrollments.length,20);assert.match(exported.exclusions,/internal_rehearsal/);assert.equal(exported.versions[0].hash,created.version.hash);
 store.action('rehearsal-1',1,{action:'withdraw'});assert.equal(store.state('rehearsal-1',1).enrollment.status,'withdrawn');assert.equal(store.enrolled('rehearsal-1',1),null);
 assert.equal(store.enrolled('rehearsal-0',2),null);
 console.log(JSON.stringify({passed:true,synthetic:true,checks:['20个演练名额全部可配置','旧控制条件转完整功能且保留原分组','读取不修改历史行或版本哈希','旧码有效、配置和历史重启后保留','导出明确标记演练数据','退出和学习轮次保护']}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
