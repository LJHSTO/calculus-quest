"use strict";

// Offline gate sensitivity analysis.
//
// Reads a research analysis package, replays every recorded proactive decision
// through the gate under a grid of cost ratios, and reports what would have
// changed. It never touches the live policy.
//
// Usage
//   node ops/proactive-gate-sensitivity.js --fixtures
//   node ops/proactive-gate-sensitivity.js 分析包.json
//   node ops/proactive-gate-sensitivity.js 分析包.json --json
//
// Why this exists rather than a gate change
// -----------------------------------------
// The shipped gate fixes the acceptance threshold at 0.75 with no stated
// derivation. The obvious fix is to derive it from asymmetric costs. That fix
// is NOT applied here, because the gate is part of a frozen protocol: changing
// it would invalidate the recorded policy version and every decision already
// attributed to it, and it would turn a declared constant into a free parameter
// tuned until the design behaves as expected.
//
// Replaying instead produces the same table at zero protocol risk, and reports
// the sensitivity as a result rather than a change.

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const scoring = require("../lib/proactive-policy/scoring");
const { candidateProfile } = require("../lib/proactive-policy/adapters/v14-c3");

const FIXED_THRESHOLD = 0.75;
const NEED_FLOOR = 0.7;
const UNCERTAINTY_CEILING = 0.3;

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// Normalizes one exported `proactive_decisions` row into what the gate needs.
function normalizeDecision(row = {}) {
  const evidence = parseJson(row.evidence_snapshot_json, {});
  const reasonCodes = parseJson(row.reason_codes_json, []);
  const kind = String(row.candidate_kind || "");
  const profile = candidateProfile(kind);
  return {
    kind,
    sceneType: String(row.scene_type || ""),
    loggedDecision: String(row.decision || ""),
    loggedDelivery: String(row.delivery_decision || ""),
    reasonCodes: Array.isArray(reasonCodes) ? reasonCodes : [],
    evidence,
    evidenceFamilies: Array.isArray(evidence.families) ? evidence.families : [],
    requiredFamilies: profile && Array.isArray(profile.requiredEvidenceFamilies)
      ? profile.requiredEvidenceFamilies
      : []
  };
}

function scoreDecision(decision) {
  const need = scoring.helpNeed({ evidence: decision.evidence });
  const interruptibilityScore = scoring.interruptibility({
    evidence: decision.evidence,
    signal: { kind: decision.kind }
  });
  const uncertaintyScore = scoring.uncertainty({
    evidence: decision.evidence,
    evidenceFamilies: decision.evidenceFamilies,
    requiredFamilies: decision.requiredFamilies
  });
  return { need, interruptibilityScore, uncertaintyScore };
}

function evaluateUnder(decision, scores, mode, cost) {
  return scoring.applyGate({
    need: scores.need,
    interruptibility: scores.interruptibilityScore,
    uncertainty: scores.uncertaintyScore,
    needFloor: NEED_FLOOR,
    uncertaintyCeiling: UNCERTAINTY_CEILING,
    fixedThreshold: FIXED_THRESHOLD,
    mode,
    cost
  });
}

function rate(part, whole) {
  return whole > 0 ? Number((part / whole).toFixed(4)) : null;
}

