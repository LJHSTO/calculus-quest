"use strict";

/**
 * 主动 Agent 实验的主分析脚本（目标清单第 10 项）。
 *
 *     node ops/analyze-proactive-experiment.js <分析包.json> [输出目录]
 *
 * 输入就是管理端导出的**分析包 JSON**（`research-analysis-package-v1`），
 * 和 `ops/prepare-research-analysis.js` 吃的是同一份文件。这样做的理由：
 * 分析包带 `data_fingerprint`，脚本可以先核对摘要再算——**报告里的每个数字都能
 * 追回到一份被摘要锁定的数据**。如果分析另起一套读取路径（比如直接查 SQLite），
 * 论文里的数字就再也无法用导出的原始数据复现。
 *
 * 过程层与三层因变量的口径见 `lib/research/process-metrics.js` 与
 * `lib/research/mixed-effects-logit.js`；本脚本只负责把分析包**映射**成那两个
 * 模块要的输入，并组织报告。
 *
 * 三条刻意的"不"：
 *   1. **不填 0**。缺失一律排除，并把排除了多少条报出来。
 *   2. **不报没有分母的比例**。分母为 0 时返回 null 并说明原因。
 *   3. **不把"分配到的条件"当成"实际经受的操纵"**。触发时机那一维只记录分配格
 *      （`triggerTimingAssigned`），系统从未真正实施随机延迟，所以它只进协变量
 *      清单，不进主模型——见 `research/决策点产出实测与设计修正-2026-09-22.md` §5。
 */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { fitLogit, pairedWithinSubject } = require("../lib/research/mixed-effects-logit");
const { computeProcessMetrics, computeHintJustification } = require("../lib/research/process-metrics");

const DELIVERED = "intervene";

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * 把分析包映射成一行一个"决策点"的分析表。
 *
 * 只做映射与排除，不做任何统计——统计要么交给 lib/research 的模块，
 * 要么在下面显式写清口径。
 */
