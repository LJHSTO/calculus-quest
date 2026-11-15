'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=process.env.CLASSROOM_LOAD_URL,users=Number(process.env.CLASSROOM_LOAD_USERS||100);
const ordinaryOnly=process.argv.includes('--ordinary-only');
const trafficProfile=process.env.CLASSROOM_LOAD_PROFILE||'simultaneous';
assert.ok(['simultaneous','classroom'].includes(trafficProfile));
const arrivalMs=Number(process.env.CLASSROOM_LOAD_ARRIVAL_MS||2000);
assert.ok(Number.isFinite(arrivalMs)&&arrivalMs>=100&&arrivalMs<=30000);
const expectedModel=process.env.CLASSROOM_LOAD_EXPECT_MODEL||require('../lib/llm').runtimeInfo().model;
assert.ok(base&&process.env.CLASSROOM_LOAD_ALLOW_SYNTHETIC==='1','必须显式指定隔离服务并允许合成账号');
assert.ok(users>0&&users<=100);
const root=path.resolve(__dirname,'..'),parent=path.join(root,'output/学生体验修复验收');fs.mkdirSync(parent,{recursive:true});
const dir=fs.mkdtempSync(path.join(parent,'真实班级并发-'));
process.env.CLASSROOM_LOAD_MANIFEST_SHA ||= crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/learning-runtime.json'))).digest('hex');
const clients=[],http=[],models=[],failures=[],health=[],run=Date.now().toString(36),wait=ms=>new Promise(r=>setTimeout(r,ms));
const cases=[['GH-01-K01','两个输入得到同一个输出，为什么仍然可能是函数？'],['GH-01-K02','为什么横坐标是2、纵坐标是3时不能写成(3,2)？'],['GH-01-K03','两个观测点的输出上升，能断言整个区间都上升吗？'],['GH-02-K01','当前讲解这张数表应先看x还是f(x)？它们分别靠近哪个数？'],['GH-02-K02','左侧趋近4、右侧趋近7，判断双侧极限时先看什么？'],['GH-02-K03','点上函数值存在，为什么还不能直接说连续？']];
function save(){fs.writeFileSync(path.join(dir,'班级并发结果.json'),JSON.stringify({users,base,trafficProfile,arrivalMs,synthetic:true,manifestSha256:process.env.CLASSROOM_LOAD_MANIFEST_SHA,startedAt:started,finishedAt:new Date().toISOString(),http,models,failures,health,clients:clients.map(({token,password,...c})=>c)},null,2));}
function distribution(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};}
async function readAnswer(response,at){
 const events=[],timing={statusEvents:[]},decoder=new TextDecoder();let buffer='';
 if(!response.ok)return {body:await response.text(),events,timing};
 function line(raw){if(!raw.trim())return;const event=JSON.parse(raw);events.push(event);const ms=performance.now()-at;timing.firstEventMs??=ms;
  if(event.type==='delta'&&event.delta)timing.firstAnswerMs??=ms;
  if(event.type==='status')timing.statusEvents.push({phase:event.phase,position:event.position,ms});
 }
 for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end));buffer=buffer.slice(end+1);}}
 buffer+=decoder.decode();if(buffer.trim())line(buffer);return {events,timing};
}
async function api(c,route,body){const at=performance.now();let r,json;try{r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':c?.arm||'A',...(c?.token?{Authorization:'Bearer '+c.token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});json=await r.json();}catch(e){http.push({worker:c?.worker,path:route,status:0,ms:performance.now()-at,error:e.name,cause:e.cause?.code});throw e;}http.push({worker:c?.worker,path:route,status:r.status,ms:performance.now()-at,...(!r.ok?{code:json.code,message:json.message}:{})});assert.equal(r.status,200,route+' '+r.status+' '+(json.code||json.message));return json;}
async function cohort(tasks){const settled=await Promise.allSettled(tasks),failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
const started=new Date().toISOString();let monitor,ordinaryMonitor;const ordinaryPending=new Set();
async function main(){try{
 const first=await api(null,'/api/health');
 if(process.env.CLASSROOM_LOAD_EXPECT_VERSION)assert.equal(first.appVersion,process.env.CLASSROOM_LOAD_EXPECT_VERSION);
 else assert.match(first.appVersion,/(?:student-ux|functions-limits.*r11|r11-diagnostic)/);
 for(let offset=0;offset<users;offset+=5){await cohort(Array.from({length:Math.min(5,users-offset)},async(_,i)=>{
  const worker=offset+i,c={worker,arm:['A','B','C'][worker%3],nickname:`班级合成${run}${worker}`,unitId:cases[worker%6][0]};
  c.token=(await api(c,'/api/auth/register',{nickname:c.nickname,password:c.password=crypto.randomBytes(16).toString('hex')})).token;assert.ok(c.token);
  const survey=(await api(c,'/api/study/survey?stage=baseline')).data;
  await api(c,'/api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,q.type==='text'?'合成回答':3]))});
  const course=(await api(c,'/api/course/multi-scene-learning-route')).chapters.find(ch=>ch.id==='V14-C1');
  await api(c,'/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:course.flow.preQuiz.questions.map(q=>({questionId:q.id,response:q.type==='multiple'?['__unknown__']:'__unknown__'}))});
  const ready=(await api(c,'/api/learning/learner-preferences')).data;c.runId=ready.study.id;
  if(c.arm==='A')await api(c,'/api/study/confirm-defaults',{});else await api(c,'/api/learning/learner-preferences',{answers:ready.record.answers,expectedRevision:ready.record.revision||1});
  clients.push(c);
 }));save();console.log('已准备合成账号 '+clients.length+'/'+users);}
 assert.equal(new Set(clients.map(c=>c.runId)).size,users);console.log('完成 '+users+' 个独立合成账号的前测和配置');save();
 for(let round=0;round<3;round++){
  await cohort(clients.map(async c=>{const state=await api(c,'/api/study/state');assert.equal(state.data.run.id,c.runId);await cohort([api(c,'/api/learning/snapshot'),api(c,'/api/learning/events',{events:[{eventId:`class-${run}-${c.worker}-${round}`,type:'classroom_load_validation',payload:{worker:c.worker,round,chapterId:'V14-C1',unitId:c.unitId}}]})]);}));
  console.log(users+' 人普通学习同步第 '+(round+1)+' 轮完成');await wait(1500);
 }
 monitor=setInterval(async()=>{const at=performance.now();try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000)});health.push({at:new Date().toISOString(),status:r.status,ms:performance.now()-at});}catch(e){health.push({at:new Date().toISOString(),error:e.name});}},2000);
 await cohort(clients.map(async c=>{const decision=await api(c,'/api/learning/assistant/intervention',{chapterId:'V14-C1',unitId:c.unitId,sceneType:'slide',signal:{kind:'quiet_dwell',dwellSeconds:600},contextRef:{kind:'unit',scope:'lesson'}});assert.equal(decision.decision.action,'stay_silent','没有困难证据时不应主动介入');}));
 console.log(users+' 人同时评估主动介入，均保持安静');
 if(process.argv.includes('--browser'))await require('./frontend-classroom-r16.cjs')({clients,base,dir});
 if(ordinaryOnly){
  clearInterval(monitor);monitor=null;
  const latency=http.filter(r=>r.status===200).map(r=>r.ms).sort((a,b)=>a-b);
  const summary={users,scope:'普通请求与持久化并发，不含真实模型吞吐',ordinaryRequests:http.length,ordinaryFailures:http.filter(r=>r.status!==200).length,latencyMs:{p50:latency[Math.ceil(latency.length*.5)-1],p95:latency[Math.ceil(latency.length*.95)-1],max:latency.at(-1)},passed:http.every(r=>r.status===200),manifestSha256:process.env.CLASSROOM_LOAD_MANIFEST_SHA};
  summary.healthErrors=health.filter(h=>h.error||h.status!==200).length;summary.passed&&=summary.healthErrors===0;
  fs.writeFileSync(path.join(dir,'班级并发摘要.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));if(!summary.passed)process.exitCode=1;return;
 }
 clients.sort((a,b)=>a.worker-b.worker);
 const requestedCount=trafficProfile==='classroom'?users+Math.min(6,users)+Math.min(12,users):users;
 async function requestModel(c,phase,scheduledAt=performance.now()){
  const at=performance.now(),startedAt=new Date().toISOString(),kind=phase==='classroom'&&c.worker%10===9?'structured-help':'dialogue';
  const question=cases[c.worker%6][1]+`（合成核验编号${c.worker}-${phase}）`;
  const requestBody=kind==='structured-help'?{action:'report',scope:c.unitId,unitId:c.unitId,sceneType:'slide',need:'concept',confirmed:true,note:question,requestId:crypto.randomUUID()}:{chapterId:'V14-C1',unitId:c.unitId,sceneType:'slide',question,conversationId:c.conversationId};
  try{const response=await fetch(base+(kind==='structured-help'?'/api/learning/support-cycle':'/api/learning/assistant/ask'),{method:'POST',headers:{'Content-Type':'application/json','X-Study-Arm':c.arm,Authorization:'Bearer '+c.token},body:JSON.stringify(requestBody),signal:AbortSignal.timeout(360000)});
   let row={worker:c.worker,arm:c.arm,phase,kind,status:response.status,arrivalLagMs:at-scheduledAt,startedAt,responseHeadersAt:new Date().toISOString()};
   if(kind==='structured-help'){
    const json=await response.json(),cycle=json.data?.cycle,content=cycle?.content;
    row={...row,ms:performance.now()-at,fallback:content?.audit?.fallback??null,provider:content?.audit?.provider,modelAudit:content?.audit?.model,text:content?.message,nextStep:content?.nextStep,supportAudit:content?.audit,cycleId:cycle?.id,cycleStatus:cycle?.status,errorCode:json.code};
    c.cycleId=cycle?.id;
   }else{
    const {body,events,timing}=await readAnswer(response,at),done=events.find(e=>e.type==='done');
    row={...row,ms:performance.now()-at,...timing,fallback:done?.fallback??null,provider:done?.message?.provider,modelAudit:done?.message?.modelAudit,text:done?.message?.content,conversationId:done?.conversation?.id};
    if(!response.ok)row.errorCode=JSON.parse(body).code;
    c.conversationId=row.conversationId;(c.questions||=[]).push(question);
   }
   models.push(row);
  }catch(e){models.push({worker:c.worker,arm:c.arm,phase,kind,ms:performance.now()-at,error:e.name,code:e.cause?.code});}
  save();console.log('模型完成 '+models.length+'/'+requestedCount+' ['+phase+'/'+kind+'] '+Math.round(models.at(-1).ms)+' ms');
 }
 if(trafficProfile==='classroom'){
  let ordinaryTick=0;
  ordinaryMonitor=setInterval(()=>{
   const c=clients[ordinaryTick++%clients.length];
   const task=Promise.allSettled([api(c,'/api/study/state'),api(c,'/api/learning/events',{events:[{eventId:`during-${run}-${ordinaryTick}`,type:'classroom_load_validation',payload:{worker:c.worker,round:ordinaryTick,chapterId:'V14-C1',unitId:c.unitId}}]})]);
   ordinaryPending.add(task);task.finally(()=>ordinaryPending.delete(task));
  },250);
  console.log('先测单人连续提问，再测12人集中提问，最后100人每 '+arrivalMs+' ms 陆续发问；普通学习请求持续运行');
  for(const c of clients.slice(0,6))await requestModel(c,'solo');
  await Promise.all(clients.slice(0,12).map(c=>requestModel(c,'burst12')));
  const arrivalStart=performance.now();
  await Promise.all(clients.map(async(c,i)=>{const scheduledAt=arrivalStart+i*arrivalMs;await wait(Math.max(0,scheduledAt-performance.now()));await requestModel(c,'classroom',scheduledAt);}));
  clearInterval(ordinaryMonitor);ordinaryMonitor=null;await Promise.all(ordinaryPending);
 }else{
  console.log('同时开始 '+users+' 个真实模型请求');
  await Promise.all(clients.map(c=>requestModel(c,'simultaneous')));
 }
 clearInterval(monitor);monitor=null;
 for(let offset=0;offset<clients.length;offset+=5)await cohort(clients.slice(offset,offset+5).map(async c=>{
  if(!c.conversationId)return;
  const history=await api(c,`/api/learning/assistant/history?chapterId=V14-C1&unitId=${c.unitId}&sceneType=slide&conversationId=${c.conversationId}`);
  assert.ok(c.questions.every(q=>history.messages.some(m=>m.role==='user'&&m.content===q)),'本人的问题必须持久化');
  assert.ok(history.messages.filter(m=>m.role==='user').every(m=>c.questions.includes(m.content)),'历史不能串入其他合成账号');
 }));
 for(const c of clients.filter(c=>c.cycleId)){
  const state=await api(c,'/api/learning/support-cycle');
  assert.ok(state.data.cycles.some(s=>s.id===c.cycleId),'本人的结构化帮助必须持久化');
  assert.ok(state.data.cycles.every(s=>s.scope===c.unitId),'结构化帮助不能串入其他知识点');
 }
 const successful=models.filter(m=>m.status===200&&!m.fallback&&m.provider==='openai-compatible'&&m.modelAudit?.requestedModel===expectedModel&&m.modelAudit?.reportedModel===expectedModel);const sorted=successful.map(m=>m.ms).sort((a,b)=>a-b),ordinary=http.filter(r=>r.status===200).map(r=>r.ms).sort((a,b)=>a-b);
 const summary={users,expectedModel,ordinaryRequests:http.length,ordinaryFailures:http.filter(r=>r.status!==200).length,ordinaryLatencyMs:{p50:ordinary[Math.ceil(ordinary.length*.5)-1],p95:ordinary[Math.ceil(ordinary.length*.95)-1],max:ordinary.at(-1)},realModelSuccess:successful.length,fallback:models.filter(m=>m.fallback).length,modelErrors:models.filter(m=>m.error||m.status!==200).length,modelLatencyMs:{p50:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)},healthErrors:health.filter(h=>h.error||h.status!==200).length};
 summary.passed=summary.realModelSuccess===requestedCount&&summary.ordinaryFailures===0&&summary.healthErrors===0;
 summary.allCallsLatencyMs=distribution(models.map(r=>r.ms));
 summary.successLatencyScope='真实模型成功回复；完整请求时延（含兜底与失败）另列 allCallsLatencyMs';
 summary.failureCodes=Object.fromEntries([...new Set(models.map(r=>r.modelAudit?.failureCode||r.supportAudit?.failureCode||r.errorCode||r.error).filter(Boolean))].map(code=>[code,models.filter(r=>(r.modelAudit?.failureCode||r.supportAudit?.failureCode||r.errorCode||r.error)===code).length]));
 summary.trafficProfile=trafficProfile;summary.requestedModelCalls=requestedCount;summary.arrivalMs=arrivalMs;
 summary.profiles=Object.fromEntries([...new Set(models.map(r=>r.phase))].map(phase=>{
  const rows=successful.filter(r=>r.phase===phase);
  return [phase,{requests:models.filter(r=>r.phase===phase).length,realSuccess:rows.length,latencyMs:distribution(rows.map(r=>r.ms)),allCallsLatencyMs:distribution(models.filter(r=>r.phase===phase).map(r=>r.ms)),queueMs:distribution(rows.map(r=>r.modelAudit?.queueMs)),executionMs:distribution(rows.map(r=>r.modelAudit?.executionMs)),arrivalLagMs:distribution(rows.map(r=>r.arrivalLagMs))}];
 }));
 summary.byKind=Object.fromEntries([...new Set(models.map(r=>r.kind))].map(kind=>[kind,{success:successful.filter(r=>r.kind===kind).length,latencyMs:distribution(successful.filter(r=>r.kind===kind).map(r=>r.ms))}]));
 summary.scheduler={concurrency:Number(process.env.LLM_MAX_CONCURRENT||24),maxPending:Number(process.env.LLM_MAX_PENDING||128)};
 summary.queueLatencyMs=distribution(successful.map(r=>r.modelAudit?.queueMs));
 summary.executionLatencyMs=distribution(successful.map(r=>r.modelAudit?.executionMs));
 summary.firstAnswerMs=distribution(successful.map(r=>r.firstAnswerMs));
 summary.promptTokens=distribution(successful.map(r=>r.modelAudit?.usage?.prompt_tokens));
 summary.completionTokens=distribution(successful.map(r=>r.modelAudit?.usage?.completion_tokens));
 summary.byArm=Object.fromEntries(['A','B','C'].map(arm=>[arm,{success:successful.filter(r=>r.arm===arm).length,models:[...new Set(successful.filter(r=>r.arm===arm).map(r=>r.modelAudit.reportedModel))]}]));
 summary.manifestSha256=process.env.CLASSROOM_LOAD_MANIFEST_SHA;
 fs.writeFileSync(path.join(dir,'班级并发摘要.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
 if(!summary.passed)process.exitCode=1;
}catch(e){failures.push({message:e.message,error:e.name});process.exitCode=1;console.error(e.message);}finally{clearInterval(monitor);clearInterval(ordinaryMonitor);await Promise.all(ordinaryPending);save();console.log('并发证据：'+dir);}}
main();
