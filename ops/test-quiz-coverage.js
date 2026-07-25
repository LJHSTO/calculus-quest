const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const route = JSON.parse(read("data/multi-scene-learning-route.json"));
const labelsApi = require("../app/main/knowledge-point-labels");
assert.equal(route.quizKnowledgePointCuration?.questionSetPreserved, true);
assert.deepEqual(route.quizKnowledgePointCuration?.selectionReplacements, []);
const quizIdentity = (route.chapters || []).flatMap((chapter) =>
  ["preQuiz", "formativeQuiz", "postQuiz"].flatMap((phase) =>
    (chapter.flow?.[phase]?.questions || []).map((question) => ({
      chapterId: chapter.id,
      phase,
      id: question.id,
      sourceId: question.sourceId,
      moduleId: question.moduleId,
      type: question.type,
      question: question.question || question.prompt || "",
      options: question.options || [],
      answer: question.answer,
      points: question.points,
      selectionOrder: question.selectionOrder
    }))
  )
);
const quizIdentityFingerprint = crypto
  .createHash("sha256")
  .update(JSON.stringify(quizIdentity))
  .digest("hex");
assert.equal(route.quizKnowledgePointCuration?.questionSetFingerprint, quizIdentityFingerprint);

const flowSource = read("app/flow-test/flow-test.js");
assert.match(flowSource, /function quizKnowledgePointLabels\(/);
assert.doesNotMatch(flowSource, /question\.knowledgePointIds\.join\(/);

const renderSource = read("app/main/render-learning.js");
assert.match(renderSource, /\$\{renderQuizCoverage\(question, unit\)\}/);
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
const observedCoverageGaps = [];
for (const chapter of route.chapters || []) {
  const lookup = chapter.modules
    .flatMap((module) => module.knowledgePoints || [])
    .reduce((map, point) => map.set(point.id, point.name), new Map());
  const moduleById = new Map(chapter.modules.map((module) => [module.id, module]));
  const chapterCoverage = new Set();
  for (const phase of ["preQuiz", "formativeQuiz", "postQuiz"]) {
    const phaseModules = new Set();
    for (const question of chapter.flow?.[phase]?.questions || []) {
      const ids = question.knowledgePointIds || [];
      const sourceModule = moduleById.get(question.moduleId);
      const sourceIds = new Set((sourceModule?.knowledgePoints || []).map((point) => point.id));
      assert.ok(sourceModule, `${chapter.id}/${phase}/${question.id} has an unknown module`);
      assert.ok(ids.length >= 1 && ids.length <= 2, `${chapter.id}/${phase}/${question.id} must cover one or two knowledge points`);
      assert.ok(ids.every((id) => sourceIds.has(id)), `${chapter.id}/${phase}/${question.id} points outside its source module`);
      assert.equal(question.knowledgePointCoverageSource, "semantic-curation-v1");
      const coreLabels = ids.map((id) => lookup.get(id)).filter(Boolean);
      assert.equal(coreLabels.length, ids.length, `${chapter.id}/${phase}/${question.id} has an unknown knowledge point ID`);
      const labels = question.knowledgePointNames || coreLabels;
      assert.ok(labels.length >= 1 && labels.length <= 2, `${chapter.id}/${phase}/${question.id} needs concrete knowledge point names`);
      assert.ok(labels.every((label) => !/^(?:GH|EXT)-\d{2}-K\d{2}$/i.test(label)));
      assert.deepEqual(question.concepts, labels, `${chapter.id}/${phase}/${question.id} has stale concept labels`);
      ids.forEach((id) => chapterCoverage.add(id));
      phaseModules.add(question.moduleId);
      if (ids.length) {
        const html = sandbox.renderQuizCoverage(question, { chapterId: chapter.id });
        assert.match(html, /覆盖知识点/);
        labels.forEach((label) => assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
        ids.forEach((id) => assert.doesNotMatch(html, new RegExp(id)));
      }
      questionCount += 1;
    }
    assert.deepEqual(
      [...phaseModules].sort(),
      [...moduleById.keys()].sort(),
      `${chapter.id}/${phase} does not represent every source module`
    );
  }
  [...lookup.keys()]
    .filter((id) => !chapterCoverage.has(id))
    .forEach((id) => observedCoverageGaps.push(id));
}

const declaredCoverageGaps = (route.quizKnowledgePointCuration?.coverageGaps || [])
  .map((gap) => gap.knowledgePointId)
  .sort();
assert.deepEqual(observedCoverageGaps.sort(), declaredCoverageGaps);
assert.deepEqual(declaredCoverageGaps, ["GH-03-K03", "GH-10-K04", "GH-14-K05"]);

console.log(`quiz coverage labels passed (${questionCount} questions)`);
