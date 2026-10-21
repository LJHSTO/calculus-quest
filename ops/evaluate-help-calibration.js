"use strict";
// Reads real, independently annotated opportunities. Never invents labels or
// installs tuned thresholds in production. Holdout is at participant level.
const fs=require("node:fs"),crypto=require("node:crypto");
function evaluate(rows,{target="need",seed="calibration-v1"}={}){
  if(!["need","interruptibility"].includes(target))throw new Error("target must be need or interruptibility");
  const scoreKey=target==="need"?"helpNeedScore":"interruptibilityScore";
  const labelKey=target==="need"?"needLabel":"interruptibilityLabel";
  const valid=rows.filter(r=>r.participantId && r.opportunityId && [0,1].includes(r[labelKey])
    && typeof r[scoreKey]==="number" && Number.isFinite(r[scoreKey]) && r[scoreKey]>=0 && r[scoreKey]<=1);
  const seen=new Set();
  for(const row of valid){const key=JSON.stringify([row.participantId,row.opportunityId]);if(seen.has(key))throw new Error("同一机会重复；请先完成双人标注裁决");seen.add(key);}
  const testIds=new Set(valid.map(r=>r.participantId).filter(id=>crypto.createHash("sha256").update(seed+":"+id).digest().readUInt32BE()%5===0));
  const train=valid.filter(r=>!testIds.has(r.participantId)),test=valid.filter(r=>testIds.has(r.participantId));
  if(!train.length||!test.length||new Set(train.map(r=>r[labelKey])).size<2||new Set(test.map(r=>r[labelKey])).size<2)
    throw new Error("训练与独立学生留出集均需包含两类标签；当前数据不足，不能报告校准完成");
  const metrics=(data,threshold)=>{
    let tp=0,fp=0,tn=0,fn=0;
    for(const r of data){if(r[scoreKey]>=threshold){if(r[labelKey])tp++;else fp++;}else{if(r[labelKey])fn++;else tn++;}}
    return {n:data.length,tp,fp,tn,fn,sensitivity:tp/(tp+fn),specificity:tn/(tn+fp),
      precision:tp+fp?tp/(tp+fp):null,balancedAccuracy:(tp/(tp+fn)+tn/(tn+fp))/2};
  };
  const thresholds=Array.from({length:101},(_,i)=>i/100);
  const threshold=thresholds.sort((a,b)=>metrics(train,b).balancedAccuracy-metrics(train,a).balancedAccuracy || b-a)[0];
  return {target,method:"participant-held-out-threshold-selection-v1",seed,valid:valid.length,excluded:rows.length-valid.length,
    trainParticipants:new Set(train.map(r=>r.participantId)).size,testParticipants:testIds.size,selectedThreshold:threshold,
    train:metrics(train,threshold),holdout:metrics(test,threshold),probabilityCalibrated:false,
    note:"仅评估规则分数的决策阈值；不是概率校准、知识追踪验证或学习效果证明。未自动应用。"};
}
if(require.main===module){
  const [input,output,target]=process.argv.slice(2);
  if(!input||!output)throw new Error("用法：node ops/evaluate-help-calibration.js 标注.jsonl 阈值核验.json [need|interruptibility]");
  const rows=fs.readFileSync(input,"utf8").replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  fs.writeFileSync(output,JSON.stringify(evaluate(rows,{target:target||"need"}),null,2),"utf8");
  console.log("已写入阈值核验；未修改平台配置。");
}
module.exports={evaluate};
