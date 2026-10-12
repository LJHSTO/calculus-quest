const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const scoring = require("../lib/proactive-policy/scoring");
const sensitivity = require("./proactive-gate-sensitivity");

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `期望 ${expected}，实际 ${actual}`);

// ── 不变量：本模块不得接入生产门控 ──────────────────────────────────────────
// 这个断言是本次改动最重要的守卫：离线分析工具一旦被 evaluate() 引用，
// 冻结协议就被改动了，本文件的其余结论全部作废。
{
  const engine = fs.readFileSync(
    path.resolve(__dirname, "../lib/proactive-policy/index.js"), "utf8");
  assert.ok(!/require\(\s*["']\.\/scoring["']\s*\)/.test(engine),
    "index.js 不得引用 scoring.js：门控属于冻结协议，只能离线分析。");
}

// ── helpNeed ────────────────────────────────────────────────────────────────
{
  assert.equal(scoring.helpNeed({ evidence: {} }), 0, "无证据时需求必须为 0");
  assert.equal(scoring.helpNeed({}), 0, "缺省入参不得抛错");

  const rising = [0, 1, 2, 3].map((n) => scoring.helpNeed({ evidence: { confirmedIncorrect: n } }));
  for (let i = 1; i < rising.length; i += 1) {
    assert.ok(rising[i] >= rising[i - 1], "需求必须对确认错误单调不减");
  }
  close(scoring.helpNeed({ evidence: { confirmedIncorrect: 2 } }), 0.35);
  close(scoring.helpNeed({ evidence: { confirmedIncorrect: 99 } }), 0.35, 1e-9); // 饱和

  close(scoring.helpNeed({ evidence: {
    confirmedIncorrect: 2, confirmedGapCount: 1,
    sceneAttemptFailures: 2, parameterCommitCount: 3
  } }), 1);

  // 负值与垃圾输入必须降级为 0，不得抬高需求
  assert.equal(scoring.helpNeed({ evidence: { confirmedIncorrect: -5 } }), 0);
  assert.equal(scoring.helpNeed({ evidence: { confirmedIncorrect: "abc" } }), 0);
}

// ── interruptibility ────────────────────────────────────────────────────────
{
  close(scoring.interruptibility({ evidence: {}, signal: { kind: "quiet_dwell" } }),
    scoring.BOUNDARY_SCORE.dwellOnly);
  // 自然边界优先于候选类型
  close(scoring.interruptibility({
    evidence: { naturalBoundary: true }, signal: { kind: "quiet_dwell" }
  }), scoring.BOUNDARY_SCORE.naturalBoundary);
  // 未知候选降级为最低分，而不是最高分
  close(scoring.interruptibility({ evidence: {}, signal: { kind: "unknown_kind" } }),
    scoring.BOUNDARY_SCORE.unverified);

  // 边界分必须按"学习者是否处在停顿点"有序
  const b = scoring.BOUNDARY_SCORE;
  assert.ok(b.naturalBoundary > b.studentInitiated);
  assert.ok(b.studentInitiated > b.quizBoundary);
  assert.ok(b.quizBoundary >= b.taskBoundary);
  assert.ok(b.taskBoundary > b.parameterBoundary);
  assert.ok(b.parameterBoundary > b.agentInitiated);
  assert.ok(b.agentInitiated > b.dwellOnly);
  assert.ok(b.dwellOnly > b.unverified);
}

// ── uncertainty ─────────────────────────────────────────────────────────────
{
  assert.equal(scoring.uncertainty({ requiredFamilies: [] }), 1, "未声明要求必须失败关闭");
  assert.equal(scoring.uncertainty({
    evidenceFamilies: ["history", "process"], requiredFamilies: ["history", "process"]
  }), 0);
  assert.equal(scoring.uncertainty({
    evidenceFamilies: ["history"], requiredFamilies: ["history", "process"]
  }), 0.5);
  assert.equal(scoring.uncertainty({
    evidenceFamilies: [], requiredFamilies: ["result"]
  }), 1);
  // 回退到 evidence.families
  assert.equal(scoring.uncertainty({
    evidence: { families: ["result"] }, requiredFamilies: ["result"]
  }), 0);
}

// ── acceptanceThreshold（PRISM Eq. 3.1） ────────────────────────────────────
{
  const r3 = { falseAlarm: 3, falseNegative: 1 };
  close(scoring.acceptanceThreshold(0, r3), 1, 1e-9);
  close(scoring.acceptanceThreshold(1, r3), 0.75, 1e-9);
  close(scoring.acceptanceThreshold(0.7, r3), 3 / 3.7, 1e-9);

  // comparative statics：阈值对需求单调不增
  const series = [0, 0.25, 0.5, 0.75, 1].map((p) => scoring.acceptanceThreshold(p, r3));
  for (let i = 1; i < series.length; i += 1) {
    assert.ok(series[i] <= series[i - 1], "阈值必须对需求单调不增");
  }

  // 代价比越大，阈值越高（越保守）
  const byRatio = scoring.COST_GRID.map((r) => scoring.acceptanceThreshold(1, { falseAlarm: r, falseNegative: 1 }));
  for (let i = 1; i < byRatio.length; i += 1) {
    assert.ok(byRatio[i] > byRatio[i - 1], "代价比越大阈值越高");
  }
  close(scoring.acceptanceThreshold(1, { falseAlarm: 1, falseNegative: 1 }), 0.5, 1e-9);

  // 退化输入不得抛错
  assert.equal(scoring.acceptanceThreshold(0.5, { falseAlarm: 0, falseNegative: 1 }), 0);
  assert.equal(scoring.acceptanceThreshold(0.5, undefined), 3 / 3.5);
}

// ── applyGate ───────────────────────────────────────────────────────────────
{
  const base = { need: 0.9, interruptibility: 0.8, uncertainty: 0.1 };

  // 需求低于下限：无论阈值策略如何都沉默
  assert.equal(scoring.applyGate({ ...base, need: 0.5 }).intervene, false);
  assert.equal(scoring.applyGate({ ...base, need: 0.5, mode: "cost" }).intervene, false);

  // 现行固定阈值 0.75：0.8 通过
  assert.equal(scoring.applyGate({ ...base, mode: "legacy" }).intervene, true);

  // 代价比 3:1 且需求 0.9 → tau = 3/3.9 = 0.769，0.8 仍通过
  const cost3 = scoring.applyGate({ ...base, mode: "cost", cost: { falseAlarm: 3, falseNegative: 1 } });
  assert.equal(cost3.intervene, true);
  close(cost3.threshold, 3 / 3.9, 1e-9);

  // 代价比 5:1 且需求 0.9 → tau = 5/5.9 = 0.847，0.8 被拦下
  const cost5 = scoring.applyGate({ ...base, mode: "cost", cost: { falseAlarm: 5, falseNegative: 1 } });
  assert.equal(cost5.intervene, false);
  assert.equal(cost5.reason, "interruptibility_below_cost_threshold");

  // 不确定性门在阈值门之后仍然生效
  const uncertain = scoring.applyGate({ ...base, uncertainty: 0.9 });
  assert.equal(uncertain.intervene, false);
  assert.equal(uncertain.reason, "uncertainty_above_threshold");
}

// ── 关键设计性质：仅凭时间流逝永远不该触发介入 ──────────────────────────────
{
  const dwell = scoring.BOUNDARY_SCORE.dwellOnly;
  // 代价比 >= 2 时，即使需求满分也拦得住
  for (const r of [2, 3, 4, 5]) {
    const outcome = scoring.applyGate({
      need: 1, interruptibility: dwell, uncertainty: 0,
      mode: "cost", cost: { falseAlarm: r, falseNegative: 1 }
    });
    assert.equal(outcome.intervene, false, `代价比 ${r}:1 时 dwellOnly 必须被拦下`);
  }
  // 代价比 1:1 时拦不住 —— 这正是敏感性分析要暴露的边界
  const permissive = scoring.applyGate({
    need: 1, interruptibility: dwell, uncertainty: 0,
    mode: "cost", cost: { falseAlarm: 1, falseNegative: 1 }
  });
  assert.equal(permissive.intervene, true, "代价比 1:1 是 dwellOnly 的临界点");
}

// ── nearDecisionBoundary ────────────────────────────────────────────────────
{
  assert.equal(scoring.nearDecisionBoundary({ interruptibilityScore: 0.8, threshold: 0.81, margin: 0.1 }), true);
  assert.equal(scoring.nearDecisionBoundary({ interruptibilityScore: 0.8, threshold: 0.95, margin: 0.1 }), false);
  assert.equal(scoring.nearDecisionBoundary({ interruptibilityScore: 0.8, threshold: 0.8, margin: 0 }), true);
}

// ── 端到端：夹具报告结构 ────────────────────────────────────────────────────
{
  const rows = sensitivity.buildFixtures();
  assert.ok(rows.length > 0, "夹具不得为空");
  const summary = sensitivity.analyze(rows);

  assert.equal(summary.total, rows.length);
  assert.equal(summary.costGrid.length, scoring.COST_GRID.length);
  assert.ok(summary.legacyAgreement !== null && summary.legacyAgreement >= 0 && summary.legacyAgreement <= 1);
  for (const row of summary.costGrid) {
    assert.equal(row.flipsToSilent + row.flipsToIntervene,
      Math.round(row.flipRate * summary.total), "翻转率必须与翻转数一致");
    assert.ok(row.thresholdAtNeedFloor >= row.thresholdAtFullNeed, "阈值随需求不增");
  }
  // 代价比越大，介入越少（单调）
  const interventions = summary.costGrid.map((row) => row.wouldIntervene);
  for (let i = 1; i < interventions.length; i += 1) {
    assert.ok(interventions[i] <= interventions[i - 1], "代价比越大介入数不得增加");
  }
  assert.ok(sensitivity.formatReport(summary, "夹具").includes("代价比敏感性"));
}

// ── 端到端：坏输入必须给出可读错误而不是崩溃 ────────────────────────────────
{
  assert.throws(() => sensitivity.analyze(null), /必须是数组/);
  const broken = sensitivity.normalizeDecision({ candidate_kind: "quiet_dwell" });
  assert.deepEqual(broken.evidence, {});
  assert.deepEqual(broken.evidenceFamilies, []);
  const summary = sensitivity.analyze([{ candidate_kind: "not_a_kind" }]);
  assert.equal(summary.total, 1);
  assert.equal(summary.byCandidateKind.not_a_kind.count, 1);
}

console.log("proactive gate sensitivity tests passed");
