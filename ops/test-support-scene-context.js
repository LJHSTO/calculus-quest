'use strict';
const assert=require('node:assert/strict'),goals=require('../lib/support-goals');
const route=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
let count=0;
for(const p of route.modules.flatMap(m=>m.knowledgePoints))for(const resource of p.resourceCandidates){
 const input={scope:p.id,sceneType:resource.type,need:{need:'concept',note:''},plan:{primaryGoal:'cognitive',strategy:'concept_hint',dose:'brief',knowledgeScaffoldLevel:'L2'}};
 const prompt=goals.promptFor(input),data=JSON.parse(prompt.user);
 assert.equal(data.scene.activity.title,resource.title);assert.equal(data.scene.activity.description,resource.description);
 assert.equal(Object.hasOwn(data.lesson,'context'),false,'概念帮助不混入其他生活背景');
 assert.equal(data.scene.type,resource.type);assert.match(prompt.system,/必须使用这个活动中的对象/);count++;
}
const motivation=JSON.parse(goals.promptFor({scope:'GH-01-K01',sceneType:'game',need:{need:'value'},plan:{primaryGoal:'motivational',strategy:'value_connection',dose:'brief'}}).user);
assert.ok(motivation.lesson.context,'价值联系仍可使用生活背景');
console.log(`通过：${count}个当前活动准确进入提示词，概念帮助与生活价值联系分开。`);
