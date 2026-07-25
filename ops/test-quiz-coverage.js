const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const route = JSON.parse(read("data/multi-scene-learning-route.json"));
const labelsApi = require("../app/main/knowledge-point-labels");

const flowSource = read("app/flow-test/flow-test.js");
assert.match(flowSource, /function quizKnowledgePointLabels\(/);
assert.doesNotMatch(flowSource, /question\.knowledgePointIds\.join\(/);

const renderSource = read("app/main/render-learning.js");
const sandbox = {
  console,
  curriculum: route.chapters,
  KnowledgePointLabels: labelsApi,
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
  renderInlineMath: (value) => String(value ?? ""),
  renderMathInHtml: (value) => String(value ?? ""),
  resourceUrl: (value) => value,
  CoursewareContextCore: { BRIDGE_VERSION: "test-bridge-v1" },
  knowledgeInteractionTypes: () => [],
  selectedKnowledgeSceneType: () => "",
  knowledgeResourceCandidate: () => null
};
vm.createContext(sandbox);
vm.runInContext(renderSource, sandbox, { filename: "render-learning.js" });
assert.equal(typeof sandbox.renderQuizCoverage, "function");

let questionCount = 0;
for (const chapter of route.chapters || []) {
  const lookup = chapter.modules
    .flatMap((module) => module.knowledgePoints || [])
    .reduce((map, point) => map.set(point.id, point.name), new Map());
  for (const phase of ["preQuiz", "formativeQuiz", "postQuiz"]) {
    for (const question of chapter.flow?.[phase]?.questions || []) {
      const ids = question.knowledgePointIds || [];
      const labels = ids.map((id) => lookup.get(id)).filter(Boolean);
      assert.equal(labels.length, ids.length, `${chapter.id}/${phase}/${question.id} has an unknown knowledge point ID`);
      assert.ok(labels.every((label) => !/^(?:GH|EXT)-\d{2}-K\d{2}$/i.test(label)));
      if (ids.length) {
        const html = sandbox.renderQuizCoverage(question, { chapterId: chapter.id });
        assert.match(html, /覆盖知识点/);
        labels.forEach((label) => assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
        ids.forEach((id) => assert.doesNotMatch(html, new RegExp(id)));
      }
      questionCount += 1;
    }
  }
}

console.log(`quiz coverage labels passed (${questionCount} questions)`);
