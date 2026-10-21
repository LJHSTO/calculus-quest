"use strict";
const fs = require("node:fs"), path = require("node:path");
const { buildReplay, modelInputs } = require("../lib/education-replay");
const [sourceFile, target, flag] = process.argv.slice(2);
try {
  if (!sourceFile || !target) throw new Error("用法：node ops/build-education-replay.js <研究导出.json> <新的输出目录> [--engineering]；划分种子来自STUDY_SPLIT_SEED");
  const source = JSON.parse(fs.readFileSync(sourceFile, "utf8")), directory = path.resolve(target);
  if (fs.existsSync(directory)) throw new Error("输出目录已存在；不能覆盖锁定的评测划分");
  const bundle = buildReplay(source.data || source, { splitSalt: process.env.STUDY_SPLIT_SEED, allowEngineering: flag === "--engineering" });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "评测索引与待标注.json"), JSON.stringify(bundle, null, 2));
  fs.writeFileSync(path.join(directory, "模型输入.jsonl"), modelInputs(bundle).map(row => JSON.stringify(row)).join("\n"));
  console.log(`已生成${bundle.caseCount}个决策前缀；${bundle.participantCount}名账号；数据类别：${bundle.dataClass}。未调用模型，未产生人工金标签。`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
