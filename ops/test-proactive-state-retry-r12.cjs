'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/main/knowledge-assistant.js'),'utf8');
const fn=source.slice(source.indexOf('  async function loadProactiveStudy('),source.indexOf('  function serverAuthorizedProactiveDecision('));
async function main(){
 let calls=0,resolveFetch,clock=10000;const scheduled=[];
 const ctx={state:{participant:{participantId:'synthetic-owner'},authToken:'synthetic-token'},proactiveStudy:{loaded:false,supportCycles:[{id:'saved-cycle'}]},proactiveStudyKey:'',proactiveStudyRequestId:0,proactiveStudyInFlight:null,proactiveStudyRetry:null,proactiveStudyRetryTimer:null,exposureGeneration:1,PROACTIVE_STUDY_CHAPTER_ID:'V14-C1',Date:class extends Date{static now(){return clock;}},setTimeout:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},clearTimeout:()=>{},isSignedInNow:()=>true,courseMeta:()=>({chapterId:'V14-C1'}),clearProactivePresentation:()=>{},proactiveStudyManaged:()=>true,loadProactiveOutcomes:async()=>{},resetProactiveOutcomes:()=>{},renderUnit:()=>{},proactiveCollectionEnabled:()=>false,proactiveCoach:{reset(){}},fetch:()=>{calls++;return new Promise(resolve=>resolveFetch=resolve);}};
 vm.createContext(ctx);vm.runInContext(fn+'\nthis.load=loadProactiveStudy',ctx);
 let tracks=0;ctx.track=()=>{tracks++;if(tracks<10)ctx.load();};
 const pending=Array.from({length:30},()=>ctx.load());assert.equal(calls,1,'相同身份的并行状态请求必须合并');resolveFetch({ok:false,status:429,headers:{get:()=> '2'},json:async()=>({message:'rate limited'})});await Promise.all(pending);assert.equal(ctx.proactiveStudy.supportCycles[0].id,'saved-cycle');
 await Promise.all(Array.from({length:30},()=>ctx.load(undefined,{force:true})));assert.equal(calls,1,'强制刷新/失败日志回流也必须服从冷却');
 clock+=2100;ctx.fetch=async()=>{calls++;return {ok:true,status:200,headers:{get:()=>null},json:async()=>({ok:true,data:{loaded:true}})};};ctx.applyProactiveStudy=()=>{ctx.proactiveStudy={...ctx.proactiveStudy,loaded:true};};await ctx.load();assert.equal(calls,2);assert.equal(ctx.proactiveStudy.loaded,true);
 console.log('状态请求合并、429冷却、保留已知结果及恢复通过');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
