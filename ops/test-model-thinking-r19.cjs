'use strict';
const assert=require('node:assert/strict'),llm=require('../lib/llm');
const original=process.env.OPENAI_COMPATIBLE_ENABLE_THINKING,originalFetch=global.fetch;
const options={provider:'openai-compatible',baseUrl:'https://synthetic.invalid/v1',apiKey:'synthetic-only',model:'deepseek-ai/DeepSeek-V4.1-Flash',maxTokens:700,user:'合成核验'};
(async()=>{try{
 for(const enabled of [false,true])for(const jsonHint of [false,true]){
  process.env.OPENAI_COMPATIBLE_ENABLE_THINKING=String(enabled);
  global.fetch=async(_url,{body})=>{const p=JSON.parse(body);assert.equal(p.enable_thinking,enabled);assert.equal(p.thinking,undefined);assert.equal(!!p.response_format,jsonHint);return {ok:true,json:async()=>({model:options.model,choices:[{finish_reason:'stop',message:{content:jsonHint?'{}':'每个输入恰有一个输出。'}}]})};};
  const r=await llm.completeChat({...options,jsonHint,requireModelIdentity:true});assert.equal(r.modelInfo.generationControls.enableThinking,enabled);assert.equal(llm.runtimeInfo(options).enableThinking,enabled);
 }
 process.env.OPENAI_COMPATIBLE_ENABLE_THINKING='invalid';await assert.rejects(llm.completeChat(options),{code:'LLM_CONFIG_INVALID'});
 delete process.env.OPENAI_COMPATIBLE_ENABLE_THINKING;
 const p=llm._internals.completionRequest({...options,wireApi:'chat-completions',jsonHint:true});assert.deepEqual(p.thinking,{type:'disabled'});assert.equal(p.enable_thinking,undefined);
 console.log('PASS: shared explicit thinking control, transport audit, invalid config rejection and legacy provider compatibility');
}finally{global.fetch=originalFetch;if(original===undefined)delete process.env.OPENAI_COMPATIBLE_ENABLE_THINKING;else process.env.OPENAI_COMPATIBLE_ENABLE_THINKING=original;}})().catch(e=>{console.error(e.message);process.exitCode=1;});
