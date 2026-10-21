"use strict";
const fs = require("node:fs"), path = require("node:path"), { evaluate,evaluateRuns } = require("../lib/education-replay-metrics");
try {
  const [bundleFile, predictionFile, target, split = "test"] = process.argv.slice(2);
  if (!bundleFile || !predictionFile || !target) throw new Error("用法：node ops/evaluate-education-replay.js <已标注索引.json> <模型预测.jsonl> <新报告.json> [test|validation|development]");
  const bundle = JSON.parse(fs.readFileSync(bundleFile, "utf8")), predictions = fs.readFileSync(predictionFile, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const result = predictions.some(p=>p.model)?evaluateRuns(bundle,predictions,split):evaluate(bundle, predictions, split), output = path.resolve(target);
  if (fs.existsSync(output)) throw new Error("结果已存在，请使用新的评测运行文件名");
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(result.runs?`完成${result.runs.length}组模型/消融/重复运行评分；无金标签时不生成质量结论。`:`完成离线评分：${result.goldCases}个裁决标签，${result.scored}个有效预测；无金标签时不生成质量结论。`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
