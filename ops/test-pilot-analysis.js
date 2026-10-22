"use strict";
const assert=require("node:assert/strict"),{summarize}=require("./summarize-pilot-study");
const d={schemaVersion:"pilot-measurement-v1",versions:[{id:"v",hash:"h"}],enrollments:[{id:"e",participantCode:"P-1",status:"finished"},{id:"w",status:"withdrawn"}],
 opportunities:[{id:"o",enrollmentId:"e",versionId:"v",protocolHash:"h",stratum:"silent",eligible:true,probability:.35,draw:.1,sampled:true},
 {id:"m",enrollmentId:"e",versionId:"v",protocolHash:"h",stratum:"triggered",eligible:true,probability:1,draw:.2,sampled:true},
 {id:"w",enrollmentId:"w",versionId:"v",protocolHash:"h",stratum:"silent",eligible:true,probability:1,draw:.2,sampled:true}],
 answers:[{opportunityId:"o",need:"uncertain",timing:null},{opportunityId:"w",need:"yes",timing:5}],annotations:[]};
const r=summarize(d);assert.equal(r.valid,true);assert.equal(r.excludedWithdrawn,1);assert.equal(r.frames.silent.uncertain,1);assert.equal(r.frames.silent.yes,0);assert.equal(r.frames.triggered.missing,1);assert.equal(r.frames.silent.timingMean,null);assert.equal(r.labeling.rawCognitiveAgreement,null);
d.answers.push({...d.answers[0]});assert.equal(summarize(d).valid,false);d.answers.pop();d.opportunities[0].probability=0;assert.equal(summarize(d).valid,false);
console.log("预试分析检查通过：撤回排除、分层、未知、缺失、重复与抽样一致性。");
