'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const course=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
const base=process.env.CLASSROOM_LOAD_URL,users=Number(process.env.CLASSROOM_LOAD_USERS||50);
assert.ok(base&&process.env.CLASSROOM_LOAD_ALLOW_SYNTHETIC==='1','必须显式指定隔离服务并允许合成账号');
assert.ok(users>0&&users<=50);
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(root,'output/学生体验修复验收/真实班级并发-'));
const clients=[],http=[],models=[],failures=[],health=[],run=Date.now().toString(36),wait=ms=>new Promise(r=>setTimeout(r,ms));
const cases=[['GH-01-K01','两个输入得到同一个输出，为什么仍然可能是函数？'],['GH-01-K02','为什么横坐标是2、纵坐标是3时不能写成(3,2)？'],['GH-01-K03','两个观测点的输出上升，能断言整个区间都上升吗？'],['GH-02-K01','当前讲解这张数表应先看x还是f(x)？它们分别靠近哪个数？'],['GH-02-K02','左侧趋近4、右侧趋近7，判断双侧极限时先看什么？'],['GH-02-K03','点上函数值存在，为什么还不能直接说连续？']];
function save(){fs.writeFileSync(path.join(dir,'班级并发结果.json'),JSON.stringify({users,base,synthetic:true,manifestSha256:process.env.CLASSROOM_LOAD_MANIFEST_SHA,startedAt:started,finishedAt:new Date().toISOString(),http,models,failures,health,clients:clients.map(({token,...c})=>c)},null,2));}
async function api(c,route,body){const at=performance.now();let r,json;try{r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Study-Arm':c?.arm||'A',...(c?.token?{Authorization:'Bearer '+c.token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});json=await r.json();}catch(e){http.push({worker:c?.worker,path:route,status:0,ms:performance.now()-at,error:e.name,cause:e.cause?.code});throw e;}http.push({worker:c?.worker,path:route,status:r.status,ms:performance.now()-at,...(!r.ok?{code:json.code,message:json.message}:{})});assert.equal(r.status,200,route+' '+r.status+' '+(json.code||json.message));return json;}
async function cohort(tasks){const settled=await Promise.allSettled(tasks),failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
const started=new Date().toISOString();let monitor;
async function main(){try{
 const first=await api(null,'/api/health');assert.match(first.appVersion,/student-ux/);
 for(let offset=0;offset<users;offset+=5){await cohort(Array.from({length:Math.min(5,users-offset)},async(_,i)=>{
  const worker=offset+i,c={worker,arm:['A','B','C'][worker%3],nickname:`班级合成${run}${worker}`,unitId:cases[worker%6][0]};
  c.token=(await api(c,'/api/auth/register',{nickname:c.nickname,password:crypto.randomBytes(16).toString('hex')})).token;assert.ok(c.token);
  const survey=(await api(c,'/api/study/survey?stage=baseline')).data;
  await api(c,'/api/study/survey',{stage:'baseline',answers:Object.fromEntries(survey.items.map(q=>[q.id,3]))});
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
 console.log('同时开始 '+users+' 个真实模型请求');
 await Promise.all(clients.map(async c=>{
  const at=performance.now();c.question=cases[c.worker%6][1]+`（合成核验编号${c.worker}）`;
  try{const response=await fetch(base+'/api/learning/assistant/ask',{method:'POST',headers:{'Content-Type':'application/json','X-Study-Arm':c.arm,Authorization:'Bearer '+c.token},body:JSON.stringify({chapterId:'V14-C1',unitId:c.unitId,sceneType:'slide',question:c.question}),signal:AbortSignal.timeout(70000)});
   const body=await response.text(),events=response.ok?body.trim().split(/\r?\n/).map(line=>JSON.parse(line)):[],done=events.find(e=>e.type==='done');
   const row={worker:c.worker,status:response.status,ms:performance.now()-at,fallback:done?.fallback??null,provider:done?.message?.provider,modelAudit:done?.message?.modelAudit,text:done?.message?.content,conversationId:done?.conversation?.id};
   if(!response.ok)row.errorCode=JSON.parse(body).code;models.push(row);c.conversationId=row.conversationId;
  }catch(e){models.push({worker:c.worker,ms:performance.now()-at,error:e.name,code:e.cause?.code});}
  save();console.log('模型完成 '+models.length+'/'+users+'，最近耗时 '+Math.round(models.at(-1).ms)+' ms');
 }));
 clearInterval(monitor);monitor=null;
 for(let offset=0;offset<clients.length;offset+=5)await cohort(clients.slice(offset,offset+5).map(async c=>{
  if(!c.conversationId)return;
  const history=await api(c,`/api/learning/assistant/history?chapterId=V14-C1&unitId=${c.unitId}&sceneType=slide&conversationId=${c.conversationId}`);
  assert.ok(history.messages.some(m=>m.role==='user'&&m.content===c.question),'本人的问题必须持久化');
  assert.ok(history.messages.filter(m=>m.role==='user').every(m=>m.content===c.question),'历史不能串入其他合成账号');
 }));
 const successful=models.filter(m=>m.status===200&&!m.fallback&&m.provider==='openai-compatible'&&m.modelAudit?.requestedModel==='gpt-5.4-2026-03-05'&&m.modelAudit?.reportedModel==='gpt-5.4-2026-03-05');const sorted=successful.map(m=>m.ms).sort((a,b)=>a-b),ordinary=http.filter(r=>r.status===200).map(r=>r.ms).sort((a,b)=>a-b);
 const summary={users,ordinaryRequests:http.length,ordinaryFailures:http.filter(r=>r.status!==200).length,ordinaryLatencyMs:{p50:ordinary[Math.ceil(ordinary.length*.5)-1],p95:ordinary[Math.ceil(ordinary.length*.95)-1],max:ordinary.at(-1)},realModelSuccess:successful.length,fallback:models.filter(m=>m.fallback).length,modelErrors:models.filter(m=>m.error||m.status!==200).length,modelLatencyMs:{p50:sorted[Math.ceil(sorted.length*.5)-1],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)},healthErrors:health.filter(h=>h.error||h.status!==200).length};
 summary.passed=summary.realModelSuccess===users&&summary.ordinaryFailures===0&&summary.healthErrors===0;
 summary.manifestSha256=process.env.CLASSROOM_LOAD_MANIFEST_SHA;
 fs.writeFileSync(path.join(dir,'班级并发摘要.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
 if(!summary.passed)process.exitCode=1;
}catch(e){failures.push({message:e.message,error:e.name});process.exitCode=1;console.error(e.message);}finally{clearInterval(monitor);save();console.log('并发证据：'+dir);}}
main();
