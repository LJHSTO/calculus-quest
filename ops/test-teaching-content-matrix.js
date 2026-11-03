"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),goals=require('../lib/support-goals'),adapter=require('../lib/proactive-policy/adapters/functions-limits-r2');
const points=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints);
const rows=[],actions={L1:'elicit_self_explanation',L2:'concept_hint',L3:'decompose_subgoal',L4:'next_step_hint',L5:'partial_worked_example'};
for(const point of points)for(const resource of [{type:'slide',title:point.slide.title},...point.resourceCandidates])for(const level of Object.keys(actions)){
 const input={scope:point.id,sceneType:resource.type,need:{need:'concept',note:''},plan:{primaryGoal:'cognitive',strategy:'concept_hint',dose:level==='L2'?'brief':'guided',knowledgeScaffoldLevel:level}};
 const prompt=goals.promptFor(input),data=JSON.parse(prompt.user);if(resource.type!=='slide'){assert.equal(data.scene.activity.title,resource.title);assert.ok(data.scene.activity.controls);assert.equal(data.scene.activity.task,resource.teachingContext.task);}assert.ok(prompt.system.includes(level));
 assert.ok(!Object.hasOwn(data.lesson,'context'));assert.ok(!/"answer"|"correctOption"|formativeQuiz|postQuiz/.test(prompt.user));
 const fallback=goals.fallbackFor(input);assert.ok(fallback.message&&fallback.nextStep);
 const direct=adapter.renderAction(actions[level],{knowledgePointId:point.id,currentSceneType:resource.type,unitId:point.id});assert.ok(direct.intervene&&direct.body.length>8);
 assert.equal(direct.body,fallback.message,'直接提示与失败回退复用对应层级内容');
 rows.push({知识点:point.id,活动:resource.title,场景:resource.type,档位:level,结构检查:'通过',教师内容审阅:'待审阅',生成提示词:prompt,直接提示:direct.body,失败回退:fallback});
}
for(const point of points)for(const sceneType of ['slide',...point.resourceCandidates.map(r=>r.type)])assert.equal(new Set(Object.values(actions).map(a=>adapter.renderAction(a,{knowledgePointId:point.id,sceneType}).body)).size,5,'五级内容不能重复');
assert.equal(rows.length,150);const dir=path.resolve(__dirname,'../output/学生体验修复验收/教学内容');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'五级支架全部路径核验.json'),JSON.stringify({passed:true,combinations:150,scenes:30,levels:5,paths:['生成提示词','直接提示','失败回退'],teacherReview:'pending',rows},null,2));
console.log('通过：30份课件 × L1–L5 共150个组合；每个组合核对生成提示词、直接提示和失败回退。此结果不代替真实模型与教师审阅。');
