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
