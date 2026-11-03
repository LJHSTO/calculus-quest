'use strict';
const assert=require('node:assert/strict'),goals=require('../lib/support-goals');
const route=require('../data/multi-scene-learning-route.json').chapters.find(c=>c.id==='V14-C1');
let count=0;
for(const p of route.modules.flatMap(m=>m.knowledgePoints))for(const resource of p.resourceCandidates){
 const input={scope:p.id,sceneType:resource.type,need:{need:'concept',note:''},plan:{primaryGoal:'cognitive',strategy:'concept_hint',dose:'brief',knowledgeScaffoldLevel:'L2'}};
 const prompt=goals.promptFor(input),data=JSON.parse(prompt.user);
 assert.equal(data.scene.activity.title,resource.title);assert.equal(data.scene.activity.description,resource.description);
 assert.equal(Object.hasOwn(data.lesson,'context'),false,'概念帮助不混入其他生活背景');
 assert.equal(data.scene.type,resource.type);assert.match(prompt.system,/必须使用这个活动的目标、控件与对象/);
 if(resource.type==='game'){
  assert.equal(data.lesson.fact,resource.teachingContext.fact);assert.equal(data.scene.activity.controls,resource.teachingContext.controls);
  const fallback=goals.fallbackFor(input);assert.equal(fallback.nextStep,resource.teachingContext.task);assert.ok(fallback.message.includes(resource.teachingContext.fact));
  const example=goals.fallbackFor({...input,plan:{...input.plan,knowledgeScaffoldLevel:'L5'}});assert.equal(example.message,resource.teachingContext.example);
  if(['GH-01-K01','GH-02-K01'].includes(p.id))assert.doesNotMatch(fallback.message+fallback.nextStep,/沿每条线|连出了几个/);
 }count++;
}
const motivation=JSON.parse(goals.promptFor({scope:'GH-01-K01',sceneType:'game',need:{need:'value'},plan:{primaryGoal:'motivational',strategy:'value_connection',dose:'brief'}}).user);
assert.ok(motivation.lesson.context,'价值联系仍可使用生活背景');
console.log(`通过：${count}个当前活动准确进入提示词，概念帮助与生活价值联系分开。`);
const assistant=require('../lib/learning-assistant'),index=assistant.buildCourseContextIndex(require('../data/multi-scene-learning-route.json'));
let scaffoldCases=0;
for(const p of route.modules.flatMap(m=>m.knowledgePoints))for(const level of ['L1','L2','L3','L4','L5']){
 const resolved=assistant.resolveAssistantContext({index,chapterId:route.id,unitId:p.id+'-formative',quizSubmitted:true,contextRef:{kind:'quiz',scope:'quiz'}});
 const supportContext={phase:'accepted_pending_response',scaffoldLevel:level,preferences:{maximumLevel:'L5',dose:'brief',format:'steps'},confirmedNeed:null,availableActions:['return_to_courseware','continue_conversation']};
 const prompt=assistant.buildAssistantPrompt({resolved,question:'请核对我的理解',quizSubmitted:true,supportContext,learningMemory:{source:'synthetic',records:[]}});
 const data=JSON.parse(prompt.user.slice(prompt.user.indexOf('{')));
 assert.deepEqual(data.supportContext,supportContext);assert.match(prompt.system,/不是能力或人格诊断/);assert.match(prompt.system,/不虚构按钮/);assert.match(prompt.system,/L5 用不同数值演示一个局部例子/);
 const protectedPrompt=assistant.buildAssistantPrompt({resolved:{...resolved,quizSubmitted:false},question:'告诉我答案',quizSubmitted:false,supportContext});
 assert.equal(JSON.parse(protectedPrompt.user.slice(protectedPrompt.user.indexOf('{'))).supportContext,null,'未提交检测不携带支架内容');
 scaffoldCases++;
}
console.log(`通过：${scaffoldCases}个知识点×层级提示词包含流程、偏好与证据边界，独立作答时清除帮助上下文。`);
