'use strict';
// Explicit live diagnostic: synthetic prompts only; never copies credentials to output.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert(process.argv.includes('--live'));
const llm=require('../lib/llm'),runtime=llm.runtimeInfo();assert(runtime.liveConfigured);
if(process.env.PROBE_MODEL)runtime.model=process.env.PROBE_MODEL;
let prompts=require('../output/r17-latency/prompt-baseline.json');
if(process.env.PROBE_PROMPT==='compact'){
 const a=require('../lib/learning-assistant'),index=a.buildCourseContextIndex(require('../data/multi-scene-learning-route.json'));
 prompts=prompts.map(({unitId,question})=>({unitId,question,...a.buildAssistantPrompt({resolved:a.resolveAssistantContext({index,chapterId:'V14-C1',unitId,sceneType:'slide'}),question})}));
}
const apiKey=process.env.OPENAI_COMPATIBLE_API_KEY||llm._internals.readLlmConfigFile(process.env.OPENAI_COMPATIBLE_CONFIG_FILE||process.env.LLM_CONFIG_FILE||process.env.OPENAI_COMPATIBLE_API_KEY_FILE||process.env.LLM_API_KEY_FILE).apiKey;
const url=process.env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/,'')+'/chat/completions';
const count=Number(process.env.PROBE_USERS||12),results=[];
const out=path.resolve('output/r17-latency/transport-'+Date.now()+'.json');
async function call(stream,i){
 const p=prompts[i%prompts.length],at=performance.now();
 const row={stream,i,unitId:p.unitId,requestedModel:runtime.model};
 try{
  const res=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify({model:runtime.model,messages:[{role:'system',content:p.system},{role:'user',content:p.user}],temperature:.2,max_tokens:700,stream,...(stream?{stream_options:{include_usage:true}}:{})}),signal:AbortSignal.timeout(60000)});
  row.headersMs=performance.now()-at;row.status=res.status;
  assert(res.ok,'provider HTTP '+res.status);
  if(!stream){const j=await res.json();row.text=j.choices?.[0]?.message?.content;row.reportedModel=j.model;row.usage=j.usage;}
  else{
   let buffer='',text='',done=false;const decoder=new TextDecoder();
   for await(const chunk of res.body){buffer+=decoder.decode(chunk,{stream:true});let end;
    while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(data==='[DONE]'){done=true;continue;}const j=JSON.parse(data);if(j.model)row.reportedModel=j.model;if(j.usage)row.usage=j.usage;
     const delta=j.choices?.[0]?.delta?.content;if(delta){row.firstTokenMs??=performance.now()-at;text+=delta;}if(j.choices?.[0]?.finish_reason)row.finishReason=j.choices[0].finish_reason;
    }
   }row.text=text;row.done=done;assert(done&&text,'incomplete stream');
  }
  assert.equal(row.reportedModel,runtime.model);
 }catch(e){row.error=llm._internals.safeProviderErrorText(e.message,[apiKey]);}
 row.totalMs=performance.now()-at;return row;
}
function stats(rows,key){const a=rows.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);return {p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};}
(async()=>{for(const stream of process.argv.includes('--json-only')?[false]:[true,false]){const rows=await Promise.all(Array.from({length:count},(_,i)=>call(stream,i)));results.push(...rows);fs.writeFileSync(out,JSON.stringify({count,prompt:process.env.PROBE_PROMPT||'baseline',model:runtime.model,results},null,2));console.log(JSON.stringify({stream,success:rows.filter(r=>!r.error).length,totalMs:stats(rows,'totalMs'),firstTokenMs:stats(rows,'firstTokenMs'),out}));}})().catch(e=>{console.error(e.message);process.exitCode=1;});
