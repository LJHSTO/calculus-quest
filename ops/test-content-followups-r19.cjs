'use strict';
// Targeted real-model regression for defects observed in the student journey.
// Synthetic data only; this is a content review, not a load test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const a=require('../lib/learning-assistant'),llm=require('../lib/llm'),math=require('../lib/assistant-math-check-r18');
assert(process.argv.includes('--live'),'Explicit live evaluation required');
const index=a.buildCourseContextIndex(require('../lib/assessments/functions-limits-registry').routeFor(require('../data/multi-scene-learning-route.json')));
const out=path.resolve(process.env.CONTENT_REVIEW_OUTPUT||'output/r19-audit/content-followups-final'),rows=[];fs.mkdirSync(out,{recursive:true});
const save=()=>fs.writeFileSync(path.join(out,'真实多轮内容复核.json'),JSON.stringify({at:new Date().toISOString(),synthetic:true,loadTest:false,promptVersion:require('../lib/assistant-prompt-r17').version,model:llm.runtimeInfo().model,rows},null,2));
function lesson(unitId){return a.resolveAssistantContext({index,chapterId:'V14-C1',unitId,sceneType:'slide'});}
async function turn(id,resolved,question,history=[],supportContext=null){
 const prompt=a.buildAssistantPrompt({resolved,question,history,quizSubmitted:!!resolved.isQuiz,supportContext});
 if(prompt.acknowledgementReply){
  rows.push({id,question,text:prompt.acknowledgementReply,provider:'conversation-control',ms:0,prompt});save();
  console.log(JSON.stringify({id,text:prompt.acknowledgementReply,provider:'conversation-control'}));return prompt.acknowledgementReply;
 }
 const started=performance.now(),r=await llm.completeChat({system:prompt.system,user:prompt.user,temperature:.2,maxTokens:700,timeoutMs:45000,requireModelIdentity:true});
 const checks=[math.validateReply(!resolved.isQuiz?math.questionFacts(question):null,r.text),math.validateArithmetic(r.text),require('../lib/courseware/quiz-scaffolds-r16').validateGuidedStep(prompt.responseGuard?.guidedStep,r.text)];
 rows.push({id,question,text:r.text,ms:Math.round(performance.now()-started),checks,...r.modelInfo,prompt});save();
 assert.equal(r.modelInfo.reportedModel,llm.runtimeInfo().model);assert(checks.every(c=>c.valid));
 console.log(JSON.stringify({id,text:r.text,ms:rows.at(-1).ms}));
 const metadata={questionId:resolved.contextRef?.questionId||'',...prompt.contextAudit};
 history.push({role:'user',content:question,...metadata},{role:'assistant',content:r.text,...metadata});return r.text;
}
(async()=>{
 if(!process.argv.includes('--guided-checks-only')){
 for(let repetition=1;repetition<=(Number(process.env.CONTENT_PREMISE_REPEATS)||3);repetition++){
  const h=[],r=lesson('GH-02-K02');
  await turn('changed-premise-'+repetition+'-1',r,'x<1时f(x)=2x+2，x>1时f(x)=x+6，且f(1)=9。左右极限、双侧极限和点值分别是什么？按步骤判断。',h);
  await turn('changed-premise-'+repetition+'-2',r,'只把f(1)改成4能修复这里的间断吗？用刚才两侧的规则解释。',h);
  await turn('changed-premise-'+repetition+'-3',r,'如果改成两侧都趋近4且点值为9，这和刚才有什么不同？能通过只改点值变连续吗？',h);
 }
 const h=[],r=lesson('GH-02-K03');
 await turn('numeric-example-1',r,'给定f(x)=x²在x不等于1时成立，f(1)=3。请依次检查连续性的三个条件，说明哪些满足。',h);
 await turn('numeric-example-2',r,'如果我说图像除了一个点都正常，因此它仍连续，错在哪里？请用接近1的数说明。',h);
 await turn('numeric-example-3',r,'把点值改成1以后连续吗？连续是否又能说明处处可导？请用绝对值函数作对照。',h);
 }
 const quiz=a.resolveAssistantContext({index,chapterId:'V14-C1',unitId:'GH-01-K01-formative',quizSubmitted:true,contextRef:{kind:'quiz',scope:'quiz',questionId:'fl-r13-formative-GH-01-K01-1'}});
 quiz.quizAttempt=a.buildQuizAttemptSummary({resolved:quiz,results:quiz.unit.quizQuestions.map(q=>({questionId:q.id,response:q.options.find(o=>!q.answer.includes(o.value)).value,isCorrect:false,status:'incorrect',score:0}))});
 const context={phase:'accepted_pending_response',scaffoldLevel:'L3',preferences:{maximumLevel:'L5'},availableActions:['return_to_courseware','continue_conversation']};
 await turn('leave-unsolved-step',quiz,'请根据我的原始作答，说明我漏用了哪个条件，分两步解释，并让我判断下一步。',[],context);
 const check=require('../lib/assessments/functions-limits-targeted-checks-r16').pools[quiz.contextRef.questionId][0];
 context.lastCompletedCheck={checkId:check.id,sourceQuestionId:check.sourceQuestionId,prompt:check.prompt,response:'9',correctAnswer:'7',explanation:check.analysis,status:'incorrect'};
 const ch=[];
 await turn('wrong-check-followup',quiz,'我明白了一部分。请对照我刚才选错的检查选项，把它为什么不成立说清楚，再给一个我能自己判断的小问题。',ch,context);
 await turn('short-answer-continuity',quiz,'2+b',ch,context);
 await turn('misconception-correction',quiz,'我现在认为b=9，因为左边是9。这样对吗？',ch,context);
 await turn('conclude-without-loop',quiz,'我知道了',ch,context);
 console.log('Saved '+rows.length+' real replies for manual review: '+out);
})().catch(e=>{save();console.error(e.message);process.exitCode=1;});
