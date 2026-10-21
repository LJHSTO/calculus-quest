"use strict";
// Offline decision quality only. Never turns a replay score into a learning effect.
const actions = ["silent", "present", "cancel", "defer"];
function evaluate(bundle, predictions, split = "test") {
  if (!["development", "validation", "test"].includes(split)) throw new Error("未知评测集合");
  const allCases = new Map(bundle.cases.map(c => [c.caseId, c]));
  if (allCases.size !== bundle.cases.length || !Array.isArray(predictions)) throw new Error("评测格式或案例编号不正确");
  const predicted = new Map();
  for (const row of predictions) {
    const c = allCases.get(row.caseId);
    if (!c || predicted.has(row.caseId) || row.inputHash !== c.inputHash) throw new Error("预测案例重复、未知或输入摘要不匹配");
    predicted.set(row.caseId, row);
  }
  const selected = bundle.cases.filter(c => c.split === split), eligible = selected.filter(c => c.annotation?.adjudicated === true && actions.includes(c.annotation.preferredAction));
  const confusion = Object.fromEntries(actions.map(a => [a, Object.fromEntries(actions.map(b => [b, 0]))]));
  let invalid = 0, missing = 0, correct = 0, scored = 0;
  for (const c of eligible) {
    const row = predicted.get(c.caseId);
    if (!row) { missing++; continue; }
    if (!actions.includes(row.action)) { invalid++; continue; }
    scored++; confusion[c.annotation.preferredAction][row.action]++; correct += row.action === c.annotation.preferredAction ? 1 : 0;
  }
  const classes = actions.map(action => {
    const tp = confusion[action][action], support = actions.reduce((n, a) => n + confusion[action][a], 0), totalPredicted = actions.reduce((n, a) => n + confusion[a][action], 0);
    return { action, support, precision: totalPredicted ? tp / totalPredicted : null, recall: support ? tp / support : null, f1: support + totalPredicted ? 2 * tp / (support + totalPredicted) : null };
  });
  const values = classes.filter(c => c.f1 !== null);
  return { dataClass: bundle.dataClass, split, cases: selected.length, goldCases: eligible.length, predictions: selected.filter(c => predicted.has(c.caseId)).length,
    scored, invalid, missing, coverage: eligible.length ? scored / eligible.length : null,
    accuracyOnValid: scored ? correct / scored : null,
    // Failure/missing-aware success rate prevents hiding errors in a smaller denominator.
    successRateAllGold: eligible.length ? correct / eligible.length : null,
    macroF1OnObservedClasses: values.length ? values.reduce((n, c) => n + c.f1, 0) / values.length : null,
    classes, confusion, limitations: ["未裁决标签不计质量分；实际规则动作不是金标签", "有效输出准确率必须连同全金标签成功率和覆盖率报告", "F1仅在有真值或预测的类别间平均，需同时报告类别支持数", "固定轨迹回放不估计替代策略的真人学习效果"] };
}
function evaluateRuns(bundle,predictions,split="test"){
  const groups=new Map();for(const row of predictions){const k=JSON.stringify([row.model||"unspecified",row.variant||"full",row.repeat||0]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}
  const summaries=[];
  for(const [key,rows]of groups){
    const [model,variant,repeat]=JSON.parse(key),metrics=evaluate(bundle,rows,split),byCase=new Map(rows.map(r=>[r.caseId,r]));
    const byPerson=new Map();for(const c of bundle.cases.filter(c=>c.split===split&&c.annotation?.adjudicated&&actions.includes(c.annotation.preferredAction))){if(!byPerson.has(c.participant))byPerson.set(c.participant,{correct:0,n:0});const p=byPerson.get(c.participant);p.n++;p.correct+=byCase.get(c.caseId)?.action===c.annotation.preferredAction?1:0;}
    let interval=null;const people=[...byPerson.values()];
    if(people.length>=2){let seed=20261019;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},samples=[];for(let b=0;b<2000;b++){let n=0,ok=0;for(let i=0;i<people.length;i++){const p=people[Math.floor(random()*people.length)];n+=p.n;ok+=p.correct;}samples.push(ok/n);}samples.sort((a,b)=>a-b);interval=[samples[50],samples[1949]];}
    const latency=rows.filter(r=>Number.isFinite(r.latencyMs)).map(r=>r.latencyMs).sort((a,b)=>a-b);
    summaries.push({model,variant,repeat,...metrics,participantCount:people.length,participantBootstrap95:interval,bootstrapSeed:20261019,bootstrapReplicates:2000,latencyMedianMs:latency.length?latency[Math.floor(latency.length/2)]:null});
  }
  return {dataClass:bundle.dataClass,split,runs:summaries,limitations:["区间按参与者整簇重采样；重复调用不能当作新增学生","此报告未提供模型间配对差异检验；正式比较需固定模型列表与同一案例分母","人工未知/缺失标签不计质量分，技术失败计入全金标签分母","回放不测量真人反事实学习收益"]};
}
module.exports = { evaluate,evaluateRuns };
