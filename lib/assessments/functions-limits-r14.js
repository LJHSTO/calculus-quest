'use strict';
const prior=require('./functions-limits-r13');
const version='functions-limits-readable-r14-20261112';
const num=n=>Number(n.toFixed(8));
function forms(form='X'){
  const p=prior.variants[form];if(!p)throw Error('未知试卷');
  return prior.forms(form).map((old,i)=>{
    const q=structuredClone(old);q.id=q.id.replace('fl-r13-','fl-r14-');q.pairId=q.pairId.replace('FLR13','FLR14');q.instrumentVersion=version;
    // Clarify vocabulary and response structure without supplying a solution.
    if(i===3)q.question=`两个函数的计算方法如下：\nf(x)=(x²−${p.a*p.a})/(x−${p.a})，允许的输入是除${p.a}以外的所有实数；\ng(x)=x+${p.a}，允许输入任何实数。\n①它们是同一个函数吗？②哪些输入会得到相同的输出？哪个输入的情况不同？③怎样修改其中一个函数允许的输入，或补上缺少的定义，才能让二者相同？\n按顺序写出判断和理由即可。`;
    if(i===7)q.question=`一个计算器按 y=2x+${p.bias} 把输入x变成输出y。输入1时，输出是${2+p.bias}。\n现在要求：输出与${2+p.bias}的距离小于${p.e}（也就是输出必须大于${num(2+p.bias-p.e)}、小于${num(2+p.bias+p.e)}）。\n有人说：“只要输入与1的距离小于${p.e}，就一定能达到要求。”\n①这个说法对吗？②找一个在他说的输入范围内、但输出不合要求的数，写出计算结果。③给出一个能保证要求的输入范围，并说明为什么这个范围内的输入都可以。\n可以用日常语言、区间或数式回答。`;
    if(i===9)q.question=`函数按输入分成三种情况：\nx<1时，f(x)=2x+k；x>1时，f(x)=x+${p.end}；恰好x=1时，f(1)=0。k是一个待确定的数。\n希望x从左、右两边靠近1时，输出接近同一个有限的数。请依次回答：\n①从左边靠近时，输出接近什么（可用含k的式子）？②从右边靠近时呢？③k应该是多少？④如果只改变恰好x=1时的输出，需要改变这个k吗？说明理由。`;
    if(i===11)q.question=`函数按输入分成三种情况：\nx<${p.a}时，f(x)=x+1；x>${p.a}时，f(x)=3x${1-2*p.a<0?'−'+Math.abs(1-2*p.a):'+'+(1-2*p.a)}；恰好x=${p.a}时，f(${p.a})=${p.a+6}。\n左右两边的计算规则不能改，只允许改变恰好x=${p.a}时的输出。请依次回答：\n①从左边靠近${p.a}时，输出接近多少？②从右边靠近时呢？③要让函数在这里连续，f(${p.a})应改成多少？④说明这样改后连续的理由。`;
    q.readabilityRevision={version,kind:'vocabulary_and_response_structure',learnerValidation:'pending_cognitive_interviews'};
    return q;
  });
}
function questions(phase,form){if(!['pre','post','retention'].includes(phase))throw Error('无效测量阶段');return forms(form||({pre:'X',post:'Y',retention:'Z'}[phase])).map(q=>({...q,id:q.id.replace('fl-r14-','fl-r14-'+phase+'-')}));}
function publicForm(phase,form){const selected=form||({pre:'X',post:'Y',retention:'Z'}[phase]);return {...prior.publicForm(phase,selected),instrumentVersion:version,items:questions(phase,selected).map(({answer,analysis,rubric,referenceAnswer,commentPrompt,hasAnswer,...q})=>q)};}
module.exports={...prior,version,forms,questions,publicForm};