function buildDataset(packageData = {}) {
  assert.equal(
    packageData.schema_version,
    "research-analysis-package-v1",
    "分析包版本不受支持。"
  );
  const tables = packageData.tables || {};
  assert.ok(Array.isArray(tables.proactive_decisions), "分析包缺少 proactive_decisions 表。");
  // 摘要核对：和 prepare-research-analysis.js 同一把锁。数据被改过就必须先停下来，
  // 否则报告里的数字会对着一份已经不存在的原始数据。
  const fingerprint = crypto.createHash("sha256")
    .update(JSON.stringify(tables))
    .digest("hex");
  assert.equal(
    fingerprint,
    packageData.data_fingerprint,
    "分析包数据摘要不匹配，内容可能已被改变；请重新导出，不要手改分析包。"
  );

  const roster = new Map(
    (Array.isArray(tables.participants) ? tables.participants : [])
      .map((row) => [String(row.user_id || ""), row])
  );

  const rows = [];
  const excluded = {
    notDelivered: 0,
    conditionUnresolved: 0,
    noCheckOutcome: 0
  };

  for (const raw of tables.proactive_decisions) {
    const evidence = parseJson(raw.evidence_snapshot_json);
    const followup = parseJson(raw.followup_outcome_json);
    const attempt = followup.independentAttempt || {};
    // 随机化条件是**知识点层面**分配的，只有它才是自变量。
    // `recorded_condition` 是名册上的展示组（control / treatment_full），
    // 那是另一回事——把它当自变量会把两个因子搅在一起。
    const condition = String(evidence.proactivityCondition || "");
    const delivered = String(raw.delivery_decision || "") === DELIVERED;
    if (!delivered) {
      excluded.notDelivered += 1;
      continue;
    }
    if (!["rule", "adaptive"].includes(condition)) {
      excluded.conditionUnresolved += 1;
      continue;
    }
    const outcome = String(attempt.outcome || "");
    const graded = outcome === "independent_attempt_success" || outcome === "continued_friction";
    if (!graded) {
      // 干预发出去了，但支架后检查还没答（或设计上没发）。这是**缺失**，
      // 不是 0 分。排除并计数。
      excluded.noCheckOutcome += 1;
    }
    const resolution = String(raw.resolution || "");
    rows.push({
      studentId: String(raw.user_id || ""),
      // 决策点序号：同一学生内按时间排序后编号，用于依从性/顺序效应分析
      decisionId: String(raw.decision_id || ""),
      createdAt: String(raw.created_at || ""),
      condition,
      conditionPolicy: String(evidence.proactivityPolicy || ""),
      proactivityLevel: String(evidence.proactivityLevel || ""),
      knowledgePointIndex: Number.isFinite(Number(evidence.knowledgePointIndex))
        ? Number(evidence.knowledgePointIndex)
        : null,
      unitId: String(raw.unit_id || ""),
      candidateKind: String(raw.candidate_kind || ""),
      action: String(raw.action || ""),
      supportLevel: String(raw.support_level || ""),
      resolution,
      accepted: resolution === "accepted" ? 1 : 0,
      // 决策来源：jev = 真的问了模型；rule_fallback = 兜底
      decisionSource: String(evidence.decisionSource || ""),
      agentConfidence: Number.isFinite(Number(evidence.agentConfidence))
        ? Number(evidence.agentConfidence)
        : null,
      // 触发时机的**分配格**。系统没有实际实施随机延迟，所以它只是协变量。
      timingAssigned: String(evidence.triggerTimingAssigned || ""),
      justification: String(followup.studentJustification || ""),
      justificationRequested: followup.justificationRequested !== false
        && (followup.justificationRequested !== undefined
          || String(followup.studentJustification || "") !== ""),
      checkOutcome: graded ? outcome : "",
      checkCorrect: graded ? (outcome === "independent_attempt_success" ? 1 : 0) : null,
      checkId: String(attempt.checkId || ""),
      stratum: String(roster.get(String(raw.user_id || ""))?.stratum || "")
    });
  }

  rows.sort((left, right) => (
    left.studentId.localeCompare(right.studentId)
    || left.createdAt.localeCompare(right.createdAt)
  ));
  const sequenceByStudent = new Map();
  rows.forEach((row) => {
    const next = (sequenceByStudent.get(row.studentId) || 0) + 1;
    sequenceByStudent.set(row.studentId, next);
    row.decisionSequence = next;
  });

  return { rows, excluded, counts: packageData.counts || {} };
}

/** 按学生聚类、带知识点固定效应的逻辑回归。 */
function fitPrimary(rows) {
  const usable = rows.filter((row) => row.checkCorrect !== null);
  const students = new Set(usable.map((row) => row.studentId));
  const points = [...new Set(usable.map((row) => row.knowledgePointIndex))]
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  // 一个条件没有观测、或只有一名学生，回归没有意义。报清楚原因，不要硬算。
  const byCondition = {
    rule: usable.filter((row) => row.condition === "rule").length,
    adaptive: usable.filter((row) => row.condition === "adaptive").length
  };
  const blockers = [];
  if (!usable.length) blockers.push("没有任何「已投递且已作答支架后检查」的决策点");
  if (byCondition.rule === 0 || byCondition.adaptive === 0) {
    blockers.push(`两个条件都必须有观测，实际 rule=${byCondition.rule}、adaptive=${byCondition.adaptive}`);
  }
  if (students.size < 2) blockers.push(`聚类稳健标准误至少需要 2 名学生，实际 ${students.size}`);
  if (blockers.length) {
    return {
      fitted: false,
      observations: usable.length,
      students: students.size,
      knowledgePoints: points.length,
      byCondition,
      blockers
    };
  }

  // 设计矩阵：[截距, adaptive, 知识点固定效应…]
  // 第一个知识点作参照水平，避免哑变量陷阱。
  const reference = points[0];
  const dummies = points.slice(1);
  const names = ["截距", "自适应档（相对固定档）", ...dummies.map((point) => `知识点#${point}`)];
  const y = [];
  const x = [];
  const cluster = [];
  for (const row of usable) {
    y.push(row.checkCorrect);
    x.push([
      1,
      row.condition === "adaptive" ? 1 : 0,
      ...dummies.map((point) => (row.knowledgePointIndex === point ? 1 : 0))
    ]);
    cluster.push(row.studentId);
  }
  const robust = (() => {
    try {
      return fitLogit({ y, x, names, cluster });
    } catch (error) {
      return { error: error.message };
    }
  })();
  if (robust.error) {
    // 设计矩阵奇异通常不是代码问题，是**设计问题**：比如所有学生的知识点分配
    // 完全一样，条件就与知识点哑变量完全共线。这种情况报清楚，不要抛栈。
    return {
      fitted: false,
      observations: y.length,
      students: students.size,
      knowledgePoints: points.length,
      byCondition,
      blockers: [`设计矩阵奇异（${robust.error}）——检查知识点层面的条件分配是否真的在轮转`]
    };
  }
  // 同时给一份不聚类的结果，让读者看到聚类把标准误改了多少。
  // 注意：被试内对比会抵消学生效应，所以聚类稳健标准误**不一定更大**，
  // 方向取决于设计；两个数都报是为了透明，不是为了挑一个好看的。
  const naive = fitLogit({ y, x, names });
  return {
    fitted: true,
    observations: y.length,
    students: robust.clusters,
    knowledgePoints: points.length,
    referenceKnowledgePointIndex: reference,
    byCondition,
    robust,
    naive
  };
}

