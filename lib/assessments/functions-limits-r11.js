'use strict';
const legacy=require('./functions-limits-r10');
const figures=require('./assessment-figures-r11');
const version='functions-limits-integrated-r11-20261107';
const figureByIndex={2:'point-membership',4:'finite-samples',6:'point-and-nearby',8:'one-sided',10:'corner'};
function forms(form){
  const p=legacy.variants[form];if(!p)throw Error('未知试卷');
  return legacy.forms(form).map((old,i)=>{
    const q={...old,id:old.id.replace('fl-r10-','fl-r11-'),instrumentVersion:version,pairId:old.pairId.replace('FLR10','FLR11'),equivalence:{...old.equivalence,representation:figureByIndex[i]?'matched_graph_and_text_alternative':'text',validationStatus:'content_paired_pending_learner_pilot'}};
    if(figureByIndex[i])q.figure=figures.publicFigure(`${form.toLowerCase()}-${figureByIndex[i]}`);
    if(i===2)q.question='图中紫线表示给定函数，甲、乙是待审核标记。根据坐标与曲线，哪项审核正确？';
    if(i===4)q.question=`某连续函数只公布了图中的三个观测点。能否据此证明它在整个[${p.a-2},${p.a}]上严格上升？`;
    if(i===6)q.question=`图中的线段给出所示区间内的完整函数规则。当x从两侧越来越接近${p.t}而不取该点时，输出接近哪个值？`;
    if(i===8)q.question='图中给出了输入1附近两段完整规则及单独的实心点。x从左、右两侧靠近1时分别趋近什么？双侧有限极限是否存在？';
    if(i===10)q.question=`图中折线给出了函数在x=${p.a}附近的完整规则。下面哪个判断正确？`;
    return q;
  });
}
function questions(phase,form){
  if(!['pre','post','retention'].includes(phase))throw Error('无效测量阶段');
  return forms(form||({pre:'X',post:'Y',retention:'Z'}[phase])).map(q=>({...q,id:q.id.replace('fl-r11-','fl-r11-'+phase+'-')}));
}
function publicForm(phase,form){
  const selected=form||({pre:'X',post:'Y',retention:'Z'}[phase]);
  return {id:phase,form:selected,instrumentVersion:version,agentAssistanceAllowed:false,feedbackPolicy:'acknowledgement_only',instructions:'按题目给出的图、范围和规则推理。图中空心位置不取，实心位置取值；菱形若标为待审核标记，不代表它已经在函数图像上。可以用自然语言说明。“我不会”与“暂不作答”分别记录；本测验不提供提示或即时答案。',maxScore:32,items:questions(phase,selected).map(({answer,analysis,rubric,referenceAnswer,commentPrompt,hasAnswer,...q})=>q)};
}
module.exports={version,ids:legacy.ids,unknown:legacy.unknown,blueprint:legacy.blueprint,variants:legacy.variants,forms,questions,publicForm,rubric:legacy.rubric,retention:[],pairs:[],figureAssets:figures.assetPaths};
