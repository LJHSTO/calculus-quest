'use strict';
// Real model regression of the prompt builder, using explicitly synthetic quiz history.
// This complements, and does not substitute for, full browser journeys.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
assert(process.argv.includes('--live'),'Explicit real API test only');
const assistant=require('../lib/learning-assistant'),llm=require('../lib/llm'),scaffolds=require('../lib/courseware/quiz-scaffolds-r16'),probes=require('../lib/assessments/functions-limits-probes-r13');
const index=assistant.buildCourseContextIndex(require('../data/multi-scene-learning-route.json')),model=llm.runtimeInfo().model;
const switchMode=process.argv.includes('--switch');
const checkMode=process.argv.includes('--check');
const out=fs.mkdtempSync(path.resolve('output')+'/r18-examples-'),rows=[];
function save(){fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({scope:switchMode?'new question with no prior-question history, using production prompt and output guard':'synthetic post-error histories through production prompt builder and real API; three identical model/parameter conditions',model,rows,passed:rows.length===18&&rows.every(r=>r.passed)},null,2));}
async function run(arm){for(let i=0;i<6;i++){
 const unitId=`GH-0${i<3?1:2}-K0${i%3+1}-formative`,resolved=assistant.resolveAssistantContext({index,chapterId:'V14-C1',unitId,quizSubmitted:true,contextRef:{kind:'quiz',scope:'quiz'}}),questions=probes.formative(i),q=questions[switchMode?1:0];
 resolved.unit={...resolved.unit,quizQuestions:questions};resolved.question=q;resolved.quizSubmitted=true;resolved.contextRef={...resolved.contextRef,questionId:q.id};
 resolved.quizAttempt=assistant.buildQuizAttemptSummary({resolved,results:questions.map(q=>({questionId:q.id,response:q.options.find(o=>!q.answer.includes(o.value)).value,isCorrect:false,status:'incorrect',score:0}))});
 const probe=require('../lib/assessments/functions-limits-targeted-checks-r16').pools[q.id][0];
 const lastCompletedCheck=checkMode?{checkId:probe.id,sourceQuestionId:q.id,prompt:probe.prompt,response:probe.options.find(o=>o.value!==probe.answer&&o.value!=='__unknown__').label,correctAnswer:probe.options.find(o=>o.value===probe.answer).label,explanation:probe.analysis,status:'incorrect'}:null;
 const prompt=assistant.buildAssistantPrompt({resolved,quizSubmitted:true,question:checkMode?'刚才的独立检查我还没有弄懂。请根据我选错的地方，用一个具体的小步骤解释为什么，并留下一个我能回答的小问题，不要重复刚才的提示。':switchMode?'这道题和上一题的关键条件有什么不同？请只根据现在这道题完整说明，不要沿用上一道检查题。':'刚才第二步还是不懂。请换一个具体数值例子，不要把原题数字直接换成答案。',history:switchMode?[]:[{role:'user',content:'请解释我刚才选错的题目。',questionId:q.id},{role:'assistant',content:scaffolds.forQuestion(q.id,'L3').text,questionId:q.id}],supportContext:{phase:'accepted_pending_response',scaffoldLevel:'L3',preferences:{maximumLevel:'L5'},availableActions:['return_to_courseware','continue_conversation'],lastCompletedCheck}});
 const supplied=checkMode?lastCompletedCheck:JSON.parse(prompt.user.slice(prompt.user.indexOf('{'))).verifiedAlternativeExample;if(!switchMode)assert(supplied);
 if(checkMode){assert.equal(prompt.contextAudit.activeCheckId,probe.id);assert.equal(JSON.parse(prompt.user.slice(prompt.user.indexOf('{'))).verifiedQuestionFacts,null);}
 const at=performance.now(),result=await llm.completeChat({system:prompt.system,user:prompt.user,model,temperature:.2,maxTokens:700,requireModelIdentity:true,timeoutMs:45000});
 const row={arm,unitId,questionId:q.id,ms:performance.now()-at,suppliedExample:supplied,text:result.text,audit:result.modelInfo,promptHash:crypto.createHash('sha256').update(prompt.system+'\n'+prompt.user).digest('hex')};rows.push(row);save();
 assert.equal(result.modelInfo.reportedModel,model);assert(scaffolds.validateReply(q.id,result.text).valid);
 assert(require('../lib/assistant-math-check-r18').validateQuestionScope(result.text).valid,'Must not invent previous-question facts');
 assert(require('../lib/assistant-math-check-r18').validateArithmetic(result.text).valid,'Explicit arithmetic must match calculation');
 // Numerical examples are reviewed from saved full text: valid mathematical
 // prose may use coordinates, f(x)=y, or words, so do not grade its spelling.
 row.passed=true;save();console.log(arm+' '+unitId+' '+Math.round(row.ms)+' ms');
}}
Promise.all(['A','B','C'].map(run)).then(()=>{save();console.log(out);}).catch(e=>{save();console.error(e.message);process.exitCode=1;});
