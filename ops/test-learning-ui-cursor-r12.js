'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app/main/core.js'),'utf8');
const snippet=source.slice(source.indexOf('function learningUiCursorContext('),source.indexOf('function learningSnapshot()'));
assert(snippet.includes('function rememberLearningUiCursor'));
const memory=new Map(),state={participant:{participantId:'owner-one'},authToken:'synthetic'},run={id:'run-one'},support={loaded:true,locked:false};
let blockedCheck=false,expired=false,judgment=false;
const context={state,currentUnitId:'unit-one',learningSnapshotReady:true,learningSnapshotGeneration:1,
 isSignedIn:()=>Boolean(state.authToken&&state.participant),getUnit:id=>({id,type:id==='quiz'?'quiz':'knowledge'}),
 knowledgeInteractionTypes:()=>[{id:'simulation'},{id:'mindMap'}],localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
 window:{StudyEntry:{},OperationGuide:{active:false},FirstSessionBudget:{get closed(){return expired;}},
 ThreeArmStudyUI:{get run(){return run;},get judgmentActive(){return judgment;}},
 KnowledgeAssistant:{pendingIndependentCheck:()=>blockedCheck?{checkId:'pending'}:null,designSpaceSnapshot:()=>support}}};
vm.createContext(context);vm.runInContext(snippet,context);
const checks=[];function test(name,body){body();checks.push({name,passed:true});}
test('游标仅保存白名单界面字段',()=>{assert.equal(context.rememberLearningUiCursor({surface:'interactive',sceneType:'mindMap',lecturePage:1,pageId:'page-two',lectureVersion:'same-lesson',completed:['unit-one'],quizResults:[{answer:'forged'}],supportCycle:{status:'closed'}}),true);const value=JSON.parse([...memory.values()][0]);assert(!('completed'in value)&&!('quizResults'in value)&&!('supportCycle'in value));assert.equal(context.readLearningUiCursor().lecturePage,1);});
for(const [name,change,restore] of [
 ['跨账号',()=>state.participant.participantId='owner-two',()=>state.participant.participantId='owner-one'],
 ['跨轮次',()=>run.id='run-two',()=>run.id='run-one'],
 ['跨学习代次',()=>context.learningSnapshotGeneration=2,()=>context.learningSnapshotGeneration=1],
 ['跨知识点',()=>context.currentUnitId='unit-two',()=>context.currentUnitId='unit-one'],
 ['未完成服务器快照恢复或版本冲突',()=>context.learningSnapshotReady=false,()=>context.learningSnapshotReady=true],
 ['未登录',()=>state.authToken='',()=>state.authToken='synthetic'],
 ['未答独立检查',()=>blockedCheck=true,()=>blockedCheck=false],
 ['正式首场已到期',()=>expired=true,()=>expired=false],
 ['独立调节测量',()=>judgment=true,()=>judgment=false],
 ['活动帮助周期',()=>support.supportCycle={status:'engaged'},()=>delete support.supportCycle],
 ['保护测验',()=>context.currentUnitId='quiz',()=>context.currentUnitId='unit-one'],
 ['导览演练',()=>context.window.OperationGuide.active=true,()=>context.window.OperationGuide.active=false],
 ['帮助保护状态尚未加载',()=>support.loaded=false,()=>support.loaded=true]
])test(name+'不恢复旧游标',()=>{change();assert.equal(context.readLearningUiCursor(),null);restore();assert.equal(context.readLearningUiCursor().sceneType,'mindMap');});
test('不接受其他单元参数的游标',()=>assert.equal(context.readLearningUiCursor('unit-two'),null));
test('内容字段伪造也不能绕过owner与run校验',()=>{const key=[...memory.keys()][0],saved=memory.get(key);memory.set(key,JSON.stringify({...JSON.parse(saved),owner:'owner-two'}));assert.equal(context.readLearningUiCursor(),null);memory.set(key,saved);});
test('过期状态不写入或推进游标',()=>{expired=true;const saved=JSON.stringify([...memory]);assert.equal(context.rememberLearningUiCursor({lecturePage:2,pageId:'page-three',lectureVersion:'same-lesson'}),false);assert.equal(JSON.stringify([...memory]),saved);expired=false;});
const report={passed:true,scope:'提取实际core游标边界，在隔离VM中验证字段白名单和拒绝条件；不替代完整浏览器恢复链',checks};
const out=process.env.STUDENT_UX_OUTPUT||path.join(root,'output/playwright/r12-ui');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'界面游标隔离回归.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length}));
