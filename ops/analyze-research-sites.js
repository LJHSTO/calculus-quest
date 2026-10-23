"use strict";
const fs=require("node:fs"),path=require("node:path");
const mean=xs=>{const clean=xs.filter(x=>typeof x==="number"&&Number.isFinite(x));return clean.length?clean.reduce((a,b)=>a+b,0)/clean.length:null;};
function summarize(data){
 if(data?.schemaVersion!=="research-sites-export-v1"||!Array.isArray(data.sessions))throw new Error("不是支持的研究导出格式");
 const rows=data.sessions.filter(s=>s.allocation).map(s=>{
  const survey=s.survey?.responses||{},choices=[survey.choice_accept,survey.choice_continue,survey.choice_correct,Number.isFinite(survey.choice_pressure)?8-survey.choice_pressure:null];
  const probes=s.units.map(u=>u.probes?.outcome).filter(Boolean),confidencePairs=probes.filter(p=>p.independent&&typeof p.correct==="boolean"&&Number.isFinite(p.confidence));
  const transfer=s.quizzes.transfer,retention=s.quizzes.retention;
  // This export uses r4: ten objective items worth eight points each.
  const objective=q=>q?{score:q.results.filter(r=>r.maxScore===8).reduce((n,r)=>n+(r.score||0),0),maxScore:80,pendingShortAnswerReview:q.pendingReview||0}:null;
  const offers=s.units.flatMap(u=>u.offers),feedback=s.units.flatMap(u=>u.feedback);
  const commonFeedback=s.units.flatMap(u=>u.commonFeedback||[]);
  const primaryWindows=commonFeedback.filter(f=>(data.protocol.study?.id!=="memory"||f.window.returnVisit)&&["需要","不需要"].includes(f.responses.need));
  return {participant:s.participant,sessionId:s.id,arm:s.allocation.arm,dataClass:s.dataClass,phase:s.phase,
   pre:objective(s.quizzes.pre),post:objective(s.quizzes.post),
   transferScore:transfer?.score??null,transferMax:transfer?.maxScore??null,retentionScore:retention?.score??null,
   perceivedChoiceControl:choices.filter(Number.isFinite).length>=3?mean(choices):null,
   choiceItemCount:choices.filter(Number.isFinite).length,managementBurden:survey.management_burden??null,
   confidenceBrier:confidencePairs.length>=4?mean(confidencePairs.map(p=>(p.confidence/100-Number(p.correct))**2)):null,confidencePairs:confidencePairs.length,
   taskEfficacyBefore:mean(Object.entries(s.baseline||{}).filter(([k])=>k.startsWith("efficacy_")).map(([,v])=>v)),
   taskEfficacyAfter:mean(Object.entries(survey).filter(([k])=>k.startsWith("efficacy_")).map(([,v])=>v)),
   offers:offers.length,visibleInquiries:offers.filter(o=>o.inquiryExposure).length,visibleSupports:offers.filter(o=>o.exposure).length,
   accepted:offers.filter(o=>o.acceptedAt).length,scopedPresentations:offers.filter(o=>o.authorization==="scoped_grant").length,
   reportedFit:mean(feedback.filter(f=>f.sampling==="offered").map(f=>f.responses.fit)),
   commonWindowFeedback:commonFeedback,
   primaryWindowReports:primaryWindows.length,
   perceivedWindowMismatch:mean(primaryWindows.map(f=>Number(f.window.offered!==(f.responses.need==="需要")))),
   noOfferFeedback:feedback.filter(f=>f.sampling==="no_offer").length,
   noOfferNeedReports:feedback.filter(f=>f.sampling==="no_offer"&&f.responses.need==="需要").length,
   frameworkCases:s.caseResponses||[],frameworkDesign:s.designResponse||null};
 });
 const arms=[...new Set(rows.map(r=>r.arm))];
 return {schemaVersion:"research-sites-summary-v1",protocolId:data.protocol.id,protocolFingerprint:data.protocol.fingerprint,
  dataClass:data.dataClass,limitations:["描述性准备表，不自动输出显著性或因果结论","无反馈不是不需要；不将日志当作独立被试","前后测简答待评分时不能使用objective分数冒充总分","正式模型比较必须遵守预先冻结的分析计划；退出数据以允许使用的范围为准"],
  participants:rows,groups:arms.map(arm=>{const group=rows.filter(r=>r.arm===arm);return {arm,allocated:group.length,completed:group.filter(r=>r.phase==="complete").length,
   transferAvailable:group.filter(r=>r.transferScore!==null).length,transferMean:mean(group.map(r=>r.transferScore)),
   choiceAvailable:group.filter(r=>r.perceivedChoiceControl!==null).length,choiceMean:mean(group.map(r=>r.perceivedChoiceControl))};})};
}
if(require.main===module){const input=process.argv[2],output=process.argv[3];if(!input||!output)throw new Error("用法：node ops/analyze-research-sites.js 导出.json 汇总.json");const result=summarize(JSON.parse(fs.readFileSync(path.resolve(input),"utf8")));fs.writeFileSync(path.resolve(output),JSON.stringify(result,null,2));console.log(JSON.stringify({participants:result.participants.length,groups:result.groups.length,dataClass:result.dataClass}));}
module.exports={summarize};
