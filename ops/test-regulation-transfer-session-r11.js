'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
async function main(){
 const SQL=await require('sql.js')();let database=new SQL.Database(),time=Date.parse('2026-11-08T10:00:00Z');
 const db={getDbSync:()=>database,saveNow(){}},version=require('../lib/assessments/regulation-transfer-r11').version;
 const runs=Object.fromEntries(['A','B','C','late'].map(id=>[id,{id,arm:id,regulationVersion:version}]));runs.old={id:'old',arm:'B'};
 const study={get:id=>runs[id]},eligibility=id=>({eligible:id!=='late',unlockAt:new Date(time-1000).toISOString()});
 let store=require('../lib/regulation-transfer-session').createStore({db,study,eligibility,clock:()=>time});
 let s=store.state('B');const command=(action,answers,extra={})=>({runId:s.runId,revision:s.revision||0,requestId:crypto.randomUUID(),taskId:s.taskId??null,phase:s.phase,action,...(answers?{answers}:{}),...extra});
 function send(action,answers,extra){const p=command(action,answers,extra);s=store.action('B',p);return p;}
 const safe=p=>{const raw=JSON.stringify(p);for(const key of ['answer','analysis','rubric','mathKeys','criteria','correct','score'])assert(!raw.includes('"'+key+'":'),key+'公开泄露');};
 assert.equal(store.state('old').status,'legacy');assert.equal(store.state('late').status,'locked');assert.throws(()=>store.state('missing'));
 assert.throws(()=>store.action('A',command('start')),/轮次/);
 const started=send('start');assert.equal(s.remainingSeconds,840);assert(store.protects('B'));assert.equal(store.action('B',started).revision,s.revision);assert.throws(()=>store.action('B',{...started,answers:{}}),/编号/);
 send('begin');assert.equal(s.taskId,'sensor');safe(s);
 assert.throws(()=>store.action('B',command('next',{checkAnswer:'A'})),/其他阶段/);
 const attempt=send('next',{initialAnswer:'C',initialReason:'附近与单点分开观察',confidence:'sure'});assert.equal(s.phase,'support');assert.equal(s.receipt.kind,'invitation');safe(s);
 assert.throws(()=>store.action('B',command('visible',null,{receiptId:s.receipt.id})),/可见/);
 time+=1300;send('visible',null,{receiptId:s.receipt.id});assert.equal(s.receipt.visible,true);
 send('help',{helpChoice:'hint'});assert.equal(s.task.help.level,1);const issued=s.receipt.id;time+=1300;send('visible',null,{receiptId:issued});
 send('help',{actionChoice:'more_help'});assert.equal(s.task.help.level,2);assert.throws(()=>store.action('B',command('help',{})),/更多/);
 send('next',{helpChoice:'hint',actionChoice:'more_help',actionNote:'分别记录三行'});assert.equal(s.phase,'check');assert(!s.task.help);assert(!s.receipt);safe(s);
 assert.throws(()=>store.action('B',command('draft',{initialAnswer:'A'})),/其他阶段/);
 send('next',{checkAnswer:'A',checkReason:'两侧与点值一样'});assert.equal(s.phase,'reflect');safe(s);
 // Persistence: a new store on a serialized database resumes the exact stage/deadline.
 const deadline=s.deadlineAt;database=new SQL.Database(database.export());store=require('../lib/regulation-transfer-session').createStore({db,study,eligibility,clock:()=>time});s=store.state('B');assert.equal(s.phase,'reflect');assert.equal(s.deadlineAt,deadline);
 send('next',{reflectionDecision:'stop',reflectionReason:'新例三者一致，能自己说明'});assert.equal(s.taskId,'junction');
 send('next',{initialAnswer:'B',confidence:'unsure'});send('next',{helpChoice:'decline',actionChoice:'self_check',actionNote:'自行比较左右'});send('next',{checkAnswer:'D'});send('next',{reflectionDecision:'continue',reflectionReason:'还想核对单点与连续条件'});
 assert.equal(s.taskId,'pause_case');send('next',{choice:'continue',reason:'独立表现已有证据',verification:'换一张图自己解释'});assert.equal(s.taskId,'worked_example_case');send('next',{choice:'hint',reason:'还不会分别比较左右',verification:'收起例子再尝试'});assert.equal(s.phase,'summary');
 const finished=send('finish');assert.equal(s.status,'submitted');assert(!store.protects('B'));assert.equal(store.action('B',finished).status,'submitted');assert.throws(()=>store.action('B',command('draft',{})),/结束/);
 const packet=store.ratingPacket('B');assert(!('runId'in packet));assert(!('arm'in packet));assert.equal(packet.receipts.filter(r=>r.visibleAt).length,2);assert.equal(packet.receipts.length,4);assert(packet.events.some(e=>e.type==='material_dispatched'));assert(packet.events.some(e=>e.type==='client_visibility_reported'));
 const ratings={sensor:[2,2,2],junction:[2,1,2],pause_case:[1,2,2],worked_example_case:[2,2,2]};const r=store.rate('B',{rater:'blind_1',scores:ratings});assert.equal(r.behaviorScore,11);assert.equal(r.scenarioScore,11);assert.equal(r.combinedScore,null);assert.deepEqual(store.rate('B',{rater:'blind_1',scores:ratings}),r);assert.throws(()=>store.rate('B',{rater:'blind_1',scores:{...ratings,sensor:[0,0,0]}}),/覆盖/);
 assert.equal(store.exportRecords().sessions[0].math.score,4);assert(!store.exportRecords().sessions[0].requests);
 // Another arm gets identical help, while run-bound payloads cannot cross accounts.
 s=store.state('A');const startA=command('start');s=store.action('A',startA);assert.throws(()=>store.action('C',startA),/轮次/);s=store.action('A',command('begin'));s=store.action('A',command('next',{initialAnswer:'A',confidence:'dont_know'}));s=store.action('A',command('help',{helpChoice:'hint'}));assert.equal(s.task.help.text,require('../lib/assessments/regulation-transfer-r11').publicTask('sensor','support',{level:1}).help.text);
 const stale=command('draft',{actionNote:'旧页面'});s=store.action('A',command('draft',{actionNote:'新页面'}));assert.throws(()=>store.action('A',stale),/另一页面/);
 time=Date.parse(s.deadlineAt)+1;assert.equal(store.state('A').status,'expired');assert(!store.protects('A'));assert.throws(()=>store.action('A',command('next',{helpChoice:'hint',actionChoice:'self_check'})),/时间/);const expired=store.exportRecords().sessions.find(x=>x.runId==='A');assert.equal(expired.math.score,null);assert(expired.events.some(e=>e.missingReason==='time_limit'));
 s=store.state('C');s=store.action('C',command('start'));s=store.action('C',command('begin'));s=store.action('C',command('skip'));assert.equal(s.taskId,'junction');assert.equal(store.exportRecords().sessions.find(x=>x.runId==='C').responses.sensor.missingReason,'explicit_skip');
 const report={passed:true,at:new Date().toISOString(),checks:['完整四任务与两级统一帮助','先作答后帮助、独立检查后反思','公开状态不泄露数学对错或量规','数据库重载后恢复阶段与原始期限','重复请求幂等、不同内容重用编号拒绝、旧页面冲突','跨轮次拒绝、旧版本保留原流程','服务器840秒到期保留缺失并释放保护','下发与客户端可见记录分开','两个盲评分总分分开、原评分不可覆盖'],limits:['本测试是独立服务，不代表主服务器HTTP鉴权已接入','未验证真人14分钟可完成']};const out=path.join(__dirname,'../output/学习体验与调节迁移-r11-20261107');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'调节迁移服务自检.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
