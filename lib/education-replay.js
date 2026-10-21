"use strict";
const crypto = require("node:crypto");
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function buildReplay(source, { splitSalt, allowEngineering = false } = {}) {
  if (!splitSalt || splitSalt.length < 16) throw new Error("需要独立的划分种子，长度至少16字符");
  if (!["engineering_synthetic_only", "human_consented_research"].includes(source.dataClass)) throw new Error("需要显式标明数据来源类别");
  if (source.dataClass === "engineering_synthetic_only" && !allowEngineering) throw new Error("工程记录不能冒充真人基准；演示需显式允许工程数据");
  if (!Array.isArray(source.sessions) || !source.fingerprint) throw new Error("研究导出格式不完整");
  const participants = source.sessions.map(s => s.userId);
  if (new Set(participants).size !== participants.length) throw new Error("参与者重复；需先选择一致协议与代次");
  const pseudonym = id => crypto.createHmac("sha256", splitSalt).update(id).digest("hex").slice(0, 24);
  const ordered = participants.map(id => ({ id, alias: pseudonym(id) })).sort((a, b) => a.alias.localeCompare(b.alias));
  const developmentCount = Math.floor(ordered.length / 2), validationCount = Math.floor(ordered.length / 4);
  const split = new Map(ordered.map((p, i) => [p.id, i < developmentCount ? "development" : i < developmentCount + validationCount ? "validation" : "test"]));
  const cases = [], excludedUnits = [];
  for (const session of source.sessions) {
    if (session.fingerprint !== source.fingerprint) throw new Error("不可混合不同协议的轨迹");
    if(source.dataClass==="human_consented_research" && session.consent?.status!=="consented"){
      for(const unit of session.units||[])excludedUnits.push({participant:pseudonym(session.userId),knowledgePointId:unit.knowledgePointId,status:unit.status||"unknown",reason:"consent_absent_or_withdrawn"});
      continue;
    }
    for (const unit of session.units || []) {
      if (!unit.probes?.t0 || !unit.probes?.t1 || !unit.decision) {
        excludedUnits.push({ participant: pseudonym(session.userId), knowledgePointId: unit.knowledgePointId, status: unit.status || "unknown",
          reason: !unit.probes?.t0 ? "initial_probe_unavailable" : !unit.probes?.t1 ? "current_probe_unavailable" : "decision_unavailable" });
        continue;
      }
      const cutoff = unit.probes.t1.at;
      if (!Number.isFinite(Date.parse(unit.probes.t0.at)) || !Number.isFinite(Date.parse(cutoff)) || Date.parse(unit.probes.t0.at) > Date.parse(cutoff)) throw new Error("事件时间顺序不一致");
      const safeProbe = p => ({ itemId: p.id, subSkill: p.subSkill, correct: typeof p.correct === "boolean" ? p.correct : null,
        responseKind: p.responseKind, independent: p.independent === true, serverGraded: p.serverGraded === true, at: p.at });
      const prefix=[];
      const eventRows=[...(source.events||[]),...(source.processEvents||[])].filter(r=>r.user_id===session.userId);
      for(const row of eventRows){
        const e=row.event||{},at=row.at||e.at;
        if(!Number.isFinite(Date.parse(at)) || Date.parse(at)>Date.parse(cutoff))continue;
        if(e.type==="assigned" || e.previousStage==="outcome" && e.opportunityId===unit.opportunityId || e.type==="survey" || e.type==="exposure")continue;
        const out={at,type:String(e.type||"unknown"),eventId:hash([pseudonym(session.userId),row.id]).slice(0,20),
          source:e.provenance||"server_recorded",knowledgePointId:e.knowledgePointId||session.units.find(u=>u.opportunityId===e.opportunityId)?.knowledgePointId||null};
        if(e.probe){out.probe=safeProbe(e.probe);if(["0","1","2","unknown","skip"].includes(e.probe.response))out.probe.response=e.probe.response;if([0,1,2].includes(e.probe.confidence))out.probe.confidence=e.probe.confidence;}
        const details=e.data||e.processEvent?.data;
        if(details)out.data=Object.fromEntries(Object.entries(details).filter(([k,v])=>["parameter","oldValue","newValue","value","event_type","source","independent","is_correct","sceneType","correct","counts_as_student_evidence"].includes(k) && (typeof v==="boolean"||typeof v==="number"||typeof v==="string"&&v.length<=300)));
        // Free text requires a separately recorded de-identification review.
        if(source.textDeidentificationReviewed===true && typeof e.probe?.explanation==="string")out.explanation=e.probe.explanation.slice(0,1200);
        prefix.push(out);
      }
      prefix.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
      const input = { knowledgePointId: unit.knowledgePointId, targetSubSkill: unit.subSkill, cutoff,
        initialEvidence: safeProbe(unit.probes.t0), currentEvidence: safeProbe(unit.probes.t1),
        history:prefix,prefixCoverage:eventRows.length?"all_available_structured_events_before_cutoff":"probe_snapshots_only",
        manualHelpBeforeCurrentProbe: unit.manualHelp === true,
        allowedActions: ["silent", "present", "cancel", "defer"],
        constraints: { supportDepth: "L2", learnerCanClose: true, noAnswerDisclosure: true } };
      cases.push({ caseId: hash([pseudonym(session.userId), unit.opportunityId, cutoff]).slice(0, 24), participant: pseudonym(session.userId),
        split: split.get(session.userId), input, inputHash: hash(input), protocolFingerprint: source.fingerprint,
        // Actual policy output is held separately and is NOT a gold label.
        observedPolicy: { condition: unit.condition, action: unit.decision.action, provenance: "observed_rule_not_human_gold" },
        annotation: { helpNeed: null, interruptibility: null, preferredAction: null, raterIds: [], adjudicated: false } });
    }
  }
  return { schemaVersion: "education-replay-v2", dataClass: source.dataClass, generatedAt: new Date().toISOString(),
    sourceFingerprint: source.fingerprint, splitSeedFingerprint: hash(splitSalt), participantCount: participants.length, caseCount: cases.length,
    sourceUnitCount: cases.length + excludedUnits.length, excludedUnitCount: excludedUnits.length, excludedUnits,
    splitCounts: Object.fromEntries(["development", "validation", "test"].map(key => [key, ordered.filter(p => split.get(p.id) === key).length])),
    limitations: ["划分按人，当前算法不额外保证先测分层平衡；正式数据划分须预注册", "输出不含原始用户ID、后测、问卷、未来行为、正确答案或条件标签作为模型输入", "观察策略不是金标准；人工双标完成后才评价模型质量", "固定前缀回放不能估计替代帮助的真人学习效果"], cases };
}
function modelInputs(bundle) { return bundle.cases.map(row => ({ caseId: row.caseId, dataClass: bundle.dataClass, split: row.split, input: row.input, inputHash: row.inputHash })); }
module.exports = { buildReplay, modelInputs };