/** 过程层：接受率、拒绝/忽略率、各主动档位接受率、Hint Justification。 */
function summarizeProcess(rows) {
  const metrics = computeProcessMetrics(rows.map((row) => ({
    resolution: row.resolution,
    proactivityLevel: row.proactivityLevel || "unknown",
    condition: row.condition,
    offered: true
  })));
  const justification = computeHintJustification(rows.map((row) => ({
    resolution: row.resolution,
    justification: row.justification,
    justificationRequested: row.justificationRequested
  })));
  const byCondition = {
    rule: computeProcessMetrics(rows.filter((row) => row.condition === "rule").map((row) => ({
      resolution: row.resolution, proactivityLevel: row.proactivityLevel, condition: "rule", offered: true
    }))),
    adaptive: computeProcessMetrics(rows.filter((row) => row.condition === "adaptive").map((row) => ({
      resolution: row.resolution, proactivityLevel: row.proactivityLevel, condition: "adaptive", offered: true
    })))
  };
  return { overall: metrics, byCondition, hintJustification: justification };
}

/** 依从性：自适应档里到底有多少次真的走了模型。 */
function summarizeAdherence(rows) {
  const adaptive = rows.filter((row) => row.condition === "adaptive");
  const rule = rows.filter((row) => row.condition === "rule");
  const jev = adaptive.filter((row) => row.decisionSource === "jev");
  const fallbackReasons = {};
  for (const row of adaptive) {
    if (row.decisionSource !== "jev") {
      const key = row.decisionSource || "unknown";
      fallbackReasons[key] = (fallbackReasons[key] || 0) + 1;
    }
  }
  const levelCounts = (list) => list.reduce((accumulator, row) => {
    const key = row.proactivityLevel || "unknown";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
  return {
    adaptiveDecisions: adaptive.length,
    jevDecisions: jev.length,
    jevRate: rate(jev.length, adaptive.length),
    fallbackBreakdown: fallbackReasons,
    // 操纵检验：自适应档应该真的出现 notification / intervention，
    // 固定档应该恒为 suggestion。如果两者分布一样，说明这一档没被实施。
    levelDistribution: { rule: levelCounts(rule), adaptive: levelCounts(adaptive) }
  };
}

/** 产出量：每人多少决策点、每条件多少观测（直接决定功效）。 */
function summarizeYield(rows) {
  const perStudent = new Map();
  for (const row of rows) {
    perStudent.set(row.studentId, (perStudent.get(row.studentId) || 0) + 1);
  }
  const counts = [...perStudent.values()].sort((a, b) => a - b);
  const median = counts.length
    ? counts[Math.floor(counts.length / 2)]
    : null;
  return {
    students: perStudent.size,
    decisions: rows.length,
    delivered: rows.length,
    medianPerStudent: median,
    minPerStudent: counts.length ? counts[0] : null,
    maxPerStudent: counts.length ? counts[counts.length - 1] : null,
    withCheckOutcome: rows.filter((row) => row.checkCorrect !== null).length,
    perCondition: {
      rule: rows.filter((row) => row.condition === "rule").length,
      adaptive: rows.filter((row) => row.condition === "adaptive").length
    }
  };
}

function analyze(packageData) {
  const dataset = buildDataset(packageData);
  const rows = dataset.rows;
  return {
    schemaVersion: packageData.schema_version,
    dataFingerprint: packageData.data_fingerprint,
    exportedAt: packageData.generated_at || "",
    protocol: packageData.protocol || {},
    excluded: dataset.excluded,
    yield: summarizeYield(rows),
    adherence: summarizeAdherence(rows),
    process: summarizeProcess(rows),
    primary: fitPrimary(rows),
    paired: pairedWithinSubject({
      // 注意字段名：pairedWithinSubject 要的是 { studentId, condition, outcome }，
      // 而数据集里那三个字段叫 studentId / condition / checkCorrect。
      // 直接把数据集行丢进去会得到 NaN 而不是报错——NaN 会静默地写进报告。
      rows: rows
        .filter((row) => row.checkCorrect !== null)
        .map((row) => ({
          studentId: row.studentId,
          condition: row.condition,
          outcome: row.checkCorrect
        }))
    }),
    rows
  };
}

const fmt = (value, digits = 3) => (
  value === null || value === undefined || Number.isNaN(value) ? "—" : Number(value).toFixed(digits)
);
const pct = (value) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`);

function renderReport(analysis) {
  const lines = [];
  const push = (text = "") => lines.push(text);
  push("# 主动 Agent 实验分析报告");
  push();
  push(`- 分析包版本：\`${analysis.schemaVersion}\``);
  push(`- 数据摘要：\`${String(analysis.dataFingerprint || "").slice(0, 16)}…\``);
  push(`- 导出时间：${analysis.exportedAt || "（未记录）"}`);
  push(`- 实验编号：${analysis.protocol.experimentId || "（未记录）"}`);
  push();
  push("> 本报告不填 0、不编分母。缺失一律排除并计数；分母为 0 的比例写 null。");
  push("> 触发时机那一维只记录**分配格**，系统从未实施随机延迟，因此不进主模型。");
  push();

  const y = analysis.yield;
  push("## 1. 产出量与设计核对");
  push();
  push(`| 指标 | 值 |`);
  push(`|---|---|`);
  push(`| 学生数 | ${y.students} |`);
  push(`| 已投递干预（决策点） | ${y.decisions} |`);
  push(`| 其中已作答支架后检查 | ${y.withCheckOutcome} |`);
  push(`| 每人干预数 中位数（最小–最大） | ${y.medianPerStudent ?? "—"}（${y.minPerStudent ?? "—"}–${y.maxPerStudent ?? "—"}） |`);
  push(`| 固定档观测 | ${y.perCondition.rule} |`);
  push(`| 自适应档观测 | ${y.perCondition.adaptive} |`);
  push();
  push(`排除：未投递 ${analysis.excluded.notDelivered} 条；条件未解析 ${analysis.excluded.conditionUnresolved} 条；已投递但没有检查结果 ${analysis.excluded.noCheckOutcome} 条。`);
  push();
  push("设计文档预期每人 6–18 个决策点、每条件约 60 个观测（20 人 × 3 知识点）。");
  push("实际数字若明显偏离，先查是不是冷却时长或知识点时长变了，再谈效应。");
  push();

  const a = analysis.adherence;
  push("## 2. 依从性（Jev 判断层真的被调用了吗）");
  push();
  push(`自适应档决策 ${a.adaptiveDecisions} 次，其中真的走了模型 ${a.jevDecisions} 次（${pct(a.jevRate)}）。`);
  if (Object.keys(a.fallbackBreakdown).length) {
    push();
    push("兜底分布：");
    push();
    push("| 来源 | 次数 |");
    push("|---|---|");
    for (const [key, count] of Object.entries(a.fallbackBreakdown)) push(`| ${key} | ${count} |`);
  }
  push();
  push("**兜底不是失败，是设计**：模型超时/不可用时会退回规则档并记录原因，实验不停摆。");
  push("代价是这一格的干预变少，所以 `jevRate` 是依从性指标，必须报出来。");
  push();
  push("主动档位分布（操纵检验）：");
  push();
  push("| 决策来源 | 档位 | 次数 |");
  push("|---|---|---|");
  for (const [source, distribution] of Object.entries(a.levelDistribution)) {
    const entries = Object.entries(distribution);
    if (!entries.length) push(`| ${source} | — | 0 |`);
    for (const [level, count] of entries) push(`| ${source} | ${level} | ${count} |`);
  }
  push();
  push("固定档应当**恒为 suggestion**。若出现别的档位，说明固定档的条件没有真正固定。");
  push();

  const p = analysis.process;
  push("## 3. 过程层因变量");
  push();
  push("| 指标 | 固定档 | 自适应档 |");
  push("|---|---|---|");
  push(`| 接受率（Help Appropriateness） | ${pct(p.byCondition.rule.acceptRate)} | ${pct(p.byCondition.adaptive.acceptRate)} |`);
  push(`| 拒绝率 | ${pct(p.byCondition.rule.declineRate)} | ${pct(p.byCondition.adaptive.declineRate)} |`);
  push(`| 忽略率 | ${pct(p.byCondition.rule.ignoreRate)} | ${pct(p.byCondition.adaptive.ignoreRate)} |`);
  push();
  push("各主动档位接受率：");
  push();
  push("| 档位 | 提供 | 接受 | 接受率 |");
  push("|---|---|---|---|");
  for (const [level, entry] of Object.entries(p.overall.byProactivityLevel)) {
    push(`| ${level} | ${entry.offered} | ${entry.accepted} | ${pct(entry.acceptRate)} |`);
  }
  push();
  const hj = p.hintJustification;
  push("Hint Justification（防 gaming 的关键指标）：");
  push();
  push(`- 被接受的提示 ${hj.accepted} 条，其中**确实问过理由**的 ${hj.prompted} 条（这才是分母）`);
  push(`- 给了理由：${hj.provided} 条 → providedRate = ${pct(hj.providedRate)}`);
  push(`- 理由够长（≥ ${hj.minSubstantiveLength} 字）：${hj.substantive} 条 → substantiveRate = ${pct(hj.substantiveRate)}`);
  push(`- 明确跳过：skipRate = ${pct(hj.skipRate)}`);
  push(`- 需要量规或模型判分的条数：${hj.needsRubricScoring}`);
  push();
  push("换表征这类本来就不问理由的接受不进分母，所以不要把 providedRate 读成「学生不愿说理由」。");
  push();

  push("## 4. 主分析：支架后检查通过率（混合效应 logistic，学生聚类稳健）");
  push();
  const primary = analysis.primary;
  if (!primary.fitted) {
    push("**尚未拟合。** 原因：");
    push();
    for (const blocker of primary.blockers) push(`- ${blocker}`);
    push();
    push(`当前可用观测 ${primary.observations} 条、学生 ${primary.students} 名、知识点 ${primary.knowledgePoints} 个。`);
    push();
    push("这是设计上的正常状态：本脚本在正式数据进来之前跑，就应该什么都不编。");
  } else {
    push(`可用观测 ${primary.observations} 条、学生 ${primary.students} 名、知识点 ${primary.knowledgePoints} 个。`);
    push(`知识点固定效应以 #${primary.referenceKnowledgePointIndex} 为参照水平。`);
    push();
    push("| 系数 | 估计 | 聚类稳健 SE | z | p | OR | OR 95% CI |");
    push("|---|---|---|---|---|---|---|");
    for (const coefficient of primary.robust.coefficients) {
      push(`| ${coefficient.name} | ${fmt(coefficient.estimate)} | ${fmt(coefficient.standardError)} | `
        + `${fmt(coefficient.z, 2)} | ${fmt(coefficient.p)} | ${fmt(coefficient.oddsRatio)} | `
        + `[${fmt(coefficient.oddsRatioCi[0])}, ${fmt(coefficient.oddsRatioCi[1])}] |`);
    }
    push();
    push("不聚类版本（用于对照聚类带来的变化，不作为结论）：");
    push();
    push("| 系数 | 估计 | 朴素 SE | z | p |");
    push("|---|---|---|---|---|");
    for (const coefficient of primary.naive.coefficients) {
      push(`| ${coefficient.name} | ${fmt(coefficient.estimate)} | ${fmt(coefficient.standardError)} | `
        + `${fmt(coefficient.z, 2)} | ${fmt(coefficient.p)} |`);
    }
    push();
    push("注意：被试内对比会抵消学生层面的效应，所以聚类稳健标准误**不一定**更大。两个都报是为了透明。");
  }
  push();
  const paired = analysis.paired;
  push("## 5. 被试内配对对比（不依赖模型，审稿人先看的数字）");
  push();
  if (!paired.students) {
    push("没有同时具备两个条件观测的学生，无法配对。");
  } else {
    push(`完整配对的学生 ${paired.students} 名。`);
    push();
    push(`- 自适应档 − 固定档 的平均通过率差：${fmt(paired.meanDifference)}（95% CI [${fmt(paired.ci95[0])}, ${fmt(paired.ci95[1])}]）`);
    push(`- 配对 t(${paired.df}) = ${fmt(paired.t, 2)}，p = ${fmt(paired.p)}`);
    push(`- d_z = ${fmt(paired.sd > 0 ? paired.meanDifference / paired.sd : 0)}`);
    push();
    push("N=20 的功效不足，主结论应当放在决策质量与体验上；学习结果报效应量与置信区间。");
  }
  push();
  push("## 6. 从这份分析包**算不出来**的东西");
  push();
  push("诚实列出来，避免有人以为它们被算过：");
  push();
  push("- **打断成本**（展示到下一次有效操作的间隔）：分析包只导出决策时间与呈现时间，没有学生下一次操作时间戳。");
  push("- **学习层前后测/迁移分数**：在 `phase_scores` 与 `outcome_items` 表里，本脚本不重复算（`ops/summarize-functions-limits.js` 负责）。");
  push("- **体验层量表**：数据在问卷星，不在这份分析包里。");
  push("- **理由内容是否正确**：需要量规或模型判分，本脚本只算采集完备度。");
  push();
  return lines.join("\n");
}

