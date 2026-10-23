"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildReplay,modelInputs}=require('../lib/education-replay'),{run,ablate}=require('../lib/education-replay-runner'),{mergeAnnotations}=require('../lib/education-annotation'),{evaluateRuns}=require('../lib/education-replay-metrics');
async function main(){
  const probe=(id,at,correct)=>({id,at,subSkill:'limit_not_point_value',correct,independent:true,serverGraded:true,responseKind:'answer'});
  const unit={knowledgePointId:'GH-02-K01',subSkill:'limit_not_point_value',opportunityId:'op1',condition:'HIDDEN_CONDITION',probes:{t0:probe('t0','2026-10-19T10:00:00Z',false),t1:probe('t1','2026-10-19T10:01:00Z',true)},decision:{action:'cancel'}};
  const source={dataClass:'engineering_synthetic_only',fingerprint:'synthetic',sessions:[{userId:'PRIVATE_ID',fingerprint:'synthetic',units:[unit]}],events:[{id:'a',user_id:'PRIVATE_ID',at:unit.probes.t0.at,event:{type:'answer',opportunityId:'op1',probe:{...unit.probes.t0,explanation:'PRIVATE_UNREVIEWED_TEXT'}}},{id:'b',user_id:'PRIVATE_ID',at:unit.probes.t1.at,event:{type:'answer',opportunityId:'op1',probe:unit.probes.t1,decision:{action:'HIDDEN_POLICY'}}},{id:'c',user_id:'PRIVATE_ID',at:'2026-10-19T10:02:00Z',event:{type:'answer',probe:{secret:'FUTURE_RESULT'}}}],processEvents:[{id:'p',user_id:'PRIVATE_ID',at:'2026-10-19T10:00:30Z',event:{type:'parameter_commit',opportunityId:'op1',data:{parameter:'x_position',value:2.999}}}]};
  const bundle=buildReplay(source,{splitSalt:'synthetic-prefix-check',allowEngineering:true}),inputs=modelInputs(bundle);
  assert.equal(inputs[0].input.history.length,3);for(const text of ['PRIVATE_ID','PRIVATE_UNREVIEWED_TEXT','HIDDEN_POLICY','HIDDEN_CONDITION','FUTURE_RESULT'])assert.equal(JSON.stringify(inputs).includes(text),false);
  const masked=ablate(inputs[0].input,'no_current_recheck');assert.equal(masked.currentEvidence,undefined);assert.equal(masked.history.some(e=>e.probe?.itemId==='t1'),false);
  const predictions=await run(inputs,{models:['synthetic-valid','synthetic-invalid','synthetic-failure'],complete:async({model})=>{if(model.endsWith('failure'))throw new Error('secret_provider_error');return {text:model.endsWith('invalid')?'not-json':JSON.stringify({action:'cancel',rationale:'独立目标题成功，撤销旧候选。',confidence:.6})};}});
  assert.equal(predictions.length,3);assert.equal(predictions.filter(r=>r.status==='ok').length,1);assert.equal(JSON.stringify(predictions).includes('secret_provider_error'),false);
  const label=id=>({caseId:bundle.cases[0].caseId,inputHash:bundle.cases[0].inputHash,raterId:id,source:'human_independent',action:'cancel',reason:'仅合成标签，验证管线'});
  const labeled=mergeAnnotations(bundle,[label('synthetic-A')],[label('synthetic-B')]);assert.equal(labeled.annotationAudit.agreement,1);
  assert.throws(()=>mergeAnnotations(bundle,[label('same')],[label('same')]),/不同标注员/);
  const scores=evaluateRuns(labeled,predictions,'test');assert.equal(scores.runs.length,3);assert.equal(scores.runs.find(r=>r.model==='synthetic-valid').successRateAllGold,1);assert.equal(scores.runs.find(r=>r.model==='synthetic-failure').successRateAllGold,0);
  const human={...source,dataClass:'human_consented_research'};assert.equal(buildReplay(human,{splitSalt:'synthetic-prefix-check'}).caseCount,0);
  const restricted=structuredClone(inputs.slice(0,1));restricted[0].input.allowedActions=['silent','present','defer'];
  const rejected=await run(restricted,{models:['synthetic-invalid-action'],complete:async()=>({text:JSON.stringify({action:'cancel',rationale:'无候选不能撤销',confidence:.9})})});
  assert.equal(rejected[0].status,'failed');assert.equal(rejected[0].error,'invalid_output');assert.equal(rejected[0].action,null);
  const output=path.resolve(__dirname,'../output/常规平台全量完善-2026-10-18/回放合成验收');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'合成索引.json'),JSON.stringify(bundle,null,2));fs.writeFileSync(path.join(output,'合成模型输入.jsonl'),inputs.map(JSON.stringify).join('\n'));fs.writeFileSync(path.join(output,'合成预测.jsonl'),predictions.map(JSON.stringify).join('\n'));fs.writeFileSync(path.join(output,'合成评分.json'),JSON.stringify(scores,null,2));
  console.log('通过：完整已采集前缀、截止时间/身份/条件隔离、消融防旁路、三模型执行与技术失败保留、双标/裁决、分组评分。全部为合成数据，无真实模型调用。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
