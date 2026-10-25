'use strict';
const crypto=require('node:crypto');
const {buildSelectedParticipantPackage}=require('./selected-participant-export');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const parse=x=>{try{return JSON.parse(x);}catch{return x;}};
function createReplay({db,pilot}){
  function read(table,user){const s=db.getDbSync().prepare(`SELECT * FROM ${table} WHERE user_id=?`);try{s.bind([user]);const a=[];while(s.step())a.push(s.getAsObject());return a;}finally{s.free();}}
  function roster(project){const versions=pilot.versions().filter(v=>v.project===project);if(!versions.length)throw Object.assign(new Error('预试项目不存在'),{status:404});
    const members=pilot.members(project).map(e=>{
      const inWindow=r=>Date.parse(r.created_at)>=Date.parse(e.consentAt)&&Date.parse(r.created_at)<=(e.endedAt?Date.parse(e.endedAt):Date.now())&&(r.learning_generation==null||Number(r.learning_generation)===e.generation);
      const q=read('quiz_results',e.userId).filter(inWindow);
      const events=read('events',e.userId).filter(inWindow);
      const before=read('quiz_results',e.userId).some(r=>Date.parse(r.created_at)<Date.parse(e.consentAt));
      return {participantCode:e.participantCode,id:e.id,versionId:e.versionId,status:e.status,stage:e.stage,arm:e.arm,consentAt:e.consentAt,endedAt:e.endedAt||null,
        generation:e.generation,configurationRevision:e.configuration?.revision||0,baselineComplete:Boolean(e.baselineSurvey),finalComplete:Boolean(e.finalSurvey&&e.status==='finished'),
        quizRecords:q.length,phases:[...new Set(q.map(r=>r.phase))],eventRecords:events.length,priorLearning:before,dataRequest:e.dataRequest||'',
        warnings:[...(before?['本账号有预试前作答，请核对是否符合初学者招募条件']:[]),...(!q.some(r=>r.phase==='post')?['尚未记录本轮后测']:[]),...(e.status==='withdrawn'?['已退出，默认回放导出排除']:[])]};});
    return {versions,members,capacity:20,used:members.length,counts:Object.fromEntries(['control','configurable'].map(a=>[a,members.filter(m=>m.arm===a).length]))};
  }
  function exportProject(project,participant=''){
    const source=pilot.exportData(project);if(!source.versions.length)throw Object.assign(new Error('预试项目不存在'),{status:404});
    const all=pilot.members(project),selected=all.filter(e=>e.status!=='withdrawn'&&(!participant||e.participantCode===participant));
    if(participant&&!selected.length)throw Object.assign(new Error('该参与记录不存在或已退出，不能导出其研究回放'),{status:404});
    const timeline=[],participants=[],coverage=[];
    const idMap=new Map(selected.map(e=>[e.userId,e.participantCode]));
    // Pseudonymize identifiers recursively, including JSON text columns. Free text
    // is retained for internal review and must be checked before external sharing.
    function clean(value){if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(password|token|secret|email|nickname|user_agent|ip_address)/i.test(k)).map(([k,v])=>[k,clean(v)]));
      if(typeof value==='string'){if(idMap.has(value))return idMap.get(value);if(/^[\[{]/.test(value)){const p=parse(value);if(typeof p!=='string')return JSON.stringify(clean(p));}}return value;}
    for(const e of selected){
      const raw=buildSelectedParticipantPackage(db.getDbSync(),[e.userId]),tables={},from=Date.parse(e.consentAt),to=e.endedAt?Date.parse(e.endedAt):Date.now();
      const omitted={};
      for(const [table,rows] of Object.entries(raw.tables)){
        if(['users','sessions','learning_assistant_daily_usage'].includes(table)){omitted[table]=rows.length;continue;}
        const metadata=table.includes('protocol')||table==='proactive_experiment_runtime';
        const kept=rows.filter(r=>{if(metadata)return true;if((r.learning_generation??r.generation)!=null&&Number(r.learning_generation??r.generation)!==e.generation)return false;
          const t=Date.parse(r.created_at||r.at||r.updated_at||r.assigned_at||'');return Number.isFinite(t)&&t>=from&&t<=to;});
        tables[table]=clean(kept);omitted[table]=rows.length-kept.length;
        for(const r of kept){if(metadata)continue;const at=r.created_at||r.at||r.updated_at||r.assigned_at,payload=parse(r.payload_json||r.payload||'{}');timeline.push({participantCode:e.participantCode,at,source:table,id:r.id||digest(r).slice(0,16),type:payload?.eventType||r.type||r.event_type||r.action||r.status||table,data:clean(r)});}
      }
      const pEvents=source.events.filter(r=>r.enrollmentId===e.id);for(const r of pEvents)timeline.push({participantCode:e.participantCode,at:r.at,source:'pilot_events',id:r.id,type:r.type,data:clean(r)});
      participants.push({participantCode:e.participantCode,enrollment:clean(e),tables});coverage.push({participantCode:e.participantCode,counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),omittedOutsideConsentOrGeneration:omitted,unavailableTables:raw.collection_coverage.unavailable_tables});
    }
    timeline.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
    const ids=new Set(selected.map(e=>e.id)),ops=source.opportunities.filter(o=>ids.has(o.enrollmentId)),opids=new Set(ops.map(o=>o.id));
    const packageData={schemaVersion:'pilot-complete-replay-v1',generatedAt:new Date().toISOString(),project,versions:source.versions,
      participants,timeline,opportunities:clean(ops),answers:clean(source.answers.filter(a=>opids.has(a.opportunityId))),annotations:clean(source.annotations.filter(a=>opids.has(a.opportunityId))),coverage,
      excludedWithdrawn:all.filter(e=>e.status==='withdrawn').map(e=>e.participantCode),
      interpretation:{kind:'带来源的事件与状态回放，不是屏幕录像或眼动记录',scope:'同意后至结束时的本学习代次；时间缺失、前期记录和退出者不进入默认包',privacy:'编号已替换直接身份字段，自由文本仍可能含个人信息，仅供内部研究管理；对外分享前复核',order:'按服务端记录时间排序，原始客户端时间保留；不是严格因果顺序',exposure:'生成、投递、可见回执和学生接受分别解释；没有回执不当作已看到',questionnaires:'研究自编预试条目，不是已验证的心理量表',limitations:['没有记录的事件不能恢复','当前状态快照可能包含早期学习上下文，不用于本轮结果计算','不同代次、缺失和未知不得合并为错误或拒绝']}};
    packageData.fingerprint=digest(packageData);return packageData;
  }
  return {roster,exportProject};
}
module.exports={createReplay};
