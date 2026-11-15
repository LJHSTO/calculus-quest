'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),os=require('node:os');
const {spawn}=require('node:child_process'),registry=require('../lib/assessments/functions-limits-registry');
const root=path.resolve(__dirname,'..');
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'study-production-r21-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=`http://127.0.0.1:${port}`,admin='synthetic-production-r21-admin';
 const env={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:admin,LOCAL_ADMIN_AUTH_BYPASS:'false',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',SENTRY_DSN:'',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'explicit-consent',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r16',RESEARCH_CONTROLS_ENABLED:'false',RESEARCH_CONTROLS_DEMO:'false',LEARNER_ONBOARDING_REQUIRED:'false',RATE_LIMIT_MAX:'10000'};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});
 const api=async(actor,route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(actor?.token?{Authorization:`Bearer ${actor.token}`} :{}),...(actor?.entry?{'X-Study-Arm':actor.entry}:{}),...(actor?.runId&&!route.startsWith('/api/auth/')?{'X-Study-Run':actor.runId}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};};
 const ok=r=>{assert.equal(r.status,200,r.message);return r;};
 const register=async entry=>({entry,token:ok(await api(null,'/api/auth/register',{nickname:'权限合成'+entry+Date.now(),password:'Synthetic-r21-password'})).token});
 try{
  let ready=false;for(let i=0;i<150;i++){if(server.exitCode!==null)throw Error('隔离服务退出，请查看 '+path.join(dir,'server.log'));try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
  const ordinary=await register('');assert.equal((await api(ordinary,'/api/learning/support-cycle')).status,403,'普通账号不能借此解锁支持');
  const protocol=ok(await api({token:admin},'/api/admin/three-arm/baseline',{reviewer:'仅本机合成测试',confirmed:true})).data;
  assert.equal(protocol.reviewMinimumSeconds,90,'三组共用90秒最低阅读时间');
  assert.equal(protocol.runtime.proactiveDefinition.modelRuntime.assistantDailyQuota,120,'协议指纹中的默认额度与运行额度一致');
  for(const entry of ['A','B','C','assigned']){
   const actor=await register(entry);
   if(entry==='assigned'){
    const doc=ok(await api(actor,'/api/study/enrollment-document')).data.document;
    ok(await api(actor,'/api/study/enroll',{consent:true,adult:true,participantName:'合成测试者',signature:'合成测试者',consentVersion:doc.version,consentHash:doc.hash}));
   }
   const run=ok(await api(actor,'/api/study/state')).data.run;actor.runId=run.id;
   const before=ok(await api(actor,'/api/learning/learner-preferences')).data;assert.equal(before.enabled,false);
   const items=ok(await api(actor,'/api/study/survey?stage=baseline')).data.items;
   ok(await api(actor,'/api/study/survey',{stage:'baseline',answers:Object.fromEntries(items.map(q=>[q.id,q.type==='text'?'合成回答':3]))}));
   const bank=registry.forVersion(run.assessmentVersion);
   ok(await api(actor,'/api/learning/quiz/submit',{chapterId:'V14-C1',unitId:'V14-C1-pre',phase:'pre',answers:bank.questions('pre',run.assessmentOrder[0]).map(q=>({questionId:q.id,response:'__unknown__'}))}));
   const prefs=ok(await api(actor,'/api/learning/learner-preferences')).data;
   assert.equal(prefs.enabled,run.arm!=='A',`${entry}在生产环境中保留正确的学习配置权限`);
   prefs.record.answers.D2.value='quiet';
   const saved=await api(actor,'/api/learning/learner-preferences',{answers:prefs.record.answers,expectedRevision:prefs.record.revision});
   assert.equal(saved.status,run.arm==='A'?403:200);
   assert.equal((await api(actor,'/api/learning/research-controls',{profile:{},expectedRevision:0})).status,403,'学习配置不能解锁工程参数');
   ok(await api(actor,'/api/learning/support-cycle'));
   assert.equal((await api({...ordinary,entry,runId:run.id},'/api/learning/support-cycle')).status,403,'禁止跨账号绑定轮次');
   if(entry==='B'){
    const target={scope:'GH-01-K01',unitId:'GH-01-K01',sceneType:'slide'};
    const initial=ok(await api(actor,'/api/learning/support-cycle',{...target,action:'report',need:'concept',confirmed:true})).data.cycle;
    assert.equal(initial.status,'offered');assert.equal(initial.profile.cooldownSeconds,180);
    await new Promise(r=>setTimeout(r,3100));
    const more=ok(await api(actor,'/api/learning/support-cycle',{...target,action:'feedback',id:initial.id,revision:initial.revision,result:'not_helped',requestMore:true})).data.cycle;
    assert.equal(more.status,'offered','同一HTTP请求应完成主动补充，不等待轮询或180秒冷却');assert.equal(more.rounds,2);
    const capped=ok(await api(actor,'/api/learning/support-cycle',{...target,action:'feedback',id:more.id,result:'not_helped',requestMore:true})).data.cycle;
    assert.equal(capped.status,'engaged');assert.equal(capped.rounds,2,'不能绕过补充次数上限');
    ok(await api(actor,'/api/learning/support-cycle',{...target,action:'close',id:more.id}));
   }
   console.log(`${entry}（实际${run.arm}）：生产权限、准备阶段、固定组、工程权限与账号隔离通过`);
  }
 }finally{if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
