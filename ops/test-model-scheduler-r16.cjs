'use strict';
const assert=require('node:assert/strict'),{createScheduler}=require('../lib/model-scheduler');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const scheduler=createScheduler({concurrency:3,maxPending:100,queueTimeoutMs:1000});let active=0,peak=0;const order=[];
 const results=await Promise.all(Array.from({length:100},(_,i)=>scheduler.run(async()=>{active++;peak=Math.max(peak,active);order.push(i);await wait(2);active--;return i;})));
 assert.equal(peak,3);assert.deepEqual(results,Array.from({length:100},(_,i)=>i));assert.deepEqual(order,results);await wait(0);assert.deepEqual(scheduler.state,{active:0,pending:0,concurrency:3,maxPending:100});
 const small=createScheduler({concurrency:1,maxPending:1,queueTimeoutMs:20});let release;const busy=small.run(()=>new Promise(r=>release=r));await wait(0);
 const abort=new AbortController(),queued=small.run(()=>assert.fail('cancelled work ran'),{signal:abort.signal});await assert.rejects(small.run(()=>{}),{code:'MODEL_QUEUE_FULL'});abort.abort();await assert.rejects(queued);assert.equal(small.state.pending,0);
 await assert.rejects(small.run(()=>assert.fail('expired work ran')),{code:'MODEL_QUEUE_TIMEOUT'});release();await busy;await wait(0);assert.equal(await small.run(()=>42),42);
 const broken=createScheduler({concurrency:1});await assert.rejects(broken.run(()=>{throw Error('upstream failure');}),/upstream failure/);assert.equal(await broken.run(()=>7),7);
 const notices=[],dedup=createScheduler({concurrency:1});let unlock;
 const held=dedup.run(()=>new Promise(r=>unlock=r));await wait(0);
 const first=dedup.run(()=>1,{onQueue:s=>notices.push(s.position)}),second=dedup.run(()=>2);
 assert.deepEqual(notices,[1],'new arrival must not re-send an unchanged queue position');
 unlock();await Promise.all([held,first,second]);assert.deepEqual(notices,[1,0]);
 console.log('PASS: 100 jobs, bounded FIFO concurrency, cancellation, queue timeout, overflow and recovery after failure');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
