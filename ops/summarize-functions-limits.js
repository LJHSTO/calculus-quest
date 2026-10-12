"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const registry = require("../lib/proactive-outcomes/functions-limits");
const { ids } = require("../lib/assessments/functions-limits-r1");
const { csvCell } = require("../admin/csv");
const numeric = value => typeof value === "number" && Number.isFinite(value);
const percent = (n, d) => d > 0 ? Math.round(n / d * 1000000) / 10000 : null;
const unique = values => [...new Set(values)];
const labels = {
  experiment_id: "实验编号", user_id: "用户标识", condition: "固定组别",
  participation_status: "参与状态", learning_generation: "学习代次",
  earliest_observed_generation: "最早观测代次", assessment_version: "配对题库版本",
  pre_objective_percent: "前测客观题百分制", post_objective_percent: "后测客观题百分制",
  objective_gain_pp: "客观题增益百分点", pre_dont_know_count: "前测不会记录数",
  post_dont_know_count: "后测不会记录数", retention_version: "保持测版本",
  retention_item_count: "保持测题数", retention_percent: "保持测百分制",
  retention_dont_know_count: "保持测不会题数", retention_session_states: "保持会话状态",
  shown_count: "实际展示数", accepted_count: "接受数", dismissed_count: "拒绝数",
  ignored_count: "忽略数", snoozed_count: "稍后数", accepted_per_shown_percent: "接受占展示百分比",
  data_quality_flags: "数据质量标记",
  ...Object.fromEntries(ids.map(id => [`retention_${id}_percent`, `${id}保持得分率百分比`]))
};