function summarize(decisions) {
  const total = decisions.length;
  const scored = decisions.map((decision) => ({
    decision,
    scores: scoreDecision(decision),
    legacy: evaluateUnder(decision, scoreDecision(decision), "legacy", scoring.DEFAULT_COST)
  }));

  // Validation: does the offline replay reproduce what the policy recorded?
  // A low agreement rate means the replay is not a faithful model of the
  // shipped gate, and every flip number below should be read with that in mind.
  let loggedIntervene = 0;
  let replayIntervene = 0;
  let agree = 0;
  for (const entry of scored) {
    const logged = entry.decision.loggedDecision === "intervene";
    if (logged) loggedIntervene += 1;
    if (entry.legacy.intervene) replayIntervene += 1;
    if (logged === entry.legacy.intervene) agree += 1;
  }

  const grid = scoring.COST_GRID.map((ratio) => {
    const cost = { falseAlarm: ratio, falseNegative: 1 };
    let toSilent = 0;
    let toIntervene = 0;
    let wouldIntervene = 0;
    const byKind = new Map();
    const byReason = new Map();
    for (const entry of scored) {
      const outcome = evaluateUnder(entry.decision, entry.scores, "cost", cost);
      if (outcome.intervene) wouldIntervene += 1;
      if (entry.legacy.intervene !== outcome.intervene) {
        if (outcome.intervene) toIntervene += 1; else toSilent += 1;
        const kindKey = entry.decision.kind || "(unknown)";
        const kindEntry = byKind.get(kindKey) || { toSilent: 0, toIntervene: 0 };
        if (outcome.intervene) kindEntry.toIntervene += 1; else kindEntry.toSilent += 1;
        byKind.set(kindKey, kindEntry);
        if (!outcome.intervene) {
          byReason.set(outcome.reason, (byReason.get(outcome.reason) || 0) + 1);
        }
      }
    }
    return {
      costRatio: `${ratio}:1`,
      thresholdAtNeedFloor: Number(scoring.acceptanceThreshold(NEED_FLOOR, cost).toFixed(4)),
      thresholdAtFullNeed: Number(scoring.acceptanceThreshold(1, cost).toFixed(4)),
      wouldIntervene,
      interventionRate: rate(wouldIntervene, total),
      flipsToSilent: toSilent,
      flipsToIntervene: toIntervene,
      flipRate: rate(toSilent + toIntervene, total),
      flipsByKind: Object.fromEntries([...byKind.entries()].sort()),
      silentReasons: Object.fromEntries([...byReason.entries()].sort())
    };
  });

  const byKindTable = {};
  for (const entry of scored) {
    const key = entry.decision.kind || "(unknown)";
    const bucket = byKindTable[key] || {
      count: 0, loggedIntervene: 0, replayIntervene: 0,
      meanNeed: 0, meanInterruptibility: 0, meanUncertainty: 0
    };
    bucket.count += 1;
    if (entry.decision.loggedDecision === "intervene") bucket.loggedIntervene += 1;
    if (entry.legacy.intervene) bucket.replayIntervene += 1;
    bucket.meanNeed += entry.scores.need;
    bucket.meanInterruptibility += entry.scores.interruptibilityScore;
    bucket.meanUncertainty += entry.scores.uncertaintyScore;
    byKindTable[key] = bucket;
  }
  for (const bucket of Object.values(byKindTable)) {
    bucket.meanNeed = Number((bucket.meanNeed / bucket.count).toFixed(4));
    bucket.meanInterruptibility = Number((bucket.meanInterruptibility / bucket.count).toFixed(4));
    bucket.meanUncertainty = Number((bucket.meanUncertainty / bucket.count).toFixed(4));
  }

  return {
    total,
    logged: { intervene: loggedIntervene, silent: total - loggedIntervene },
    replayLegacy: { intervene: replayIntervene, silent: total - replayIntervene },
    legacyAgreement: rate(agree, total),
    byCandidateKind: byKindTable,
    costGrid: grid
  };
}

// Fixtures exist to exercise the decision boundary, not to look realistic.
// The diagnostic row is the last one per candidate kind: maximum need with NO
// natural boundary, which puts interruptibility at the candidate's own boundary
// score. That is the region where the cost ratio actually decides the outcome,
// so it is the row that makes the sensitivity table informative.
const FIXTURE_HIGH_NEED_NO_BOUNDARY = Object.freeze({
  families: ["result", "process", "history"],
  confirmedIncorrect: 2,
  confirmedGapCount: 1,
  sceneAttemptFailures: 2,
  parameterCommitCount: 3
});

function buildFixtures() {
  const kinds = Object.keys(scoring.KIND_BOUNDARY);
  const rows = [];
  const push = (kind, evidence) => rows.push({
    decision_id: `fixture-${rows.length + 1}`,
    candidate_kind: kind,
    scene_type: "simulation",
    decision: "stay_silent",
    delivery_decision: "stay_silent",
    reason_codes_json: "[]",
    evidence_snapshot_json: JSON.stringify(evidence)
  });
  for (const kind of kinds) {
    push(kind, { families: ["time"] });
    push(kind, { families: ["time"], naturalBoundary: true });
    push(kind, { families: ["result"], confirmedIncorrect: 1, naturalBoundary: true });
    push(kind, { ...FIXTURE_HIGH_NEED_NO_BOUNDARY, naturalBoundary: true });
    push(kind, { ...FIXTURE_HIGH_NEED_NO_BOUNDARY });
  }
  return rows;
}

