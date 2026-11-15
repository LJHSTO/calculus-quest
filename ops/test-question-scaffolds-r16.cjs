'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const probes=require('../lib/assessments/functions-limits-probes-r13'),scaffolds=require('../lib/courseware/quiz-scaffolds-r16');
const checks=[];
const targeted=require('../lib/assessments/functions-limits-targeted-checks-r16'),adapter=require('../lib/proactive-policy/adapters/functions-limits-r16');
for(const [questionId,pool] of Object.entries(targeted.pools)){
 const seen=[];
 for(const [v,q] of pool.entries()){
  const a=v+2,c=v+5,point=v+1,L=v+4,correct=q.options.find(o=>o.value===q.answer).label;
  const expected={
   overlap_unique_output:String(a+c),many_to_one_allowed:'满足，不同输入可以有相同输出',
   domain_after_cancellation:`两者在x≠${a}处相同，但f不允许输入${a}、g允许`,
   actual_point_and_hole:`(${a},${point})实心，(${a},${a+3})空心`,
   finite_samples_not_monotonic_proof:'不能，观测点之间仍可能出现下降',
   one_pair_does_not_prove_decreasing:'含这两点的区间不是严格上升，但尚不能证明整个区间严格下降',
   radius_and_strict_error_bound:String((v+2)/10),limit_distinct_from_point_value:`${2*a+1}和${a+13}`,
   unequal_one_sided_limits:`不能，左右分别趋近${L}和${L+2}`,
   unbounded_is_not_finite_limit:'不存在有限极限；两侧都趋向正无穷',
   corner_can_be_continuous:'连续，左右极限和点值都是0',
   jump_not_repaired_by_point_value:'不能，一个点值无法同时等于两个不同的左右极限'
  };
  assert.equal(correct,expected[q.subSkill]);
  for(const level of ['L1','L2','L3','L4','L5']){
   const pub=adapter.nextVerificationCheck(q.knowledgePointId,level,'',seen,questionId);
   assert.equal(pub.id,q.id);assert.equal(pub.sourceQuestionId,questionId);assert.equal(pub.answer,undefined);assert.equal(pub.analysis,undefined);
   assert.equal(adapter.publicVerificationCheck(q.knowledgePointId,level,pub.id).id,pub.id);
   for(const option of pub.options)assert.equal(adapter.gradeVerificationCheck({knowledgePointId:q.knowledgePointId,supportLevel:level,checkId:pub.id,response:option.value}).correct,option.label===correct);
   assert.equal(adapter.publicVerificationCheck('INVALID',level,pub.id),null);
  }
  seen.push(q.id);checks.push({id:q.id,kind:'question_targeted_check',subSkill:q.subSkill,sourceQuestionId:questionId,correctLabel:correct});
 }
 assert.equal(adapter.nextVerificationCheck(pool[0].knowledgePointId,'L3','',seen,questionId),null,'不重复已做的题，也不悄悄换成另一项技能');
}
// Recompute every post-help item's correct option independently of its key.
for(let point=0;point<6;point++)for(let v=0;v<8;v++){
 const q=probes.raw(point,v),k=v+5,L=k+1;
 const radius=Number((v===0?.07:(v+1)*.1).toFixed(4));
 const expected=[String(2*1+k-1),`只有P在图像上；Q的纵坐标应为${2*(k+1)+1}`,
  '已经否定包含这两点的区间严格上升',String(radius),`不能，两侧分别趋近${L}和${L+1}`,`可以，改为${L}并与共同极限相等`][point];
 assert.equal(q.options.find(o=>o.value===q.answer).label,expected);
 assert.equal(q.options.filter(o=>o.label===expected).length,1);
 if(point===3){const epsilon=4*radius;assert(4*(.999*radius)<epsilon);assert(4*(1.5*radius)>epsilon);}
 checks.push({id:q.id,kind:'independent_check',correctLabel:expected});
}
const expectedFormative=['14','不违反，唯一性限制的是同一输入的输出','两者在x≠5处相同，但原定义域不同','(4,2)为实心点，(4,7)为空心点','不能，观测之间仍可能起伏','这对数否定严格上升，但未检查其余输入对','0.9','7和20','不能，两侧分别趋近14和15','不存在有限极限，趋向正无穷描述的是无界趋势','连续，三项条件都满足','没有一个点值能同时匹配两侧，只改点值不能修复'];
for(let point=0;point<6;point++)for(const [i,q] of probes.formative(point).entries()){
 assert.equal(q.options.find(o=>q.answer.includes(o.value)).label,expectedFormative[2*point+i]);
 const versions=['L2','L3','L5'].map(level=>scaffolds.forQuestion(q.id,level));
 assert(versions.every(v=>v&&v.version===scaffolds.version));assert.equal(new Set(versions.map(v=>v.text)).size,3);
 checks.push({id:q.id,kind:'formative',supportVersions:versions});
}
// The counterexample in the finite-samples explanation satisfies all given
// observations and continuity, while containing a strictly descending segment.
const polyline=[[0,0],[.5,2],[1,1],[2,2]];
for(const x of [0,1,2])assert.equal(polyline.find(p=>p[0]===x)[1],x);
assert(polyline[1][1]>polyline[2][1]&&polyline[1][0]<polyline[2][0]);
assert.equal(scaffolds.forQuestion('fl-r14-pre-X-4','L5'),null,'Protected assessment IDs cannot enter the authored help bank.');
assert.equal(scaffolds.validateReply('fl-r13-formative-GH-01-K01-1','你填的 \\(13\\) 是左段在输入 \\(1\\) 时的输出：\\(2(1)+13=15\\)。').valid,false);
assert.equal(scaffolds.validateReply('fl-r13-formative-GH-01-K01-1','13不是左段在输入1时的输出。').valid,true);
assert.equal(scaffolds.validateReply('fl-r13-formative-GH-02-K01-1','要让 \\(4r<3.6\\)，两边除以4。').valid,false);
assert.equal(scaffolds.validateReply('fl-r13-formative-GH-02-K01-1','可取0<r≤0.9，因为d<r，所以4d<4r≤3.6。').valid,true);
const out=path.resolve('output/playwright/r16-flow');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'题目与提示核验.json'),JSON.stringify({passed:true,independentChecks:48,targetedChecks:48,formativeQuestions:12,authoredHelpVariants:36,checks},null,2));
console.log('PASS: 48通用检查＋48错题对应检查的答案、归属、防泄漏、历史兼容；12检测题×3级帮助绑定；有限采样连续反例。');
