'use strict';
const assert=require('node:assert/strict'),db=require('../db');
(async()=>{
 let calls=0,value=1;const read=()=>{calls++;return value;};
 assert.equal(db.memoizeRequestRead('k',read),1);assert.equal(db.memoizeRequestRead('k',read),1);assert.equal(calls,2,'outside requests there is no cache');
 await db.deferResponseSaves(async()=>{
  assert.equal(db.memoizeRequestRead('k',read),1);await Promise.resolve();assert.equal(db.memoizeRequestRead('k',read),1);assert.equal(calls,3);
  value=2;db.saveNow();assert.equal(db.memoizeRequestRead('k',read),2,'writes invalidate prior reads');assert.equal(calls,4);
  let retries=0;assert.throws(()=>db.memoizeRequestRead('failure',()=>{retries++;throw Error('retry');}));
  assert.equal(db.memoizeRequestRead('failure',()=>++retries),2,'failed reads are not cached');
 });
 const results=await Promise.all(['A','B','C'].map(owner=>db.deferResponseSaves(async()=>{
  const a=db.memoizeRequestRead('same-key',()=>owner);await new Promise(r=>setTimeout(r,5));
  return [a,db.memoizeRequestRead('same-key',()=>{throw Error('duplicate read');})];
 })));
 assert.deepEqual(results,[['A','A'],['B','B'],['C','C']]);
 assert.equal(await db.deferResponseSaves(()=>db.memoizeRequestRead('same-key',()=> 'fresh')),'fresh');
 db.withRequestReads(()=>{
  let n=0;assert.equal(db.memoizeRequestRead('synchronous',()=>++n),1);assert.equal(db.memoizeRequestRead('synchronous',()=>++n),1);
  db.saveNow();assert.equal(db.flushResponseSaves(),null,'read scopes preserve immediate persistence');
  assert.equal(db.memoizeRequestRead('synchronous',()=>++n),2);
 });
 db.saveNow(); // Clear the no-database timer created by the synthetic save.
 console.log('PASS: request-only reuse, write invalidation, failed-read retry, concurrent A/B/C isolation, no cross-request stale state');
})().catch(e=>{db.saveNow();console.error(e);process.exitCode=1;});
