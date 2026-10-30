'use strict';
// Opt-in, synthetic curriculum only. Uses the configured provider; never purchases or switches services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../app/shared/learner-preferences'),controls=require('../lib/research-controls'),goals=require('../lib/support-goals');
async function main(){
 assert.equal(process.env.LIVE_MODEL_SMOKE,'1','Requires LIVE_MODEL_SMOKE=1');
 assert.ok(process.env.LLM_CONFIG_FILE,'Use the existing server-side model configuration');
 const llm=require('../lib/llm'),info=llm.runtimeInfo();
 assert.equal(llm.provider(),'openai-compatible');
 const model=process.env.LEARNING_ASSISTANT_MODEL||info.model;
 const directory=path.resolve(process.env.LIVE_CONFIGURATION_OUTPUT||'output/live-learner-configurations-'+Date.now());
 fs.mkdirSync(directory,{recursive:true});const results=[];
 for(const scope of Object.keys(goals.CURRICULUM))for(const value of ['hint','guided','example']){
  const answers=C.defaults();for(const a of Object.values(answers))a.reason='try';answers.D3.value=value;
  const profile=C.profile(answers,controls.defaults),need=goals.validateNeed({need:'concept',confirmed:true,note:'合成课程验收：请帮助我理解当前知识点，保留让我自己思考和作答的部分。'}),plan=goals.selectPlan(need,profile);
  const output=await goals.generateSupport({scope,need,plan},{live:true,model,complete:llm.completeChat});
  results.push({scope,value,level:plan.knowledgeScaffoldLevel,message:output.message,nextStep:output.nextStep,audit:output.audit});
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({synthetic:true,contractVersion:C.version,contentVersion:goals.VERSION,expected:18,completed:results.length,realSuccess:results.filter(r=>!r.audit.fallback).length,fallback:results.filter(r=>r.audit.fallback).length,reviewStatus:'requires_blind_content_coding_not_human_perceptibility_evidence',results},null,2));
  console.log(JSON.stringify({scope,value,fallback:output.audit.fallback,failure:output.audit.failure||null,latencyMs:output.audit.latencyMs}));
 }
 console.log(JSON.stringify({directory,completed:results.length,realSuccess:results.filter(r=>!r.audit.fallback).length,fallback:results.filter(r=>r.audit.fallback).length}));
 if(results.some(r=>r.audit.fallback))process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
