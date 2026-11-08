'use strict';
const prior=require('./functions-limits-r11');
const version='functions-limits-integrated-r12-20261108';
const positions={X:[1,3,0,2,2,0,3,1],Y:[2,0,3,1,3,1,0,2],Z:[0,2,1,3,1,3,2,0]};
const unknown={value:'__unknown__',label:'我不会'};

// Fixed, audited positions keep each form reproducible without coupling the key to item order.
function reorderChoices(question,target,numeric=false){
  const q=structuredClone(question),choices=q.options.filter(o=>!String(o.value).startsWith('__'));
  const arrayAnswer=Array.isArray(q.answer),key=arrayAnswer?q.answer[0]:q.answer;
  const correct=choices.find(o=>o.value===key);
  if(choices.length!==4||!correct||!Number.isInteger(target)||target<0||target>3)throw Error('题目选项与答案不一致');
  const ordered=choices.filter(o=>o!==correct);ordered.splice(target,0,correct);
  q.options=ordered.map((o,i)=>({...o,value:numeric?String(i):'ABCD'[i]}));
  q.answer=arrayAnswer?[q.options[target].value]:q.options[target].value;
  if(question.options.some(o=>o.value==='__unknown__'))q.options.push({...unknown});
  return q;
}
function setChoices(q,labels,key){q.options=labels.map((label,i)=>({value:'ABCD'[i],label}));q.options.push({...unknown});q.answer=['ABCD'[key]];}
function forms(form='X'){
  if(!positions[form])throw Error('未知试卷');
  let singleIndex=0;
  return prior.forms(form).map((old,i)=>{
    const q=structuredClone(old);
    q.id=q.id.replace('fl-r11-','fl-r12-');q.pairId=q.pairId.replace('FLR11','FLR12');q.instrumentVersion=version;
    if(i===1)setChoices(q,['能，两条记录已经确定所有输入的输出','不能，经过这两个记录点的规则不止一种','能，相邻两次输出的差相同就能外推','不能，同一函数不能在其他输入取相同输出'],1);
    if(i===2)setChoices(q,['甲、乙都在函数图像上','只有甲在函数图像上','只有乙在函数图像上','甲、乙都不在函数图像上'],1);
    if(i===4)setChoices(q,['能，三个观测点依次上升足以证明','能，连续性排除了观测点之间下降','不能，观测点之间仍可能局部下降','不能，再增加一个观测点就足以补全证明'],2);
    if(i===5)setChoices(q,['这两个值既不能否定严格上升，也不能证明严格下降','这两个值能否定整个区间严格上升，但不能证明严格下降','这两个值能证明整个区间严格下降，不需要其他输入对','这两个值与连续性矛盾，因此必须先删去一个观测'],1);
    if(i===10)setChoices(q,['该点不连续，因为左右线段的倾斜方向不同','该点连续，因为所有有定义的点都会连续','该点连续，因为左右趋近值与实际点值相等','该点无法判断，因为只有先求导数才能检查连续'],2);
    q.equivalence={...q.equivalence,validationStatus:'content_paired_pending_learner_pilot'};
    if(q.type==='single')return reorderChoices(q,positions[form][singleIndex++]);
    q.commentPrompt='按四项量规分别评分，每项0或1分；接受等价理由。空白与明确表示不会分别记录。不得仅按关键词命中给分。';
    return q;
  });
}
function questions(phase,form){
  if(!['pre','post','retention'].includes(phase))throw Error('无效测量阶段');
  return forms(form||({pre:'X',post:'Y',retention:'Z'}[phase])).map(q=>({...q,id:q.id.replace('fl-r12-','fl-r12-'+phase+'-')}));
}
function publicForm(phase,form){
  const selected=form||({pre:'X',post:'Y',retention:'Z'}[phase]);
  return {id:phase,form:selected,instrumentVersion:version,agentAssistanceAllowed:false,feedbackPolicy:'acknowledgement_only',instructions:'按题目给出的图、范围和规则推理。空心点表示该位置未取值，实心点表示实际取值；待审核标记不代表已经属于函数图像。不会时可选择“我不会”，未完成内容可保存后继续。本测验不提供提示或即时答案。',maxScore:32,items:questions(phase,selected).map(({answer,analysis,rubric,referenceAnswer,commentPrompt,hasAnswer,...q})=>q)};
}
module.exports={...prior,version,unknown,forms,questions,publicForm,reorderChoices};
