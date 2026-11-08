'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app/main/navigation.js'),'utf8');
async function main(){
 let returned=0,advanced=0,resumed=0;
 const context=vm.createContext({
  window:{KnowledgeAssistant:{pendingIndependentCheck:()=>null},LearningWorkspace:{advanceKnowledge(){advanced++;return true;}}},
  getUnit:()=>({id:'K1',type:'knowledge'}),
  quizResourceReviewContext:()=>({quizUnitId:'Q1',questionId:'q3'}),
  returnToQuizFromCourseware(){returned++;return true;}
 });
 vm.runInContext(source,context);
 context.returnToQuizFromCourseware=()=>{returned++;return true;};
 context.quizResourceReviewContext=()=>({quizUnitId:'Q1',questionId:'q3'});
 assert.equal(await context.completeAndAdvanceCurrentUnit(),true);
 assert.equal(returned,1,'从题目解析打开课件后的主按钮必须先返回原测验');
 assert.equal(advanced,0,'返回测验不能被讲解翻页或互动门控截断');
 context.window.KnowledgeAssistant={pendingIndependentCheck:()=>({unitId:'K1'}),resumeIndependentCheck:async()=>{resumed++;}};
 assert.equal(await context.completeAndAdvanceCurrentUnit(),false);
 assert.equal(resumed,1);assert.equal(returned,1,'未答独立检查应优先于返回测验');
 context.window.KnowledgeAssistant.pendingIndependentCheck=()=>null;
 context.quizResourceReviewContext=()=>null;
 assert.equal(await context.completeAndAdvanceCurrentUnit(),true);assert.equal(advanced,1,'普通学习使用当前讲解/互动主操作');
 console.log('主操作优先级通过：未答独立检查→返回原题→当前讲解/互动。');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
