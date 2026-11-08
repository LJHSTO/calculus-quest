'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/综合课程-r10-20261106/延迟测量缺失值回归');
const oldSchema=`CREATE TABLE proactive_outcome_attempts (
 id TEXT PRIMARY KEY,session_id TEXT DEFAULT '',user_id TEXT NOT NULL REFERENCES users(id),experiment_id TEXT NOT NULL,
 condition TEXT NOT NULL,cohort TEXT DEFAULT '',chapter_id TEXT NOT NULL,stage TEXT NOT NULL,instrument_version TEXT NOT NULL,
 response_json TEXT NOT NULL DEFAULT '{}',item_results_json TEXT NOT NULL DEFAULT '[]',score REAL NOT NULL DEFAULT 0,
 max_score REAL NOT NULL DEFAULT 0,accuracy REAL NOT NULL DEFAULT 0,duration_ms INTEGER NOT NULL DEFAULT 0,
 learning_generation INTEGER NOT NULL DEFAULT 1,started_at TEXT DEFAULT '',submitted_at TEXT NOT NULL,
 UNIQUE(user_id,experiment_id,stage))`;
const read=(raw,sql,values=[])=>{const s=raw.prepare(sql);try{s.bind(values);const rows=[];while(s.step())rows.push(s.getAsObject());return rows;}finally{s.free();}};
async function worker(driver,directory){
 process.env.DB_PATH=path.join(directory,driver+'.db');process.env.DB_DRIVER=driver==='native'?'native':'sqljs';process.env.NODE_ENV='test';
 const SQL=await require('sql.js')(),seed=new SQL.Database();seed.run(oldSchema);
 const old={id:'legacy-row',session_id:'legacy-session',user_id:'legacy-user',experiment_id:'legacy-study',condition:'control',cohort:'原批次',chapter_id:'V14-C1',stage:'retention',instrument_version:'functions-limits-retention-r4',response_json:'{"old":"A"}',item_results_json:'[{"itemId":"old","score":0,"maxScore":1,"correct":false}]',score:0,max_score:1,accuracy:0,duration_ms:321,learning_generation:1,started_at:'2026-01-01T00:00:00Z',submitted_at:'2026-01-01T00:00:01Z'};
 seed.run(`INSERT INTO proactive_outcome_attempts (${Object.keys(old).join(',')}) VALUES (${Object.keys(old).map(()=>'?').join(',')})`,Object.values(old));
 const oldColumns=read(seed,'PRAGMA table_info(proactive_outcome_attempts)');fs.writeFileSync(process.env.DB_PATH,seed.export());seed.close();
 const db=require('../db'),raw=await db.getDb(),checks=[];
 try{
  assert.equal(Boolean(raw.native),driver==='native');
  const columns=read(raw,'PRAGMA table_info(proactive_outcome_attempts)');assert.deepEqual(columns.slice(0,-1),oldColumns);
  assert.equal(columns.at(-1).name,'score_complete');assert.equal(columns.at(-1).type,'INTEGER');assert.equal(columns.at(-1).notnull,1);assert.equal(String(columns.at(-1).dflt_value),'1');
  const migrated=read(raw,'SELECT * FROM proactive_outcome_attempts WHERE id=?',[old.id])[0];assert.equal(migrated.score_complete,1);delete migrated.score_complete;assert.deepEqual(migrated,old);
  checks.push('旧schema仅追加score_complete INTEGER NOT NULL DEFAULT 1；原列定义、顺序和每个旧值保持');
  const bank=require('../lib/assessments/functions-limits-delayed-r10'),registry=require('../lib/proactive-outcomes/functions-limits-r10');
  const preferences=require('../lib/learner-preferences').createStore({db}),store=require('../lib/three-arm-study').createStore({db,preferences});
  const timestamp='2026-11-07T00:00:00.000Z',allCorrect=Object.fromEntries(bank.retention.map(q=>[q.id,q.answer[0]]));
  const scenarios={skip:{...allCorrect,[bank.retention[7].id]:'skip'},unknown:Object.fromEntries(bank.retention.map(q=>[q.id,'__unknown__'])),correct:allCorrect};
  const records=[];
  function participant(label,experiment){
   const owner='synthetic-'+label;db.upsertUser(owner,label,timestamp,timestamp);const run=store.resolve({id:owner},'B');
   db.getOrCreateExperimentAssignment({user_id:run.id,experiment_id:experiment,condition:'control',stratum:'synthetic',assignment_version:'fixture-v1',assigned_at:timestamp});return run.id;
  }
  function recordFor(user,experiment,stage,grade){return {id:experiment+'-'+stage+'-'+user,user_id:user,experiment_id:experiment,condition:'control',chapter_id:'V14-C1',stage,instrument_version:registry.version,score:grade.score,max_score:grade.maxScore,accuracy:grade.accuracy,item_results:grade.results,responses:Object.fromEntries(grade.results.map(r=>[r.itemId,r.response])),duration_ms:2000,learning_generation:1,started_at:timestamp,submitted_at:timestamp};}
  function assertPublic(row,kind){assert.equal(row.score_complete,kind==='skip'?0:1);assert.equal(row.score,kind==='skip'?null:kind==='unknown'?0:8);assert.equal(row.accuracy,kind==='skip'?null:kind==='unknown'?0:1);assert.equal(row.max_score,8);const items=JSON.parse(row.item_results_json);assert.equal(items.filter(i=>i.score===null).length,kind==='skip'?1:0);}
  for(const method of ['insert','submit']){
   const experiment='synthetic-'+method;
   for(const [kind,responses]of Object.entries(scenarios)){
    const user=participant(method+'-'+kind,experiment),grade=registry.grade('retention',responses),record=recordFor(user,experiment,'retention',grade);
    assert.equal(grade.complete,kind!=='skip');let stored;
    if(method==='insert')stored=db.insertProactiveOutcomeAttempt(record);
    else{
     const sessionId='session-'+user;assert.equal(db.startProactiveOutcomeSession({...record,id:sessionId,protocol_fingerprint:'fixture'}).ok,true);
     const submitted=db.submitProactiveOutcomeSession({userId:user,sessionId,attempt:record,submittedAt:timestamp});assert.equal(submitted.ok,true);assert.equal(submitted.session.status,'submitted');stored=submitted.attempt;
     const repeated=db.submitProactiveOutcomeSession({userId:user,sessionId,attempt:record,submittedAt:timestamp});assert.equal(repeated.idempotent,true);assertPublic(repeated.attempt,kind);
    }
    assertPublic(stored,kind);assertPublic(db.getProactiveOutcomeAttempt(user,experiment,'retention'),kind);assertPublic(db.listProactiveOutcomeAttempts(user,experiment)[0],kind);
    assertPublic(db.proactiveOutcomeRows({experimentId:experiment,userId:user}).rows[0],kind);
    const physical=read(raw,'SELECT * FROM proactive_outcome_attempts WHERE id=?',[record.id])[0];assert.equal(physical.score_complete,kind==='skip'?0:1);assert.equal(physical.score,kind==='correct'?8:0);assert.equal(physical.item_results_json,JSON.stringify(grade.results));
    records.push({method,kind,user,experiment,id:record.id});
   }
   const summary=db.proactiveOutcomeSummary(experiment)[0];assert.equal(summary.submissions,3);assert.equal(summary.scored_submissions,2);assert.equal(summary.incomplete_submissions,1);assert.equal(summary.mean_accuracy,.5);
   const source=db.researchAnalysisSource({experimentId:experiment,chapterId:'V14-C1'});
   for(const row of records.filter(r=>r.experiment===experiment))assertPublic(source.outcomes.find(x=>x.id===row.id),row.kind);
   const pkg=require('../lib/research-analysis-export').buildPackage({source,protocol:{fingerprint:'fixture'},assessmentIndex:new Map()});
   const items=pkg.tables.outcome_items;assert.equal(items.length,24);
   for(const record of records.filter(r=>r.experiment===experiment)){
    const mine=items.filter(i=>i.attempt_id===record.id);assert.ok(mine.every(i=>i.attempt_score_complete===(record.kind==='skip'?0:1)));
    assert.equal(mine.filter(i=>i.score===null).length,record.kind==='skip'?1:0);
    if(record.kind==='unknown')assert.ok(mine.every(i=>i.score===0&&i.correct===false));
   }
   const csvDir=path.join(directory,driver+'-'+method+'-分析包');require('./prepare-research-analysis').prepare(pkg,csvDir);
   const csv=fs.readFileSync(path.join(csvDir,'独立测量逐题结果.csv'),'utf8');assert.match(csv,/整份测量可计总分/);
   const scoreColumn=Object.keys(require('../lib/research-analysis-export').schemas.outcome_items).indexOf('score'),csvLines=csv.split('\r\n');
   const skipIndex=items.findIndex(i=>i.score===null),zeroIndex=items.findIndex(i=>i.score===0);
   assert.equal(csvLines[skipIndex+1].split(',')[scoreColumn].replaceAll('"',''),'');assert.equal(csvLines[zeroIndex+1].split(',')[scoreColumn].replaceAll('"',''),'0');
  }
  checks.push('SQL真实直接插入及会话提交：7对1跳过为缺失、全不会为有效0分、全对为8分，幂等提交和全部getter/list读回正确');
  checks.push('汇总3份提交只计2份完整成绩，准确率均值0.5；逐题null及分析CSV整卷完整性保留');
  const only=participant('only-skip','only-incomplete'),skipGrade=registry.grade('retention',scenarios.skip);db.insertProactiveOutcomeAttempt(recordFor(only,'only-incomplete','retention',skipGrade));
  assert.equal(db.proactiveOutcomeSummary('only-incomplete')[0].mean_accuracy,null);
  const complete=records.find(r=>r.method==='submit'&&r.kind==='correct'),transferResponses=Object.fromEntries(bank.transfer.map(q=>[q.id,q.answer[0]])),transferGrade=registry.grade('transfer',transferResponses);
  const transferRecord=recordFor(complete.user,complete.experiment,'transfer',transferGrade);const transferSession='transfer-session';db.startProactiveOutcomeSession({...transferRecord,id:transferSession});assert.equal(db.submitProactiveOutcomeSession({userId:complete.user,sessionId:transferSession,attempt:transferRecord,submittedAt:timestamp}).ok,true);
  const analysis=db.proactiveExperimentAnalysis({experimentId:complete.experiment,chapterId:'V14-C1',outcomeInstrumentVersion:registry.version});
  const learner=analysis.participants.find(p=>p.user_id===complete.user);assert.deepEqual(Object.keys(learner.outcomes),['retention','transfer']);assert.equal(learner.outcomes.transfer.score,6);assert.equal(learner.outcomes.transfer.status,'submitted');assert.equal(learner.outcomes.retention.score,8);
  const incomplete=analysis.participants.find(p=>p.user_id===records.find(r=>r.method==='submit'&&r.kind==='skip').user);assert.equal(incomplete.outcomes.retention.score,null);assert.equal(incomplete.outcomes.retention.accuracy,null);assert.equal(incomplete.outcomes.retention.score_complete,0);
  assert.equal(db.proactiveParticipantFlow({experimentId:complete.experiment,chapterId:'V14-C1'})[0].transferCompleted,1);
  for(const version of ['functions-limits-retention-r4','functions-limits-delayed-r7','v14-c3-outcomes-v3']){
   const experiment='version-'+version,user=participant(version,experiment),instrument=registry.forVersion(version),stage=instrument.stageIds[0];
   db.insertProactiveOutcomeAttempt({...recordFor(user,experiment,stage,{score:0,maxScore:1,accuracy:0,results:[]}),instrument_version:version});
   const p=db.proactiveExperimentAnalysis({experimentId:experiment,chapterId:'V14-C1',outcomeInstrumentVersion:registry.version}).participants[0];assert.deepEqual(Object.keys(p.outcomes),instrument.stageIds);assert.equal(p.outcome_instrument_version,version);
  }
  checks.push('r10保持8/8及迁移6/6均出现在对应阶段；r4/r7/v14-c3按记录题库stageIds汇总，参与者流包含真实transfer');
  const exported=store.exportData().tables.proactive_outcome_attempts;
  const selected=require('../lib/selected-participant-export').buildSelectedParticipantPackage(raw,records.map(r=>r.user));
  for(const record of records){assertPublic(exported.find(r=>r.id===record.id),record.kind);assertPublic(selected.tables.proactive_outcome_attempts.find(r=>r.id===record.id),record.kind);}
  assert.ok(selected.dictionary.proactive_outcome_attempts.find(f=>f.field==='score_complete').meaning.includes('null'));
  checks.push('三组全量导出和所选参与者导出：不完整总分/准确率null、完整0分保持0，并明确完整性字典');
  const after=read(raw,'SELECT * FROM proactive_outcome_attempts WHERE id=?',[old.id])[0];delete after.score_complete;assert.deepEqual(after,old);db.saveNow();
  const reopened=new SQL.Database(fs.readFileSync(process.env.DB_PATH));assert.equal(read(reopened,'SELECT score_complete FROM proactive_outcome_attempts WHERE id=?',[records[0].id])[0].score_complete,0);reopened.close();
  fs.writeFileSync(path.join(directory,driver+'-验收.json'),JSON.stringify({passed:true,driver,checks,newColumn:{name:'score_complete',type:'INTEGER',notNull:true,default:1,existingColumnsAndValuesPreserved:true},database:process.env.DB_PATH},null,2));console.log(driver+'：'+checks.length+'组检查通过');
 }finally{db.saveNow();db.releaseWriteLock();raw.close();}
}
async function main(){
 if(process.argv[2]==='--worker')return worker(process.argv[3],process.argv[4]);
 fs.mkdirSync(out,{recursive:true});const directory=fs.mkdtempSync(path.join(out,'隔离库-'));
 const runs=await Promise.all(['sqljs','native'].map(driver=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[__filename,'--worker',driver,directory],{cwd:root,env:{...process.env,NODE_ENV:'test'},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('error',reject);child.on('close',code=>code===0?resolve({driver,output}):reject(Error(driver+' failed\n'+output)));})));
 for(const r of runs)console.log(r.output.trim());fs.writeFileSync(path.join(out,'双后端回归结果.json'),JSON.stringify({passed:true,directory,drivers:runs.map(r=>r.driver),scope:'隔离合成数据库；未接触真实数据库或重启服务'},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
