'use strict';
// Targeted content review after an observed arithmetic error. Sequential,
// synthetic conversations; never a load test or proof of all future replies.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const a=require('../lib/learning-assistant'),llm=require('../lib/llm'),math=require('../lib/assistant-math-check-r18'),authored=require('../lib/courseware/quiz-scaffolds-r16');
assert(process.argv.includes('--live'),'Explicit live content evaluation required');
const index=a.buildCourseContextIndex(require('../lib/assessments/functions-limits-registry').routeFor(require('../data/multi-scene-learning-route.json')));
const id='fl-r13-formative-GH-02-K02-1',resolved=a.resolveAssistantContext({index,chapterId:'V14-C1',unitId:'GH-02-K02-formative',quizSubmitted:true,contextRef:{kind:'quiz',scope:'quiz',questionId:id}});
resolved.quizAttempt=a.buildQuizAttemptSummary({resolved,results:resolved.unit.quizQuestions.map(q=>({questionId:q.id,response:q.options.find(o=>!q.answer.includes(o.value)).value,isCorrect:false,status:'incorrect',score:0}))});
const supportContext={phase:'accepted_pending_response',scaffoldLevel:'L2',preferences:{maximumLevel:'L3'},availableActions:['continue_conversation','return_to_courseware']};
const rows=[],out=path.resolve('output/r20-final/分步讲解与平均值复测.json');
const save=()=>fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),synthetic:true,loadTest:false,promptVersion:require('../lib/assistant-prompt-r17').version,model:llm.runtimeInfo().model,rows},null,2));
(async()=>{
 for(let repetition=1;repetition<=2;repetition++){
  const history=[];
  for(const question of [
   '请根据我的原始作答，说明我漏用了哪个条件，分两步解释，并让我判断下一步。',
   '只改f(0)不会改变x<0时的规则，左侧仍趋近14。接下来该核对什么？',
   '两侧还是14和15，所以不能把它们平均后当极限。我这样解释对吗？',
   '我想再确认：14和15的平均值是不是15/2？如果把点值设成平均值，这题会成立吗？',
   '那另一个例子：两侧都趋近4、点值为9，只改点值能连续吗？',
   '我知道了'
  ]){
   const prompt=a.buildAssistantPrompt({resolved,question,history,quizSubmitted:true,supportContext}),started=performance.now();
   const r=prompt.acknowledgementReply?{text:prompt.acknowledgementReply,provider:'conversation-control'}:await llm.completeChat({system:prompt.system,user:prompt.user,temperature:.2,maxTokens:700,timeoutMs:45000,requireModelIdentity:true});
   const validations=[authored.validateReply(id,r.text),math.validateArithmetic(r.text),math.validateReply(math.continuityFacts(question),r.text)];
   const row={repetition,turn:history.length/2+1,question,text:r.text,ms:Math.round(performance.now()-started),provider:r.provider,modelAudit:r.modelInfo,validations,prompt};rows.push(row);save();
   assert(validations.every(v=>v.valid),JSON.stringify(validations));
   if(r.modelInfo)assert.equal(r.modelInfo.reportedModel,llm.runtimeInfo().model);
   console.log(JSON.stringify({repetition,turn:row.turn,question,text:r.text,ms:row.ms}));
   const metadata={questionId:id,...prompt.contextAudit};history.push({role:'user',content:question,...metadata},{role:'assistant',content:r.text,...metadata});
  }
 }
 console.log('Saved sequential live content review: '+out);
})().catch(e=>{save();console.error(e.message);process.exitCode=1;});
