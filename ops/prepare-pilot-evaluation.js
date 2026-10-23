"use strict";
// Offline bridge only. No database writes, automatic tuning or external API calls.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { summarize } = require("./summarize-pilot-study");
const hash = x => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const finite = x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1 ? x : null;
const time = x => typeof x === "string" && Number.isFinite(Date.parse(x));
function prepare(data, { versionId, splitSalt, dataClass, reviewedText = false } = {}) {
  if (!splitSalt || splitSalt.length < 16) throw new Error("划分种子至少16字符，须保存在研究私有目录");
  if (!["engineering_synthetic_only", "human_consented_research"].includes(dataClass)) throw new Error("须明确数据类别，工程记录不能冒充真人");
  const check = summarize(data); if (!check.valid) throw new Error(check.errors.join("；"));
  const v = data.versions.find(x => x.id === versionId);
  if (!v) throw new Error("请指定一个存在的预试版本；不自动合并版本");
  const eligible = data.enrollments.filter(e => e.versionId === versionId && e.status !== "withdrawn");
  if (new Set(eligible.map(e => e.participantCode)).size !== eligible.length || eligible.some(e => !e.participantCode)) throw new Error("同一版本参与编号缺失或重复");
  const alias = id => crypto.createHmac("sha256", splitSalt).update(String(id)).digest("hex").slice(0, 24);
  const ids = eligible.map(e => alias(e.participantCode)).sort(), n = ids.length;
  const split = new Map(ids.map((id, i) => [id, i < Math.floor(n / 2) ? "development" : i < Math.floor(n / 2) + Math.floor(n / 4) ? "validation" : "test"]));
  const enrollments = new Map(eligible.map(e => [e.id, e])), answers = new Map(data.answers.map(a => [a.opportunityId, a]));
  const cases = [], labels = [], thresholdRows = [], excluded = [];
  for (const o of data.opportunities.filter(x => x.versionId === versionId)) {
    const e = enrollments.get(o.enrollmentId), exclude = reason => excluded.push({ opportunityHash: alias(o.id), reason });
    if (!e) { exclude("withdrawn_or_ineligible_enrollment"); continue; }
    if (!time(e.consentAt) || e.versionHash !== v.hash || !time(o.at) || Date.parse(o.at) < Date.parse(e.consentAt)) throw new Error("同意时间、版本或机会时间无效");
    if (e.endedAt && (!time(e.endedAt) || Date.parse(o.at) > Date.parse(e.endedAt))) throw new Error("机会发生在参与结束之后");
    if (o.runtimeHash !== hash(o.runtime)) throw new Error("参数快照摘要不一致");
    if (!o.sampled || !o.eligible) { exclude("not_sampled_or_ineligible"); continue; }
    const participant = alias(e.participantCode), caseId = alias(o.id), history = [];
    let futureEventsRemoved = 0;
    for (const event of o.teacherFacts?.events || []) {
      if (!time(event.at) || Date.parse(event.at) > Date.parse(o.at)) { futureEventsRemoved++; continue; }
      const safe = { at: event.at, type: String(event.type || "unknown").slice(0, 100),
        source: "courseware_event_not_independent_server_grade", serverGraded: false,
        correct: typeof event.correct === "boolean" ? event.correct : null,
        value: typeof event.value === "boolean" || typeof event.value === "number" && Number.isFinite(event.value) ? event.value : null };
      if (typeof event.parameter === "string" && /^[\w.-]{1,80}$/.test(event.parameter)) safe.parameter = event.parameter;
      if (reviewedText && typeof event.response === "string") safe.response = event.response.slice(0, 600);
      history.push(safe);
    }
    history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const input = { knowledgePointId: o.scope, cutoff: o.at, history,
      courseFacts: require("../lib/support-goals").CURRICULUM[o.scope] || null,
      prefixCoverage: "frozen_recent_courseware_events_max_40_not_complete_history",
      allowedActions: ["silent", "present", "defer"],
      actionDefinitions: { silent: "不发起询问", present: "现在发起可拒绝的需求确认，不直接提供完整帮助", defer: "稍后重新检查，不能定时盲发" },
      constraints: { learnerCanClose: true, confirmationBeforeSupport: true, noAnswerDisclosure: true,
        sparseActivityDoesNotEstablishMotivation: true, missingFactsRemainUnknown: true,
        currentBusyAndVisibilityNotCapturedInThisPrefix: true } };
    const d = o.decision, current = o.stratum === "triggered" && d && d.historicalNotCurrent !== true;
    const needScore = current ? finite(d.helpNeedScore) : null, timingScore = current ? finite(d.interruptibilityScore) : null;
    const c = { caseId, participant, split: split.get(participant), input, inputHash: hash(input), protocolFingerprint: v.hash,
      frame: o.stratum, runtimeHash: o.runtimeHash, sampling: { probability: o.probability, frameVersion: o.frameVersion },
      observedPolicy: { action: current ? d.deliveryDecision || null : null, helpNeedScore: needScore, interruptibilityScore: timingScore,
        provenance: current ? "observed_rule_not_human_gold" : "historical_or_absent_not_current", probabilityCalibrated: false },
      annotation: { preferredAction: null, adjudicated: false, raterIds: [] }, futureEventsRemoved };
    cases.push(c);
    const a = answers.get(o.id), validAnswer = a && !a.skipped && time(a.at) && time(o.expiresAt)
      && Date.parse(a.at) >= Date.parse(o.at) && Date.parse(a.at) <= Date.parse(o.expiresAt);
    const latest = new Map();
    for (const x of data.annotations.filter(x => x.opportunityId === o.id && x.role === "independent")) {
      if (x.caseHash !== hash(o.teacherFacts)) throw new Error("教师标注材料摘要不一致");
      if (!latest.has(x.raterId) || latest.get(x.raterId).revision < x.revision) latest.set(x.raterId, x);
    }
    const teacherLabels = [...latest.values()].map(x => ({ rater: alias(x.raterId), cognitiveDifficulty: x.cognitiveDifficulty,
      sufficientEvidence: x.sufficientEvidence, primaryGoal: x.primaryGoal, revision: x.revision }));
    // Explicit operational dichotomy; the neutral response remains unknown.
    const needLabel = validAnswer && ["yes", "no"].includes(a.need) ? Number(a.need === "yes") : null;
    const timingLabel = validAnswer && [1, 2, 4, 5].includes(a.timing) ? Number(a.timing >= 4) : null;
    labels.push({ caseId, inputHash: c.inputHash, participant, split: c.split, frame: o.stratum, runtimeHash: o.runtimeHash,
      needLabel, interruptibilityLabel: timingLabel, timingOrdinal: validAnswer ? a.timing : null,
      responseStatus: !a ? "missing" : a.skipped ? "skipped" : !validAnswer ? "invalid_time" : a.need,
      labelSource: "student_self_report_not_objective_truth", teacherLabels });
    thresholdRows.push({ participantId: participant, opportunityId: caseId, split: c.split, stratum: o.stratum, runtimeHash: o.runtimeHash,
      helpNeedScore: needScore, interruptibilityScore: timingScore, needLabel, interruptibilityLabel: timingLabel,
      labelSource: "student_self_report", scoreSource: c.observedPolicy.provenance });
  }
  return { bundle: { schemaVersion: "education-replay-v2", dataClass, source: "pilot-measurement-v1", sourceFingerprint: v.hash,
    splitSeedFingerprint: hash(splitSalt), participantCount: ids.length, caseCount: cases.length,
    splitCounts: Object.fromEntries(["development", "validation", "test"].map(s => [s, ids.filter(id => split.get(id) === s).length])),
    textDeidentificationAttested: reviewedText, cases }, labels, thresholdRows,
    audit: { dataClass, versionId, sourceHash: hash(data), cases: cases.length, participants: ids.length, excluded,
      freshRuleScoreCases: thresholdRows.filter(r => r.helpNeedScore !== null).length,
      futureEventsRemoved: cases.reduce((s, c) => s + c.futureEventsRemoved, 0),
      humanValidationComplete: false, probabilityCalibrated: false,
      limitations: ["本包只准备材料，不证明校准、模型优越性或学习收益。", "静默窗口没有即时规则分数，不能用历史分数补齐。",
        "两个抽样框分别分析；候选框已被规则筛选，不能估计总体召回率。", "每版本独立划分；跨版本同人须先由负责人建立私有身份对应表。",
        "教师困难标签不是学生需要或可打断性的金标签；动作标注仍为空。", "时机1–2与4–5的二分是操作定义，3及缺失保持未知。",
        "文本默认不进入模型输入；开启文本须先完成逐条去标识复核。", "8人预试的留出集合极小，不代表独立验证充分。"] } };
}
function writePackage(result, target) {
  fs.mkdirSync(target, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(target, name), value, { encoding: "utf8", flag: "wx" });
  write("回放索引.json", JSON.stringify(result.bundle, null, 2));
  write("模型输入.jsonl", result.bundle.cases.map(c => JSON.stringify({ caseId: c.caseId, inputHash: c.inputHash,
    split: c.split, dataClass: result.bundle.dataClass, input: c.input })).join("\n"));
  write("独立标签.jsonl", result.labels.map(x => JSON.stringify(x)).join("\n"));
  write("规则阈值输入.jsonl", result.thresholdRows.map(x => JSON.stringify(x)).join("\n"));
  write("数据准备核验.json", JSON.stringify(result.audit, null, 2));
}
if (require.main === module) {
  try {
    const [input, target, versionId, dataClass, flag] = process.argv.slice(2);
    if (!input || !target) throw new Error("用法：node ops/prepare-pilot-evaluation.js 导出.json 新目录 版本ID engineering_synthetic_only|human_consented_research [--reviewed-text]；种子用STUDY_SPLIT_SEED");
    const result = prepare(JSON.parse(fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "")), {
      versionId, dataClass, splitSalt: process.env.STUDY_SPLIT_SEED, reviewedText: flag === "--reviewed-text" });
    writePackage(result, path.resolve(target));
    console.log(JSON.stringify({ cases: result.bundle.caseCount, participants: result.bundle.participantCount, validationComplete: false }));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { prepare, writePackage };
