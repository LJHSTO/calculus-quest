"use strict";
// All server fixtures choose isolated databases. Never point this runner at a live database.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/六维多目标支持-2026-10-21/验证日志');
fs.mkdirSync(out,{recursive:true});
const tests=['test-support-cycle','test-support-cycle-browser','test-research-controls','test-research-controls-browser',
 'test-six-dimension-runtime','test-selected-participant-export','test-student-data-chain-api','test-main-common-tasks','test-study-workbench',
 'test-proactive-policy','test-proactive-study-api','test-proactive-verification-v3','test-courseware-verification-match',
 'test-learning-assistant-api','test-knowledge-assistant-ui','test-courseware-embedded-layout',
 'test-auth-login','test-static-security','test-course-assessment-security','test-subpath-deployment',
 'test-deployment-safety','test-llm-config-file','test-grading-model-audit','test-db-flush-durability','test-learning-event-durability'];
const results=[];
for(const name of tests){
 const start=Date.now(),r=spawnSync(process.execPath,[`ops/${name}.js`],{cwd:root,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:10*1024*1024});
 fs.writeFileSync(path.join(out,name+'.log'),(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):''),'utf8');
 const result={test:name,passed:r.status===0,exitCode:r.status,durationMs:Date.now()-start};results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(out,'回归结果.json'),JSON.stringify({synthetic:true,at:new Date().toISOString(),results},null,2));
process.exitCode=results.every(r=>r.passed)?0:1;
