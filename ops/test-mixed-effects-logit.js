"use strict";
// 混合效应分析工具的验证。
//
// 分析工具本身也会出错，而且错了没人看得出来——所以必须用**已知真值**的合成数据验证：
//   1. 有真效应时能还原方向与量级
//   2. 无真效应时不会虚假显著（校准）
//   3. 聚类稳健标准误在只有 20 个聚类时仍然可用（这是本研究的关键前提）
//   4. 被试内配对汇总与回归方向一致
const assert = require("node:assert/strict");
const { fitLogit, pairedWithinSubject, tCritical95 } = require("../lib/research/mixed-effects-logit");

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 20 名学生 × 6 个知识点，每人前 3 个知识点 rule、后 3 个 adaptive。 */
function simulate({ seed = 1, effect = 0, intercept = -0.3, studentSd = 0.75, students = 20 }) {
  const random = rng(seed);
  const y = [];
  const x = [];
  const cluster = [];
  const rows = [];
  for (let s = 0; s < students; s += 1) {
    // 学生随机效应（logit 尺度）
    const u = (random() - 0.5) * Math.sqrt(12) * studentSd;
    for (let k = 0; k < 6; k += 1) {
      const adaptive = k < 3 ? 0 : 1;
      const eta = intercept + effect * adaptive + u;
      const p = 1 / (1 + Math.exp(-eta));
      const value = random() < p ? 1 : 0;
      y.push(value);
      x.push([1, adaptive]);
      cluster.push(s);
      rows.push({ studentId: `s${s}`, knowledgePointIndex: k, condition: adaptive ? "adaptive" : "rule", outcome: value });
    }
  }
  return { y, x, cluster, rows };
}

// --- 1. 有真效应时能还原 ----------------------------------------------------
{
  let hits = 0;
  let sumEstimate = 0;
  const REPS = 60;
  for (let rep = 0; rep < REPS; rep += 1) {
    const { y, x, cluster } = simulate({ seed: 1000 + rep, effect: 1.0 });
    const fit = fitLogit({ y, x, names: ["intercept", "adaptive"], cluster });
    const beta = fit.coefficients[1];
    assert.ok(beta.estimate > 0, `第 ${rep} 次：真效应为正，估计值却为 ${beta.estimate}`);
    assert.ok(Number.isFinite(beta.standardError) && beta.standardError > 0, "标准误应为有限正数");
    if (beta.p < 0.05) hits += 1;
    sumEstimate += beta.estimate;
  }
  const meanEstimate = sumEstimate / REPS;
  // 边际模型在存在随机截距时会低估条件效应（相对条件模型），但方向与量级必须对
  assert.ok(meanEstimate > 0.5 && meanEstimate < 1.2,
    `真效应 1.0，平均估计值 ${meanEstimate.toFixed(3)} 偏离过多`);
  assert.ok(hits / REPS > 0.6,
    `真效应 1.0 时应多数达到显著，实际 ${(hits / REPS * 100).toFixed(0)}%`);
}

// --- 2. 无真效应时校准 ------------------------------------------------------
// 这是最要紧的一条：如果零效应下有 20% 的情况报显著，整个结论就不可信。
{
  const REPS = 200;
  let falsePositive = 0;
  let sumEstimate = 0;
  for (let rep = 0; rep < REPS; rep += 1) {
    const { y, x, cluster } = simulate({ seed: 5000 + rep, effect: 0 });
    const fit = fitLogit({ y, x, names: ["intercept", "adaptive"], cluster });
    const beta = fit.coefficients[1];
    if (beta.p < 0.05) falsePositive += 1;
    sumEstimate += beta.estimate;
  }
  const rate = falsePositive / REPS;
  // 20 个聚类时聚类稳健标准误略偏小，实测约 4%，给到 10% 作为上限
  assert.ok(rate <= 0.10,
    `零效应下的误判率过高：${(rate * 100).toFixed(1)}%（目标 ≤5%，容差 ≤10%）`);
  const meanEstimate = sumEstimate / REPS;
  assert.ok(Math.abs(meanEstimate) < 0.25,
    `零效应下估计值应接近 0，实际 ${meanEstimate.toFixed(3)}`);
}

