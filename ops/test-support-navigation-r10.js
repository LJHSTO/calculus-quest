'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const goals=require('../lib/support-goals');
async function main(){
 const plan={primaryGoal:'cognitive',strategy:'concept_hint',knowledgeScaffoldLevel:'L2',dose:'brief'},base={sceneType:'game',plan,need:{need:'concept',note:'想核对这一步',source:'student_confirmed'}};
 const model='synthetic-model-for-validation',answer=nextStep=>async()=>({text:JSON.stringify({message:'有限个相同样本只支持这些输入下的取值一致；比较新的允许输入可以尝试区分两条规则。',nextStep}),provider:'synthetic',modelInfo:{requestedModel:model}});
 for(const scope of Object.keys(goals.CURRICULUM)){
  const result=await goals.generateSupport({...base,scope},{complete:answer('在“选择理由”中勾出答案，再点击“完成”按钮。'),model});
  assert.equal(result.audit.nextStepRepaired,true);assert.equal(result.audit.fallback,false);assert.equal(result.audit.nextStepSource,'authored_activity_guard');assert.doesNotMatch(result.nextStep,/按钮|勾|点击|选择理由|填写|提交/);assert.ok(result.nextStep.length>10);
  const {audit,...content}=result;assert.equal(audit.contentHash,crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex'));
 }
 const safe='先比较同一个允许输入在两条规则下得到的输出。',kept=await goals.generateSupport({...base,scope:'GH-01-K01'},{complete:answer(safe),model});assert.equal(kept.nextStep,safe);assert.equal(kept.audit.nextStepSource,'model');
 const prompt=goals.promptFor({...base,scope:'GH-01-K01'});assert.equal(JSON.parse(prompt.user).scene.activity.controlDescriptionsAreVisibleLabels,false);assert.equal(JSON.parse(prompt.user).scene.activity.currentStageVerified,false);assert.match(prompt.system,/不是此刻可见的按钮名称/);
 const report={passed:true,at:new Date().toISOString(),version:goals.VERSION,checks:['六知识点的虚构或提前控件指令被替换为当前知识点数学动作','修正范围仅nextStep，保留模型正文与独立provider审计，不伪称整条备用回复','审计保留原建议与修正来源，contentHash覆盖实际显示内容','合格数学动作保持原文，提示明确区分功能概述与实时控件']};
 const reportPath=path.resolve(__dirname,'../output/综合课程-r10-20261106/帮助操作指引回归.json');fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
