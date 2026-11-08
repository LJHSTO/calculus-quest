'use strict';
const crypto=require('node:crypto');
const instrument=require('./assessments/regulation-transfer-r11');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,code:'regulation_transfer_session'});};
const clone=x=>JSON.parse(JSON.stringify(x));
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function createStore({db,study,eligibility=()=>({eligible:false,reason:'请先完成延迟保持与迁移。'}),clock=Date.now}){
  let initialized=false;
  function sql(){const d=db.getDbSync();if(!initialized){d.run('CREATE TABLE IF NOT EXISTS regulation_transfer_sessions(run_id TEXT PRIMARY KEY,document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS regulation_transfer_ratings(run_id TEXT NOT NULL,rater TEXT NOT NULL,document TEXT NOT NULL,PRIMARY KEY(run_id,rater));');initialized=true;}return d;}
  function rows(query,params=[]){const s=sql().prepare(query);try{s.bind(params);const result=[];while(s.step())result.push(s.getAsObject());return result;}finally{s.free();}}
  const now=()=>new Date(clock()).toISOString();
  const read=id=>{const r=rows('SELECT document FROM regulation_transfer_sessions WHERE run_id=?',[id])[0];return r?JSON.parse(r.document):null;};
  function save(s){sql().run('INSERT INTO regulation_transfer_sessions(run_id,document) VALUES(?,?) ON CONFLICT(run_id) DO UPDATE SET document=excluded.document',[s.runId,JSON.stringify(s)]);db.saveNow();return s;}
  function run(id){const r=study.get(id);if(!r)fail('学习轮次不存在',404);return r;}
  const supported=r=>r.regulationVersion===instrument.version;
  function event(s,type,data={}){s.events.push({sequence:s.events.length+1,at:now(),taskId:s.taskId,phase:s.phase,type,...data});}
  function expire(s){if(s?.status==='active'&&clock()>=Date.parse(s.deadlineAt)){s.status='expired';s.completedAt=now();s.revision++;event(s,'time_limit_reached',{missingReason:'time_limit'});save(s);}return s;}
  function current(id){run(id);return expire(read(id));}
  function receipt(s,kind,content){const r={id:crypto.randomUUID(),kind,taskId:s.taskId,phase:s.phase,level:s.helpLevel||0,issuedAt:now(),contentVersion:instrument.version,contentHash:digest(content),visibleAt:null};s.receipts.push(r);s.currentReceiptId=r.id;event(s,'material_dispatched',{receiptId:r.id,kind:r.kind,level:r.level,contentHash:r.contentHash});}
  function issue(s){if(s.phase==='support'){const p=instrument.publicTask(s.taskId,'support',{level:s.helpLevel});receipt(s,s.helpLevel?'help':'invitation',s.helpLevel?p.help:p.invitation);}else s.currentReceiptId=null;}
  function project(r,s){
    const gate=eligibility(r.id),base={runId:r.id,instrumentVersion:instrument.version,supported:supported(r),serverNow:now(),unlockAt:gate.unlockAt||null,reason:gate.reason||'请在后测满72小时并完成延迟保持与迁移后进入。'};
    if(!supported(r))return {...base,status:'legacy',reason:'本轮使用原版本的配置判断任务。'};
    if(!s)return {...base,status:gate.eligible?'available':'locked',instrument:instrument.publicInstrument()};
    const safe={...base,status:s.status,revision:s.revision,startedAt:s.startedAt,deadlineAt:s.deadlineAt,remainingSeconds:Math.max(0,Math.ceil((Date.parse(s.deadlineAt)-clock())/1000)),completedAt:s.completedAt||null,phase:s.phase,taskId:s.taskId,taskIndex:Math.max(0,instrument.taskOrder.indexOf(s.taskId)),instrument:instrument.publicInstrument()};
    if(s.status!=='active')return {...safe,message:s.status==='expired'?'14分钟已到，已有作答已保存；未完成部分会如实保留。':instrument.publicInstrument().completionMessage};
    safe.draft=clone(s.responses[s.taskId]||{});
    if(s.phase!=='orientation'&&s.phase!=='summary')safe.task=instrument.publicTask(s.taskId,s.phase,{level:s.helpLevel});
    if(['support','reflect'].includes(s.phase))safe.task.reviewQuestion=instrument.publicTask(s.taskId,s.phase==='support'?'attempt':'check').question;
    if(s.currentReceiptId){const r=s.receipts.find(x=>x.id===s.currentReceiptId);safe.receipt={id:r.id,kind:r.kind,level:r.level,visible:Boolean(r.visibleAt)};}
    return safe;
  }
  function state(id){const r=run(id);return project(r,expire(read(id)));}
  function validateInput(input){if(!input||typeof input!=='object'||Array.isArray(input))fail('请求格式无效');const allowed=['action','runId','requestId','revision','taskId','phase','answers','receiptId'];if(Object.keys(input).some(k=>!allowed.includes(k)))fail('请求包含未知字段');if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))fail('保存请求编号无效');if(!Number.isSafeInteger(input.revision)||input.revision<0)fail('保存版本无效');}
  const phaseFields={attempt:['initialAnswer','initialReason','confidence'],support:['helpChoice','actionChoice','actionNote'],check:['checkAnswer','checkReason'],reflect:['reflectionDecision','reflectionReason'],scenario:['choice','reason','verification']};
  function answers(s,input){const kind=instrument.publicTask(s.taskId).kind,fields=kind==='scenario'?phaseFields.scenario:phaseFields[s.phase];if(!fields)fail('当前阶段不能填写答案',409);const clean=instrument.normalizeSubmission(s.taskId,input.answers||{});if(Object.keys(clean).some(k=>!fields.includes(k)))fail('不能修改其他阶段的回答',409);return clean;}
  function requireFields(value,fields){if(fields.some(k=>!value[k]))fail('请完成当前选择，或明确选择暂不作答。');}
  function advanceTask(s){const index=instrument.taskOrder.indexOf(s.taskId);s.taskId=instrument.taskOrder[index+1]||null;s.phase=s.taskId?'attempt':'summary';s.helpLevel=0;s.currentReceiptId=null;event(s,'phase_entered');}
  function action(id,input){
    const r=run(id);validateInput(input);if(input.runId!==id)fail('账号或学习轮次已变化，请重新打开任务。',409);if(!supported(r))fail('本轮使用原版本任务',409);
    let s=expire(read(id)),signature=digest(input),prior=s?.requests.find(x=>x.id===input.requestId);
    if(prior){if(prior.signature!==signature)fail('相同保存编号不能提交不同内容',409);return project(r,s);}
    if(input.action==='start'){
      if(s) return project(r,s);
      if(input.revision!==0||!eligibility(id).eligible)fail('请在后测满72小时并完成延迟保持与迁移后开始。',409);
      s={runId:id,instrumentVersion:instrument.version,primaryOutcome:instrument.primaryOutcome,status:'active',startedAt:now(),deadlineAt:new Date(clock()+840000).toISOString(),revision:0,phase:'orientation',taskId:null,helpLevel:0,responses:{},events:[],receipts:[],requests:[]};event(s,'started');
    }else{
      if(!s||s.status!=='active')fail(s?.status==='expired'?'任务时间已到，已有记录已保存。':'任务尚未开始或已经结束。',409);
      if(input.revision!==s.revision)fail('另一页面已更新作答，请重新读取后继续。',409);
      if(input.taskId!==s.taskId||input.phase!==s.phase)fail('任务阶段已变化，请重新读取。',409);
      if(s.requests.length>=2048)fail('保存次数已超过本任务上限，请联系研究人员。',429);
      if(input.action==='visible'){
        const x=s.receipts.find(t=>t.id===input.receiptId);if(!x||x.id!==s.currentReceiptId||clock()-Date.parse(x.issuedAt)<1000)fail('该内容尚未获得有效可见记录',409);
        if(!x.visibleAt){x.visibleAt=now();event(s,'client_visibility_reported',{receiptId:x.id,kind:x.kind,level:x.level,criterion:'client_reports_half_visible_1000ms_server_elapsed_checked_not_proof_of_reading'});}
      }else if(input.action==='begin'){
        if(s.phase!=='orientation')fail('任务已开始',409);s.taskId=instrument.taskOrder[0];s.phase='attempt';event(s,'phase_entered');
      }else if(input.action==='finish'){
        if(s.phase!=='summary')fail('请先完成各个任务',409);s.status='submitted';s.completedAt=now();event(s,'submitted');
      }else if(input.action==='skip'){
        if(!s.taskId)fail('当前阶段不能跳过',409);s.responses[s.taskId]={...s.responses[s.taskId],skipped:true,missingReason:'explicit_skip'};event(s,'task_skipped');advanceTask(s);
      }else if(['draft','next','help'].includes(input.action)){
        const value=answers(s,input);s.responses[s.taskId]={...s.responses[s.taskId],...value};const a=s.responses[s.taskId];
        if(input.action==='help'){
          if(s.phase!=='support'||s.helpLevel>=2)fail('当前没有更多线索',409);
          // A content request is a real help choice. The client cannot claim a level or a score.
          a.helpChoice='hint';if(s.helpLevel)a.actionChoice='more_help';s.helpLevel++;issue(s);event(s,'help_requested',{level:s.helpLevel});
        }else if(input.action==='next'){
          const kind=instrument.publicTask(s.taskId).kind;
          if(kind==='scenario'){requireFields(a,['choice']);event(s,'scenario_saved');advanceTask(s);}
          else if(s.phase==='attempt'){requireFields(a,['initialAnswer','confidence']);s.phase='support';s.helpLevel=0;issue(s);event(s,'initial_attempt_saved');}
          else if(s.phase==='support'){requireFields(a,['helpChoice','actionChoice']);if(a.helpChoice==='hint'&&!s.helpLevel)fail('请先打开线索，或选择自己继续。');if(a.actionChoice==='more_help'&&s.helpLevel<2)fail('请先打开更具体的线索，或改选下一步。');event(s,'support_action_saved',{helpLevel:s.helpLevel});s.phase='check';s.currentReceiptId=null;}
          else if(s.phase==='check'){requireFields(a,['checkAnswer']);event(s,'independent_check_saved');s.phase='reflect';}
          else if(s.phase==='reflect'){requireFields(a,['reflectionDecision']);event(s,'reflection_saved');advanceTask(s);}
        }
      }else fail('任务操作无效');
    }
    // Visibility bookkeeping does not invalidate an in-flight answer edit in another request.
    if(input.action!=='visible')s.revision++;
    s.requests.push({id:input.requestId,signature});save(s);return project(r,s);
  }
  function protects(id){const r=study.get(id);return Boolean(r&&supported(r)&&expire(read(id))?.status==='active');}
  function ratingPacket(id){const s=current(id);if(!s||s.status==='active')fail('任务尚未结束',409);return {blindId:digest({id}).slice(0,20),instrumentVersion:s.instrumentVersion,status:s.status,responses:clone(s.responses),events:clone(s.events),receipts:clone(s.receipts),rubric:instrument.ratingCards()};}
  function rate(id,input){const s=current(id);if(!s||s.status==='active')fail('请在任务结束后评分',409);if(typeof input?.rater!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(input.rater))fail('评分人编号无效');if(!input.scores||typeof input.scores!=='object'||Array.isArray(input.scores))fail('评分记录格式无效');const scores=instrument.summarizeRatings(input.scores),old=rows('SELECT document FROM regulation_transfer_ratings WHERE run_id=? AND rater=?',[id,input.rater])[0];if(old){const previous=JSON.parse(old.document);if(digest(previous.ratings)!==digest(input.scores))fail('原始盲评分不可覆盖，请另存裁决记录',409);return previous;}const result={rater:input.rater,at:now(),instrumentVersion:instrument.version,ratings:clone(input.scores),...scores};sql().run('INSERT INTO regulation_transfer_ratings VALUES(?,?,?)',[id,input.rater,JSON.stringify(result)]);db.saveNow();return result;}
  function exportRecords(){return {instrumentVersion:instrument.version,instrument:instrument.publicInstrument(),ratingCards:instrument.ratingCards(),sessions:rows('SELECT document FROM regulation_transfer_sessions').map(r=>{const s=expire(JSON.parse(r.document));const responses=Object.fromEntries(['sensor','junction'].map(id=>[id,{initial:s.responses[id]?.initialAnswer,check:s.responses[id]?.checkAnswer}]));const {requests,...safe}=s;return {...safe,math:instrument.mathSummary(responses)};}),ratings:rows('SELECT run_id,document FROM regulation_transfer_ratings').map(r=>({runId:r.run_id,...JSON.parse(r.document)}))};}
  return {state,action,protects,ratingPacket,rate,exportRecords};
}
module.exports={createStore,version:instrument.version};
