'use strict';
const prior=require('./functions-limits-r12');
const version='functions-limits-integrated-r13-20261108';
function forms(form='X'){
  const p=prior.variants[form];if(!p)throw Error('未知试卷');
  return prior.forms(form).map((old,i)=>{
    const q=structuredClone(old);q.id=q.id.replace('fl-r12-','fl-r13-');q.pairId=q.pairId.replace('FLR12','FLR13');q.instrumentVersion=version;
    if(i===3||i===7)q.question+=' 按要点用1—3句或数式回答即可。';
    if(i===9)q.question=`x<1时f(x)=2x+k；x>1时f(x)=x+${p.end}；f(1)=0。要让左右两侧有共同有限极限，请依次填写四个要点（用分号或换行分开）：①左侧趋近式；②右侧趋近值；③k的值；④只改f(1)是否改变这个k，并用一句话说明原因。`;
    if(i===11)q.question=`x<${p.a}时f(x)=x+1；x>${p.a}时f(x)=3x${1-2*p.a<0?'−'+Math.abs(1-2*p.a):'+'+(1-2*p.a)}；原来f(${p.a})=${p.a+6}。只允许改这一点的值。请依次填写四个要点（用分号或换行分开）：①左侧趋近值；②右侧趋近值；③为使函数连续，应设f(${p.a})为多少；④用一句话解释连续的依据。`;
    return q;
  });
}
function questions(phase,form){if(!['pre','post','retention'].includes(phase))throw Error('无效测量阶段');return forms(form||({pre:'X',post:'Y',retention:'Z'}[phase])).map(q=>({...q,id:q.id.replace('fl-r13-','fl-r13-'+phase+'-')}));}
function publicForm(phase,form){const selected=form||({pre:'X',post:'Y',retention:'Z'}[phase]);return {...prior.publicForm(phase,selected),instrumentVersion:version,items:questions(phase,selected).map(({answer,analysis,rubric,referenceAnswer,commentPrompt,hasAnswer,...q})=>q)};}
module.exports={...prior,version,forms,questions,publicForm};
