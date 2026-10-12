"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { summarize, writeReport } = require("./summarize-functions-limits");
const bank = require("../lib/assessments/functions-limits-retention-r3");
const instrument = require("../lib/proactive-outcomes/functions-limits");
const base = { experiment_id: "e", user_id: "u1", learning_generation: 1, condition: "treatment_full" };
const grade = instrument.grade("retention", Object.fromEntries(bank.items.map(q => [q.id, "__unknown__"])));
const data = {
  schema_version: "research-analysis-package-v1",
  scope: { chapter_id: "V14-C1", experiment_id: "e" }, protocol: { fingerprint: "p" },
  tables: {
    participants: [{ ...base, participation_status: "consented" },
      { ...base, user_id: "u2", participation_status: "withdrawn" }],
    phase_scores: ["pre", "post"].map((phase, i) => ({ ...base, phase, component: "objective",
      instrument_version: "a1", expected_max_score: 80, objective_percent: i ? 75 : 50,
      analysis_score: i ? 60 : 40, status: "objective_complete" })),
    quiz_attempts: [{ ...base, phase: "pre", provenance: "recorded_experiment",
      catalog_match: true, response_kind: "dont_know" }],
    proactive_decisions: [{ ...base, decision_id: "d1", recorded_condition: base.condition,
      shown_at: "2026-09-16T00:00:00Z", resolution: "accepted" },
      { ...base, decision_id: "d2", recorded_condition: base.condition, shown_at: null, resolution: null }],
    outcome_items: grade.results.map(q => ({ ...base, recorded_condition: base.condition,
      stage: "retention", instrument_version: instrument.version, session_id: "s", attempt_id: "a",
      item_id: q.itemId, knowledge_point_id: q.knowledgePointId, response: "__unknown__",
      score: q.score, max_score: q.maxScore, correct: false })),
    outcome_sessions: [{ ...base, recorded_condition: base.condition, stage: "retention",
      session_id: "s", status: "submitted", instrument_version: instrument.version, protocol_fingerprint: "p" }]
  }
};
function result(value = data) {
  value.data_fingerprint = crypto.createHash("sha256").update(JSON.stringify(value.tables)).digest("hex");
  return summarize(value).rows;
}
let rows = result();
assert.equal(rows.length, 2);
assert.equal(rows[0].objective_gain_pp, 25);
assert.equal(rows[0].retention_percent, 0);
assert.equal(rows[0].retention_dont_know_count, 18);
assert.equal(rows[0]["retention_GH-02-K03_percent"], 0);
assert.equal(rows[0].accepted_per_shown_percent, 100);
assert.equal(rows[0].shown_count, 1);
assert.equal(rows[1].retention_percent, null);
assert.equal(rows[1].objective_gain_pp, null);
assert.equal(rows[1].accepted_per_shown_percent, null);
assert.equal(rows[1].participation_status, "withdrawn");
for (const mutate of [
  d => { d.tables.outcome_items.pop(); },
  d => { d.tables.outcome_items[0].instrument_version = "functions-limits-retention-r1"; },
  d => { d.tables.outcome_items[0].score = 1; },
  d => { d.tables.outcome_items[0].response = "forged"; },
  d => { d.tables.outcome_sessions[0].protocol_fingerprint = "wrong"; },
  d => { d.tables.outcome_items[0].knowledge_point_id = "GH-06-K01"; },
  d => { d.tables.outcome_items.push(d.tables.outcome_items[0]); }
]) {
  const copy = structuredClone(data);
  mutate(copy);
  assert.equal(result(copy)[0].retention_percent, null);
}
const reset = structuredClone(data);
reset.tables.phase_scores[1].learning_generation = 2;
rows = result(reset);
assert.equal(rows.filter(row => row.user_id === "u1").length, 2);
assert.ok(rows.every(row => row.objective_gain_pp === null));
const version = structuredClone(data);
version.tables.phase_scores[1].instrument_version = "a2";
assert.equal(result(version)[0].objective_gain_pp, null);
const duplicate = structuredClone(data);
duplicate.tables.proactive_decisions.push(duplicate.tables.proactive_decisions[0]);
assert.equal(result(duplicate)[0].accepted_per_shown_percent, null);
const legacy = structuredClone(data);
const old = instrument.forVersion("functions-limits-retention-r1");
legacy.tables.outcome_sessions[0].instrument_version = old.version;
legacy.tables.outcome_items = old.publicStage("retention").items.map(q => ({
  ...base, recorded_condition: base.condition, stage: "retention", instrument_version: old.version,
  session_id: "s", attempt_id: "a", item_id: q.id, knowledge_point_id: q.knowledgePointId,
  response: "__unknown__", score: 0, max_score: 1, correct: false
}));
assert.equal(result(legacy)[0].retention_item_count, 6);
assert.equal(result(legacy)[0].retention_percent, 0);
data.data_fingerprint = "tampered";
assert.throws(() => summarize(data), /摘要不匹配/);
result(data);
const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cq-metrics-")), "指标");
writeReport(data, output);
const csv = fs.readFileSync(path.join(output, "函数极限逐人逐代次指标.csv"), "utf8");
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv.split("\r\n")[0], /客观题增益百分点/);
assert.doesNotMatch(csv.split("\r\n")[0], /objective_gain_pp/);
assert.equal(JSON.parse(fs.readFileSync(path.join(output, "函数极限描述性指标.json"), "utf8")).rows.length, 2);
assert.throws(() => writeReport(data, output), /拒绝覆盖/);
console.log("描述性指标通过：增益、真实零分、缺失、退出保留、代次/版本隔离、保持判分复核、旧版与重复记录边界。");
