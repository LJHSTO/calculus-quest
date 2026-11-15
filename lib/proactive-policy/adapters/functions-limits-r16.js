'use strict';
const prior=require('./functions-limits-r13'),{createAdapter}=require('./v14-c3');
const bank=require('../../assessments/functions-limits-targeted-checks-r16');
const levels=['L1','L2','L3','L4','L5'];
const checkForms=Object.fromEntries(Object.keys(prior.knowledgePoints).map(id=>[id,Object.fromEntries(levels.map(level=>[level,Object.values(bank.pools).flat().filter(q=>q.knowledgePointId===id)]))]));
const targeted=createAdapter({chapterId:'V14-C1',version:'functions-limits-adapter-r16',knowledgePoints:prior.knowledgePoints,verification:{version:bank.version,checks:{},checkForms}});
function publicVerificationCheck(id,level,checkId=''){
  if(!checkId.includes('-target-r16-'))return prior.publicVerificationCheck(id,level,checkId);
  const q=targeted.publicVerificationCheck(id,level,checkId);
  return q?{...q,sourceQuestionId:Object.values(bank.pools).flat().find(row=>row.id===checkId)?.sourceQuestionId}:null;
}
module.exports=Object.freeze({...prior,version:'functions-limits-adapter-r16',verificationVersion:bank.version,
  nextVerificationCheck(id,level,last='',seen=[],questionId=''){
    const pool=bank.pools[questionId];
    if(!pool)return prior.nextVerificationCheck(id,level,last,seen);
    if(pool[0].knowledgePointId!==id||!levels.includes(level))return null;
    const excluded=new Set([...seen,last].filter(Boolean));
    const chosen=pool.find(q=>!excluded.has(q.id));
    return chosen?publicVerificationCheck(id,level,chosen.id):null;
  },
  publicVerificationCheck,
  gradeVerificationCheck(input){return input.checkId?.includes('-target-r16-')?targeted.gradeVerificationCheck(input):prior.gradeVerificationCheck(input);}
});
