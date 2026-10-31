"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),goals=require('../lib/support-goals'),llm=require('../lib/llm');
async function main(){
 assert.equal(process.env.LIVE_MODEL_CONTENT,'1','真实内容抽检需显式启用');
 const config=llm._internals.parseLlmConfigText(fs.readFileSync(process.env.LLM_CONFIG_FILE,'utf8'));assert.equal(new URL(config.baseUrl).hostname,'api.openai.com');
 const points=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints),rows=[];
 for(const [i,p]of points.entries())for(let j=0;j<2;j++){
  const scene=p.resourceCandidates[(i+j)%p.resourceCandidates.length],level=['L2','L3','L5'][(i+j)%3];
  const input={scope:p.id,sceneType:scene.type,need:{need:'concept',note:'合成教学内容抽检：请帮助我理解当前活动。'},plan:{primaryGoal:'cognitive',strategy:'concept_hint',dose:level==='L2'?'brief':'guided',knowledgeScaffoldLevel:level}};
  const content=await goals.generateSupport(input,{complete:llm.completeChat,live:true,model:config.model});
  rows.push({知识点:p.id,活动:scene.title,活动说明:scene.description,场景:scene.type,档位:level,正文:content.message,下一步:content.nextStep,审计:content.audit,教师审阅:{数学正确性:null,活动匹配:null,帮助份量:null,保留独立思考:null,测验答案保护:null,备注:''}});
  console.log(`完成 ${rows.length}/12：${p.id} ${scene.type} ${level}，${content.audit.fallback?'回退':'真实模型'}`);
 }
 const report={passed:rows.every(r=>!r.审计.fallback),at:new Date().toISOString(),sampleCount:rows.length,teacherReview:'pending',synthetic:true,rows};
 const dir=path.resolve(__dirname,'../output/学生体验修复验收/教学内容');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'真实模型内容样本.json'),JSON.stringify(report,null,2));
 assert.equal(report.passed,true,'全部抽检均须实际调用成功；失败样本已经保存');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
