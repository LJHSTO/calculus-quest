(function(root,factory){const api=factory(typeof module==='object'?require('../functions-limits-r9/model'):root.R9Native);if(typeof module==='object')module.exports=api;else root.R9Native=api;})(typeof window==='undefined'?globalThis:window,function(base){
 'use strict';
 const version='native-construction-r10-v1',courseVersion='functions-limits-integrated-r10-20261106';
 const tasks=JSON.parse(JSON.stringify(base.tasks));
 Object.assign(tasks['GH-01-K02-mindMap'],{kind:'domain',title:'还原空点与真正的点值',goal:'x≠2时，f(x)=(x²−4)/(x−2)=x+2。先看题目是否另外规定f(2)，再还原图像。约分不能替原函数补上定义；紫点是你正在调整的草稿。'});
 Object.assign(tasks['GH-02-K01-mindMap'],{title:'倍率改变后，输入范围该多大',goal:'附近规则为f(x)=k(x−2)+4。先看输出误差要求，再调整输入范围δ；切换倍率k，说明为什么一个范围不能照搬到所有规则。'});
 Object.assign(tasks['GH-01-K03-visualization3d'],{title:'在可读的截面上寻找反例',goal:'黄色截面固定z=0，规则为f(x)=s(x²/32−1)，s是正的高度倍率。选择x₁<x₂但f(x₁)≥f(x₂)的一对，否定整段严格上升；负输出也可以增大。'});
 const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
 function evaluate(id,s){
  if(!s||typeof s!=='object')return null;
  if(id==='GH-01-K02-mindMap'){
   if(!['hole','assigned'].includes(s.mode)||!['exclude','assign'].includes(s.action)||!finite(s.pointValue,-2,5))return null;
   const correct=s.mode==='hole'?s.action==='exclude':s.action==='assign'&&s.pointValue===0;
   return {correct,feedback:correct?(s.mode==='hole'?'原式在2处没有定义，(2,4)保留空点。x+2仅在x≠2时与原式等价；两个公式在其他地方相同，不代表定义域相同。':'空点(2,4)表示附近曲线没有在这里取值，实心点(2,0)记录另行规定的f(2)=0。同一输入仍只有一个实际输出。'):(s.mode==='hole'?'题目没有给f(2)赋值。约分只对x≠2成立，不能把(2,4)或其他点擅自画成实际点值。':'此时题目已另外规定f(2)=0。不能删掉这个值，也不能用约分式在2处算出的4覆盖原定义。')};
  }
  if(id==='GH-02-K01-mindMap'){
   if(!finite(s.delta,.01,1)||![.2,.05].includes(s.epsilon)||![1,2,3,4].includes(s.gain))return null;
   const correct=s.gain*s.delta<=s.epsilon;
   return {correct,feedback:correct?`对于所有0<|x−2|<δ，都有|f(x)−4|=${s.gain}|x−2|<${s.gain}δ≤${s.epsilon}。正倍率越大，允许的输入半径越小。`:`这个范围过宽。取输入距离r=(${s.delta}+${s.epsilon}/${s.gain})/2，它小于δ，却有${s.gain}r>${s.epsilon}，所以输出误差超标。把δ缩到不大于${s.epsilon}/${s.gain}（精确上界），再用倍率关系说明整个范围。`};
  }
  if(id==='GH-01-K03-visualization3d'){
   if(!finite(s.a,-7,7)||!finite(s.b,-7,7)||s.a>=s.b||!finite(s.scale,.5,3))return null;
   const correct=s.a*s.a>=s.b*s.b;
   return {correct,feedback:correct?'右侧输入更大，输出却没有变大。这一对足以反驳全程严格上升；它不能证明整段下降，0右侧仍会上升。':'这两个位置的输出在增大，不能作为反例。保持x₁<x₂，移到0左侧再比较；用公式而不是相机朝向解释。'};
  }
  return base.evaluate(id,s);
 }
 function grade(data,point){const id=data?.parameters?.task_id;if(data?.independent!==false||data.evidence_scope!=='native_construction_r10'||data.task_version!==version||data.course_version!==courseVersion||data.knowledge_point_id!==point||!tasks[id]||!id.startsWith(point+'-')||data.challenge_id!==id+'-construction')return null;return evaluate(id,data.parameters.state)?.correct??null;}
 return {...base,version,courseVersion,tasks,evaluate,grade};
});
