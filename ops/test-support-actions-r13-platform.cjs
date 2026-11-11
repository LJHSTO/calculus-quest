'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=process.env.SUPPORT_R13_OUTPUT;
assert(out,'请通过 SUPPORT_R13_OUTPUT 指定私有证据目录');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const dir=fs.mkdtempSync(path.join(out,'平台验收-')),port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>resolve(p));});}),base=`http://127.0.0.1:${port}`;
 const registry=require('../lib/assessments/functions-limits-registry');
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),ADMIN_TOKEN:crypto.randomBytes(24).toString('hex'),LOCAL_ADMIN_AUTH_BYPASS:'false',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-support-r13',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:process.env.SUPPORT_ADAPTER_VERSION||'functions-limits-adapter-r13',PROACTIVE_OUTCOME_INSTRUMENT_VERSION:process.env.SUPPORT_OUTCOME_VERSION||registry.delayedVersion(registry.version),RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'false',RATE_LIMIT_MAX:'2000',LEARNING_ASSISTANT_DAILY_QUOTA:'100',APP_VERSION:'synthetic-support-r13',SUPPORT_R12_OUTPUT:dir};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 try{
  for(let n=0;n<150;n++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(server.exitCode!==null)throw Error('隔离服务启动失败，见server.log');await new Promise(resolve=>setTimeout(resolve,100));}
  console.log(JSON.stringify({base,output:dir,adapter:env.PROACTIVE_ADAPTER_VERSION}));
  const child=spawn(process.execPath,['ops/test-support-review-r12-platform.cjs',base,'--actions-r13'],{cwd:root,env,stdio:'inherit',windowsHide:true});
  assert.equal(await new Promise(resolve=>child.on('exit',resolve)),0,'知点平台流程回归失败');
 }finally{server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
