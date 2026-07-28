const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const route = JSON.parse(read("data/multi-scene-learning-route.json"));
const { routeUnits } = require("../lib/kg-build");
const labelsApi = require("../app/main/knowledge-point-labels");
const unitById = new Map(
  route.chapters.flatMap((chapter) => routeUnits(chapter)).map((unit) => [unit.id, unit])
);
const syntheticUnits = new Map([
  ["knowledge-target", {
    id: "knowledge-target",
    type: "knowledge",
    chapterId: route.chapters[0].id,
    order: 2,
    label: "目标课件"
  }],
  ["knowledge-future", {
    id: "knowledge-future",
    type: "knowledge",
    chapterId: route.chapters[0].id,
    order: 99,
    label: "后续课件"
  }]
]);
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
const quizSource = read("app/main/quiz.js");
const eventsSource = read("app/main/events.js");
const accessibleQuizResources = new Set();
const sandbox = {
  console,
  curriculum: route.chapters,
  state: { submittedQuizzes: [], returnToQuiz: null },
  els: {
    lessonPlayer: {
      innerHTML: "",
      querySelector: () => null
    },
    completeLesson: {
      addEventListener: () => {}
    }
  },
  document: {
    querySelectorAll: () => []
  },
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
  analyticsTrack: () => {},
  moduleRoleForUnit: () => "",
  quizRecordsForUnit: () => [],
  displayOptionLabel: (option) => option.label || option.text || option.value || "",
  getChapter: (chapterId) => ({
    allUnits: routeUnits(route.chapters.find((chapter) => chapter.id === chapterId) || {}),
    units: routeUnits(route.chapters.find((chapter) => chapter.id === chapterId) || {})
  }),
  getUnit: (unitId) => syntheticUnits.get(unitId) || unitById.get(unitId) || null,
  agenticGuardNavigation: (unitId) => accessibleQuizResources.has(unitId),
  quizMaxScoreFor: (question) => Number(question.points || 1),
  quizAiReviewFailed: () => false,
  quizReviewIsPending: () => false,
  quizScoreFromAiScore: (score) => Number(score || 0),
  quizFormatScore: (score) => String(score),
  quizQuestionScoreLabel: () => "1 / 1 分",
  completeAndAdvanceCurrentUnit: () => {},
  knowledgeInteractionTypes: () => [],
  selectedKnowledgeSceneType: () => "",
  knowledgeResourceCandidate: () => null
};
vm.createContext(sandbox);
vm.runInContext(renderSource, sandbox, { filename: "render-learning.js" });
vm.runInContext(quizSource, sandbox, { filename: "quiz.js" });
assert.equal(typeof sandbox.renderQuizCoverage, "function");
assert.equal(typeof sandbox.renderQuizReturnNotice, "function");
assert.equal(typeof sandbox.quizUnitSequenceIndex, "function");

const firstQuizQuestion = route.chapters
  .flatMap((chapter) => ["preQuiz", "formativeQuiz", "postQuiz"]
    .flatMap((phase) => chapter.flow?.[phase]?.questions || []))
  .find((question) => (question.knowledgePointIds || []).length);
assert.ok(firstQuizQuestion, "expected at least one quiz question with knowledge-point coverage");

sandbox.renderResourceShell = (_unit, _title, body) => body;
sandbox.renderAssessmentBanner = () => "";
sandbox.renderCoach = () => "";
sandbox.renderQuestionInput = () => "<input>";
sandbox.setupQuizVisibilityTracking = () => {};
sandbox.renderQuiz({
  id: "quiz-unsubmitted",
  label: "未提交测验",
  chapterId: route.chapters[0].id,
  assessmentPhase: "pre",
  scene: {
    type: "quiz",
    content: { questions: [firstQuizQuestion] }
  }
});
assert.equal(
  (sandbox.els.lessonPlayer.innerHTML.match(/data-quiz-coverage/g) || []).length,
  0,
  "unsubmitted quiz cards must not expose knowledge-point coverage"
);

const reviewUnit = {
  ...unitById.get("V14-C1-formative"),
  id: "quiz-submitted",
  chapterId: route.chapters[0].id,
  assessmentPhase: "formative"
};
const choiceQuestion = {
  ...firstQuizQuestion,
  type: "single",
  options: [
    { value: "A", label: "选项 A" },
    { value: "B", label: "选项 B" }
  ],
  answer: ["A"],
  analysis: "解析"
};
const reviewCases = [
  {
    label: "correct choice",
    question: choiceQuestion,
    result: { response: ["A"], answer: ["A"], isCorrect: true }
  },
  {
    label: "incorrect choice",
    question: choiceQuestion,
    result: { response: ["B"], answer: ["A"], isCorrect: false }
  },
  {
    label: "short answer",
    question: {
      ...firstQuizQuestion,
      type: "short_answer",
      referenceAnswer: "参考答案",
      commentPrompt: "评分参考"
    },
    result: {
      response: "作答",
      aiScore: 1,
      aiWeakConcepts: []
    }
  }
];
reviewCases.forEach(({ label, question, result }) => {
  const html = sandbox.renderQuestionReview({ question, result, index: 0, unit: reviewUnit });
  assert.equal(
    (html.match(/data-quiz-coverage/g) || []).length,
    1,
    `${label} review must show knowledge-point coverage exactly once`
  );
});

