'use strict';
// Run explicitly with the local private credential configuration:
// node --env-file=.env ops/test-live-study-r15.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cq-live-study-r15-')),out=path.join(root,'output/live-r15');fs.mkdirSync(out,{recursive:true});
 assert.equal(require('../lib/llm').runtimeInfo().liveConfigured,true,'须先提供本机私有模型配置');
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});}),base=`http://127.0.0.1:${port}`;
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),LOCAL_ADMIN_AUTH_BYPASS:'true',MAIN_LEARNING_PROTOCOL_FILE:'',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'false'},stdio:['ignore',log,log]});
 let token='';
 const api=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':'B',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();assert.equal(r.status,200,route+': '+v.message);return v.data||v;};
 try{
  for(let i=0;i<150;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  token=(await api('/api/auth/register',{nickname:'合成模型验收',password:'synthetic-live-password'})).token;
  const run=(await api('/api/study/state')).run,doc=(await api('/api/study/consent')).document;
  await api('/api/study/consent',{participantName:'合成模型验收',signature:'合成模型验收',adult:true,consent:true,consentVersion:doc.version,consentHash:doc.hash});
  const items=(await api('/api/study/survey?stage=baseline')).items;await api('/api/study/survey',{stage:'baseline',answers:Object.fromEntries(items.map(q=>[q.id,q.type==='text'?'合成回答':3]))});
  const bank=require('../lib/assessments/functions-limits-registry').forVersion(run.assessmentVersion);
  await api('/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:bank.questions('pre',run.assessmentOrder[0]).map(q=>({questionId:q.id,response:q.type==='short_answer'?'__unknown__':q.answer[0]}))});
  const preferences=await api('/api/learning/learner-preferences');await api('/api/learning/learner-preferences',{answers:preferences.record.answers,expectedRevision:preferences.record.revision});
  const started=Date.now(),r=await fetch(base+'/api/learning/assistant/ask',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Arm':'B',Authorization:'Bearer '+token},body:JSON.stringify({chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'slide',question:'合成系统验收：我把 f(2)=5 理解成把 2 代入规则得到 5，这样理解对吗？请简短解释。'}),signal:AbortSignal.timeout(70000)});
  assert.equal(r.status,200);const stream=(await r.text()).trim().split(/\r?\n/).map(s=>JSON.parse(s)),done=stream.find(e=>e.type==='done');assert(done,'流式接口必须完成');assert.equal(done.fallback,false);assert.equal(done.message.provider,'openai-compatible');assert.equal(done.message.modelAudit.requestedModel,process.env.LEARNING_ASSISTANT_MODEL);
  const history=await api('/api/learning/assistant/history?chapterId=V14-C1&unitId=GH-01-K01&sceneType=slide&conversationId='+done.conversation.id);assert(history.messages.some(m=>m.role==='assistant'&&m.content===done.message.content));
  const result={passed:true,at:new Date().toISOString(),syntheticOnly:true,assessmentVersion:run.assessmentVersion,provider:done.message.provider,modelAudit:done.message.modelAudit,fallback:done.fallback,durationMs:Date.now()-started,text:done.message.content,persisted:true};fs.writeFileSync(path.join(out,'应用模型接口验收.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}fs.closeSync(log);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
