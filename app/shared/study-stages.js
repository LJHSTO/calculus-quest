(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudyStages=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const stages=[
    {id:'S1',title:'函数规则与图像',points:['GH-01-K01','GH-01-K02'],review:true,next:'GH-01-K03'},
    {id:'S2',title:'变化方向与趋近',points:['GH-01-K03','GH-02-K01'],review:true,next:'GH-02-K02'},
    {id:'S3',title:'左右极限与连续',points:['GH-02-K02','GH-02-K03'],review:false,next:'V14-C1-post'}
  ].map(s=>Object.freeze({...s,points:Object.freeze(s.points)}));
  const order=stages.flatMap(s=>s.points),reviews=stages.filter(s=>s.review);
  const point=id=>String(id||'').replace(/-formative$/,'');
  function crosses(stage,id){const target=point(id);return target==='V14-C1-post'||order.indexOf(target)>order.indexOf(stage.points.at(-1));}
  function completed(stage,results){return stage.points.every(id=>new Set(results.filter(r=>r.unit_id===id+'-formative').map(r=>r.question_id)).size>=3);}
  function reviewWindow(run,submitted=[],unitId=''){
    const protectedTask=/-(pre|post|formative|retention|transfer)$/.test(unitId)&&!submitted.includes(unitId);
    const stage=reviews.find(s=>s.points.every(id=>submitted.includes(id+'-formative'))&&!(run?.reviewedStages||[]).includes(s.id));
    const allowed=Boolean(run?.configuredAt&&!protectedTask&&!run?.activeJudgment&&(stage||run?.reviewedStages?.length||submitted.includes('V14-C1-post')));
    return {allowed,readOnly:!stage,stage:stage?.id||null,message:protectedTask?'独立作答中，提交后可查看回顾。':allowed?stage?'回顾本阶段学习':'查看已完成的学习回顾':'完成前两个知识点的检测后开放；之后可在这里查看。'};
  }
  return Object.freeze({version:'three-stages-two-reconfigurations-v1',stages:Object.freeze(stages),reviews:Object.freeze(reviews),order:Object.freeze(order),crosses,completed,
    reviewWindow,reviewAfter:id=>reviews.find(s=>s.points.at(-1)===point(id))||null});
});
