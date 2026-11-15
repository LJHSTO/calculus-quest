'use strict';
// One bounded FIFO per server process, shared by tutoring and grading.
function createScheduler({concurrency=24,maxPending=128,queueTimeoutMs=90000}={}){
 let active=0;const pending=[];
 const error=(code,message)=>Object.assign(new Error(message),{code});
 // New arrivals do not change the positions of earlier waiters. Avoid
 // repeatedly redrawing every student's conversation for identical notices.
 const inform=(entry,position)=>{const key=`${position}:${active}`;if(entry.lastNotice===key)return;entry.lastNotice=key;try{entry.onQueue?.({position,active});}catch{}};
 const notify=()=>pending.forEach((entry,i)=>inform(entry,i+1));
 function drain(){
  while(active<concurrency&&pending.length){const entry=pending.shift();entry.cleanup();active++;
   inform(entry,0);
   Promise.resolve().then(entry.work).then(entry.resolve,entry.reject).finally(()=>{active--;drain();});
  }notify();
 }
 function run(work,{signal,onQueue}={}){
  if(signal?.aborted)return Promise.reject(signal.reason||error('MODEL_CANCELLED','Request cancelled'));
  if(active>=concurrency&&pending.length>=maxPending)return Promise.reject(error('MODEL_QUEUE_FULL','知点当前请求较多，请稍后重试。'));
  return new Promise((resolve,reject)=>{
   const entry={work,resolve,reject,onQueue};let timer;
   const remove=reason=>{const i=pending.indexOf(entry);if(i<0)return;pending.splice(i,1);entry.cleanup();reject(reason);notify();};
   const abort=()=>remove(signal.reason||error('MODEL_CANCELLED','Request cancelled'));
   entry.cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
   timer=setTimeout(()=>remove(error('MODEL_QUEUE_TIMEOUT','等待时间较长，请稍后重试。')),queueTimeoutMs);
   signal?.addEventListener('abort',abort,{once:true});pending.push(entry);drain();
  });
 }
 return {run,limits:Object.freeze({concurrency,maxPending,queueTimeoutMs}),get state(){return {active,pending:pending.length,concurrency,maxPending};}};
}
const integer=(name,fallback,min,max)=>{const value=Number(process.env[name]);return Number.isInteger(value)&&value>=min&&value<=max?value:fallback;};
const shared=createScheduler({concurrency:integer('LLM_MAX_CONCURRENT',24,1,100),maxPending:integer('LLM_MAX_PENDING',128,1,1000),queueTimeoutMs:integer('LLM_QUEUE_TIMEOUT_MS',90000,1000,600000)});
module.exports={createScheduler,shared};