function formatReport(summary, source, { synthetic = false } = {}) {
  const lines = [];
  lines.push(`来源：${source}`);
  lines.push(`决策总数：${summary.total}`);
  lines.push(`记录值：介入 ${summary.logged.intervene} / 沉默 ${summary.logged.silent}`);
  lines.push(`离线重放（现行 0.75 固定阈值）：介入 ${summary.replayLegacy.intervene} / 沉默 ${summary.replayLegacy.silent}`);
  lines.push(`重放与记录一致率：${summary.legacyAgreement === null ? "无数据" : summary.legacyAgreement}`);
  if (synthetic) {
    lines.push("  ⚠️ 夹具模式的记录值是人造的，一致率在此不构成任何验证；只有真实分析包的一致率才有意义。");
  } else if (summary.legacyAgreement !== null && summary.legacyAgreement < 0.9) {
    lines.push("  ⚠️ 一致率偏低：离线评分函数未能忠实复现已发布门控，下面的翻转数应据此打折解读。");
  }
  lines.push("");
  lines.push("按候选类型的离线重放：");
  lines.push("  候选类型 | 条数 | 记录介入 | 重放介入 | 平均需求 | 平均可打断性 | 平均不确定性");
  for (const [kind, bucket] of Object.entries(summary.byCandidateKind)) {
    lines.push(`  ${kind} | ${bucket.count} | ${bucket.loggedIntervene} | ${bucket.replayIntervene} | ${bucket.meanNeed} | ${bucket.meanInterruptibility} | ${bucket.meanUncertainty}`);
  }
  lines.push("");
  lines.push("代价比敏感性（tau = C_FA / (C_FA + p_need * C_FN)）：");
  lines.push("  代价比 | 需求下限处阈值 | 需求满分处阈值 | 会介入 | 介入率 | 转为沉默 | 转为介入 | 翻转率");
  for (const row of summary.costGrid) {
    lines.push(`  ${row.costRatio} | ${row.thresholdAtNeedFloor} | ${row.thresholdAtFullNeed} | ${row.wouldIntervene} | ${row.interventionRate} | ${row.flipsToSilent} | ${row.flipsToIntervene} | ${row.flipRate}`);
  }
  const detailed = summary.costGrid.filter((row) => row.flipsToSilent > 0);
  if (detailed.length) {
    lines.push("");
    lines.push("转为沉默的分布：");
    for (const row of detailed) {
      lines.push(`  ${row.costRatio}：${JSON.stringify(row.flipsByKind)}`);
      lines.push(`    原因：${JSON.stringify(row.silentReasons)}`);
    }
  }
  lines.push("");
  lines.push("说明：本报告不改变任何生产决策，也不代表已迁移门控。代价比为声明值，非拟合值。");
  return lines.join("\n");
}

function analyze(rows) {
  assert.ok(Array.isArray(rows), "决策记录必须是数组。");
  return summarize(rows.map(normalizeDecision));
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const asJson = args.includes("--json");
    const useFixtures = args.includes("--fixtures");
    const input = args.find((arg) => !arg.startsWith("--"));
    let rows;
    let source;
    if (useFixtures) {
      rows = buildFixtures();
      source = "内置夹具（无真实数据时的自检）";
    } else {
      assert.ok(input, "用法：node ops/proactive-gate-sensitivity.js <分析包.json> [--json] | --fixtures");
      const data = JSON.parse(fs.readFileSync(path.resolve(input), "utf8").replace(/^\uFEFF/, ""));
      rows = data?.tables?.proactive_decisions;
      assert.ok(Array.isArray(rows), "分析包缺少 proactive_decisions 表。");
      source = path.resolve(input);
    }
    const summary = analyze(rows);
    console.log(asJson
      ? JSON.stringify(summary, null, 2)
      : formatReport(summary, source, { synthetic: useFixtures }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { analyze, normalizeDecision, scoreDecision, buildFixtures, formatReport, FIXED_THRESHOLD };
