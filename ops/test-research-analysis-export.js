const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildPackage, scoreState } = require("../lib/research-analysis-export");
const { prepare } = require("./prepare-research-analysis");

const objective = { id: "objective", type: "single", points: 80, instrumentVersion: "fixture-v1", question: "测试题", answer: ["a"] };
const short = { id: "short", type: "short_answer", points: 20, instrumentVersion: "fixture-v1", question: "解释题" };
const index = new Map([objective, short].map((question) => [question.id, {
  chapterId: "C", unitId: "C-pre", phase: "pre", question
}]));
function row(id, question, overrides = {}) {
  return {
    id, user_id: "u1", unit_id: "C-pre", phase: "pre", question_id: question.id,
    question_type: question.type, learning_generation: 1, created_at: "2026-09-09T10:00:00Z",
    response: "=不会执行的合成答案", score: 0, max_score: question.points,
    status: "ai_reviewed", is_correct: 0,
    research_experiment_id: "experiment",
    research_context_json: JSON.stringify({
      experimentId: "experiment", protocolFingerprint: "protocol",
      instrumentVersion: question.instrumentVersion,
      questionDigest: crypto.createHash("sha256").update(JSON.stringify(question)).digest("hex")
    }),
    ...overrides
  };
}
const source = {
  experimentId: "experiment", chapterId: "C",
  participants: [
    { user_id: "u1", condition: "control", current_learning_generation: 2 },
    { user_id: "u2", condition: "treatment_full", participation_status: "withdrawn", current_learning_generation: 1 },
    { user_id: "u3", condition: null, current_learning_generation: 1 }
  ],
  quizzes: [
    row("zero", objective),
    row("short", short, { score: 20, ai_score: 20, ai_confidence: 0.95, ai_error_type: "none" }),
    row("reset", objective, { learning_generation: 2, score: 80, response: "a", is_correct: 1 }),
    row("legacy", objective, { user_id: "u2", research_experiment_id: "", research_context_json: "{}" }),
    row("pending", short, { user_id: "u2", status: "pending_review", is_correct: -1 })
  ],
  events: [
    { id: "e1", user_id: "u1", learning_generation: 1, created_at: "2026-09-09",
      payload: JSON.stringify({ eventType: "courseware_challenge_result", chapterId: "C",
        research: { experimentId: "other" }, data: { independent: "true", is_correct: false } }) },
    { id: "e2", user_id: "u1", payload: JSON.stringify({ eventType: "ui_click" }) }
  ],
  outcomes: [{ id: "outcome", user_id: "u1", learning_generation: 1, instrument_version: "outcome-v1",
    item_results_json: JSON.stringify([{ itemId: "item1", score: 0, maxScore: 1, correct: false, response: "b" }]) }],
  sessions: [{ id: "no-submit", user_id: "u2", status: "withdrawn", stage: "retention" }],
  initialGrades: [{ id: "grade1", user_id: "u1", input_summary: '{"questionId":"short"}',
    output_summary: JSON.stringify({ score: 20, gradingAudit: { requestedModel: "auto" } }) }],
  regrades: [{ id: "grade2", user_id: "u1", quiz_result_id: "short", status: "applied",
    proposed_grade_json: JSON.stringify({ score: 20, gradingAudit: { requestedModel: "auto", reportedModel: "reported" } }) }],
  decisions: [{ id: "decision1", user_id: "u1", condition: "control",
    decision: "intervene", delivery_decision: "stay_silent", support_level: "L1",
    followup_outcome_json: '{"independentAttempt":{"success":false}}' }]
};
const data = buildPackage({ source, protocol: { fingerprint: "protocol" }, assessmentIndex: index });
const archivedIndex = new Map([...index].map(([id, entry]) => [id, { ...entry, assessmentStatus: "archived" }]));
const archivedPackage = buildPackage({ source, protocol: { fingerprint: "protocol" }, assessmentIndex: archivedIndex });
assert.ok(archivedPackage.tables.assessment_catalog.every((item) => item.assessment_status === "archived"));
assert.ok(archivedPackage.tables.quiz_attempts.every((item) =>
  item.score_state === "archived_assessment" && item.candidate_score === null && !item.analysis_eligible));
assert.ok(archivedPackage.tables.phase_scores.every((item) => item.analysis_score === null));
assert.equal(archivedPackage.tables.quiz_attempts.find((item) => item.record_id === "short").raw_score, 20,
  "归档仅限制使用，不能修改历史原始分数");
assert.equal(data.tables.participants.length, 3, "退出和未作答者不能从名册消失");
const byId = new Map(data.tables.quiz_attempts.map((item) => [item.record_id, item]));
assert.equal(byId.get("zero").candidate_score, 0);
assert.equal(byId.get("legacy").provenance, "roster_history_unverified");
assert.equal(byId.get("legacy").instrument_version, null, "不借用当前目录补造历史版本");
assert.equal(byId.get("pending").candidate_score, null);
assert.equal(byId.get("short").score_state, "model_scored_unfrozen");
assert.equal(byId.get("short").analysis_eligible, false);
const phase = (component, generation = 1) => data.tables.phase_scores.find((item) =>
  item.user_id === "u1" && item.learning_generation === generation && item.component === component);
