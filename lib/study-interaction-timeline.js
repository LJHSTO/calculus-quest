'use strict';
// Descriptive reconstruction, kept separate from the leakage-controlled decision replay.
const parse=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v||'{}');}catch{return {};}};
const instant=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const dictionaries={
 timeline:{runId:'关联学习轮次；不含实名签署信息',at:'服务端时间，UTC；缺失时为null，不捏造顺序',clientAt:'客户端上报时间，仅作辅助',category:'记录类别',sourceTable:'原始表',sourceId:'原始记录标识',questionId:'题目标识；空值不推断归属',conversationId:'对话标识',requestId:'请求标识；旧记录可能为空',inputOrigin:'客户端来源标记：manual_submit手动提交（可能编辑过建议），action_button按钮代发，suggested_draft未修改的建议草稿，programmatic程序调用，unrecorded旧记录或未上报；不据此断言文字为本人原创',inputActionLabel:'触发请求的按钮文字，未记录时为空',detail:'完整结构化内容；非屏幕录像'},
 modelCalls:{status:'completed=已返回；cancelled=取消；fallback=课程兜底。空白不是成功',kind:'dialogue_model/structured_help为模型路径，local_control为确定性会话控制',activeCheckId:'讨论已完成独立检查时的检查号，可关联checks表',discussionTarget:'current_task或completed_independent_check',queueMs:'本系统等待执行槽的毫秒数',executionMs:'外部模型调用耗时，含其网关和网络',totalMs:'服务端请求处理至生成完成的耗时，不含随后保存和浏览器渲染；旧记录缺失为null',generationMs:'提示构造后到生成完成的耗时，包含本地排队；不是完整请求耗时',requestedModel:'请求型号',reportedModel:'服务返回型号',fallback:'true不可计作真实模型成功',promptTokens:'输入token数',completionTokens:'输出token数'},
 checks:{correct:'true/false/null；未评分与跳过为null',phase:'pre/formative/post或记录的检查范围',response:'原始作答或检查选择',evidenceKind:'按来源区分测验、课后独立检查与对话练习，不合并算分'}
};
function build(bundle,{mode,protocolFingerprint,runId}={}){
 if(!['formal','preview'].includes(mode)||!protocolFingerprint)throw Object.assign(Error('请选择正式或体验记录，以及协议版本'),{status:400});
 const runs=(bundle.runs||[]).filter(r=>r.mode===mode&&r.protocolFingerprint===protocolFingerprint&&(!runId||r.id===runId)&&r.status!=='withdrawn'&&(mode!=='formal'||r.consentedAt));
 const byId=new Map(runs.map(r=>[r.id,r])),timeline=[],modelCalls=[],checks=[],issues=[];
 const common=(run)=>({runId:run.id,arm:run.arm,mode:run.mode,protocolFingerprint:run.protocolFingerprint});
 const add=(r,table,category,type,detail={},extra={})=>{
  const run=byId.get(r.user_id||r.run_id);if(!run)return;
  const at=instant(r.created_at||r.at||detail.at||detail.offeredAt||r.updated_at);
  if(!at)issues.push({runId:run.id,sourceTable:table,sourceId:r.id||r.slot||'',code:'missing_server_time'});
  const context=parse(r.context_json);
  const item={...common(run),at,clientAt:instant(detail.clientAt||detail.timestamp),category,type,sourceTable:table,sourceId:r.id||r.slot||'',unitId:r.unit_id||detail.unitId||detail.scope||'',sceneType:r.scene_type||detail.sceneType||context.sceneType||'',questionId:r.question_id||context.questionId||detail.questionId||'',conversationId:r.conversation_id||detail.conversationId||'',requestId:context.requestId||detail.requestId||'',inputOrigin:context.inputOrigin||detail.inputOrigin||'unrecorded',inputActionLabel:context.inputActionLabel||detail.inputActionLabel||'',detail,...extra};
  timeline.push(item);return item;
 };
 const tables=bundle.tables||{};
 const finished=new Map((tables.events||[]).flatMap(r=>{const p=parse(r.payload);return p.eventType==='assistant_request_finished'&&p.data?.requestId?[[r.user_id+':'+p.data.requestId,p.data]]:[];}));
 const interventions=new Map((tables.proactive_interventions||[]).map(r=>[r.id,r]));
 const recordedChecks=new Set((tables.events||[]).flatMap(r=>{const p=parse(r.payload);return /^proactive_verification_(submitted|declined)$/.test(p.eventType)?[r.user_id+':'+p.data?.checkId]:[];}));
 for(const [table,rows]of Object.entries(tables))for(const r of rows){
  if(!byId.has(r.user_id))continue;
  if(table==='events'){
   const p=parse(r.payload),d=p.data||{},type=p.eventType||r.type,merged={...p,...d};
   const category=/assistant_request|knowledge_(question|answer|request|discussion|conversation)/.test(type)?'对话与等待':/check|verification/.test(type)?'独立检验':/proactive|support_cycle/.test(type)?'帮助与决策':/scene|unit|lecture|slide|courseware|parameter|challenge/.test(type)?'课件与操作':/guide|consent|logout|session|review/.test(type)?'流程与退出':'其他事件';
   const item=add(r,table,category,type,merged);
   if(/^proactive_verification_(submitted|declined)$/.test(type)){
    const linked=interventions.get(d.interventionId),presentation=linked?.user_id===r.user_id?parse(linked.presentation):{};
    const questionId=d.questionId||presentation.questionId||presentation.questionContext?.questionId||'';
    item.questionId=questionId;
    checks.push({...common(byId.get(r.user_id)),at:item.at,sourceId:r.id,sourceTable:table,unitId:p.unitId||'',questionId,phase:'independent_check',evidenceKind:'policy_owned_probe',checkId:d.checkId||'',correct:typeof d.isCorrect==='boolean'?d.isCorrect:null,status:type.endsWith('declined')?'skipped':d.isCorrect===true?'correct':d.isCorrect===false?'incorrect':'unscored',response:d.response??null,prompt:d.itemSnapshot?.prompt||'',options:d.itemSnapshot?.options||[],interventionId:d.interventionId||'',decisionId:d.decisionId||'',instrumentVersion:d.instrumentVersion||'',supportLevel:d.supportLevel||''});
   }
   if(type==='assistant_request_finished'&&d.status==='cancelled')modelCalls.push({...common(byId.get(r.user_id)),at:item.at,sourceId:r.id,requestId:d.requestId||'',conversationId:d.conversationId||'',unitId:p.unitId||'',questionId:d.questionId||'',status:'cancelled',queueMs:number(d.queueMs),executionMs:number(d.executionMs),totalMs:number(d.totalMs),requestedModel:d.requestedModel||'',reportedModel:'',fallback:null,promptTokens:null,completionTokens:null});
  }else if(table==='learning_assistant_messages'){
   const c=parse(r.context_json),a=c.modelAudit||{};add(r,table,'对话与等待',r.role,{...c,text:r.content,provider:r.provider});
   if(r.role==='assistant')modelCalls.push({...common(byId.get(r.user_id)),at:instant(r.created_at),sourceId:r.id,requestId:c.requestId||'',conversationId:r.conversation_id,unitId:r.unit_id,questionId:c.questionId||'',activeCheckId:a.contextAudit?.activeCheckId||'',discussionTarget:a.contextAudit?.discussionTarget||'',kind:['conversation-control','grounding-guard'].includes(r.provider)?'local_control':'dialogue_model',status:c.fallback?'fallback':'completed',provider:r.provider,queueMs:number(a.queueMs),executionMs:number(a.executionMs),totalMs:number(finished.get(r.user_id+':'+c.requestId)?.totalMs),generationMs:number(a.latencyMs),requestedModel:a.requestedModel||'',reportedModel:a.reportedModel||'',fallback:typeof c.fallback==='boolean'?c.fallback:null,promptTokens:number(a.usage?.prompt_tokens),completionTokens:number(a.usage?.completion_tokens)});
  }else if(table==='quiz_results'){
   const item=add(r,table,'测验作答',r.phase,r),raw=r.is_correct;
   checks.push({...common(byId.get(r.user_id)),at:item.at,sourceId:r.id,unitId:r.unit_id,questionId:r.question_id,phase:r.phase,evidenceKind:'quiz_result',correct:[0,1].includes(raw)?raw===1:null,status:r.status||'',response:r.response??r.selected_option??r.selected_answer??null});
  }else if(table==='agent_memory'){
   const payload=parse(r.payload_json||r.payload),o=payload.outcome;
   add(r,table,'学习证据',r.kind||'memory',payload);
   if(o&&!recordedChecks.has(r.user_id+':'+o.checkId))checks.push({...common(byId.get(r.user_id)),at:instant(r.created_at),sourceId:r.id,sourceTable:table,unitId:o.unitId||r.scope,questionId:o.questionId||'',phase:'independent_check',evidenceKind:'verified_check_memory',correct:o.status==='correct'?true:o.status==='incorrect'?false:null,status:o.status||'',response:o.response??o.responseLabel??null,checkId:o.checkId||''});
  }else if(table==='learner_support_rounds'){
   const d=parse(r.document),audit=d.content?.audit||{},a=audit.model||{};
   add(r,table,'帮助与决策','structured_help',d);
   for(const response of d.responses||[])add({...r,id:r.id+':'+response.id,created_at:response.at},table,'帮助与决策','support_'+response.action,{...response,scope:d.scope,sceneType:d.sceneType,cycleId:d.cycleId,round:d.round});
   if(d.content)modelCalls.push({...common(byId.get(r.user_id)),at:instant(d.offeredAt),sourceId:r.id,requestId:'',conversationId:'',cycleId:d.cycleId,round:d.round,unitId:d.scope,questionId:'',kind:'structured_help',status:audit.fallback?'fallback':'completed',provider:audit.provider||'',queueMs:number(a.queueMs),executionMs:number(a.executionMs),totalMs:null,generationMs:number(audit.latencyMs),requestedModel:a.requestedModel||'',reportedModel:a.reportedModel||'',fallback:typeof audit.fallback==='boolean'?audit.fallback:null,promptTokens:number(a.usage?.prompt_tokens),completionTokens:number(a.usage?.completion_tokens)});
  }else if(['learner_preference_history','learner_support_cycles','proactive_decisions','proactive_interventions','proactive_outcome_attempts','agent_tasks','agent_permissions','agent_action_receipts','learning_notes'].includes(table)){
   const category=table==='learner_preference_history'?'帮助配置':table==='learning_notes'?'笔记':table==='proactive_outcome_attempts'?'后续测量':'帮助与决策';
   const mutable=['learner_support_cycles','proactive_interventions','agent_tasks','agent_permissions','agent_action_receipts'].includes(table);
   add(mutable?{...r,created_at:r.updated_at||r.created_at}:r,table,category,mutable?'latest_snapshot:'+r.status:r.kind||r.status||table,parse(r.document||r.payload_json||JSON.stringify(r)));
  }
 }
 for(const record of bundle.records||[])if(byId.has(record.run_id))add(record,'three_arm_records','研究流程',record.kind,parse(record.document));
 for(const run of runs)add({user_id:run.id,id:run.id,created_at:run.createdAt},'three_arm_runs','研究流程','run_started',{assessmentVersion:run.assessmentVersion,status:run.status});
 timeline.sort((a,b)=>(a.at||'~').localeCompare(b.at||'~')||a.sourceTable.localeCompare(b.sourceTable)||String(a.sourceId).localeCompare(String(b.sourceId)));
 const summaries=runs.map(run=>{const own=timeline.filter(r=>r.runId===run.id),calls=modelCalls.filter(r=>r.runId===run.id);return {...common(run),events:own.length,modelReplies:calls.filter(c=>c.status!=='cancelled'&&c.kind!=='local_control').length,localReplies:calls.filter(c=>c.kind==='local_control').length,cancelledRequests:calls.filter(c=>c.status==='cancelled').length,fallbacks:calls.filter(c=>c.fallback===true).length,missingModelAudit:calls.filter(c=>c.status!=='cancelled'&&c.kind!=='local_control'&&!c.reportedModel).length,checks:checks.filter(c=>c.runId===run.id).length,firstAt:own.find(e=>e.at)?.at||null,lastAt:[...own].reverse().find(e=>e.at)?.at||null};});
 return {schemaVersion:'study-interaction-timeline-r18',generatedAt:new Date().toISOString(),mode,protocolFingerprint,summaries,timeline,modelCalls,checks,issues,dictionaries,notes:['这是事件与对话回放，不是屏幕录像；没有记录的操作不能据此推断。','时间线含事后结果，仅用于描述分析，不作为介入决策模型的输入；决策评估使用独立的介入与静默回放。','按轮次、协议和题号关联；空白表示未记录，不等于零或答错。','全文对话与笔记保留供内部研究核查，分享前需检查自由文本中的个人信息。']};
}
module.exports={build};
