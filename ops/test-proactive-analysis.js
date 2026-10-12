"use strict";

/**
 * 主分析脚本的行为测试。
 *
 * 这个测试要钉住三件事：
 *   1. **映射口径正确**：随机化条件取自 `evidence_snapshot_json.proactivityCondition`
 *      （知识点层面），不是名册上的展示组；未投递、没检查结果的记录被排除并计数。
 *   2. **没数据时不编**：分母不足就报 blocker，不产生系数、不产生比例。
 *   3. **摘要守卫有效**：分析包被改过就拒绝分析，而不是对着改过的数据算出一份报告。
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const proactivity = require("../lib/proactive-policy/proactivity");
const {
  buildDataset,
  fitPrimary,
  summarizeAdherence,
  summarizeYield,
  analyze,
  renderReport
} = require("./analyze-proactive-experiment.js");

// --------------------------------------------------------------- 构造分析包

function decision({
  student,
  knowledgePointIndex,
  condition,
  createdAt,
  delivered = true,
  checkOutcome = "independent_attempt_success",
  resolution = "accepted",
  justification = "",
  justificationRequested = true,
  decisionSource = "",
  proactivityLevel = "suggestion",
  candidateKind = "independent_attempt_outcome"
}) {
  return {
    experiment_id: "test-experiment",
    user_id: student,
    condition: "treatment_full",
    learning_generation: 1,
    decision_id: `${student}-kp${knowledgePointIndex}`,
    recorded_condition: "treatment_full",
    unit_id: `GH-0${Math.floor(knowledgePointIndex / 3) + 1}-K0${(knowledgePointIndex % 3) + 1}`,
    scene_type: "game",
    candidate_kind: candidateKind,
    decision: "intervene",
    delivery_decision: delivered ? "intervene" : "stay_silent",
    action: "elicit_self_explanation",
    support_level: "L1",
    policy_version: "test-policy",
    adapter_version: "test-adapter",
    created_at: createdAt,
    shown_at: delivered ? createdAt : null,
    resolution,
    intervention_status: delivered ? "resolved" : "",
    reason_codes_json: "[]",
    evidence_snapshot_json: JSON.stringify({
      proactivityCondition: condition,
      proactivityPolicy: condition === "rule" ? "fixed" : "adaptive",
      proactivityLevel,
      knowledgePointIndex,
      decisionSource: decisionSource || (condition === "adaptive" ? "jev" : "rule"),
      agentConfidence: condition === "adaptive" ? 0.9 : null,
      // 这一维只作协变量：系统从未实施随机延迟
      triggerTimingAssigned: "agent"
    }),
    followup_outcome_json: JSON.stringify({
      ...(justification || justificationRequested
        ? { studentJustification: justification, justificationRequested }
        : {}),
      ...(checkOutcome
        ? {
            independentAttempt: {
              outcome: checkOutcome,
              correct: checkOutcome === "independent_attempt_success" ? 1 : 0,
              incorrect: checkOutcome === "independent_attempt_success" ? 0 : 1,
              questionCount: 1,
              checkId: `${student}-kp${knowledgePointIndex}-probe-l1-v3`
            }
          }
        : {})
    })
  };
}

function packageOf(rows, participants = []) {
  const tables = {
    participants,
    quiz_attempts: [],
    phase_scores: [],
    assessment_catalog: [],
    courseware_events: [],
    outcome_items: [],
    outcome_sessions: [],
    grading_audits: [],
    proactive_decisions: rows
  };
  return {
    schema_version: "research-analysis-package-v1",
    generated_at: "2026-09-22T12:00:00.000Z",
    scope: { chapterId: "V14-C1" },
    export_transform_digest: "test",
    data_fingerprint: crypto.createHash("sha256")
      .update(JSON.stringify(tables)).digest("hex"),
    counts: Object.fromEntries(Object.entries(tables).map(([key, value]) => [key, value.length])),
    protocol: { experimentId: "test-experiment" },
    warnings: [],
    dictionary: {},
    tables
  };
}

/**
 * 6 名学生 × 6 个知识点。条件用**生产环境那把拉丁方轮转**分配，
 * 而不是"前三个自适应、后三个固定"——后者会让条件与知识点哑变量完全共线，
 * 主模型直接奇异。测试数据必须复现真实设计，否则测的是一个不存在的世界。
 */
