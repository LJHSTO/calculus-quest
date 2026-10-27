'use strict';
const assert=require('node:assert/strict'),M=require('../resources/open-maic/主动探索证据/exploration-model'),evidence=require('../lib/assisted-game-evidence');
let cases=0;const now=Date.now();
for(const point of M.points)for(const [scene,task]of Object.entries(M.tasks[point])){
 const base={scene_type:scene,task_version:M.version,evidence_scope:'concept_exploration_attempt',independent:false,challenge_id:`${point}:${scene}:concept`};
 task.options.forEach((_,response)=>{assert.equal(M.grade({...base,response,is_correct:false},point),response===task.answer);cases++;});
 assert.equal(M.grade({...base,response:task.answer,task_version:'unknown'},point),null);
 assert.equal(M.grade({...base,response:task.answer,independent:true},point),null);
 assert.equal(M.grade({...base,response:99},point),null);
 const wrong=task.options.map((_,i)=>i).filter(i=>i!==task.answer);
 const row=(response,i)=>({id:'e'+i,created_at:new Date(now-1000+i).toISOString(),payload:{eventType:'courseware_challenge_result',data:{...base,response,is_correct:true,attempt_id:'a'+i}}});
 assert.equal(evidence.collect([row(wrong[0],1),row(wrong[0],2)],point,now).failures.length,1,'重复同一判断不能累加困难');
 assert.equal(evidence.collect([row(wrong[0],1),row(wrong[1],2)],point,now).failures.length,2);
 assert.equal(evidence.collect([row(wrong[0],1),row(wrong[1],2),row(task.answer,3)],point,now).failures.length,0,'成功后清除旧失败链');
}
console.log(`18场景、${cases}项判定及伪造结果、版本、重复、恢复边界通过`);
