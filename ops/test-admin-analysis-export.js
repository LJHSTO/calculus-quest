const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const presentation = require("../admin/presentation");
const source = fs.readFileSync(path.join(__dirname, "../admin/admin.js"), "utf8");
const context = {
  AdminPresentation: presentation,
  proactiveLearningGeneration: (row) => row.learning_generation || 1,
  safeRows: (rows) => Array.isArray(rows) ? rows : []
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf("function proactiveDecisionCsvRows("),
  source.indexOf("function proactiveShadowCodingCsvRows(")), context);
vm.runInContext(source.slice(source.indexOf("function proactiveParticipantAnalysisCsvRows("),
  source.indexOf("function shortAnswerCsvRows(")), context);
const submitted = { submitted: 10, expected: 10, completed: true,
  score: 0, max_score: 100, score_rate: 0, pending: 0 };
assert.equal(presentation.measurementExport({}).status, "not_started");
assert.equal(presentation.measurementExport({}).score, "");
assert.equal(presentation.measurementExport(submitted).score, 0);
assert.equal(presentation.measurementExport({ ...submitted, pending: 1 }).rate, "");
assert.equal(presentation.measurementExport({ ...submitted, completed: false }).score, "");
assert.equal(presentation.measurementExport({ ...submitted, submitted: 7, completed: false },
  { adaptive: true }).status, "recorded_adaptive");
assert.equal(presentation.observedRate(0, 0), "");
assert.equal(presentation.observedRate(0, 1), 0);
assert.equal(presentation.observedRate("", 1), "");
const rows = context.proactiveParticipantAnalysisCsvRows([
  { user_id: "not-started" },
  { user_id: "zero", pretest: submitted, posttest: submitted,
    courseware: { independent_attempts: 1, independent_accuracy: 0 } },
  { user_id: "pending", pretest: { ...submitted, pending: 1 },
    posttest: { ...submitted, submitted: 5, completed: false } }
]);
const cell = (row, header) => rows[row][rows[0].indexOf(header)];
rows.slice(1).forEach((row) => assert.equal(row.length, rows[0].length, "CSV列须与表头对齐"));
assert.equal(cell(1, "前测得分"), "");
assert.equal(cell(1, "独立正确率%"), "");
assert.equal(cell(2, "前测得分"), 0);
assert.equal(cell(2, "独立正确率%"), 0);
assert.equal(cell(3, "前测得分"), "");
assert.equal(cell(3, "前测状态"), "pending_review");
assert.equal(cell(3, "后测状态"), "partial");
const withProtocol = context.proactiveParticipantAnalysisCsvRows([
  { experiment_id: "matching" }, { experiment_id: "historical" }
], { experimentId: "matching", fingerprint: "frozen-hash",
  definition: { courseAssessmentFingerprint: "bank-hash", courseAssessmentVersion: "r3",
    outcomeInstrumentVersion: "outcomes-v2" } });
assert.equal(withProtocol[1][withProtocol[0].indexOf("题库版本")], "r3");
assert.equal(withProtocol[2][withProtocol[0].indexOf("题库版本")], "",
  "不能把当前协议版本套到历史实验");