const linkedQuestion = {
  ...choiceQuestion,
  question: "请先回看[[cq-unit:knowledge-target|simulation|回看课件：目标课件]]，再回答：测试题目。"
};
const linkedResult = { response: ["B"], answer: ["A"], isCorrect: false };
const lockedPreHtml = sandbox.renderQuestionReview({
  question: linkedQuestion,
  result: linkedResult,
  index: 0,
  unit: { ...reviewUnit, assessmentPhase: "pre" }
});
assert.doesNotMatch(lockedPreHtml, /data-quiz-resource-link/);
assert.match(lockedPreHtml, /请根据对应知识点/);
assert.match(lockedPreHtml, /完成前测后的学习路径选择/);
assert.doesNotMatch(lockedPreHtml, /可以先回看/);

const lockedFormativeHtml = sandbox.renderQuestionReview({
  question: linkedQuestion,
  result: linkedResult,
  index: 0,
  unit: { ...reviewUnit, assessmentPhase: "formative" }
});
assert.doesNotMatch(lockedFormativeHtml, /data-quiz-resource-link/);
assert.match(lockedFormativeHtml, /对应课件尚未解锁/);
assert.doesNotMatch(lockedFormativeHtml, /可以先回看/);

accessibleQuizResources.add("knowledge-target");
const unlockedFormativeHtml = sandbox.renderQuestionReview({
  question: linkedQuestion,
  result: linkedResult,
  index: 0,
  unit: { ...reviewUnit, assessmentPhase: "formative" }
});
assert.match(unlockedFormativeHtml, /data-quiz-resource-link="knowledge-target"/);
assert.match(unlockedFormativeHtml, /可以先回看/);
assert.match(unlockedFormativeHtml, /回看「目标课件」课件/);
assert.doesNotMatch(unlockedFormativeHtml, /请先回看回看课件/);

const unlockedPreHtml = sandbox.renderQuestionReview({
  question: linkedQuestion,
  result: linkedResult,
  index: 0,
  unit: { ...reviewUnit, assessmentPhase: "pre" }
});
assert.doesNotMatch(unlockedPreHtml, /data-quiz-resource-link/);
assert.doesNotMatch(unlockedPreHtml, /回看课件/);
assert.doesNotMatch(unlockedPreHtml, /请先回看/);

accessibleQuizResources.add("knowledge-future");
const futureLinkedQuestion = {
  ...choiceQuestion,
  question: "请先回看[[cq-unit:knowledge-future|simulation|回看课件：后续课件]]，再回答：测试题目。"
};
const blockedFutureFormativeHtml = sandbox.renderQuestionReview({
  question: futureLinkedQuestion,
  result: linkedResult,
  index: 0,
  unit: reviewUnit
});
assert.doesNotMatch(blockedFutureFormativeHtml, /data-quiz-resource-link/);
assert.doesNotMatch(blockedFutureFormativeHtml, /回看课件/);
assert.doesNotMatch(blockedFutureFormativeHtml, /请先回看/);
assert.match(blockedFutureFormativeHtml, /本次形成性测验不提供后续课件入口/);

for (const chapter of route.chapters || []) {
  const units = routeUnits(chapter);
  const preUnit = {
    ...units.find((unit) => unit.id === `${chapter.id}-pre`),
    assessmentPhase: "pre"
  };
  const formativeUnit = {
    ...units.find((unit) => unit.id === `${chapter.id}-formative`),
    assessmentPhase: "formative"
  };
  const preQuestions = chapter.flow?.preQuiz?.questions || [];
  const formativeQuestions = chapter.flow?.formativeQuiz?.questions || [];

  preQuestions.forEach((question) => {
    const html = sandbox.renderQuestionTextWithLinks(question, preUnit);
    assert.doesNotMatch(html, /data-quiz-resource-link/);
    assert.doesNotMatch(html, /\[\[cq-unit:/);
    assert.doesNotMatch(html, /请先回看|回看课件/);
  });

  const markerRe = /\[\[cq-unit:([^|\]]+)\|[^|\]]*\|[^\]]+\]\]/g;
  formativeQuestions.forEach((question) => {
    const source = question.question || question.prompt || "";
    const targetIds = Array.from(source.matchAll(markerRe)).map((match) => match[1]);
    if (!targetIds.length) return;
    targetIds.forEach((targetId) => accessibleQuizResources.add(targetId));
    const html = sandbox.renderQuestionTextWithLinks(question, formativeUnit);
    targetIds.forEach((targetId) => {
      const allowed = sandbox.quizResourceAllowedForPhase(targetId, formativeUnit);
      if (allowed) {
        assert.match(html, new RegExp(`data-quiz-resource-link="${targetId}"`));
      } else {
        assert.doesNotMatch(html, new RegExp(`data-quiz-resource-link="${targetId}"`));
        assert.doesNotMatch(html, /请先回看(?=对应知识点)|回看课件/);
      }
    });
  });
}

sandbox.state.returnToQuiz = {
  unitId: "quiz-submitted",
  questionId: firstQuizQuestion.id,
  targetUnitId: "knowledge-target"
};
assert.match(
  sandbox.renderQuizReturnNotice({ id: "knowledge-target" }),
  /可按左上角“返回”键返回测验/
);
assert.equal(sandbox.renderQuizReturnNotice({ id: "knowledge-other" }), "");
assert.match(eventsSource, /targetUnitId:\s*targetUnit\?\.id\s*\|\|\s*targetUnitId/);
assert.match(eventsSource, /quizResourceTargetAccessible\(targetUnitId\)/);

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
