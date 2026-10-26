'use strict';
// Admission is based on stored server results, never on browser-supplied scores.
function admission(results,questionIds,canReuse){
  if(!results.length)return {kind:'fresh'};
  const pre=results.filter(r=>r.phase==='pre');
  if(canReuse&&questionIds.length>0&&pre.length===results.length&&questionIds.every(id=>pre.some(r=>r.question_id===id)))
    return {kind:'reuse_pretest',resultIds:pre.map(r=>r.id),completedAt:pre.map(r=>r.created_at).sort().at(-1)};
  return {kind:'new_round_required'};
}
function editWindow(enrollment,snapshot,results){
  if(!enrollment)return {allowed:true,kind:'ordinary_learning'};
  if(enrollment.stage==='configuration')return {allowed:true,kind:'initial_configuration'};
  const unitId=snapshot?.currentUnitId||'';
  if((!unitId||unitId.endsWith('-pre'))&&!results.some(r=>['formative','post'].includes(r.phase)))return {allowed:true,kind:'before_learning'};
  const point=require('../data/multi-scene-learning-route.json').chapters.flatMap(c=>c.modules||[]).flatMap(m=>m.knowledgePoints||[]).find(p=>p.id+'-formative'===unitId);
  const questions=point?.formativeQuiz?.questions||[],core=questions.find(q=>q.adaptiveRole==='core'),diagnostic=questions.find(q=>q.adaptiveRole==='diagnostic');
  const attempts=results.filter(r=>r.unit_id===unitId&&r.phase==='formative');
  const complete=core?attempts.some(r=>r.question_id===core.id&&Number(r.is_correct)===1)||Boolean(diagnostic&&attempts.some(r=>r.question_id===diagnostic.id)):questions.length>0&&questions.every(q=>attempts.some(r=>r.question_id===q.id));
  if(complete)return {allowed:true,kind:'after_formative',unitId};
  return {allowed:false,kind:'within_unit',unitId,message:'先完成当前知识点的检测，再调整下一节的帮助方式。当前仍可拒绝、暂停帮助或退出预试。'};
}
module.exports={admission,editWindow};
