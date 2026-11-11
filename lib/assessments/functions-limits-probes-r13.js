'use strict';
const prior=require('./functions-limits-probes-r12'),bank=require('./functions-limits-r13'),figures=require('./assessment-figures-r13'),commonFigures=require('./assessment-figures-r11');
const version='functions-limits-probes-r13-20261108',formativeVersion='functions-limits-formative-r13-20261108';
const stages={t0:0,t1:1,outcome:2,return_probe:7},figureKinds={1:'point-membership',4:'one-sided',5:'continuity-repair'};
function raw(index,variant){
  const q=prior.raw(index,variant);q.id=q.id.replace('-probe-r12-','-probe-r13-');q.instrumentVersion=version;
  const stage=Object.keys(stages).find(key=>stages[key]===variant);
  if(stage&&figureKinds[index]){
    q.figure=figures.publicFigure(`${figureKinds[index]}-${stage.replace('_','-')}`);
    if(index===1)q.prompt='图中紫线表示规则y=2x+1，P、Q是待审核标记。根据坐标与规则，哪项正确？';
    if(index===4)q.prompt='图中线段给出0附近的完整规则，f(0)尚未指定。只修改f(0)能让双侧有限极限存在吗？';
    if(index===5)q.prompt='图中横轴表示x−a，横坐标0对应输入a；线段给出a附近的规则，实心点表示当前f(a)。只改点值能否使它在a连续？';
  }
  return q;
}
function formative(index){return prior.formative(index).map((old,i)=>{
  const q=structuredClone(old);q.id=q.id.replace('fl-r12-','fl-r13-');q.sourceProbeId=q.sourceProbeId.replace('-probe-r12-','-probe-r13-');q.instrumentVersion=formativeVersion;
  if(index===2&&i===0)q.figure=commonFigures.publicFigure('x-finite-samples');
  if(index===5&&i===0)q.figure=commonFigures.publicFigure('z-corner');
  return q;
});}
function publicProbe(index,stage){if(!Object.hasOwn(stages,stage))throw Error('检查阶段无效');const {answer,analysis,...q}=raw(index,stages[stage]);return {...q,stage,evidenceScope:'platform_independent_check',independent:true};}
function gradeProbe(index,stage,response){if(!Object.hasOwn(stages,stage))throw Error('检查阶段无效');const q=raw(index,stages[stage]),result=prior.gradeProbe(index,stage,response);return {...result,checkId:q.id,instrumentVersion:version};}
module.exports={version,formativeVersion,raw,formative,publicProbe,gradeProbe};