function buildFixtures() {
  // 每名学生在自适应档/固定档各通过几题，用于造出有真实方差的配对差异
  const pattern = [
    { adaptive: 3, rule: 0 },
    { adaptive: 3, rule: 1 },
    { adaptive: 2, rule: 1 },
    { adaptive: 2, rule: 0 },
    { adaptive: 2, rule: 2 },
    { adaptive: 1, rule: 2 }
  ];
  const rows = [];
  const participants = [];
  const assignments = new Map();
  pattern.forEach((counts, studentIndex) => {
    const student = `S${studentIndex + 1}`;
    participants.push({
      experiment_id: "test-experiment",
      user_id: student,
      condition: "treatment_full",
      learning_generation: 1,
      cohort: "pilot",
      stratum: "pre-high",
      assignment_version: "test",
      assigned_at: "2026-09-22T09:00:00.000Z",
      participation_status: "enrolled",
      enrollment_basis: "implicit_engineering_pilot",
      consented_at: "2026-09-22T09:00:00.000Z",
      withdrawn_at: null
    });
    let adaptiveLeft = counts.adaptive;
    let ruleLeft = counts.rule;
    let fallbackUsed = false;
    for (let knowledgePointIndex = 0; knowledgePointIndex < 6; knowledgePointIndex += 1) {
      const assignment = proactivity.assignKnowledgePointCondition({
        participantId: student,
        knowledgePointIndex,
        knowledgePointCount: 6,
        salt: "test-salt"
      });
      const condition = assignment.condition;
      assignments.set(`${student}-${knowledgePointIndex}`, condition);
      // 前 N 个该条件上的知识点算通过
      const pass = condition === "adaptive" ? adaptiveLeft-- > 0 : ruleLeft-- > 0;
      // 自适应档里给前两名学生各安排一次模型兜底，用来检验依从性统计
      const useFallback = condition === "adaptive" && studentIndex < 2 && !fallbackUsed;
      if (useFallback) fallbackUsed = true;
      rows.push(decision({
        student,
        knowledgePointIndex,
        condition,
        createdAt: `2026-09-22T10:0${knowledgePointIndex}:00.000Z`,
        checkOutcome: pass ? "independent_attempt_success" : "continued_friction",
        decisionSource: useFallback ? "rule_fallback" : "",
        // 换表征本来就不问理由，用来检验分母修正
        candidateKind: knowledgePointIndex === 5 ? "representation_switch" : "independent_attempt_outcome",
        justificationRequested: knowledgePointIndex !== 5,
        justification: knowledgePointIndex === 5
          ? ""
          : (studentIndex + knowledgePointIndex) % 3 === 0 ? "" : "因为要先确定自变量再对应到输出值",
        resolution: knowledgePointIndex === 4 ? "dismissed" : "accepted",
        proactivityLevel: condition === "adaptive" && pass ? "intervention" : "suggestion"
      }));
    }
  });
  return { rows, participants, pattern, assignments };
}

// ------------------------------------------------ 1. 摘要守卫

{
  const fixture = buildFixtures();
  const pkg = packageOf(fixture.rows, fixture.participants);
  const dataset = buildDataset(pkg);
  assert.equal(dataset.rows.length, 36);

  pkg.tables.proactive_decisions[0].delivery_decision = "stay_silent";
  assert.throws(
    () => buildDataset(pkg),
    /数据摘要不匹配/,
    "分析包被改过就必须拒绝分析，绝不能对着改过的数据出报告"
  );
  console.log("摘要守卫通过：分析包被改动后拒绝分析。");
}

// ------------------------------------------------ 2. 映射与排除口径

