'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),assistant=require('../lib/learning-assistant');
const index=assistant.buildCourseContextIndex(require('../data/multi-scene-learning-route.json'));
const resolved=assistant.resolveAssistantContext({index,chapterId:'V14-C1',unitId:'GH-02-K02-formative',quizSubmitted:true,contextRef:{kind:'quiz',scope:'quiz'}});
resolved.quizAttempt=assistant.buildQuizAttemptSummary({resolved,results:resolved.unit.quizQuestions.map(q=>({questionId:q.id,response:'__unknown__',isCorrect:false,status:'incorrect',score:0}))});
const cases=[
 ['理解自述','好的我知道了','左右极限都趋近5，所以双侧极限是5。点值8不改变这个结论。','acknowledgement'],
 ['已经做过','我不是已经做了吗','要不要我再给你出一道小练习，判一次左极限和右极限？','completed_task_reminder'],
 ['同意复盘','好的','我们可以回看你刚提交的第2题，先区分两侧的趋势和点值。','acknowledgement'],
 ['执行已同意步骤','我愿意','我可以用第2题带你一步一步判：先从左侧的趋势开始。','acknowledgement'],
 ['请求第一步','请从第2题的第一步带我判断','我们现在复盘第2题。','substantive_response'],
 ['单数值没有回答比较','4','第2题左侧趋近4元，右侧趋近7元。这两个值相等吗？','substantive_response'],
 ['第二个数不等于同意','7','第2题要比较左侧4元和右侧7元。它们相等吗？','substantive_response'],
 ['有效比较回答','不相等，所以双侧极限不存在','第2题两侧趋近值4元和7元相等吗？','substantive_response']
];
const fixtures=cases.map(([name,question,previous,kind])=>{
 const prompt=assistant.buildAssistantPrompt({resolved,question,quizSubmitted:true,history:[{role:'assistant',content:previous}],supportContext:{phase:'accepted_pending_response',scaffoldLevel:'L3',preferences:{maximumLevel:'L5'},availableActions:['return_to_courseware','continue_conversation']}});
 const data=JSON.parse(prompt.user.slice(prompt.user.indexOf('{')));assert.equal(data.conversationContinuity.turnKind,kind);assert.equal(data.conversationContinuity.acknowledgementIsEvidenceOfUnderstanding,false);assert.equal(data.conversationContinuity.latestAssistantMessage,previous);
 if(name==='同意复盘'||name==='执行已同意步骤')assert.equal(data.quizReviewFocus.position,2);
 assert.match(prompt.system,/不再次问要不要/);assert.match(prompt.system,/除非学生明确要求新题/);
 return {name,question,previous,prompt};
});
const out=path.resolve(__dirname,'../output/学生流程重做-20261102');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'对话回放输入.json'),JSON.stringify(fixtures,null,2));
const mixed={...resolved,contextRef:{...resolved.contextRef,questionId:resolved.unit.quizQuestions[1].id}};
mixed.quizAttempt=assistant.buildQuizAttemptSummary({resolved:mixed,results:mixed.unit.quizQuestions.map((q,i)=>({questionId:q.id,response:'__unknown__',isCorrect:i===1,status:i===1?'correct':'incorrect',score:i===1?10:0}))});
for(const [question,position] of [['请解释这道题',2],['改看第3题',3],['回看第二题',2]]){
 const prompt=assistant.buildAssistantPrompt({resolved:mixed,question,quizSubmitted:true});const data=JSON.parse(prompt.user.slice(prompt.user.indexOf('{')));
 assert.equal(data.quizReviewFocus.position,position,'明确选题应优先，答对题也能讨论');assert.equal(prompt.guidance.focusQuestionId,mixed.unit.quizQuestions[position-1].id);
 assert.equal(data.quizReview.incorrectItems.length,position===2?0:1,'答对题不能标记为错题');
}
console.log('通过：理解自述、已完成提醒、同意复盘、执行已同意步骤，均保留当前题与真实上一轮上下文。');
const questionOne=mixed.unit.quizQuestions[0].id,questionTwo=mixed.unit.quizQuestions[1].id;
const scopedHistory=[{role:'user',content:'刚才独立检查选了r=0.4。',questionId:questionOne},{role:'assistant',content:'继续计算4乘0.4。',questionId:questionOne}];
let scoped=assistant.buildAssistantPrompt({resolved:mixed,question:'请讲第二题',quizSubmitted:true,history:scopedHistory,supportContext:{lastCompletedCheck:{sourceQuestionId:questionOne,prompt:'上一题检查'}}});
let data=JSON.parse(scoped.user.slice(scoped.user.indexOf('{')));
assert.deepEqual(data.recentConversation,[]);assert.equal(data.supportContext.lastCompletedCheck,null);assert.equal(scoped.contextAudit.excludedOtherQuestionMessages,2);assert.equal(scoped.contextAudit.questionId,questionTwo);
scoped=assistant.buildAssistantPrompt({resolved:{...mixed,contextRef:{...mixed.contextRef,questionId:questionOne}},question:'请继续解释',quizSubmitted:true,history:scopedHistory});
data=JSON.parse(scoped.user.slice(scoped.user.indexOf('{')));assert.equal(data.recentConversation.length,2);assert.match(data.conversationContinuity.latestAssistantMessage,/4乘0.4/);
console.log('通过：换题过滤旧题消息与检查；同题补充解释仍保留完整接续依据。');
const emptyMemory={version:'synthetic',points:[{id:'empty',correct:0,incorrect:0,pending:0,lastObservedAt:null,sources:[]}]};
let memoryPrompt=assistant.buildAssistantPrompt({resolved:mixed,quizSubmitted:true,question:'请解释',learningMemory:emptyMemory});
assert.equal(JSON.parse(memoryPrompt.user.slice(memoryPrompt.user.indexOf('{'))).learningMemory,null);
const observation={id:'observed',correct:0,incorrect:0,pending:1,sources:[{id:'pending-source',status:'pending'}]};
memoryPrompt=assistant.buildAssistantPrompt({resolved:mixed,quizSubmitted:true,question:'请解释',learningMemory:{...emptyMemory,points:[...emptyMemory.points,observation]}});
assert.deepEqual(JSON.parse(memoryPrompt.user.slice(memoryPrompt.user.indexOf('{'))).learningMemory.points,[observation]);
console.log('通过：未观察知识点按未知处理，真实记录及待评分来源完整保留。');
const withCheck=assistant.buildAssistantPrompt({resolved:mixed,quizSubmitted:true,question:'请比较刚才的独立检查与当前题',supportContext:{lastCompletedCheck:{sourceQuestionId:questionTwo,prompt:'已提供的真实检查题',response:'学生作答'}}});
assert(!withCheck.system.includes('这里没有提供上一道题的可靠题干'),'有明确检查上下文时不能声称没有题干');
const checkContext={lastCompletedCheck:{checkId:'check-current',sourceQuestionId:questionTwo,prompt:'左侧x+4，右侧2x+6',response:'取平均值5',correctAnswer:'不能',explanation:'左右极限4和6不同'}};
const checkHistory=[{role:'assistant',content:'检查题的左右极限是4和6。',questionId:questionTwo,discussionTarget:'completed_independent_check',activeCheckId:'check-current'}];
const firstCheck=assistant.buildAssistantPrompt({resolved:mixed,quizSubmitted:true,question:'刚才的独立检查为什么错了？',history:[{role:'user',content:'解释原题',questionId:questionTwo},{role:'assistant',content:'原题左右极限14和15。',questionId:questionTwo}],supportContext:checkContext});
assert.equal(firstCheck.contextAudit.excludedOtherTaskMessages,2);assert.deepEqual(JSON.parse(firstCheck.user.slice(firstCheck.user.indexOf('{'))).recentConversation,[]);
for(const question of ['刚才的独立检查为什么错了？','第二步还是不懂','为什么不能取平均值？']){
 const p=assistant.buildAssistantPrompt({resolved:mixed,quizSubmitted:true,question,history:checkHistory,supportContext:checkContext}),d=JSON.parse(p.user.slice(p.user.indexOf('{')));
 assert.equal(p.contextAudit.activeCheckId,'check-current');assert.equal(d.activeLearningTask.prompt,checkContext.lastCompletedCheck.prompt);
 assert.equal(d.recentConversation[0].content,checkHistory[0].content,'检查题自己的上一轮必须保留');
 for(const key of ['quiz','quizReview','quizReviewFocus','verifiedQuestionFacts','proactiveAssistantPrompt'])assert.equal(d[key],null,'检查复盘不得混入原题 '+key);
}
const back=assistant.buildAssistantPrompt({resolved:mixed,quizSubmitted:true,question:'回到原题，请解释原题',history:checkHistory,supportContext:checkContext});
assert.equal(back.contextAudit.activeCheckId,'');assert(JSON.parse(back.user.slice(back.user.indexOf('{'))).quizReviewFocus);
console.log('通过：检查题优先、隐式多轮接续、显式回到原题，均保留任务归属。');
