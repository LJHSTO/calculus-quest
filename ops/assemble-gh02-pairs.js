"use strict";

const fs = require("fs");
const path = require("path");
const route = require("../data/multi-scene-learning-route.json");
const { validatePairedAssessment } = require("./assessment-output-validator");

const inputDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "prompts", "assessments", "GH-02", "pair-outputs"));
const outputPath = path.resolve(process.argv[3] || path.join(inputDir, "GH-02-openmaic.json"));
const moduleDefinition = route.chapters
  .flatMap((chapter) => chapter.modules || [])
  .find((module) => module.id === "GH-02");

function parsePairFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(unfenced);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.pre || !parsed.post) {
    throw new Error(`${path.basename(filePath)} must contain exactly one object with pre and post questions`);
  }
  return parsed;
}

const pairs = Array.from({ length: 6 }, (_, index) => {
  const pairId = `P${String(index + 1).padStart(2, "0")}`;
  return parsePairFile(path.join(inputDir, `${pairId}.json`));
});

const payload = {
  languageDirective: "zh-CN",
  courseTitle: "极限与连续：直觉探索测评",
  outlines: [
    {
      id: "GH-02-pre",
      type: "quiz",
      title: "前测：极限与连续：直觉探索（A卷）",
      order: 1,
      difficulty: "medium",
      quizConfig: { questionCount: 6, difficulty: "medium", questionTypes: ["single", "multiple", "text"] },
      keyPoints: pairs.map((pair) => JSON.stringify(pair.pre))
    },
    {
      id: "GH-02-post",
      type: "quiz",
      title: "后测：极限与连续：直觉探索（B卷）",
      order: 2,
      difficulty: "medium",
      quizConfig: { questionCount: 6, difficulty: "medium", questionTypes: ["single", "multiple", "text"] },
      keyPoints: pairs.map((pair) => JSON.stringify(pair.post))
    }
  ]
};

const validation = validatePairedAssessment(payload, moduleDefinition);
if (!validation.valid) {
  process.stderr.write(`${JSON.stringify(validation.errors, null, 2)}\n`);
  process.exitCode = 1;
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`Validated and assembled GH-02 assessment: ${outputPath}\n`);
}
