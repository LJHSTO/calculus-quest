'use strict';
const prior=require('./functions-limits-probes-r10');
const bank=require('./functions-limits-r12');
const version='functions-limits-probes-r12-20261108';
const formativeVersion='functions-limits-formative-r12-20261108';
const selections=[[8,10],[9,10],[9,10],[8,9],[8,10],[9,10]];
function raw(index,variant){
  const q=structuredClone(prior.raw(index,variant));
  q.id=q.id.replace('-probe-r10-','-probe-r12-');q.instrumentVersion=version;
  if(variant>=9)q.subSkill=[['model_assumption','many_to_one_allowed'],['domain_equivalence','point_and_nearby_value'],['finite_sample_scope','counterexample_scope'],['point_and_nearby_value','universal_error_guarantee'],['sequence_limit_criterion','finite_limit_vs_unbounded'],['corner_continuity','jump_not_point_repair']][index][variant-9];
  if(index===3&&variant<=8){
    const radius=Number((variant===0?.07:(variant+1)*.1).toFixed(4)),epsilon=Number((4*radius).toFixed(4));
    q.prompt=`输出误差的绝对值恰为输入误差绝对值的4倍。要让输出误差的绝对值小于${epsilon}，准备把输入误差的绝对值限制为小于正半径r。以下哪个r能保证范围内所有输入都合格？`;
  }
  return bank.reorderChoices(q,(variant+index)%4,true);
}
function formative(index){
  if(!selections[index])throw Error('知识点索引无效');
  return selections[index].map((variant,i)=>{
    const source=raw(index,variant),q=bank.reorderChoices(source,(2*index+i)%4,true),scope=bank.ids[index];
    return {...q,id:`fl-r12-formative-${scope}-${i+1}`,type:'single',question:q.prompt,points:1,answer:[q.answer],knowledgePointIds:[scope],instrumentVersion:formativeVersion,assessmentRole:'common_formative',sourceProbeId:source.id,options:[...q.options,{...bank.unknown}]};
  });
}
function publicProbe(index,stage){
  const variant={t0:0,t1:1,outcome:2,return_probe:7}[stage];if(variant===undefined)throw Error('检查阶段无效');
  const {answer,analysis,...q}=raw(index,variant);return {...q,stage,evidenceScope:'platform_independent_check',independent:true};
}
function gradeProbe(index,stage,response){
  const variant={t0:0,t1:1,outcome:2,return_probe:7}[stage];if(variant===undefined)throw Error('检查阶段无效');
  const q=raw(index,variant),base={checkId:q.id,response,instrumentVersion:version,serverGraded:true,independent:true};
  if(response==='skip')return {...base,correct:null,score:null,responseKind:'skipped',status:'skipped'};
  if(response==='unknown'||response==='__unknown__')return {...base,correct:false,score:0,responseKind:'dont_know',status:'unknown'};
  if(!q.options.some(o=>o.value===String(response)))throw Error('检查选项无效');
  return {...base,response:String(response),correct:String(response)===q.answer,score:String(response)===q.answer?1:0,responseKind:'answer'};
}
module.exports={version,formativeVersion,raw,formative,publicProbe,gradeProbe};
