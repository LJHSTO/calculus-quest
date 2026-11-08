'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app/main/knowledge-assistant.js'),'utf8'),out=process.env.SUPPORT_R12_OUTPUT||path.join(root,'tmp/check-submit-race-r12');fs.mkdirSync(out,{recursive:true});
const section=(a,b)=>{const x=source.indexOf(a),y=source.indexOf(b,x+1);assert(x>=0&&y>x);return source.slice(x,y);};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.route('http://check-race.test/**',r=>r.fulfill({contentType:'text/html',body:'<html lang="zh-CN"><meta charset="utf-8"><body></body></html>'}));await page.goto('http://check-race.test/');
 await page.addScriptTag({content:`
 const global=window,state={authToken:'synthetic-memory-only',participant:{participantId:'synthetic-owner'}},Core={normalizeContextRef:x=>x};
 const meta={chapterId:'V14-C1',unitId:'GH-01-K02-formative',knowledgePointId:'GH-01-K02',sceneType:'quiz'};
 const courseMeta=()=>meta,proactiveScopeKey=m=>m.knowledgePointId||m.unitId,isSignedInNow=()=>true;
 window.ThreeArmStudyUI={run:{id:'synthetic-run'}};let learningSnapshotGeneration=1,exposureGeneration=0;
 let composerDraftKey='',activeContext=null,proactiveCheckView=null,proactiveCheckKey='',proactiveCheckSelection='',proactiveCheckStartedAt=0,proactiveCheckSubmitting=false,proactiveCheckFeedback=null,proactiveDecision=null,proactiveCandidateId='';
 const check={id:'check-one',supportLevel:'L2',prompt:'哪一个输入对应输出？',options:[{value:'A',label:'甲'},{value:'B',label:'乙'}]};
 let proactiveStudy={policyStates:[{scopeKey:meta.knowledgePointId,updatedAt:'2026-11-08T10:00:00Z',lifecycle:{phase:'awaiting_independent_attempt',activeVerificationCheckId:check.id},verificationCheck:check}]};
 const setQuestionMathContent=(n,s)=>n.textContent=s,setStatus=()=>{},track=()=>{},serverAuthorizedProactiveDecision=()=>false,applyProactiveStudy=()=>{proactiveStudy.policyStates=[{scopeKey:meta.knowledgePointId,updatedAt:'2026-11-08T10:01:00Z',lifecycle:{phase:'closed',lastVerificationCheckId:check.id}}];};
 const render=()=>{document.body.innerHTML='<p id="saved">'+(proactiveCheckFeedback?.text||'')+'</p>';},renderMessages=()=>{if(!proactiveCheckSubmitting)document.body.replaceChildren(proactiveVerificationNode(check));};window.TaskSupport={leaveConversation(){}};
 window.requests=[];window.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,checkResult:{checkId:check.id,status:'correct',at:'2026-11-08T10:01:00Z'},decision:{intervene:false},study:{policyState:{lifecycle:{phase:'closed'}}}})};};
 ${section('  function learnerDraftKey(','  function supportSurfaceOwnsContent(')}
 ${section('  function proactiveVerificationCheck(','  function proactivePendingQuietState(')}
 ${section('  async function submitProactiveVerification(','  function proactiveVerificationNode(')}
 ${section('  function proactiveVerificationNode(','  function setMessageQuizReviewProgress(')}
 syncProactiveCheckState(meta);document.body.append(proactiveVerificationNode(check));
 window.interruptCheck=()=>{syncProactiveCheckState({...meta,unitId:'GH-01-K01',knowledgePointId:'GH-01-K01',sceneType:'slide'});proactiveStudy.policyStates=[];syncProactiveCheckState(meta);};
 window.mountAgain=()=>{proactiveCheckSubmitting=false;proactiveCheckSelection='B';meta.unitId='GH-01-K02-formative';document.body.replaceChildren(proactiveVerificationNode(check));};
 window.changeIdentity=kind=>{if(kind==='token')state.authToken+='-new';if(kind==='run')ThreeArmStudyUI.run.id+='-new';if(kind==='generation')learningSnapshotGeneration++;if(kind==='unit')meta.unitId='different-unit';};
 `});
 await page.getByRole('radio').nth(1).click();await page.evaluate(()=>interruptCheck());await page.getByRole('button',{name:'提交检查',exact:true}).click();await page.waitForTimeout(30);
 const requests=await page.evaluate(()=>window.requests);assert.equal(requests.length,1,'真实点击在旧meta/短暂空状态之后仍须提交展示题首答');assert.equal(requests[0].checkId,'check-one');assert.equal(requests[0].response,'B');assert.equal(requests[0].unitId,'GH-01-K02-formative');assert.deepEqual(errors,[]);
 for(const kind of ['token','run','generation','unit']){await page.evaluate(()=>mountAgain());await page.evaluate(kind=>changeIdentity(kind),kind);await page.getByRole('button',{name:'提交检查',exact:true}).click();assert.equal(await page.evaluate(()=>requests.length),1,'身份或位置变化后旧按钮不得发新提交：'+kind);}
 fs.writeFileSync(path.join(out,'确定时序检查提交回归.json'),JSON.stringify({passed:true,checks:['先显示真实检查并选择乙','注入旧unit同步及临时空policy行','真实Chrome点击只提交一次展示checkId及首选项','原始owner/run/generation绑定保持','后端关闭结果后撤销展示题'],request:{checkId:requests[0].checkId,response:requests[0].response,unitId:requests[0].unitId},errors},null,2));console.log('确定时序检查提交回归通过');
 }catch(e){fs.writeFileSync(path.join(out,'确定时序失败.json'),JSON.stringify({error:e.message,errors},null,2));throw e;}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