function summarize(data) {
  assert.equal(data.schema_version, "research-analysis-package-v1");
  assert.equal(data.scope.chapter_id, "V14-C1", "只处理函数与极限实验，不混合旧积分题库。");
  assert.equal(data.data_fingerprint, crypto.createHash("sha256").update(JSON.stringify(data.tables)).digest("hex"),
    "原始导出摘要不匹配。");
  const t = data.tables;
  const rows = [];
  for (const person of t.participants) {
    const belongs = row => row.user_id === person.user_id && row.experiment_id === data.scope.experiment_id;
    const observations = ["phase_scores", "quiz_attempts", "outcome_items", "outcome_sessions", "proactive_decisions"]
      .flatMap(table => t[table].filter(belongs));
    const observedGenerations = unique(observations.map(row => row.learning_generation)
      .filter(value => Number.isInteger(value) && value >= 0)).sort((a, b) => a - b);
    const generations = observedGenerations.length ? observedGenerations : [person.learning_generation ?? null];
    for (const generation of generations) {
      const select = table => t[table].filter(row => belongs(row) && row.learning_generation === generation);
      const flags = [];
      function phase(phaseId) {
        const matches = select("phase_scores").filter(row => row.phase === phaseId && row.component === "objective");
        if (matches.length !== 1 || matches[0].status !== "objective_complete"
          || !numeric(matches[0].objective_percent) || !numeric(matches[0].analysis_score)
          || !(matches[0].expected_max_score > 0) || matches[0].objective_percent < 0
          || matches[0].objective_percent > 100 || !matches[0].instrument_version) return null;
        return matches[0];
      }
      const pre = phase("pre"), post = phase("post");
      const paired = pre && post && pre.instrument_version === post.instrument_version
        && pre.expected_max_score === post.expected_max_score;
      if (pre && post && !paired) flags.push("pre_post_scale_mismatch");
      const attempts = select("quiz_attempts").filter(row => ["pre", "post"].includes(row.phase)
        && row.provenance === "recorded_experiment" && row.catalog_match === true);
      const decisions = select("proactive_decisions");
      const eligibleDecisions = decisions.filter(row => row.recorded_condition === person.condition
        && person.condition && row.condition === person.condition);
      const decisionIds = eligibleDecisions.map(row => row.decision_id);
      const decisionsValid = unique(decisionIds).length === decisionIds.length && decisionIds.every(Boolean);
      if (!decisionsValid) flags.push("duplicate_or_missing_decision_id");
      if (eligibleDecisions.length !== decisions.length) flags.push("decision_condition_mismatch");
      const shown = eligibleDecisions.filter(row => row.shown_at);
      const accepted = shown.filter(row => row.resolution === "accepted");
      const dismissed = shown.filter(row => row.resolution === "dismissed");
      const ignored = shown.filter(row => row.resolution === "ignored");
      const snoozed = shown.filter(row => row.resolution === "snoozed");
      const stages = select("outcome_items").filter(row => row.stage === "retention");
      const sessions = select("outcome_sessions").filter(row => row.stage === "retention");
      const retentionVersions = unique(stages.map(row => row.instrument_version));
      let retention = null;
      if (retentionVersions.length === 1) {
        const instrument = registry.forVersion(retentionVersions[0]);
        const stage = instrument?.chapterId === "V14-C1" ? instrument.publicStage("retention") : null;
        const sessionIds = unique(stages.map(row => row.session_id));
        const session = sessions.find(row => row.session_id === sessionIds[0]);
        const trusted = stage && stages.length === stage.items.length
          && unique(stages.map(row => row.item_id)).length === stage.items.length
          && unique(stages.map(row => row.attempt_id)).length === 1
          && stages.every(row => row.attempt_id && row.recorded_condition === person.condition)
          && sessionIds.length === 1 && sessionIds[0] && session?.status === "submitted"
          && session.instrument_version === instrument.version
          && session.recorded_condition === person.condition
          && session.protocol_fingerprint === data.protocol.fingerprint;
        if (trusted) {
          const graded = instrument.grade("retention", Object.fromEntries(stages.map(row => [row.item_id, row.response])));
          if (graded && graded.results.every(result => {
            const stored = stages.find(row => row.item_id === result.itemId);
            return stored?.score === result.score && stored.max_score === result.maxScore
              && stored.correct === result.correct && stored.knowledge_point_id === result.knowledgePointId;
          })) retention = graded;
        }
      }
      if (stages.length && !retention) flags.push("retention_incomplete_mixed_or_unverified");
      const row = {
        experiment_id: data.scope.experiment_id, user_id: person.user_id,
        condition: person.condition, participation_status: person.participation_status,
        learning_generation: generation, earliest_observed_generation: observedGenerations[0] ?? null,
        assessment_version: paired ? pre.instrument_version : null,
        pre_objective_percent: pre?.objective_percent ?? null,
        post_objective_percent: post?.objective_percent ?? null,
        objective_gain_pp: paired ? Math.round((post.objective_percent - pre.objective_percent) * 10000) / 10000 : null,
        pre_dont_know_count: attempts.filter(row => row.phase === "pre" && row.response_kind === "dont_know").length,
        post_dont_know_count: attempts.filter(row => row.phase === "post" && row.response_kind === "dont_know").length,
        retention_version: retention ? retentionVersions[0] : null,
        retention_item_count: retention?.results.length ?? null,
        retention_percent: retention ? percent(retention.score, retention.maxScore) : null,
        retention_dont_know_count: retention ? stages.filter(row => row.response === "__unknown__").length : null,
        retention_session_states: unique(sessions.map(row => row.status)).join("|") || "not_recorded",
        shown_count: decisionsValid ? shown.length : null,
        accepted_count: decisionsValid ? accepted.length : null,
        dismissed_count: decisionsValid ? dismissed.length : null,
        ignored_count: decisionsValid ? ignored.length : null,
        snoozed_count: decisionsValid ? snoozed.length : null,
        accepted_per_shown_percent: decisionsValid ? percent(accepted.length, shown.length) : null,
        data_quality_flags: flags.join("|")
      };
      for (const id of ids) {
        const matched = retention?.results.filter(item => item.knowledgePointId === id);
        row[`retention_${id}_percent`] = matched?.length
          ? percent(matched.reduce((sum, item) => sum + item.score, 0), matched.reduce((sum, item) => sum + item.maxScore, 0))
          : null;
      }
      rows.push(row);
    }
  }
  return {
    schema_version: "functions-limits-descriptive-metrics-r1",
    source_fingerprint: data.data_fingerprint, protocol_fingerprint: data.protocol.fingerprint,
    columns: labels,
    definitions: {
      objective_gain_pp: "同代次同版本后测客观题标准分减前测标准分；单位为百分点，非相对提升率。",
      retention_percent: "完整同版本保持卷，经答案复核且测量会话协议一致后计算；缺失不填0。",
      accepted_per_shown_percent: "接受次数/实际展示次数；无展示为null，不同于接受/已解决提示。",
      counts: "次数仅为导出中匹配记录的观察计数；0不证明日志完整或没有发生过该行为。",
      generation: "逐代次输出；不自动选最高分，不跨代次配对；最早观测代次不是自动纳入规则。"
    },
    warnings: [
      "描述性派生表，不自动执行显著性检验、因果分析或排除退出者。",
      "简答候选分数不并入学习增益。未作答、退出和未分组参与者保留。",
      "保持卷与前后测不是等值量表，不计算保持百分制减后测百分制作为遗忘量。",
      "保持测满72小时后持续开放；没有保持会话不等于已经失访，须结合预先冻结的分析截止日及随访机会判断。",
      "不将系统判定需帮助当作真实心理需求；不将游戏操作成绩当作独立知识掌握。"
    ],
    rows
  };
}

function writeReport(data, directory) {
  const report = summarize(data);
  const target = path.resolve(directory);
  assert.ok(!fs.existsSync(target), "目标目录已存在，拒绝覆盖研究数据。");
  console.log(`指标输出目录：${target}`);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "函数极限描述性指标.json"), JSON.stringify(report, null, 2), { encoding: "utf8", flag: "wx" });
  const columns = report.rows.length ? Object.keys(report.rows[0]) : ["user_id"];
  const csv = [columns.map(key => labels[key] || key), ...report.rows.map(row => columns.map(key => row[key]))]
    .map(row => row.map(value => typeof value === "number" ? `"${value}"` : csvCell(value)).join(",")).join("\r\n");
  fs.writeFileSync(path.join(target, "函数极限逐人逐代次指标.csv"), "\uFEFF" + csv, { encoding: "utf8", flag: "wx" });
  return report;
}
if (require.main === module) {
  try {
    assert.ok(process.argv[2] && process.argv[3], "用法：node ops/summarize-functions-limits.js 分析包.json 新输出目录");
    const data = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8").replace(/^\uFEFF/, ""));
    console.log(`完成：${writeReport(data.data || data, process.argv[3]).rows.length}行；仅描述性指标。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { summarize, writeReport };
