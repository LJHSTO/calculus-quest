"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {getStudy}=require("../lib/research-sites/catalog"),{decide}=require("../lib/research-sites/policy");
const rows=[],now=2000000,scope="GH-01-K01";
for(const safeIdleMs of [1000,3000,5000,10000])for(const cooldownMs of [60000,120000,180000])for(const candidateTtlMs of [300000,600000,900000]){
 const study=getStudy("authorization");Object.assign(study.parameters,{safeIdleMs,cooldownMs,candidateTtlMs});
 const base={study,arm:"confirm_each",now,evidence:{initial:{id:"synthetic-wrong",scope,at:now-20000,correct:false,independent:true,serverGraded:true},candidateAt:now-20000},context:{scope,phase:"explore",visible:true,idleMs:5000}};
 const neutral=decide({...base,evidence:{quietMs:600000,clicks:0}});assert.equal(neutral.action,"silent");
 assert.equal(decide({...base,context:{...base.context,phase:"pre"}}).action,"silent");
 assert.equal(decide({...base,authority:{declinedPoint:scope}}).action,"silent");
 assert.equal(decide({...base,context:{...base.context,typing:true}}).action,"wait");
 assert.equal(decide({...base,evidence:{...base.evidence,candidateAt:now-candidateTtlMs}}).action,"cancel");
 const initial=decide(base),repeated=decide({...base,budget:{lastOfferAt:now-90000}});
 rows.push({safeIdleMs,cooldownMs,candidateTtlMs,atFiveSeconds:initial.action,atNinetySecondsSinceOffer:repeated.action});
}
const dir=process.env.RESEARCH_SENSITIVITY_OUTPUT||path.resolve(__dirname,"../output/多研究网站与阈值依据-2026-10-23");fs.mkdirSync(dir,{recursive:true});
const result={passed:true,synthetic:true,parameterCombinations:rows.length,notCalibration:true,interpretation:"规则边界和保护约束检查；合成轨迹不能估计目标群体最优阈值、识别准确率或学习效果。",rows};fs.writeFileSync(path.join(dir,"参数敏感性合成检查.json"),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,parameterCombinations:rows.length,notCalibration:true}));
