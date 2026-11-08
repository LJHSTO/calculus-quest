'use strict';
const {createAdapter}=require('./v14-c3');
const points=require('../../courseware/functions-limits-r7/supports');
const probes=require('../../assessments/functions-limits-probes-r7');
const ids=Object.keys(points),levels=['L1','L2','L3','L4','L5'];
const pools=Object.fromEntries(ids.map((id,i)=>[id,Array.from({length:4},(_,k)=>{const p=probes.raw(i,k+3);return {...p,id:p.id+'-support',stage:'after_support',answer:p.answer,options:[...p.options,{value:'__unknown__',label:'我暂时不会'}]};})]));
const checkForms=Object.fromEntries(ids.map(id=>[id,Object.fromEntries(levels.map(l=>[l,pools[id]]))]));
const checks=Object.fromEntries(ids.map(id=>[id,Object.fromEntries(levels.map(l=>[l,pools[id][0]]))]));
const adapter=createAdapter({chapterId:'V14-C1',version:'functions-limits-adapter-r7',knowledgePoints:points,verification:{version:probes.version,checks,checkForms}});
const fields={elicit_self_explanation:'selfExplanationPrompt',concept_hint:'conceptHint',decompose_subgoal:'subgoalPrompt',next_step_hint:'nextStepPrompt',partial_worked_example:'partialExamplePrompt'};
module.exports=Object.freeze({...adapter,
 nextVerificationCheck(id,level,last='',seen=[]){const excluded=new Set([...seen,last].filter(Boolean)),pool=pools[id];if(!pool||!levels.includes(level))return null;const start=Math.max(0,...[...excluded].map(id=>pool.findIndex(q=>q.id===id)+1));const chosen=pool.slice(start).find(q=>!excluded.has(q.id));return chosen?adapter.publicVerificationCheck(id,level,chosen.id):null;},
 coursewareVerificationMatch(){return {eligible:false,reasonCode:'r7_guided_courseware_requires_separate_probe',evidenceScope:'guided_courseware',subSkill:'practice_only',matchingVersion:'functions-limits-r7'};},
 renderAction(action,context={}){const old=adapter.renderAction(action,context),point=points[context.knowledgePointId];if(!old||!point||!fields[action])return old;const out={...old,title:'一起检查这一步',body:point[fields[action]],assistantPrompt:point[fields[action]],why:'按本轮允许的帮助方式提供支架；不把选择某种支架解释为已经经历了其他级别的失败。',contextSummary:point.label};delete out.confidence;return out;}
});

