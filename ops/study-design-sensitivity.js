"use strict";
// Planning approximation only: no participant data and no observed power.
const fs = require("node:fs"), path = require("node:path");
const cases = [
  { recruited: 30, pilot: 6, formal: 24 },
  { recruited: 56, pilot: 8, formal: 48 },
  { recruited: 60, pilot: 8, formal: 52 }
].map(row => {
  const complete = Math.floor(row.formal * .85);
  return { ...row, complete_if_15_percent_loss: complete,
    paired_dz_normal_approx_80pct: (1.95996398454 + .84162123357) / Math.sqrt(row.formal),
    paired_dz_after_loss: (1.95996398454 + .84162123357) / Math.sqrt(complete),
    planned_unit_boundaries: row.formal * 6,
    candidate_scenarios: [.3, .6].flatMap(candidateRate => [.1, .3].map(recoveryRate => ({
      candidate_rate: candidateRate, recovery_rate_among_candidates: recoveryRate,
      expected_recovered_candidates: row.formal * 6 * candidateRate * recoveryRate
    }))) };
});
const result = { type: "planning_only_no_human_data", alpha: .05, power: .8,
  formula: "(z_0.975 + z_0.8) / sqrt(n_participants)", cases,
  limitations: ["正态近似的配对差异敏感性，假设人间独立、无缺失且差异近似连续正态。",
    "不是六单元混合模型或七点有序量表的正式功效；先导后须按实际方差、相关性、机会率重新模拟。",
    "六个学习单元不等于六倍独立被试；候选与恢复比例仅为假设。",
    "不能据此宣称保持测非劣效，也不能把未显著解释为相等。"] };
const target = path.join(__dirname, "../output/平台优化与实验方案-2026-10-17/样本规划敏感性.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
