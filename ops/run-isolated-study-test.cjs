'use strict';
// Runs destructive synthetic fixtures only against a disposable local database.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
async function main(){
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cq-r16-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base=`http://127.0.0.1:${port}`;
 const live=process.argv.includes('--live'),args=process.argv.slice(2).filter(a=>a!=='--live');if(!args.length)throw Error('Provide a test script');
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',BASE_PATH:'',DB_PATH:path.join(dir,'synthetic.db'),LOCAL_ADMIN_AUTH_BYPASS:'true',MAIN_LEARNING_PROTOCOL_FILE:'',LLM_PROVIDER:live?'openai-compatible':'mock',GRADING_LLM_PROVIDER:'mock',ASSESSMENT_LLM_ENABLED:'false',COACH_NARRATION_LLM_ENABLED:'false',PROACTIVE_EXPERIMENT_ID:path.basename(dir),PROACTIVE_EXPERIMENT_CHAPTER_ID:'V14-C1',PROACTIVE_POLICY_MODE:'active',PROACTIVE_ASSIGNMENT_SALT:'synthetic-only',PROACTIVE_PARTICIPATION_MODE:'implicit-pilot',PROACTIVE_EXPERIMENT_ARMS:'treatment_full',PROACTIVE_DISPLAY_ARMS:'treatment_full',PROACTIVE_ADAPTER_VERSION:'functions-limits-adapter-r16',RESEARCH_CONTROLS_ENABLED:'true',RESEARCH_CONTROLS_DEMO:'true',LEARNER_ONBOARDING_REQUIRED:'false',RATE_LIMIT_MAX:'100000',STUDENT_UX_BASE_URL:base,CLASSROOM_LOAD_URL:base,CLASSROOM_LOAD_ALLOW_SYNTHETIC:'1',SYNTHETIC_STUDY_DIR:dir};
 const log=fs.openSync(path.join(dir,'server.log'),'w'),server=spawn(process.execPath,['server.js',String(port)],{cwd:root,env,stdio:['ignore',log,log]});
 try{
  let ready=false;for(let i=0;i<150;i++){if(server.exitCode!==null)throw Error(fs.readFileSync(path.join(dir,'server.log'),'utf8').slice(-2000));try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Server did not start');
  console.log(JSON.stringify({isolated:true,base,dir,live}));
  const test=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});process.exitCode=await new Promise(resolve=>test.once('exit',code=>resolve(code??1)));
 }finally{if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}fs.closeSync(log);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