assert.equal(phase("total").candidate_total, 20);
assert.equal(phase("total").analysis_score, null);
assert.equal(phase("objective").analysis_score, 0);
assert.equal(phase("objective").objective_percent, 0, "真实客观零分保留为0");
assert.equal(phase("total").objective_percent, null, "混合总分不能冒充客观主结果");
assert.equal(phase("total", 2).candidate_total, null, "重置后的部分作答不能拼接上一代次简答成绩");
assert.equal(data.tables.courseware_events.length, 1);
assert.equal(data.tables.courseware_events[0].provenance, "experiment_mismatch");
assert.equal(data.tables.courseware_events[0].independent, null, "字符串true不作独立证据");
assert.equal(data.tables.outcome_items[0].score, 0);
assert.equal(data.tables.outcome_sessions[0].status, "withdrawn");
assert.equal(data.tables.grading_audits[0].record_id, null);
assert.equal(data.tables.grading_audits[0].reported_model, null);
assert.equal(data.tables.grading_audits[1].record_id, "short");
assert.equal(data.tables.grading_audits[1].reported_model, "reported");
assert.equal(data.tables.proactive_decisions[0].decision, "intervene");
assert.equal(data.tables.proactive_decisions[0].delivery_decision, "stay_silent");
assert.equal(JSON.parse(data.tables.proactive_decisions[0].followup_outcome_json).independentAttempt.success, false);
const duplicated = buildPackage({ source: {
  ...source, quizzes: [...source.quizzes, row("duplicate", objective)]
}, protocol: { fingerprint: "protocol" }, assessmentIndex: index });
assert.equal(duplicated.tables.phase_scores.find((item) =>
  item.user_id === "u1" && item.learning_generation === 1 && item.component === "total").candidate_total, null);
const tampered = buildPackage({ source: { ...source,
  quizzes: [row("tampered", objective, { score: 80 })],
  initialGrades: [{ id: "bound", user_id: "u1",
    input_summary: '{"questionId":"objective","quizResultIds":["tampered"]}', output_summary: '{"score":80}' }]
}, protocol: { fingerprint: "protocol" }, assessmentIndex: index });
assert.equal(tampered.tables.quiz_attempts[0].score_state, "objective_score_mismatch");
assert.equal(tampered.tables.quiz_attempts[0].candidate_score, null);
assert.equal(tampered.tables.grading_audits[0].record_link, "record_id");
assert.equal(tampered.tables.grading_audits[0].learning_generation, 1);
const coreQuestion = { ...objective, adaptiveRole: "core" };
const diagnosticQuestion = { ...objective, id: "diagnostic", adaptiveRole: "diagnostic" };
const adaptiveIndex = new Map([coreQuestion, diagnosticQuestion].map((question) => [question.id, {
  chapterId: "C", unitId: "C-formative", phase: "formative", question
}]));
const adaptivePackage = (passed) => buildPackage({ source: { ...source,
  quizzes: [row("core", coreQuestion, {
    unit_id: "C-formative", phase: "formative", response: passed ? "a" : "b",
    is_correct: passed ? 1 : 0, score: passed ? 80 : 0
  })]
}, protocol: { fingerprint: "protocol" }, assessmentIndex: adaptiveIndex });
const passedCore = adaptivePackage(true).tables.phase_scores;
assert.equal(passedCore.find((item) => item.component === "total").expected_items, 1);
assert.equal(passedCore.find((item) => item.component === "total").analysis_score, 80,
  "核心题答对后未呈现诊断题不应被认定为漏答");
assert.equal(passedCore.find((item) => item.component === "short_answer").status, "not_applicable");
assert.equal(adaptivePackage(false).tables.phase_scores.find((item) => item.component === "total").expected_items, 2);
assert.equal(adaptivePackage(false).tables.phase_scores.find((item) => item.component === "total").candidate_total, null);
assert.equal(scoreState(row("fail", short, { ai_error_type: "api_timeout" })), "grading_unavailable");
assert.equal(scoreState(row("blank", objective, { response: " " })), "not_answered");
assert.equal(scoreState(row("too-high", objective, { score: 1000 })), "invalid_score");
for (const [table, rows] of Object.entries(data.tables)) {
  assert.equal(data.counts[table], rows.length);
  rows.forEach((item) => assert.deepEqual(Object.keys(item), data.dictionary[table].map((field) => field.field)));
}
// Stored instants are +08:00 while package metadata is UTC Z; one file must not
// mix the two, or lexical order stops matching chronological order.
assert.equal(data.scope.timestamps_normalized_to, "UTC");
assert.ok(data.time_normalization.rule.includes("UTC"));
assert.ok(!/\+08:00/.test(JSON.stringify(data.tables)), "no +08:00 form may survive in the tables");
for (const [table, rows] of Object.entries(data.tables)) {
  for (const item of rows) {
    for (const field of data.dictionary[table]) {
      if (!field.time_zone) continue;
      const value = item[field.field];
      if (typeof value !== "string") continue;
      assert.match(value, /Z$/, `${table}.${field.field} must be UTC, got ${value}`);
    }
  }
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-analysis-package-"));
const output = path.join(temp, "分析表");
const converted = prepare(data, output);
assert.equal(converted.files.length, 11);
const csv = fs.readFileSync(path.join(output, "逐题作答.csv"), "utf8");
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv, /"'=不会执行的合成答案"/, "CSV须保护公式注入；原始JSON保持不变");
assert.throws(() => prepare(data, output), /拒绝覆盖/);
const broken = { ...data, counts: { ...data.counts, quiz_attempts: 999 } };
assert.throws(() => prepare(broken, path.join(temp, "错误包")), /行数不一致/);
assert.equal(fs.existsSync(path.join(temp, "错误包")), false, "校验失败不能先写部分文件");
console.log("分析包测试通过：逐题/逐次/分项分数、缺失与0、代次隔离、历史未知、评分审计、字典与可重跑CSV。");