{
  const fixture = buildFixtures();
  const rows = [
    ...fixture.rows,
    // 未投递：不该进分析
    decision({
      student: "S1", knowledgePointIndex: 0, condition: "adaptive",
      createdAt: "2026-09-22T11:00:00.000Z", delivered: false
    }),
    // 已投递但学生还没做支架后检查：算缺失，不算 0 分
    decision({
      student: "S1", knowledgePointIndex: 1, condition: "adaptive",
      createdAt: "2026-09-22T11:01:00.000Z", checkOutcome: ""
    })
  ];
  const dataset = buildDataset(packageOf(rows, fixture.participants));
  assert.equal(dataset.excluded.notDelivered, 1);
  assert.equal(dataset.excluded.noCheckOutcome, 1);
  assert.equal(dataset.excluded.conditionUnresolved, 0);
  assert.equal(dataset.rows.length, 37, "未投递的被剔除，缺检查结果的保留在表里但 outcome 为 null");

  const missing = dataset.rows.find((row) => row.createdAt === "2026-09-22T11:01:00.000Z");
  assert.equal(missing.checkCorrect, null, "缺检查结果必须是 null，不能变成 0");
  assert.equal(missing.checkOutcome, "");

  // 条件取自 evidence（知识点层面），不是名册展示组
  assert.ok(dataset.rows.every((row) => ["rule", "adaptive"].includes(row.condition)));
  assert.ok(
    dataset.rows.every((row) => !["control", "treatment_full"].includes(row.condition)),
    "不得把名册展示组当作随机化条件"
  );
  // 决策序号按学生内时间顺序编号
  const s1 = dataset.rows.filter((row) => row.studentId === "S1");
  assert.deepEqual(s1.map((row) => row.decisionSequence), s1.map((_, index) => index + 1));
  console.log("映射口径通过：条件取知识点层面分配；未投递剔除、缺检查记为 null 并计数。");
}

// ------------------------------------------------ 3. 产出量与依从性

{
  const fixture = buildFixtures();
  const dataset = buildDataset(packageOf(fixture.rows, fixture.participants));
  const yielded = summarizeYield(dataset.rows);
  assert.equal(yielded.students, 6);
  assert.equal(yielded.decisions, 36);
  assert.equal(yielded.withCheckOutcome, 36);
  assert.equal(yielded.perCondition.rule, 18);
  assert.equal(yielded.perCondition.adaptive, 18);
  assert.equal(yielded.medianPerStudent, 6);

  const adherence = summarizeAdherence(dataset.rows);
  assert.equal(adherence.adaptiveDecisions, 18);
  assert.equal(adherence.jevDecisions, 16, "有两次自适应档走了兜底");
  assert.equal(adherence.fallbackBreakdown.rule_fallback, 2);
  assert.equal(adherence.jevRate, 16 / 18);
  // 操纵检验：固定档必须恒为 suggestion
  assert.deepEqual(Object.keys(adherence.levelDistribution.rule), ["suggestion"]);
  assert.ok(
    Object.keys(adherence.levelDistribution.adaptive).includes("intervention"),
    "自适应档必须真的出现过非建议档，否则这一档没有被实施"
  );
  console.log("产出量与依从性通过：18/18 观测；自适应档出现过 intervention；固定档恒为 suggestion。");
}

// ------------------------------------------------ 4. 过程层与 Hint Justification

{
  const fixture = buildFixtures();
  const analysis = analyze(packageOf(fixture.rows, fixture.participants));
  const process = analysis.process;

  // 36 条里只有 kp4（每名学生 1 条）是 dismissed，其余 accepted
  assert.equal(process.overall.offered, 36);
  assert.equal(process.overall.accepted, 30);
  assert.equal(process.overall.declined, 6);
  assert.equal(process.overall.acceptRate, 30 / 36);

  const hj = process.hintJustification;
  // kp5（representation_switch）接受但不问理由 → 不进分母
  assert.equal(hj.accepted, 30, "接受的 30 条里包含换表征");
  assert.equal(hj.prompted, 24, "换表征的 6 条接受不进分母");
  assert.ok(hj.provided < hj.prompted && hj.provided > 0);
  assert.equal(hj.providedRate, hj.provided / hj.prompted);
  assert.ok(hj.needsRubricScoring <= hj.substantive);
  console.log("过程层通过：接受率按决策点口径；换表征的接受不进 Hint Justification 分母。");
}

