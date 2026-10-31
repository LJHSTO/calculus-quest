"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),goals=require('../lib/support-goals'),adapter=require('../lib/proactive-policy/adapters/functions-limits-r2');
const points=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1').modules.flatMap(m=>m.knowledgePoints);
const rows=[],actions={L2:'concept_hint',L3:'decompose_subgoal',L5:'partial_worked_example'};
for(const point of points)for(const resource of point.resourceCandidates)for(const level of Object.keys(actions))for(const initiation of ['ask','cue']){
 const input={scope:point.id,sceneType:resource.type,need:{need:'concept',note:''},plan:{primaryGoal:'cognitive',strategy:'concept_hint',dose:level==='L2'?'brief':'guided',knowledgeScaffoldLevel:level}};
 const prompt=goals.promptFor(input),data=JSON.parse(prompt.user);assert.equal(data.scene.activity.title,resource.title);assert.ok(prompt.system.includes(level));
 assert.ok(!Object.hasOwn(data.lesson,'context'));assert.ok(!/"answer"|"correctOption"|formativeQuiz|postQuiz/.test(prompt.user));
 const fallback=goals.fallbackFor(input);assert.ok(fallback.message&&fallback.nextStep);
 const direct=adapter.renderAction(actions[level],{knowledgePointId:point.id,currentSceneType:resource.type,unitId:point.id});assert.ok(direct.intervene&&direct.body.length>8);
 rows.push({知识点:point.id,活动:resource.title,场景:resource.type,档位:level,发起方式:initiation==='ask'?'确认后帮助':'直接知识提示',结构检查:'通过',教师内容审阅:'待审阅',模板正文:direct.body,回退正文:fallback.message});
}
for(const point of points)assert.equal(new Set(Object.values(actions).map(a=>adapter.renderAction(a,{knowledgePointId:point.id}).body)).size,3,'三档模板实际有不同份量');
assert.equal(rows.length,144);const dir=path.resolve(__dirname,'../output/学生体验修复验收/教学内容');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'结构与模板验收.json'),JSON.stringify({passed:true,cases:rows.length,teacherReview:'pending',rows},null,2));
console.log('教学内容结构验收通过：24个互动活动 × 3档知识支持 × 2种发起方式，共144个组合；数学和教学内容留作独立审阅。');