const challengeRows = context.proactiveChallengeAnalysisCsvRows([
  {}, { participants: 1, attempts: 1, total_attempt_accuracy: 0 }
]);
assert.equal(challengeRows[1][challengeRows[0].indexOf("总尝试正确率%")], "");
assert.equal(challengeRows[2][challengeRows[0].indexOf("总尝试正确率%")], 0);
const classified = context.proactiveChallengeAnalysisCsvRows([{
  independent_attempts: 1, supported_attempts: 2, missed_attempts: 3, unclassified_attempts: 4
}]);
assert.equal(classified[1].length, classified[0].length);
for (const [header, expected] of [
  ["独立尝试", 1], ["提示或重置后尝试", 2], ["漏接尝试", 3], ["未归类尝试", 4]
]) assert.equal(classified[1][classified[0].indexOf(header)], expected);
const participantCategories = context.proactiveParticipantAnalysisCsvRows([{
  courseware: { missed_attempts: 3, unclassified_attempts: 4 }
}]);
assert.equal(participantCategories[1].length, participantCategories[0].length);
assert.equal(participantCategories[1][participantCategories[0].indexOf("漏接尝试")], 3);
assert.equal(participantCategories[1][participantCategories[0].indexOf("未归类尝试")], 4);
const checkRows = context.proactiveDecisionCsvRows([{}, {
  followup_outcome: { independentAttempt: {
    source: "policy_owned_probe", instrumentVersion: "v14-c3-verification-v2",
    evidenceScope: "post_support_local_check", subSkill: "bounds_substitution"
  } }
}]);
checkRows.slice(1).forEach((row) => assert.equal(row.length, checkRows[0].length));
assert.equal(checkRows[1][checkRows[0].indexOf("支架检查版本")], "", "未知历史版本不得补成当前版本");
assert.equal(checkRows[2][checkRows[0].indexOf("支架检查版本")], "v14-c3-verification-v2");
assert.equal(checkRows[2][checkRows[0].indexOf("检查证据范围")], "post_support_local_check");
assert.equal(checkRows[2][checkRows[0].indexOf("检查子技能")], "bounds_substitution");
assert.equal(checkRows[2][checkRows[0].indexOf("后续证据来源")], "policy_owned_probe");
const matchingRows = context.proactiveDecisionCsvRows([{}, {
  evidence_snapshot: { coursewareVerificationMatch: {
    eligible: false, matchingVersion: "v14-c3-courseware-match-v1",
    reasonCode: "factor_selection_insufficient_for_support_target",
    evidenceScope: "factor_selection", subSkill: "factor_choice", eventId: "event-1"
  } }
}, { evidence_snapshot: { coursewareVerificationMatch: { eligible: true } } }]);
matchingRows.slice(1).forEach((row) => assert.equal(row.length, matchingRows[0].length));
assert.equal(matchingRows[1][matchingRows[0].indexOf("课件证据采用")], "");
assert.equal(matchingRows[2][matchingRows[0].indexOf("课件证据采用")], "否");
assert.equal(matchingRows[3][matchingRows[0].indexOf("课件证据采用")], "是");
assert.equal(matchingRows[2][matchingRows[0].indexOf("课件证据事件ID")], "event-1");
assert.equal(matchingRows[2][matchingRows[0].indexOf("课件证据范围")], "factor_selection");
vm.runInContext(source.slice(source.indexOf("function regradeAuditCsvRows("),
  source.indexOf("function phaseCsvRows(")), context);
const gradingRows = context.regradeAuditCsvRows([
  {}, { proposed_grade_json: "broken" },
  { proposed_grade_json: JSON.stringify({ gradingAudit: {
    requestedModel: "auto", reportedModel: "reported-test-model",
    promptVersion: "calculus-rubric-v3", rubricHash: "rubric-hash"
  }, rubricScores: [{ criterionIndex: 0, score: 5, evidence: "原文" }] }) }
]);
gradingRows.slice(1).forEach((row) => assert.equal(row.length, gradingRows[0].length));
assert.equal(gradingRows[1][gradingRows[0].indexOf("请求模型")], "");
assert.equal(gradingRows[2][gradingRows[0].indexOf("服务端报告模型")], "");
assert.equal(gradingRows[3][gradingRows[0].indexOf("请求模型")], "auto");
assert.equal(gradingRows[3][gradingRows[0].indexOf("服务端报告模型")], "reported-test-model");
assert.equal(gradingRows[3][gradingRows[0].indexOf("评分量规摘要")], "rubric-hash");
console.log("管理员分析导出通过：缺失/待评分/部分作答/真实零分区分、零分母留空、CSV列对齐。");
