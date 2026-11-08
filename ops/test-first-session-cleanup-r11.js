'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'),start=source.indexOf('function recordFirstSessionLimit('),end=source.indexOf('function assertFirstSessionOpen(',start);
const records=new Map(),states=[{scope_key:'GH-01-K01',lifecycle_json:JSON.stringify({phase:'awaiting_independent_attempt',activeVerificationCheckId:'unanswered'})}];
let failures=1,closes=0,policyUpdates=0;
const study={get:()=>({mode:'formal'}),readRecord:(_,kind)=>records.get(kind),record:(_,kind,slot,value)=>{if(!records.has(kind))records.set(kind,value);return records.get(kind);}};
const db={currentLearningGeneration:()=>1,closeOpenProactiveInterventionsForUser(input){assert.equal(input.resolution,'first_session_time_limit');if(failures--)throw Error('synthetic_transient_cleanup_failure');closes++;},listProactivePolicyStates:()=>states,upsertProactivePolicyState(){policyUpdates++;states[0].lifecycle_json='{"phase":"closed"}';},saveNow(){}};
const f=new Function('threeArmStudy','firstSession','db','supportCycles','proactiveStudyConfig','nowIso','proactivePolicy','parseStoredJson','proactivePolicyStateRecord',source.slice(start,end)+';return recordFirstSessionLimit;')(
 study,{project:()=>({enforce:true,expired:true,deadlineAt:'2026-11-07T10:30:00Z'})},db,{cancel(){}},{experimentId:'synthetic'},()=>new Date().toISOString(),{lifecycle:{normalize:v=>v}},JSON.parse,(row,next)=>({...row,...next}));
assert.throws(()=>f('synthetic'),/synthetic_transient/);assert.ok(records.has('time_limit_end'));assert.equal(records.has('time_limit_cleanup'),false);
f('synthetic');assert.ok(records.get('time_limit_cleanup').completed);assert.equal(closes,1);assert.equal(policyUpdates,1);
f('synthetic');assert.equal(closes,1);assert.equal(policyUpdates,1);assert.equal(records.size,2);
(async()=>{const dir=fs.mkdtempSync(path.join(__dirname,'../tmp/r11-cleanup-db-'));process.env.DB_PATH=path.join(dir,'synthetic.db');process.env.DB_DRIVER='sqljs';const actual=require('../db');try{await actual.getDb();assert.equal(actual.closeOpenProactiveInterventionsForUser({userId:'synthetic-none',experimentId:'synthetic',resolution:'first_session_time_limit',resolvedAt:new Date().toISOString()}),0);}finally{actual.saveNow();actual.getDbSync().close();actual.releaseWriteLock();}console.log('首场到期清理回归通过：真实DB接受专用原因、审计后失败可重试、清理成功后幂等、不生成检查成绩。');})().catch(e=>{console.error(e);process.exitCode=1;});
