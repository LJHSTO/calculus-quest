'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const r10=require('./functions-limits-r10'),r11=require('./functions-limits-r11');
const figures=require('./assessment-figures-r11'),probes=require('./functions-limits-probes-r10');
const banks=new Map([[r10.version,r10],[r11.version,r11]]);
const formativeVersion='functions-limits-formative-r11-20261107';
const selections=[[8,10],[9,10],[9,10],[8,9],[8,10],[9,10]];
function questionIdentityFingerprint(route){
  const identity=(route.chapters||[]).flatMap(chapter=>[
    ...['preQuiz','postQuiz'].flatMap(phase=>(chapter.flow?.[phase]?.questions||[]).map(q=>({chapterId:chapter.id,unitId:`${chapter.id}-${phase==='preQuiz'?'pre':'post'}`,id:q.id,sourceId:q.sourceId,type:q.type,knowledgePointIds:q.knowledgePointIds,points:q.points}))),
    ...(chapter.modules||[]).flatMap(m=>(m.knowledgePoints||[]).flatMap(p=>(p.formativeQuiz?.questions||[]).map(q=>({chapterId:chapter.id,unitId:`${p.id}-formative`,id:q.id,sourceId:q.sourceId,type:q.type,knowledgePointIds:q.knowledgePointIds,adaptiveRole:q.adaptiveRole,points:q.points}))))
  ]);return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
function forVersion(version=r11.version){return banks.get(version)||null;}
function versionForRun(run){
  if(!run)return r11.version;
  const frozen=run.assessmentVersion||run.runtimeManifest?.proactiveDefinition?.courseAssessmentVersion;
  if(frozen && banks.has(frozen))return frozen;
  if(run.assessmentVersion)return null;
  return /(?:^|-)r11(?:-|$)/.test(run.studyVersion||'')?r11.version:r10.version;
}
function formative(pointIndex){return selections[pointIndex].map((variant,i)=>{
  const q=probes.raw(pointIndex,variant),scope=r11.ids[pointIndex];
  return {...q,id:`fl-r11-formative-${scope}-${i+1}`,type:'single',question:q.prompt,points:1,answer:[q.answer],
    knowledgePointId:scope,knowledgePointIds:[scope],instrumentVersion:formativeVersion,assessmentRole:'common_formative',
    sourceProbeId:q.id,options:[...q.options,{value:'__unknown__',label:'我不会'},{value:'__skip__',label:'暂不作答'}]};
});}
function routeFor(route,version=r11.version){
  if(!forVersion(version))throw new Error('数学测量版本不可用，原记录未改动。');
  const copy=structuredClone(route);
  if(version===r10.version)return copy;
  const chapter=copy.chapters.find(c=>c.id==='V14-C1');if(!chapter)return copy;
  copy.versionId=r11.version;chapter.assessmentVersion=r11.version;
  chapter.assessmentRevision={...chapter.assessmentRevision,version:r11.version};
  for(const phase of ['pre','post']){
    const quiz=chapter.flow[phase+'Quiz'],form=phase==='pre'?'X':'Y',alternate=phase==='pre'?'Y':'X';
    Object.assign(quiz,{instrumentVersion:r11.version,questionCount:12,questions:r11.questions(phase,form),alternateFormQuestions:r11.questions(phase,alternate)});
  }
  for(const point of chapter.modules.flatMap(m=>m.knowledgePoints||[])){
    const index=r11.ids.indexOf(point.id);if(index<0)continue;
    point.formativeQuiz={...point.formativeQuiz,questionCount:2,instrumentVersion:formativeVersion,questions:formative(index)};
  }
  copy.quizKnowledgePointCuration={...copy.quizKnowledgePointCuration,questionSetPreserved:false,questionSetFingerprint:questionIdentityFingerprint(copy)};
  return copy;
}
const figureRecords=new Map(figures.assets().map(f=>[f.src,f]));
function publicFigure(value){
  const known=figureRecords.get(value?.src);if(!known)return null;
  return figures.publicFigure(known.id);
}
function verifyFigureAssets(root){
  const digests={};for(const item of figureRecords.values()){
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,item.src))).digest('hex');
    if(digest!==item.sha256)throw new Error(`测量图形完整性校验失败：${item.src}`);
    digests[item.src]=digest;
  }return digests;
}
function exportInstruments(){return Object.fromEntries([...banks].map(([version,bank])=>[version,{
  version,forms:Object.fromEntries(['X','Y','Z'].map(form=>[form,bank.forms(form)])),
  delayed:require(version===r11.version?'./functions-limits-delayed-r11':'./functions-limits-delayed-r10'),
  ...(version===r11.version?{formativeVersion,formative:r11.ids.map((id,i)=>({knowledgePointId:id,items:formative(i)})),figures:[...figureRecords.values()].map(({svg,...record})=>record)}:
    {formative:require('../../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints||[]).map(p=>({knowledgePointId:p.id,items:p.formativeQuiz?.questions||[]}))})
}]));}
module.exports={version:r11.version,legacyVersion:r10.version,formativeVersion,forVersion,versionForRun,routeFor,questionIdentityFingerprint,formative,publicFigure,verifyFigureAssets,exportInstruments,
  versions:[...banks.keys()],figurePaths:[...figureRecords.keys()],delayedVersion:version=>version===r11.version?'functions-limits-delayed-r11-20261107':'functions-limits-delayed-r10',formativeCount:version=>version===r11.version?2:3};