// ------------------------------------------------ 5. 主分析：真的拟合出方向

{
  const fixture = buildFixtures();
  const analysis = analyze(packageOf(fixture.rows, fixture.participants));
  const primary = analysis.primary;
  assert.equal(primary.fitted, true);
  assert.equal(primary.observations, 36);
  assert.equal(primary.students, 6);
  assert.equal(primary.knowledgePoints, 6);
  assert.deepEqual(primary.byCondition, { rule: 18, adaptive: 18 });
  // 截距 + 条件 + (知识点数 − 1) 个固定效应哑变量
  assert.equal(primary.robust.coefficients.length, 1 + 1 + 5);
  assert.equal(primary.robust.coefficients[0].name, "截距");
  assert.equal(primary.robust.coefficients[1].name, "自适应档（相对固定档）");

  const adaptive = primary.robust.coefficients[1];
  assert.ok(adaptive.estimate > 0, `自适应档应为正向，实际 ${adaptive.estimate}`);
  assert.ok(adaptive.oddsRatio > 1, "优势比应大于 1");
  // 造的数据里自适应 13/18 通过、固定 6/18 通过，方向必须反映出来
  assert.equal(primary.naive.coefficients[1].estimate > 0, true);
  assert.ok(primary.referenceKnowledgePointIndex === 0);

  // 报告必须包含聚类与不聚类两套标准误，且点明聚类方向不一定更大
  const report = renderReport(analysis);
  assert.match(report, /聚类稳健 SE/);
  assert.match(report, /朴素 SE/);
  assert.match(report, /不一定.*更大/);
  assert.match(report, /自适应档（相对固定档）/);
  console.log("主分析通过：知识点固定效应 + 学生聚类稳健，自适应档系数为正。");
}

// ------------------------------------------------ 6. 被试内配对对比

{
  const fixture = buildFixtures();
  const analysis = analyze(packageOf(fixture.rows, fixture.participants));
  const paired = analysis.paired;
  assert.equal(paired.students, 6);
  assert.equal(paired.df, 5);
  // 每名学生的（自适应通过率 − 固定通过率）均值
  const differences = fixture.pattern.map((counts) => counts.adaptive / 3 - counts.rule / 3);
  const expected = differences.reduce((sum, n) => sum + n, 0) / differences.length;
  assert.ok(
    Math.abs(paired.meanDifference - expected) < 1e-12,
    `配对差值应为 ${expected}，实际 ${paired.meanDifference}`
  );
  assert.ok(paired.ci95[0] < paired.meanDifference && paired.meanDifference < paired.ci95[1]);
  assert.ok(Number.isFinite(paired.t) && Number.isFinite(paired.p));
  console.log("配对对比通过：逐学生差值均值与手工计算一致，且给出置信区间与效应量。");
}

// ------------------------------------------------ 7. 没数据时不编

{
  const empty = analyze(packageOf([], []));
  assert.equal(empty.primary.fitted, false);
  assert.ok(empty.primary.blockers.length >= 1);
  assert.match(empty.primary.blockers.join("\n"), /没有任何/);
  assert.equal(empty.paired.students, 0);
  assert.equal(empty.paired.meanDifference, null);
  assert.equal(empty.process.overall.acceptRate, null, "分母为 0 的比例必须是 null，不是 0");
  assert.equal(empty.process.hintJustification.providedRate, null);
  const report = renderReport(empty);
  assert.match(report, /尚未拟合/);
  assert.match(report, /不填 0/);
  assert.match(report, /算不出来/);
  console.log("空数据路径通过：不产生系数、不产生比例，报告明确写「尚未拟合」。");
}

// ------------------------------------------------ 8. 只有一个条件有观测时不硬算

