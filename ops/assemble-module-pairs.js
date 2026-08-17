"use strict";

const fs = require("fs");
const path = require("path");
const graph = require("../data/knowledge-graph.json");
const { validatePairedAssessment } = require("./assessment-output-validator");

const moduleId = process.argv[2];
if (!moduleId) throw new Error("Usage: node ops/assemble-module-pairs.js <MODULE_ID>");

const units = graph.nodes.filter((node) => node.kind === "unit" && node.type === "knowledge" && node.moduleId === moduleId);
if (!units.length) throw new Error(`Unknown module: ${moduleId}`);
const moduleDefinition = {
  id: moduleId,
  title: units[0].moduleTitle,
  knowledgePoints: units.map((unit) => ({ id: unit.id, name: unit.title }))
};
const outputDir = path.join(__dirname, "..", "prompts", "assessments", moduleId, "outputs");
const pairs = Array.from({ length: 10 }, (_, index) => {
  const pairId = `P${String(index + 1).padStart(2, "0")}`;
  return JSON.parse(fs.readFileSync(path.join(outputDir, "pairs", `${pairId}.json`), "utf8"));
});
const makeOutline = (phase, order) => ({
  id: `${moduleId}-${phase}`,
  type: "quiz",
  title: `${phase === "pre" ? "前测" : "后测"}：${moduleDefinition.title}（${phase === "pre" ? "A" : "B"}卷）`,
  order,
  difficulty: "medium",
  quizConfig: { questionCount: 10, difficulty: "medium", questionTypes: ["single", "multiple", "text"] },
  keyPoints: pairs.map((pair) => JSON.stringify(pair[phase]))
});
const payload = {
  languageDirective: "所有学生可见文本必须使用简体中文。",
  courseTitle: `${moduleDefinition.title}测评`,
  outlines: [makeOutline("pre", 1), makeOutline("post", 2)]
};
const result = validatePairedAssessment(payload, moduleDefinition);
if (!result.valid) {
  process.stderr.write(`${JSON.stringify(result.errors, null, 2)}\n`);
  process.exitCode = 1;
} else {
  const outputPath = path.join(outputDir, `${moduleId}-pre-post.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`Validated and assembled ${moduleId}: ${outputPath}\n`);
}
