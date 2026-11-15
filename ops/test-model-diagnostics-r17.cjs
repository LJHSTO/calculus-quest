'use strict';
const assert=require('node:assert/strict'),llm=require('../lib/llm');
const originalFetch=global.fetch,options={provider:'openai-compatible',baseUrl:'https://synthetic.invalid/v1',apiKey:'synthetic-private-value',model:'fixed-course-model',wireApi:'chat-completions',temperature:.2,maxTokens:700,user:'合成核验'};
(async()=>{try{
 global.fetch=async(_url,request)=>{
  const body=JSON.parse(request.body);assert.equal(body.model,options.model);assert.equal(body.temperature,.2);assert.equal(body.max_tokens,700);
  return {ok:true,json:async()=>({model:options.model,choices:[{finish_reason:'stop',message:{content:'每个允许输入恰有一个输出。'}}],usage:{prompt_tokens:2000,completion_tokens:20,total_tokens:2020,prompt_tokens_details:{cached_tokens:1536},completion_tokens_details:{reasoning_tokens:0}}})};
 };
 const result=await llm.completeChat(options);assert.equal(result.modelInfo.reportedModel,options.model);assert.equal(result.modelInfo.cachedPromptTokens,1536);assert.equal(result.modelInfo.reasoningTokens,0);assert.equal(result.modelInfo.finishReason,'stop');
 for(const v of [result.modelInfo.queueMs,result.modelInfo.executionMs,...Object.values(result.modelInfo.transport)])assert(v>=0);
 global.fetch=async()=>({ok:true,json:async()=>({model:'different-model',choices:[{finish_reason:'stop',message:{content:'not accepted'}}]})});
 await assert.rejects(llm.completeChat({...options,requireModelIdentity:true}),e=>e.code==='MODEL_IDENTITY_MISMATCH'&&e.reportedModel==='different-model');
 global.fetch=async()=>({ok:false,status:429,text:async()=>options.apiKey+' synthetic quota'});
 await assert.rejects(llm.completeChat(options),e=>e.status===429&&e.code==='MODEL_HTTP_ERROR'&&e.modelTiming.executionMs>=0&&!e.message.includes(options.apiKey));
 global.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'如果两个极限'}}]})});
 await assert.rejects(llm.completeChat(options),{code:'MODEL_OUTPUT_INCOMPLETE'});
 global.fetch=async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 await assert.rejects(llm.completeChat({...options,timeoutMs:15}),e=>e.code==='MODEL_EXECUTION_TIMEOUT'&&e.modelTiming.executionMs>=10);
 await new Promise(r=>setTimeout(r,0));assert.equal(require('../lib/model-scheduler').shared.state.active,0);
 console.log('PASS: model identity/options, cache and phase timings, redacted HTTP status, truncated-answer rejection, timeout releases capacity');
}finally{global.fetch=originalFetch;}})().catch(e=>{console.error(e.message);process.exitCode=1;});
