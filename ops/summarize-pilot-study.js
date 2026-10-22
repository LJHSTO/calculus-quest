"use strict";
// Descriptive audit only. No pseudo-replication, automatic threshold fitting,
// or substitution of nonresponse with a negative need label.
const fs=require("node:fs"),path=require("node:path");
function summarize(data){
 if(data.schemaVersion!=="pilot-measurement-v1")throw new Error("不支持的预试导出版本");
 const errors=[],unique=(rows,key,label)=>{const seen=new Set();for(const r of rows){if(!r[key]||seen.has(r[key]))errors.push(label+"缺少或重复编号");seen.add(r[key]);}return seen;};
 const es=data.enrollments||[],os=data.opportunities||[],answers=data.answers||[],annotations=data.annotations||[];
 const eids=unique(es,"id","参与记录"),oids=unique(os,"id","抽样机会");unique(answers,"opportunityId","回答");
 const versions=new Map((data.versions||[]).map(v=>[v.id,v]));
 for(const o of os){if(!eids.has(o.enrollmentId)||!versions.has(o.versionId))errors.push("抽样机会引用缺失");
  if(o.protocolHash!==versions.get(o.versionId)?.hash)errors.push("协议摘要不一致");
  if(!Number.isFinite(o.probability)||o.probability<0||o.probability>1||o.sampled&&o.probability===0)errors.push("抽样概率无效");
  if(o.sampled!==Boolean(o.draw!==null&&o.draw<o.probability))errors.push("抽签与抽中结果不一致");
 }
 for(const a of answers)if(!oids.has(a.opportunityId))errors.push("回答引用缺失");
 for(const a of annotations)if(!oids.has(a.opportunityId))errors.push("标注引用缺失");
 const allowed=new Set(es.filter(e=>e.status!=="withdrawn").map(e=>e.id)),aMap=new Map(answers.map(a=>[a.opportunityId,a]));
 const activeOps=os.filter(o=>allowed.has(o.enrollmentId));
 const count=rows=>{const result={opportunities:rows.length,eligible:0,sampled:0,answered:0,skipped:0,missing:0,yes:0,no:0,uncertain:0,decline:0,timingKnown:0,timingSum:0};
  for(const o of rows){if(o.eligible)result.eligible++;if(!o.sampled)continue;result.sampled++;const a=aMap.get(o.id);
   if(!a){result.missing++;continue;}if(a.skipped){result.skipped++;continue;}result.answered++;result[a.need]++;
   if(Number.isInteger(a.timing)){result.timingKnown++;result.timingSum+=a.timing;}}
  return {...result,timingMean:result.timingKnown?result.timingSum/result.timingKnown:null};};
 const students=es.filter(e=>allowed.has(e.id)).map(e=>({participantCode:e.participantCode,versionId:e.versionId,status:e.status,
  silent:count(activeOps.filter(o=>o.enrollmentId===e.id&&o.stratum==="silent")),triggered:count(activeOps.filter(o=>o.enrollmentId===e.id&&o.stratum==="triggered"))}));
 const pairs=[];
 for(const o of activeOps){const latest=new Map();for(const a of annotations.filter(a=>a.opportunityId===o.id&&a.role==="independent")){
  if(!latest.has(a.raterId)||latest.get(a.raterId).revision<a.revision)latest.set(a.raterId,a);}
  const xs=[...latest.values()];if(xs.length===2)pairs.push(xs);}
 return {schemaVersion:data.schemaVersion,valid:errors.length===0,errors:[...new Set(errors)],
  excludedWithdrawn:es.filter(e=>e.status==="withdrawn").length,students,
  frames:{silent:count(activeOps.filter(o=>o.stratum==="silent")),triggered:count(activeOps.filter(o=>o.stratum==="triggered"))},
  labeling:{exactlyTwoIndependentRatings:pairs.length,rawCognitiveAgreement:pairs.length?pairs.filter(p=>p[0].cognitiveDifficulty===p[1].cognitiveDifficulty).length/pairs.length:null,
   pairsContainingUnknown:pairs.filter(p=>p.some(a=>a.cognitiveDifficulty==="unknown")).length},
  notes:["本报告仅描述预试，不检验显著性，也不训练或校准概率。","静默窗口与策略候选是两个抽样框，不能直接合并为总体漏检率。",
   "机会数不是独立学生数；需要推断时按学生划分并处理重复测量。","历史分数不是即时分数，缺失、跳过和不确定不得记成不需要。",
   "退出参与者不纳入本报告；原始导出及删除请求仍须负责人按同意书处理。","原始一致率包含未知类别；它不能替代完整的标注信度报告。"]};
}
if(require.main===module){try{const input=process.argv[2],target=process.argv[3];if(!input||!target)throw new Error("用法：node ops/summarize-pilot-study.js 输入.json 输出.json");
 const report=summarize(JSON.parse(fs.readFileSync(input,"utf8").replace(/^\uFEFF/,"")));
 if(path.resolve(input)===path.resolve(target))throw new Error("输出不能覆盖原始导出");fs.writeFileSync(target,JSON.stringify(report,null,2));
 console.log(JSON.stringify({valid:report.valid,students:report.students.length,errors:report.errors}));if(!report.valid)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={summarize};
