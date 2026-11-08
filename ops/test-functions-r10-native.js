'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const model=require('../lib/courseware/functions-limits-r10/native-model'),practice=require('../lib/assisted-game-evidence');
let count=0;const checks=[];
function event(id,state){return {independent:false,evidence_scope:'native_construction_r10',task_version:model.version,course_version:model.courseVersion,knowledge_point_id:id.slice(0,9),challenge_id:id+'-construction',attempt_id:'test-'+count,parameters:{task_id:id,state},is_correct:true};}
function verify(id,state,expected){const result=model.evaluate(id,state);assert.equal(result.correct,expected);assert.equal(practice.grade(event(id,state),id.slice(0,9)),expected);count++;return result;}
for(const mode of ['hole','assigned'])for(const action of ['exclude','assign'])for(let pointValue=-2;pointValue<=5;pointValue++)verify('GH-01-K02-mindMap',{mode,action,pointValue},mode==='hole'?action==='exclude':action==='assign'&&pointValue===0);
checks.push('定义域及空实心点32个状态重判一致，不采纳伪造正确标记');
for(const gain of [1,2,3,4])for(const epsilon of [.2,.05])for(let step=1;step<=100;step++)verify('GH-02-K01-mindMap',{gain,epsilon,delta:step/100},gain*step/100<=epsilon);
const boundary=verify('GH-02-K01-mindMap',{gain:3,epsilon:.2,delta:.0667},false);assert.ok(boundary.feedback.includes('0.2/3（精确上界）'));assert.ok(!boundary.feedback.includes('不大于0.0667'));
const close=verify('GH-02-K01-mindMap',{gain:3,epsilon:.2,delta:.066667},false);assert.ok(close.feedback.includes('r=(0.066667+0.2/3)/2'));
checks.push('800种滑块误差组合及小数边界；上界和反例距离保留精确式');
for(let ai=-70;ai<=69;ai++)for(let bi=ai+1;bi<=70;bi++)for(const scale of [.5,1,3])verify('GH-01-K03-visualization3d',{a:ai/10,b:bi/10,scale},ai*ai>=bi*bi);
checks.push('29610种有序截面及倍率状态的公式、反例和服务器重判一致');
const id='GH-01-K02-mindMap',point=id.slice(0,9),now=Date.now(),row=(state,offset)=>({id:'row-'+offset,created_at:new Date(now+offset).toISOString(),payload:{eventType:'courseware_challenge_result',data:event(id,state)}}),bad={mode:'hole',action:'assign',pointValue:1},good={...bad,action:'exclude'};
assert.equal(practice.collect([row(bad,-4000),row(bad,-3000)],point,now).failures.length,1);
assert.equal(practice.collect([row(bad,-4000),row({...bad,pointValue:2},-3000)],point,now).failures.length,2);
assert.equal(practice.collect([row(bad,-4000),row({...bad,pointValue:2},-3000),row(good,-1000)],point,now).failures.length,0);
assert.equal(practice.collect([row(bad,-300001)],point,now).failures.length,0);
for(const override of [{independent:true},{task_version:'old'},{course_version:'old'},{knowledge_point_id:'GH-01-K01'}])assert.equal(practice.grade({...event(id,good),...override},point),null);
checks.push('不同失败可累计、重复状态去重、成功清空、过期与错误版本不作证据');
const registry=require('../lib/proactive-outcomes/functions-limits-r10');
for(const version of ['functions-limits-retention-r4','functions-limits-delayed-r7','functions-limits-delayed-r10'])assert.equal(registry.forVersion(version)?.version,version);
checks.push('旧r4、r7与当前r10延迟测量按各自版本读取');
const out=path.resolve(__dirname,'../output/综合课程-r10-20261106');fs.mkdirSync(out,{recursive:true});const report={passed:true,version:model.courseVersion,cases:count,checks,at:new Date().toISOString()};fs.writeFileSync(path.join(out,'原生操作数学与证据检查.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
