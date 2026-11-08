'use strict';
const {createAdapter}=require('./v14-c3');
const prior=require('./functions-limits-r11');
const points=require('../../courseware/functions-limits-r10/supports');
const probes=require('../../assessments/functions-limits-probes-r12');
const ids=Object.keys(points),levels=['L1','L2','L3','L4','L5'];
const pools=Object.fromEntries(ids.map((id,i)=>[id,Array.from({length:8},(_,variant)=>{const q=probes.raw(i,variant);return {...q,id:q.id+'-support',stage:'after_support',options:[...q.options,{value:'__unknown__',label:'我不会'}]};})]));
const checkForms=Object.fromEntries(ids.map(id=>[id,Object.fromEntries(levels.map(level=>[level,pools[id]]))]));
const checks=Object.fromEntries(ids.map(id=>[id,Object.fromEntries(levels.map(level=>[level,pools[id][0]]))]));
const adapter=createAdapter({chapterId:'V14-C1',version:'functions-limits-adapter-r12',knowledgePoints:points,verification:{version:probes.version,checks,checkForms}});
module.exports=Object.freeze({...adapter,verificationVersion:probes.version,
  nextVerificationCheck(id,level,last='',seen=[]){
    const excluded=new Set([...seen,last].filter(Boolean)),pool=pools[id];if(!pool||!levels.includes(level))return null;
    const start=Math.max(0,...[...excluded].map(checkId=>pool.findIndex(q=>q.id===checkId)+1));
    const chosen=pool.slice(start).find(q=>!excluded.has(q.id));return chosen?adapter.publicVerificationCheck(id,level,chosen.id):null;
  },
  publicVerificationCheck(id,level,checkId=''){return adapter.publicVerificationCheck(id,level,checkId)||prior.publicVerificationCheck(id,level,checkId);},
  gradeVerificationCheck(input){return adapter.gradeVerificationCheck(input)||prior.gradeVerificationCheck(input);},
  coursewareVerificationMatch:prior.coursewareVerificationMatch,
  renderAction:prior.renderAction
});
