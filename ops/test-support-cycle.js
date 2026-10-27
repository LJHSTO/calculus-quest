"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const goals=require("../lib/support-goals"),{createStore}=require("../lib/support-cycle"),{defaults,validate}=require("../lib/research-controls");
const adapter=require("../lib/proactive-policy/adapters/functions-limits-r2");
async function main(){
 const SQL=await require("sql.js")();let database=new SQL.Database(),time=Date.parse("2026-10-21T12:00:00Z"),events=[];
 const db={getDbSync:()=>database,saveNow(){},insertEvent:e=>events.push(e)};
 let store=createStore({db,clock:()=>time,experimentId:"synthetic"});
 const guard=()=>({profileRevision:0,protected:false,boundary:true,disabled:false,occupied:false});
 const input={need:"value",confirmed:true,note:"我想了解测量误差",ratings:{value:0,confidence:null}};
 assert.throws(()=>goals.validateNeed({need:"value",confirmed:false}),/确认/);
 assert.throws(()=>goals.validateNeed({...input,ratings:{cost:5}}),/0–4/);
 assert.equal(goals.validateNeed(input).ratings.value,0);assert.equal(goals.validateNeed(input).ratings.confidence,null);
 assert.equal(goals.selectPlan(goals.validateNeed({...input,need:"uncertain"}),defaults),null);
 assert.throws(()=>validate({...defaults,supportGoal:"motivational",supportStrategy:"concept_hint"}),/对应策略/);
 let combinations=0;
 for(const scope of Object.keys(goals.CURRICULUM))for(const primaryGoal of Object.keys(goals.GOALS))for(const strategy of goals.GOALS[primaryGoal].strategies)for(const dose of ['brief','guided']){
   const plan=goals.selectPlan(goals.validateNeed(input),{...defaults,supportGoal:primaryGoal,supportStrategy:strategy,supportDose:dose});
   assert.equal(plan.knowledgeScaffoldLevel,null);assert.equal(plan.primaryGoal,primaryGoal);
   const p=goals.promptFor({scope,need:input,plan});assert.ok(p.user.includes(goals.CURRICULUM[scope].fact));
   const out=await goals.generateSupport({scope,need:input,plan},{live:false});assert.equal(out.audit.fallback,true);assert.ok(out.message.length>20);combinations++;
 }
 for(const text of ['invalid json',JSON.stringify({message:'<b>这是一段不得注入的文本内容</b>',nextStep:'继续'}),JSON.stringify({message:'你一定能完成这道题，不要停止现在的学习。',nextStep:'继续'})]){
   const out=await goals.generateSupport({scope:'GH-01-K01',need:input,plan:goals.selectPlan(input,defaults)},{live:true,complete:async()=>({text,provider:'synthetic'})});
   assert.equal(out.audit.fallback,true);assert.equal(out.audit.failure,'provider_or_validation_failure');
 }
 const timeout=await goals.generateSupport({scope:'GH-01-K01',need:input,plan:goals.selectPlan(input,defaults)},{live:true,complete:async()=>{throw Object.assign(new Error('synthetic'),{name:'TimeoutError'});}});
 assert.equal(timeout.audit.failure,'timeout');
 assert.equal(timeout.audit.attempts.length,2,'临时错误最多重试一次');
 let providerAttempts=0;
 const recovered=await goals.generateSupport({scope:'GH-01-K01',need:input,plan:goals.selectPlan(input,defaults)},{live:true,complete:async()=>{
   if(providerAttempts++===0)throw Object.assign(new Error('synthetic timeout'),{name:'TimeoutError'});
   return {provider:'synthetic',text:JSON.stringify({message:'先区分输入与输出，再说明它们之间使用了什么规则。',nextStep:'你可以先试一小步。'})};
 }});
 assert.equal(recovered.audit.fallback,false);assert.deepEqual(recovered.audit.attempts.map(a=>a.outcome),['timeout','received']);
 for(const model of ['Qwen3.8-Flash-Next','MiniMax-M3.1-Flash']) {
 const budgeted=await goals.generateSupport({scope:'GH-01-K01',need:input,plan:goals.selectPlan(input,defaults)},{model,complete:async args=>{assert.equal(args.maxTokens,1600);return {provider:'synthetic',text:JSON.stringify({message:'可以先比较输入与输出的含义，再独立说出一个例子。',nextStep:'由你选择是否继续。'})};}});
 assert.equal(budgeted.audit.requestOptions.maxTokens,1600);assert.equal(budgeted.audit.fallback,false);
 }
 const scope="GH-02-K01",profile={...defaults,ttlSeconds:120,cooldownSeconds:60,supportFollowups:1};
 let c=store.report("alice",scope,1,input,profile,0);assert.equal(c.status,"queued");
 const idem={...input,requestId:'synthetic-idempotency-request'};
 const first=store.report('dedupe',scope,1,idem,profile,0);
 assert.equal(store.report('dedupe',scope,1,idem,profile,0).id,first.id);
 assert.equal(store.current("bob",scope,1),null);assert.equal(store.current("alice",scope,2),null);
 let calls=0;
 const generate=async args=>{calls++;return goals.generateSupport(args,{live:true,complete:async()=>({provider:"synthetic",modelInfo:{returnedModel:"fixture"},text:JSON.stringify({message:"可以先看看测量越来越细时，结果有什么趋势。这个情境能否与你关心的测量误差联系起来？",nextStep:"由你选择是否继续这个例子。"})})});};
 await store.advance("alice",scope,1,{guard:()=>({...guard(),protected:true}),generate});assert.equal(calls,0);
 const pair=await Promise.all([store.advance("alice",scope,1,{guard,generate}),store.advance("alice",scope,1,{guard,generate})]);
 c=pair[0];assert.equal(calls,1);assert.equal(c.status,"offered");assert.equal(c.content.audit.fallback,false);
 assert.ok(c.content.audit.promptSnapshot.user.includes('我想了解测量误差'));
 assert.throws(()=>store.act('alice',c.id,1,{action:'exposed',visibleMs:999,visibleFraction:.5},{adapter}),/标准/);
 c=store.act('alice',c.id,1,{action:'exposed',round:1,visibleMs:1000,visibleFraction:.5},{adapter});
 const exposedRevision=c.revision;
 assert.equal(store.act('alice',c.id,1,{action:'exposed',round:1,visibleMs:1000,visibleFraction:.5},{adapter}).revision,exposedRevision);
 assert.throws(()=>store.act("bob",c.id,1,{action:"accept"},{adapter}),/不存在/);
 assert.throws(()=>store.act("alice",c.id,1,{action:"accept",revision:0},{adapter}),/另一页面/);
 c=store.act("alice",c.id,1,{action:"feedback",result:"helped",ratings:{confidence:3},requestMore:true},{adapter});
 assert.equal(c.status,"queued");assert.equal(c.checkResult,null);assert.equal(c.feedback.selfReportNotLearningGain,true);
 await store.advance("alice",scope,1,{guard,generate});assert.equal(calls,1);
 time+=61000;c=await store.advance("alice",scope,1,{guard,generate});assert.equal(calls,2);
 assert.equal(c.exposure,null,'补充一轮需重新记录展示，不能沿用上一轮');
 assert.throws(()=>store.act('alice',c.id,1,{action:'exposed',round:1,visibleMs:1000,visibleFraction:.5},{adapter}),/轮次/);
 c=store.act("alice",c.id,1,{action:"feedback",result:"helped",requestMore:true},{adapter});assert.equal(c.status,"engaged","达到轮数上限不再自动追加");
 c=store.act("alice",c.id,1,{action:"start_check"},{adapter});assert.equal(store.protects("alice",1),true);assert.equal(c.check.answer,undefined);
 const correct=c.check.options.find(o=>adapter.gradeVerificationCheck({knowledgePointId:scope,supportLevel:"L1",checkId:c.check.id,response:o.value})?.correct);
 assert.throws(()=>store.act("alice",c.id,1,{action:"submit_check",checkId:"wrong",response:correct.value},{adapter}),/更新/);
 c=store.act("alice",c.id,1,{action:"submit_check",checkId:c.check.id,response:correct.value,score:0},{adapter});
 assert.equal(c.checkResult.correct,true);assert.equal(c.status,"closed");assert.equal(store.protects("alice",1),false);
 assert.throws(()=>store.act("alice",c.id,1,{action:"submit_check",checkId:c.check.id,response:correct.value},{adapter}),/更新/);
 const bytes=database.export();database.close();database=new SQL.Database(bytes);store=createStore({db,clock:()=>time,experimentId:"synthetic"});
 assert.equal(store.current("alice",scope,1).checkResult.correct,true,"重启后原记录保留");
 c=store.report("alice",scope,1,input,profile,0);time+=121000;c=await store.advance("alice",scope,1,{guard,generate});assert.equal(c.status,"expired");
 c=store.report("alice",scope,1,input,profile,0);
 let finish;const wait=new Promise(r=>finish=r);
 const delayed=store.advance("alice",scope,1,{guard,generate:async()=>{await wait;return generate({scope,need:input,plan:c.plan});}});
 store.act("alice",c.id,1,{action:"close"},{adapter});finish();assert.equal((await delayed).status,"closed","生成中拒绝后不得展示旧内容");
 assert.equal(store.blocksAutomatic('alice',scope,1),true,'结束后旧知识提示也应退避');
 c=store.report("alice",scope,1,{...input,need:"none"},profile,0);assert.equal(c.closeReason,"student_declined");assert.equal(c.plan,null);
 assert.equal(store.blocksAutomatic('alice',scope,1),true);
 const out=path.join(__dirname,"../output/六维多目标支持-2026-10-21");fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,"核心测试结果.json"),JSON.stringify({passed:true,synthetic:true,combinations,eventTypes:[...new Set(events.map(e=>e.payload.eventType))]},null,2));
 console.log(`多目标支持核心测试通过：${combinations} 个知识点×策略组合；账号与轮次隔离、持久化、并发、拒绝、过期、反馈与客观检查。`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