{
  const rows = [];
  for (let index = 0; index < 8; index += 1) {
    rows.push(decision({
      student: `S${(index % 4) + 1}`,
      knowledgePointIndex: index % 3,
      condition: "adaptive",
      createdAt: `2026-09-22T10:${String(index).padStart(2, "0")}:00.000Z`
    }));
  }
  const analysis = analyze(packageOf(rows, []));
  assert.equal(analysis.primary.fitted, false);
  assert.match(analysis.primary.blockers.join("\n"), /两个条件都必须有观测/);
  console.log("单条件路径通过：只有一个条件有观测时拒绝拟合并说明原因。");
}

// ------------------------------------------------ 8b. 所有学生分配相同 → 共线，必须报出来

{
  // 这正是真实设计要避免的失败模式：如果拉丁方没有真的在轮转，
  // "条件"就与知识点哑变量完全共线，模型会奇异。
  const rows = [];
  for (let studentIndex = 0; studentIndex < 6; studentIndex += 1) {
    for (let knowledgePointIndex = 0; knowledgePointIndex < 6; knowledgePointIndex += 1) {
      rows.push(decision({
        student: `S${studentIndex + 1}`,
        knowledgePointIndex,
        // 所有学生都"前三个自适应、后三个固定"——看起来合理，其实完全共线
        condition: knowledgePointIndex < 3 ? "adaptive" : "rule",
        createdAt: `2026-09-22T10:0${knowledgePointIndex}:00.000Z`,
        checkOutcome: (studentIndex + knowledgePointIndex) % 2 === 0
          ? "independent_attempt_success" : "continued_friction",
        resolution: "accepted"
      }));
    }
  }
  const analysis = analyze(packageOf(rows, []));
  assert.equal(analysis.primary.fitted, false);
  assert.match(analysis.primary.blockers.join("\n"), /设计矩阵奇异/);
  assert.match(analysis.primary.blockers.join("\n"), /轮转/);
  const report = renderReport(analysis);
  assert.match(report, /设计矩阵奇异/);
  console.log("共线路径通过：分配没有真正轮转时报出设计矩阵奇异，而不是抛栈或给假系数。");
}

// ------------------------------------------------ 9. CLI 落盘与拒绝覆盖

{
  const fixture = buildFixtures();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cq-analysis-"));
  const packagePath = path.join(temporary, "分析包.json");
  const outputDirectory = path.join(temporary, "报告");
  fs.writeFileSync(packagePath, JSON.stringify(packageOf(fixture.rows, fixture.participants)));

  const first = spawnSync(process.execPath, [
    path.join(root, "ops/analyze-proactive-experiment.js"),
    packagePath,
    outputDirectory
  ], { cwd: root, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  for (const name of ["分析报告.md", "分析表.csv", "分析结果.json"]) {
    assert.ok(fs.existsSync(path.join(outputDirectory, name)), `缺少输出文件 ${name}`);
  }
  const table = fs.readFileSync(path.join(outputDirectory, "分析表.csv"), "utf8");
  assert.equal(table.split("\r\n").length, 1 + 36, "分析表应当一行一个决策点");
  assert.match(table, /studentId,decisionId,createdAt/);
  const result = JSON.parse(fs.readFileSync(path.join(outputDirectory, "分析结果.json"), "utf8"));
  assert.equal(result.primary.fitted, true);
  assert.equal(result.rows, undefined, "结果 JSON 不应重复塞进 36 行明细");

  // 已有分析结果时拒绝覆盖：报告是论文证据，不能被静默重写
  const second = spawnSync(process.execPath, [
    path.join(root, "ops/analyze-proactive-experiment.js"),
    packagePath,
    outputDirectory
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /拒绝覆盖/);
  fs.rmSync(temporary, { recursive: true, force: true });
  console.log("CLI 通过：报告/分析表/结果三件套落盘，且拒绝覆盖已有输出。");
}

console.log("主分析脚本通过：口径正确、缺失不填 0、没数据不编、摘要守卫与输出保护都在。");
