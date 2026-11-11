'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app/main/three-arm-study.js'),'utf8');
const start=source.indexOf('  async function openTasks()'),end=source.indexOf('  async function openJudgment()',start);
assert(start>0&&end>start);
function node(tag,text){return {tag,text,children:[],append(...items){this.children.push(...items);}};}
function descendants(parent){return [parent,...parent.children.flatMap(descendants)];}
async function check(regulation,mode='preview'){
  const run={id:'frozen-run',mode,...(regulation?{regulationVersion:'regulation-transfer-r11-20261107'}:{})},original=structuredClone(run),dialogs=[],writes=[];
  const task={status:'available',unlockAt:'2026-01-01T00:00:00Z'},data={run,preparation:{stage:'ready'},posttestComplete:true,...(regulation?{regulation:task}:{judgment:task})};
  const context={run,global:{StudyEntry:{arm:'A'}},el:node,button:(text,fn)=>({...node('button',text),onclick:fn}),
    request:async(path,body)=>{if(body)writes.push({path,body});return data;},setRun:value=>{context.run=value;},
    modal:title=>{const d=node('dialog',title);dialogs.push(d);return d;},show:async()=>{},
    openSurvey:()=>{},openReview:()=>{},openJudgment:()=>{},location:{reload(){context.reloaded=true;}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);await context.openTasks();
  const nodes=descendants(dialogs.at(-1)),text=nodes.map(n=>n.text||'').join('\n');
  assert.doesNotMatch(text,/新版|旧版|配置判断/,'学生任务说明不使用工程版本或错误的通用流程');
  assert.match(text,regulation?/14分钟调节任务/:/学习帮助情境/);
  if(!regulation)assert.doesNotMatch(text,/14分钟/,'历史轮次按冻结任务显示');
  assert.deepEqual(run,original,'查看任务不改变轮次和测量版本');assert.equal(writes.length,0);
  const restart=nodes.find(n=>n.text==='重新开始一次学习（当前记录保留）');
  if(mode==='formal'){assert.equal(restart,undefined,'正式参与者不显示预览重启入口');return;}
  const optional=nodes.find(n=>n.tag==='details');assert(optional&&!optional.open,'重启入口单独折叠');assert(restart);
  await restart.onclick();assert.equal(writes.length,0,'打开重启说明不创建新轮次');
  const confirmation=descendants(dialogs.at(-1));assert.match(confirmation.map(n=>n.text||'').join('\n'),/从学习前问卷和独立前测重新开始/);
  await confirmation.find(n=>n.text==='确认从头开始').onclick();
  assert.equal(writes.length,1);assert.equal(writes[0].path,'preview/new');assert.equal(writes[0].body.previousRunId,run.id);assert(context.reloaded);
}
(async()=>{await check(false);await check(true);await check(true,'formal');console.log('学生任务说明通过：冻结任务分支正确、无版本营销、预览重启需明确从头确认、正式轮次无重启入口。');})().catch(error=>{console.error(error);process.exitCode=1;});