function main(argv) {
  const [, , inputPath, outputDirectory] = argv;
  if (!inputPath) {
    console.error("用法：node ops/analyze-proactive-experiment.js <分析包.json> [输出目录]");
    return 1;
  }
  const packageData = JSON.parse(
    fs.readFileSync(path.resolve(inputPath), "utf8").replace(/^\uFEFF/, "")
  );
  const analysis = analyze(packageData);
  const report = renderReport(analysis);
  console.log(report);
  if (outputDirectory) {
    const output = path.resolve(outputDirectory);
    assert.ok(!fs.existsSync(output), "目标目录已存在，为保护已有分析结果拒绝覆盖。");
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "分析报告.md"), report, { encoding: "utf8", flag: "wx" });
    // 行级分析表一起落盘：报告里每个数字都能对着这张表复算。
    const header = ["studentId", "decisionId", "createdAt", "decisionSequence", "condition",
      "proactivityLevel", "decisionSource", "agentConfidence", "knowledgePointIndex",
      "unitId", "candidateKind", "action", "supportLevel", "resolution", "accepted",
      "justificationRequested", "justificationLength", "checkOutcome", "checkCorrect", "checkId"];
    const csv = [header.join(","), ...analysis.rows.map((row) => header.map((key) => {
      const value = key === "justificationLength" ? row.justification.length : row[key];
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(","))].join("\r\n");
    fs.writeFileSync(path.join(output, "分析表.csv"), "\uFEFF" + csv, { encoding: "utf8", flag: "wx" });
    fs.writeFileSync(path.join(output, "分析结果.json"), JSON.stringify({
      ...analysis,
      rows: undefined
    }, null, 2), { encoding: "utf8", flag: "wx" });
    console.log(`\n输出目录：${output}`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildDataset,
  fitPrimary,
  summarizeProcess,
  summarizeAdherence,
  summarizeYield,
  analyze,
  renderReport
};
