'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const users=Number(process.env.SOAK_USERS||32),duration=Number(process.env.SOAK_MINUTES||30)*60000;
 assert.ok(users>=2&&users<=100&&duration>=1000);
 const dir=fs.mkdtempSync(path.join(root,'output/学生体验修复验收/并发长稳-'));
 const runtime=path.join(dir,'runtime');fs.mkdirSync(runtime);
 for(const file of ['server.js','db.js','lib','data','app','admin','assets','package.json'])fs.cpSync(path.join(root,file),path.join(runtime,file),{recursive:true});
 for(const entry of fs.readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&/\.(html|css|js|json)$/.test(entry.name))fs.copyFileSync(path.join(root,entry.name),path.join(runtime,entry.name));
 const points=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints);
 for(const c of points.flatMap(p=>p.resourceCandidates)){const file='resources/'+c.root+'/'+c.file;fs.mkdirSync(path.dirname(path.join(runtime,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(runtime,file));}
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const base=`http://127.0.0.1:${port}`,dbPath=path.join(dir,'synthetic.db'),log=fs.openSync(path.join(dir,'server.log'),'w');
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:dbPath,MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'false',RATE_LIMIT_MAX:'100000',AUTH_RATE_LIMIT_MAX:'10000'};
 const metrics=[],latencies=[],failures=[],clients=[];let server,requests=0,completed=0,passed=false;
 async function boot(){server=spawn(process.execPath,['-e',`const {monitorEventLoopDelay}=require('node:perf_hooks');const lag=monitorEventLoopDelay({resolution:20});lag.enable();setInterval(()=>{process.send?.({at:Date.now(),memory:process.memoryUsage(),lagP99Ms:lag.percentile(99)/1e6,lagMaxMs:lag.max/1e6});lag.reset();},10000).unref();require('./server.js');`,'soak',String(port)],{cwd:runtime,env,windowsHide:true,stdio:['ignore',log,log,'ipc']});server.on('message',m=>metrics.push(m));for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(server.exitCode!==null)throw Error('隔离服务退出');await sleep(100);}throw Error('隔离服务启动超时');}
 async function stop(){if(server?.exitCode===null){const closed=new Promise(r=>server.once('exit',r));server.kill();await closed;}}
 async function api(client,route,body){const start=performance.now();const res=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(client?.token?{Authorization:'Bearer '+client.token}:{}),'X-Study-Arm':client?.arm||'A'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const json=await res.json();latencies.push(performance.now()-start);requests++;assert.equal(res.status,200,route+' '+res.status+' '+JSON.stringify(json).slice(0,180));return json;}
 const start=Date.now();
 try{
  await boot();
  for(let offset=0;offset<users;offset+=4)await Promise.all(Array.from({length:Math.min(4,users-offset)},async(_,i)=>{const worker=offset+i,c={worker,arm:['A','B','C'][worker%3],sent:0};const reg=await api(c,'/api/auth/register',{nickname:'长稳合成账号'+worker,password:'synthetic-soak-password'});c.token=reg.token;const state=await api(c,'/api/study/state');c.runId=state.data.run.id;clients.push(c);}));
  assert.equal(new Set(clients.map(c=>c.runId)).size,users);
  const until=Date.now()+duration;let lastReport=Date.now();
  await Promise.all(clients.map(async c=>{try{while(Date.now()<until){
   const seq=c.sent,events=[0,1].map(i=>({eventId:`soak-${c.worker}-${seq}-${i}`,type:'soak_validation',payload:{worker:c.worker,sequence:seq,index:i,chapterId:'V14-C1',unitId:'GH-01-K01'}}));
   const results=await Promise.all([api(c,'/api/learning/events',{events}),api(c,'/api/learning/events',{events}),api(c,'/api/study/state'),api(c,'/api/learning/snapshot')]);
   assert.deepEqual(results[0].eventIds,results[1].eventIds,'并发重试必须幂等');assert.equal(results[2].data.run.id,c.runId,'用户轮次不能串号');c.sent++;completed++;
   if(Date.now()-lastReport>60000){lastReport=Date.now();console.log(JSON.stringify({minutes:Math.round((Date.now()-start)/60000),requests,completed,activeUsers:users-failures.filter(f=>f.worker!==undefined).length}));}
   await sleep(5000);
  }}catch(e){const failure={worker:c.worker,message:e.message,cause:e.cause?.code||e.cause?.message,at:new Date().toISOString()};failures.push(failure);console.error(JSON.stringify(failure));}}));
  assert.deepEqual(failures,[]);await stop();
  const SQL=await require('sql.js')(),db=new SQL.Database(fs.readFileSync(dbPath));const rows=db.exec("SELECT user_id,payload FROM events WHERE type='soak_validation'")[0]?.values||[];
  assert.equal(rows.length,clients.reduce((n,c)=>n+c.sent*2,0),'所有已确认写入的事件在重启前应完整持久化');const owners=new Map();
  for(const [id,payload]of rows){const worker=JSON.parse(payload).worker;if(owners.has(worker))assert.equal(id,owners.get(worker),'事件账号隔离');else owners.set(worker,id);}
  assert.equal(new Set(owners.values()).size,users);db.close();
  await boot();for(const c of clients)assert.equal((await api(c,'/api/study/state')).data.run.id,c.runId);passed=true;
 }catch(e){failures.push({phase:'验收',message:e.message});throw e;}finally{
  await stop();fs.closeSync(log);latencies.sort((a,b)=>a-b);
  const report={passed,users,durationMs:Date.now()-start,requests,completed,failures,latencyMs:{p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.floor(latencies.length*.95)],p99:latencies[Math.floor(latencies.length*.99)],max:latencies.at(-1)},clients:clients.map(({token,...c})=>c),metrics};
  fs.writeFileSync(path.join(dir,'并发长稳结果.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dir,...report,clients:undefined,metrics:undefined}));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
