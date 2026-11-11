'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.addInitScript(()=>{try{localStorage.clear();sessionStorage.clear();}catch{}});
  await page.goto(pathToFileURL(path.join(root,'resources/open-maic/函数极限-OpenMAIC修订/GH-02-K01.html')).href);
  await page.locator('#game-screen').waitFor({state:'visible'});
  const questions=[];
  for(const [round,x] of [0.001,1].entries()){
   await page.locator('#candidate-grid').getByRole('button',{name:String(x),exact:true}).click();
   await page.getByRole('button',{name:'预计输出不同',exact:true}).click();
   await page.getByRole('button',{name:'提交观测点',exact:true}).click();
   await page.getByRole('button',{name:'读完反馈，继续',exact:true}).click();
   await page.locator('#conclusion-screen').waitFor({state:'visible'});
   questions.push(await page.locator('#conclusion-screen > p').innerText());
   if(round)assert.notEqual(questions[0],questions[1],'两轮不能重复同一道概括题');
   await page.locator(`[onclick="checkConclusion('${round?'B':'A'}')"]`).click();
   await page.getByRole('button',{name:'读完反馈，继续',exact:true}).click();
   await page.locator(round?'#result-screen':'#game-screen').waitFor({state:'visible'});
  }
  console.log('通过：两轮不同问题，第二轮将新规则与趋近趋势联系起来。');
 }finally{await browser.close();}
}
function feedbackIsolation(){
 const source=fs.readFileSync(path.join(root,'app/main/knowledge-assistant.js'),'utf8');
 // Exercise the real snapshot function with the same scope and different scenes.
 const body=source.slice(source.indexOf('  function designSpaceSnapshot()'),source.indexOf('  function scheduleDesignSpaceSync()'));
 const context={meta:{unitId:'GH-01-K01',sceneType:'game',unitType:'knowledge',supported:true},proactiveCheckFeedback:{scopeKey:'GH-01-K01',unitId:'GH-01-K01',sceneType:'game',expiresAt:Date.now()+10000},proactiveScopeKey:m=>m.unitId,courseMeta:()=>context.meta,
  global:{},quizAssistantLocked:()=>false,activeProactiveOutcomeSession:()=>false,isSignedInNow:()=>true,learningViewActive:()=>true,proactiveStudy:{},proactiveDecision:null,messages:[],activeContext:null,taskRequestError:null,state:{},exposureGeneration:1,proactiveStudyManaged:()=>true,proactiveCollectionEnabled:()=>true,proactiveScopeMuted:()=>false,supportView:{},proactiveScopeState:()=>null,proactiveVerificationCheck:()=>null,proactiveCheckSelection:'',pendingProactivePrompt:null,usableProactivePrompt:()=>false,proactiveChoiceSaving:false,proactiveCheckSubmitting:false,isAsking:false,provider:{},isOpen:false};
 // The helper lives next to the snapshot so both rendered surfaces share it.
 const helper=source.includes('  function currentCheckFeedback(')?source.slice(source.indexOf('  function currentCheckFeedback('),source.indexOf('  function designSpaceSnapshot()')):'';
 vm.createContext(context);vm.runInContext(helper+body,context);
 assert.ok(context.designSpaceSnapshot().feedback);
 context.meta.sceneType='slide';assert.equal(context.designSpaceSnapshot().feedback,null,'互动检查结果不能出现在讲解场景');
 context.meta.sceneType='game';context.proactiveCheckFeedback.expiresAt=Date.now()-1;assert.equal(context.designSpaceSnapshot().feedback,null,'结束结果不能永久占据工作区');
 console.log('通过：检查结果按场景隔离并在结束后消退。');
}
function questionContext(){
 const {quizQuestionContext}=require('../lib/learning-assistant');
 const wrong={questionId:'q3',position:3,question:'哪一组对应关系违反函数定义？',studentResponse:'B',correctAnswer:'A',analysis:'不应泄露的完整解析'};
 const r={isQuiz:true,quizSubmitted:true,quizAttempt:{pendingReview:0,incorrectItems:[wrong]}};
 assert.deepEqual(quizQuestionContext(r),{questionId:'q3',position:3,question:wrong.question,studentResponse:'B'});
 assert.equal(quizQuestionContext(r,'missing'),null);assert.equal(quizQuestionContext({...r,quizSubmitted:false}),null);
 assert.equal(quizQuestionContext({...r,quizAttempt:{...r.quizAttempt,pendingReview:1}}),null);
 console.log('通过：复盘绑定原题号、原题与学生作答，不附带答案；未提交或待评分不提供题目帮助。');
}
if(process.argv.includes('--feedback')){feedbackIsolation();questionContext();}else main().catch(e=>{console.error(e);process.exitCode=1;});
