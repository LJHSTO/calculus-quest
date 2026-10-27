'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const M=require('../resources/open-maic/函数极限混合探索/game-model');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(root,'output/practice-api-'));
 const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),base=`http://127.0.0.1:${port}`;
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'false',RATE_LIMIT_MAX:'10000'}});
 let token='';async function api(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()};}
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const u=await api('/api/auth/register',{nickname:'合成游戏决策',password:'Synthetic-game-check-27',email:''});assert.equal(u.status,200);token=u.token;
  const chapter=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
  const pre=await api('/api/learning/quiz/submit',{unitId:'V14-C1-pre',chapterId:'V14-C1',phase:'pre',answers:chapter.flow.preQuiz.questions.map(q=>({questionId:q.id,response:q.type==='multiple'?['__unknown__']:'__unknown__'}))});assert.equal(pre.status,200,JSON.stringify(pre));
  const events=[0,1].map(i=>({eventId:'practice-'+i,type:'interaction',payload:{schemaVersion:1,eventType:'courseware_challenge_result',source:'iframe',chapterId:'V14-C1',unitId:'GH-01-K01',unitType:'knowledge',sceneType:'game',timing:{clientAt:new Date().toISOString()},data:{attempt_id:'practice-'+i,challenge_id:'GH-01-K01-game-r0',independent:false,is_correct:false,evidence_scope:'assisted_game_attempt',feedback_version:'concept-games-20261027-v3',parameters:M.create(0),response:M.create(0)}}}));
  assert.equal((await api('/api/learning/events',{events})).status,200);
  const result=await api('/api/learning/assistant/intervention',{chapterId:'V14-C1',unitId:'GH-01-K01',sceneType:'game',signal:{kind:'task_difficulty',attemptId:'practice-1'}});
  fs.writeFileSync(path.join(dir,'decision.json'),JSON.stringify(result,null,2));
  assert.equal(result.status,200,JSON.stringify(result));
  const text=JSON.stringify(result);assert.match(text,/need_confirmation_offered|repeated_practice_failures/,'记录的游戏失败必须真正形成主动询问');
  assert.doesNotMatch(text,/independent_attempt_success/);
  const inquiry=result.study.supportCycles.find(c=>c.status==='awaiting_confirmation');
  assert.ok(inquiry);
  assert.equal((await api('/api/learning/support-cycle',{action:'decline',scope:'GH-01-K01',unitId:'GH-01-K01',sceneType:'game',id:inquiry.id})).status,200);
  const otherEvents=events.map((event,i)=>({...event,eventId:'other-'+i,payload:{...event.payload,unitId:'GH-01-K02',data:{...event.payload.data,attempt_id:'other-'+i,challenge_id:'GH-01-K02-game-r0-p0',parameters:M.create(1),response:[-3,-3]}}}));
  assert.equal((await api('/api/learning/events',{events:otherEvents})).status,200);
  const deferred=await api('/api/learning/assistant/intervention',{chapterId:'V14-C1',unitId:'GH-01-K02',sceneType:'game',signal:{kind:'task_difficulty'}});
  assert.equal(deferred.status,200);
  assert.match(JSON.stringify(deferred),/need_confirmation_unavailable/,'跨知识点拒绝退避不能绕过询问而直接显示知识提示');
  console.log('隔离 API：游戏错误事件→服务端复核→主动询问通过。');
 }finally{server.kill();await new Promise(r=>server.once('exit',r));fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
