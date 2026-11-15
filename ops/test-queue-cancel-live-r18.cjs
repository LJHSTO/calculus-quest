'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.STUDENT_UX_BASE_URL;assert(base&&process.env.SYNTHETIC_STUDY_DIR);assert.equal(process.env.LLM_MAX_CONCURRENT,'1','This diagnostic deliberately creates a one-slot queue only on an isolated server');
const out=fs.mkdtempSync(path.resolve('output')+'/r18-queue-'),calls=[],clients=[],model=require('../lib/llm').runtimeInfo().model;
async function api(c,url,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':c?.arm||'A',...(c?.token?{Authorization:'Bearer '+c.token}:{})},body:body?JSON.stringify(body):undefined});const v=await r.json();assert.equal(r.status,200,url+': '+v.message);return v;}
function ask(c,question,{cancelQueued=false,started}={}){
 const controller=new AbortController(),row={arm:c.arm,question,events:[]},at=performance.now();calls.push(row);
 const promise=(async()=>{try{const r=await fetch(base+'/api/learning/assistant/ask',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Arm':c.arm,Authorization:'Bearer '+c.token},body:JSON.stringify({unitId:'GH-01-K01',chapterId:'V14-C1',sceneType:'slide',question}),signal:controller.signal});assert(r.ok);
  let buffer='';const decoder=new TextDecoder();for await(const chunk of r.body){buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const event=JSON.parse(line);row.events.push({type:event.type,phase:event.phase,position:event.position,ms:performance.now()-at});
   if(event.type==='meta')row.conversationId=event.conversationId;
   if(event.type==='status'&&event.phase==='generating')started?.();
   if(event.type==='status'&&event.phase==='queued'&&cancelQueued){row.cancelAtMs=performance.now()-at;controller.abort();}
   if(event.type==='done'){row.text=event.message.content;row.audit=event.message.modelAudit;row.fallback=event.fallback;}
  }}
 }catch(e){if(controller.signal.aborted)row.cancelled=true;else throw e;}finally{row.totalMs=performance.now()-at;}})();return promise;
}
(async()=>{for(const arm of ['A','B','C']){const c={arm};c.token=(await api(c,'/api/auth/register',{nickname:'排队取消'+arm+Date.now(),password:'Synthetic-r18-password'})).token;const study=(await api(c,'/api/study/state')).data.run;c.runId=study.id;
 const survey=(await api(c,'/api/study/survey?stage=baseline')).data;await api(c,'/api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,q.type==='text'?'合成回答':3]))});
 const route=(await api(c,'/api/course/multi-scene-learning-route')).chapters.find(ch=>ch.id==='V14-C1');await api(c,'/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:route.flow.preQuiz.questions.map(q=>({questionId:q.id,response:'__unknown__'}))});
 const pref=(await api(c,'/api/learning/learner-preferences')).data;if(arm==='A')await api(c,'/api/study/confirm-defaults',{});else await api(c,'/api/learning/learner-preferences',{answers:pref.record.answers,expectedRevision:pref.record.revision});clients.push(c);
 }
 let signal;const started=new Promise(r=>signal=r);
 const first=ask(clients[0],'请解释f(x)=(x²−4)/(x−2)与g(x)=x+2是否相同。分开讨论允许输入、约分、图像空点、补f(2)=4或5后的变化，最后给一个使用不同数字的完整例子。',{started:signal});await started;
 await ask(clients[1],'我暂时不需要这次解释。',{cancelQueued:true});
 const third=ask(clients[2],'接着比较f(x)=x²，输入−2和2都输出4，与输入2同时输出4和5有什么区别？分别说明是否是函数。');await Promise.all([first,third]);
 assert(calls[1].cancelled&&!calls[1].audit);assert(!calls[1].events.some(e=>e.phase==='generating'));
 assert.equal(calls[2].events.find(e=>e.phase==='queued')?.position,1,'cancelled waiter does not consume queue position');
 for(const row of [calls[0],calls[2]]){assert.equal(row.fallback,false);assert.equal(row.audit.requestedModel,model);assert.equal(row.audit.reportedModel,model);}
 const exported=(await api(null,'/api/admin/three-arm/export')).data;
 const events=exported.tables.events.filter(e=>e.user_id===clients[1].runId).map(e=>JSON.parse(e.payload)).filter(e=>e.eventType==='assistant_request_finished');assert.equal(events.length,1);assert.equal(events[0].data.status,'cancelled');assert.equal(events[0].data.executionMs,0);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,scope:'isolated one-slot queue, three users, two real completed replies and one queue cancellation; not production capacity',model,calls,cancellationEvidence:events[0]},null,2));console.log(JSON.stringify({out,passed:true,calls:calls.map(r=>({arm:r.arm,totalMs:r.totalMs,queueMs:r.audit?.queueMs,cancelled:r.cancelled}))}));
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.message,calls},null,2));console.error(e);process.exitCode=1;});
