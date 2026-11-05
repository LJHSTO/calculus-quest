'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const adapter=require('../lib/proactive-policy').adapterForChapter('V14-C1');

// Runs inside the normal student journey, with the same login, submitted quiz and real help state.
module.exports=async function({page,teacher,dir,arm,remote,point}){
 const records=[];
 const record=(step,detail={})=>{records.push({step,...detail});fs.writeFileSync(path.join(dir,arm+'组-帮助闭环补充.json'),JSON.stringify(records,null,2));console.log('闭环通过：'+arm+' '+step);};
 const shot=name=>page.screenshot({path:path.join(dir,arm+'组-闭环-'+name+'.png')});
 async function send(text){
  const count=await page.evaluate(()=>uxAssistantResponses.length),start=Date.now();
  await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).fill(text);
  await teacher.getByRole('button',{name:'发送我的想法',exact:true}).click();
  await page.waitForFunction(n=>!KnowledgeAssistant.designSpaceSnapshot().busy&&uxAssistantResponses.length>n,count);
  const done=await page.evaluate(n=>uxAssistantResponses[n],count);
  if(remote)assert.equal(done.fallback,false,'实际交流不能使用回退冒充模型回答');
  const reply=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().reply);
  assert.ok(reply?.text);assert.doesNotMatch(reply.text,/已经掌握|理解到位|再给你.*小练习/);
  record('连续回应',{text,reply:reply.text,provider:done.message?.provider,model:done.message?.modelAudit,elapsedMs:Date.now()-start});
 }
 const third=page.locator('.question-card[data-question]').nth(2);
 await third.getByRole('button',{name:'和知点讨论这道题',exact:true}).click();
 for(const text of ['好的我知道了','我不是已经做了吗','好的','我愿意'])await send(text);
 const before=await teacher.locator('.task-conversation-reply').count();assert.ok(before>=4,'已经有可见连续对话');
 const lastReply=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().reply.text);
 const visibleReply=await teacher.locator('.task-conversation-reply .assistant-content').last().innerText();
 await page.reload();await page.waitForFunction(id=>currentUnitId===id+'-formative'&&Boolean(KnowledgeAssistant.designSpaceSnapshot().reply?.text),point);
 await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).waitFor();
 assert.ok(await teacher.locator('.task-conversation-reply').count()>=4,'刷新后应恢复已发生的帮助对话，不能只剩空输入框');
 assert.equal(await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().reply.text),lastReply,'刷新恢复相同服务器回复');
 await page.waitForFunction(text=>[...document.querySelectorAll('.task-conversation-reply .assistant-content')].some(n=>n.innerText===text),visibleReply);
 await page.waitForFunction(()=>{const send=document.querySelector('.task-response-form button[type=submit]'),footer=document.querySelector('.classroom-footer');return send&&send.getBoundingClientRect().bottom<=(footer?.getBoundingClientRect().top||innerHeight)+1;});
 record('刷新恢复对话');await shot('刷新后交流');
 const text='我想继续这道题，先确认左右趋近值是否相等。';
 await page.route('**/api/learning/assistant/ask',r=>r.fulfill({status:503,headers:{'x-synthetic-fault':'assistant-retry'},contentType:'application/json',body:JSON.stringify({ok:false,message:'合成网络中断，请重试'})}));
 await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).fill(text);
 const failed=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/api/learning/assistant/ask'));
 await teacher.getByRole('button',{name:'发送我的想法',exact:true}).click();assert.equal((await failed).status(),503);
 await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().busy);
 assert.equal(await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).inputValue(),text,'失败不能清空草稿');
 assert.match(await teacher.innerText(),/未发送|中断|重试|失败/,'失败应在正在使用的老师面板内显示');
 await page.unroute('**/api/learning/assistant/ask');record('请求失败保留草稿与就地提示');
 await send(text);
 // The reply arrives before its study-state refresh and the form completion callback.
 await page.waitForFunction(value=>[...document.querySelectorAll('textarea[data-task-draft-key]')].every(n=>n.value!==value),text);
 assert.equal(await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).inputValue(),'');record('重试成功');
 await teacher.getByRole('button',{name:'用一题检查',exact:true}).click();await page.waitForFunction(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().check));
 assert.equal(await teacher.getByRole('textbox',{name:'继续交流（选填）',exact:true}).count(),0,'独立检查期间收起聊天输入');
 const check=await page.evaluate(()=>KnowledgeAssistant.designSpaceSnapshot().check);
 assert.equal(Object.hasOwn(check,'answer'),false);
 const index=check.options.findIndex(o=>adapter.gradeVerificationCheck({knowledgePointId:point,supportLevel:check.supportLevel,checkId:check.id,response:o.value})?.correct);
 assert.ok(index>=0);
 const checkNode=teacher.locator('.knowledge-proactive-verification');await checkNode.getByRole('radio').nth(index).check();
 const result=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/api/learning/proactive/check')&&r.request().postDataJSON()?.action!=='start');
 await checkNode.getByRole('button',{name:'提交检查',exact:true}).click();const payload=await (await result).json();
 assert.equal(payload.checkResult.status,'correct');assert.equal(payload.study.policyState.lifecycle.phase,'exited');
 await page.waitForFunction(()=>!KnowledgeAssistant.designSpaceSnapshot().check);
 assert.equal(await teacher.locator('.knowledge-proactive-inline-offer').count(),0,'通过后不继续加码');
 const review=await page.evaluate(async()=>{const r=await fetch('api/study/review',{headers:{Authorization:`Bearer ${state.authToken}`}});return r.status;});assert.equal(review,200);
 record('显式检查、正确退出、恢复回顾',{phase:payload.study.policyState.lifecycle.phase});await shot('检查退出');
 await page.waitForTimeout(6500);
 assert.equal(await page.evaluate(()=>Boolean(KnowledgeAssistant.designSpaceSnapshot().feedback)),false,'通过反馈自动消退');
 assert.equal(await teacher.isVisible(),false,'完成一轮后工作区帮助收起');record('通过后自动收起');
};
