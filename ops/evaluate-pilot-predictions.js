"use strict";
// Fixed, predeclared thresholds; does not tune on the test students or install a policy.
const fs = require("node:fs");
const prob = x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
function metrics(rows, threshold) {
  const predicted = rows.filter(r => prob(r.p)); let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of predicted) { if (r.p >= threshold) r.y ? tp++ : fp++; else r.y ? fn++ : tn++; }
  const divide = (a, b) => b ? a / b : null;
  return { labeled: rows.length, scored: predicted.length, missingOrFailed: rows.length - predicted.length,
    coverage: divide(predicted.length, rows.length), tp, fp, tn, fn,
    sensitivity: divide(tp, tp + fn), specificity: divide(tn, tn + fp), precision: divide(tp, tp + fp),
    accuracyOnScored: divide(tp + tn, predicted.length), successRateAllLabels: divide(tp + tn, rows.length),
    brierDiagnostic: divide(predicted.reduce((n, r) => n + (r.p - r.y) ** 2, 0), predicted.length),
    reliabilityBins: Array.from({ length: 5 }, (_, i) => {
      const bin = predicted.filter(r => Math.min(4, Math.floor(r.p * 5)) === i);
      return { lower: i / 5, upper: (i + 1) / 5, n: bin.length,
        predictedMean: divide(bin.reduce((n, r) => n + r.p, 0), bin.length),
        observedMean: divide(bin.reduce((n, r) => n + r.y, 0), bin.length) };
    }) };
}
function evaluate(bundle, labels, predictions, { target = "need", threshold = .5, split = "test" } = {}) {
  if (!["need", "interruptibility"].includes(target) || !prob(threshold) || !["development", "validation", "test"].includes(split)) throw new Error("目标、阈值或集合无效");
  const labelKey = target === "need" ? "needLabel" : "interruptibilityLabel";
  const probabilityKey = target === "need" ? "needProbability" : "interruptibilityProbability";
  const cases = new Map(bundle.cases.map(c => [c.caseId, c])), lm = new Map(), pm = new Map();
  if (cases.size !== bundle.cases.length) throw new Error("案例编号重复");
  for (const [rows, map] of [[labels, lm], [predictions, pm]]) for (const r of rows) {
    const c = cases.get(r.caseId);
    if (!c || r.inputHash !== c.inputHash || map.has(r.caseId)) throw new Error("案例重复、未知或输入摘要不匹配");
    map.set(r.caseId, r);
  }
  const models = new Set(predictions.map(p => p.model));
  if (models.size !== 1 || ![...models][0]) throw new Error("每次只评一个明确版本的模型及一次重复运行");
  const groups = new Map(); let excludedUnknown = 0;
  for (const c of bundle.cases.filter(c => c.split === split)) {
    const l = lm.get(c.caseId), p = pm.get(c.caseId);
    if (!l || ![0, 1].includes(l[labelKey])) { excludedUnknown++; continue; }
    if (l.participant !== c.participant || l.frame !== c.frame || l.runtimeHash !== c.runtimeHash || l.split !== c.split) throw new Error("标签分组元数据不匹配");
    const k = JSON.stringify([c.frame, c.runtimeHash]);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ participant: c.participant, y: l[labelKey], p: p?.status === "ok" && prob(p[probabilityKey]) ? p[probabilityKey] : null });
  }
  const output = [...groups].map(([key, rows]) => {
    const people = [...new Set(rows.map(r => r.participant))];
    const perParticipant = people.map(id => ({ participant: id, ...metrics(rows.filter(r => r.participant === id), threshold) }));
    const defined = perParticipant.filter(p => p.successRateAllLabels !== null);
    return { frame: JSON.parse(key)[0], runtimeHash: JSON.parse(key)[1], participants: people.length,
      ...metrics(rows, threshold), participantMacroSuccess: defined.length ? defined.reduce((n, p) => n + p.successRateAllLabels, 0) / defined.length : null,
      perParticipant, inferenceStatus: "descriptive_only_no_independent_effectiveness_claim" };
  });
  return { dataClass: bundle.dataClass, model: [...models][0], target, threshold, split, excludedUnknown, groups: output,
    probabilityCalibrated: false, learningEffectEstimated: false,
    notes: ["阈值须先在开发/验证学生上选定；本工具不自动调优。", "Brier与分箱仅是诊断，不代表完成概率校准；规则权重不可冒充概率。",
      "各抽样框与参数版本分开；覆盖率包括失败与超时。", "按学生报告，不把多条日志当独立学生。推断须预注册并按学生聚类估计区间。"] };
}
if (require.main === module) { try {
  const [index, labelsFile, predictionsFile, output, target = "need", threshold = ".5", split = "test"] = process.argv.slice(2);
  if (!output) throw new Error("用法：node ops/evaluate-pilot-predictions.js 索引.json 标签.jsonl 预测.jsonl 新报告.json [need|interruptibility] [固定阈值] [集合]");
  const lines = f => fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const result = evaluate(JSON.parse(fs.readFileSync(index, "utf8")), lines(labelsFile), lines(predictionsFile), { target, threshold: Number(threshold), split });
  fs.writeFileSync(output, JSON.stringify(result, null, 2), { encoding: "utf8", flag: "wx" });
  console.log("已完成固定阈值描述核验；未校准或修改线上策略。");
} catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { evaluate };
