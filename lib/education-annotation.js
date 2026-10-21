"use strict";
const valid=['silent','present','cancel','defer','unknown'];
function mergeAnnotations(bundle,a,b,adjudications=[]){
  const index=rows=>{const m=new Map();for(const r of rows){const c=bundle.cases.find(c=>c.caseId===r.caseId);if(!c||r.inputHash!==c.inputHash||m.has(r.caseId)||r.source!=='human_independent'||!r.raterId||!valid.includes(r.action)||!r.reason?.trim())throw new Error('标注缺失、重复、未盲化或摘要不匹配');m.set(r.caseId,r);}return m;};
  const left=index(a),right=index(b),decided=index(adjudications),copy=structuredClone(bundle);let paired=0,agreement=0;const countsA={},countsB={},conflicts=[];
  for(const c of copy.cases){const x=left.get(c.caseId),y=right.get(c.caseId);if(!x||!y)continue;if(x.raterId===y.raterId)throw new Error('双标必须由不同标注员独立完成');paired++;countsA[x.action]=(countsA[x.action]||0)+1;countsB[y.action]=(countsB[y.action]||0)+1;
    let winner=null;if(x.action===y.action){agreement++;winner=x;}else{conflicts.push(c.caseId);winner=decided.get(c.caseId);if(winner&&[x.raterId,y.raterId].includes(winner.raterId))throw new Error('分歧需由第三位标注员裁决');}
    c.annotation={...c.annotation,ratings:[x,y],preferredAction:winner&&winner.action!=='unknown'?winner.action:null,adjudicated:Boolean(winner),raterIds:[x.raterId,y.raterId,...(winner&&winner!==x?[winner.raterId]:[])],adjudication:winner&&winner!==x?winner:null};
  }
  const observed=paired?agreement/paired:null,expected=paired?valid.reduce((n,v)=>n+(countsA[v]||0)*(countsB[v]||0)/paired**2,0):null;
  return {...copy,annotationAudit:{paired,agreement:observed,cohenKappa:paired&&expected<1?(observed-expected)/(1-expected):null,conflicts,unresolved:conflicts.filter(id=>!decided.has(id)),unknownRemainsUnscored:true}};
}
module.exports={mergeAnnotations};