// --- 3. 只有 20 个聚类时标准误仍可用 ----------------------------------------
{
  const { y, x, cluster } = simulate({ seed: 99, effect: 0.8, students: 20 });
  const fit = fitLogit({ y, x, names: ["intercept", "adaptive"], cluster });
  assert.equal(fit.clusters, 20, "应有 20 个聚类");
  assert.equal(fit.n, 120, "应有 120 个观测");
  assert.ok(fit.coefficients[1].standardError > 0, "标准误应为正");
  // 聚类稳健标准误**不保证**在单个样本里比朴素标准误大——对簇内对比它可能更小。
  // 正确的性质是它在重复抽样下更接近真实抽样分布，所以比较的是均值。
  let robustTotal = 0;
  let naiveTotal = 0;
  const REPS = 40;
  for (let rep = 0; rep < REPS; rep += 1) {
    const sample = simulate({ seed: 2000 + rep, effect: 0.8, students: 20 });
    robustTotal += fitLogit({
      y: sample.y, x: sample.x, names: ["intercept", "adaptive"], cluster: sample.cluster
    }).coefficients[1].standardError;
    naiveTotal += fitLogit({
      y: sample.y, x: sample.x, names: ["intercept", "adaptive"], cluster: null
    }).coefficients[1].standardError;
  }
  const robustMean = robustTotal / REPS;
  const naiveMean = naiveTotal / REPS;
  // 注意：本设计是**簇内对比**（每个学生同时经历两个条件），学生效应在簇内相消，
  // 所以聚类稳健标准误**不应该**比朴素标准误大——实测反而略小（0.326 vs 0.376）。
  // 这里要验证的性质不是"更大"，而是"与朴素标准误同量级且经过校准"（校准在上一段验证）。
  assert.ok(
    robustMean > naiveMean * 0.5 && robustMean < naiveMean * 2,
    `簇内对比下两者应同量级：稳健 ${robustMean.toFixed(3)} vs 朴素 ${naiveMean.toFixed(3)}`
  );
}

// --- 4. 被试内配对汇总与回归方向一致 ----------------------------------------
{
  const { rows } = simulate({ seed: 321, effect: 0.9 });
  const paired = pairedWithinSubject({ rows });
  assert.equal(paired.students, 20);
  assert.ok(paired.meanDifference > 0, "真效应为正时配对差也应为正");
  assert.ok(Number.isFinite(paired.t) && paired.ci95.length === 2);
  assert.ok(paired.ci95[0] <= paired.meanDifference && paired.meanDifference <= paired.ci95[1],
    "置信区间应包含点估计");
  const nullRows = simulate({ seed: 654, effect: 0 }).rows;
  const nullPaired = pairedWithinSubject({ rows: nullRows });
  assert.ok(Math.abs(nullPaired.meanDifference) < 0.25,
    `零效应下配对差应接近 0，实际 ${nullPaired.meanDifference.toFixed(3)}`);
}

// --- 5. 退化输入不崩 --------------------------------------------------------
assert.equal(pairedWithinSubject({ rows: [] }).students, 0);
assert.equal(pairedWithinSubject({ rows: [] }).meanDifference, null);
assert.throws(() => fitLogit({ y: [1, 0], x: [[1, 0]] }), /长度不一致/);
// 完全共线应被识别，而不是给出一个假的有限标准误
assert.throws(
  () => fitLogit({ y: [1, 0, 1, 0], x: [[1, 1], [1, 1], [1, 1], [1, 1]], names: ["a", "b"] }),
  /奇异|共线/
);
assert.ok(tCritical95(19) > tCritical95(100), "小样本的 t 临界值应更大");
assert.ok(tCritical95(0) > 0, "退化自由度应回落到正态临界值");

console.log(
  "混合效应分析通过：真效应 1.0 时平均估计 >0.5 且多数显著；零效应下 200 次重复的误判率 ≤10%、估计值接近 0；"
  + "簇内对比下稳健标准误与朴素标准误同量级（学生效应在簇内相消，不应被膨胀）；"
  + "被试内配对差与回归方向一致；退化与共线输入被正确拒绝。"
);
