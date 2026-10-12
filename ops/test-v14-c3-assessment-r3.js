const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const route = require("../data/multi-scene-learning-route.json");
const assessment = require("../lib/course-assessment");
const revision = require("../lib/assessments/v14-c3-r3");
const archive = JSON.parse(fs.readFileSync(path.join(__dirname,
  "../research/archive/V14-C3修订前题库-2026-09-09.json"), "utf8"));
const chapter = route.chapters.find((entry) => entry.id === "V14-C3");
const index = assessment.buildAssessmentIndex(route);
const oldQuestions = [
  ...archive.flow.preQuiz.questions, ...archive.flow.postQuiz.questions,
  ...archive.formative.flatMap((point) => point.formativeQuiz.questions)
];
const questions = [
  ...chapter.flow.preQuiz.questions, ...chapter.flow.postQuiz.questions,
  ...chapter.modules.flatMap((module) => module.knowledgePoints
    .flatMap((point) => point.formativeQuiz.questions))
];
assert.equal(questions.length, 34);
assert.equal(new Set(questions.map((question) => question.id)).size, 34);
assert.equal(chapter.assessmentRevision.version, revision.version);
assert.equal(chapter.assessmentRevision.empiricalEquivalence, "not-established");
for (const old of oldQuestions) {
  assert.equal(index.has(old.id), false, `旧题ID不可继续按新题意判分：${old.id}`);
  assert.ok(questions.some((question) => question.legacyQuestionId === old.id));
}
const expected = {
  pre: ["A", "B", "C", "D", "A", "B", "C", ["A", "C"], ["B", "D"]],
  post: ["D", "C", "A", "B", "D", "A", "B", ["B", "D"], ["A", "C"]]
};
for (const phase of ["pre", "post"]) {
  const quiz = chapter.flow[`${phase}Quiz`];
  assert.equal(quiz.questions.reduce((sum, question) => sum + question.points, 0), 100);
  assert.deepEqual(quiz.questions.map((question) => question.type),
    [...Array(7).fill("single"), "multiple", "multiple", "short_answer"]);
  for (const [i, key] of expected[phase].entries()) {
    const question = quiz.questions[i];
    assert.equal(assessment.scoreObjectiveQuestion(question, key).score, question.points);
    if (question.type === "multiple") {
      assert.equal(assessment.scoreObjectiveQuestion(question, key.slice(0, 1)).score, 0);
    }
  }
  const short = quiz.questions.at(-1);
  assert.equal(short.rubric.reduce((sum, criterion) => sum + criterion.points, 0), 20);
}
for (let i = 0; i < 10; i += 1) {
  const pre = chapter.flow.preQuiz.questions[i];
  const post = chapter.flow.postQuiz.questions[i];
  assert.deepEqual(pre.knowledgePointIds, post.knowledgePointIds);
  assert.deepEqual(pre.equivalence, post.equivalence);
  assert.equal(pre.points, post.points);
  assert.equal(pre.pairId, post.pairId);
}
for (const question of questions) {
  assert.equal(question.instrumentVersion, revision.version);
  if (question.type === "short_answer") continue;
  assert.equal(new Set(question.options.map((option) => option.label)).size, question.options.length);
  assert.ok(question.answer.every((value) => question.options.some((option) => option.value === value)));
  if (question.type === "single") assert.equal(question.answer.length, 1);
  const feedback = assessment.publicReviewFields(question);
  assert.equal(feedback.feedbackVersion, "v14-c3-feedback-r1");
  for (const option of question.options) {
    const expected = question.answer.includes(option.value) ? "应选" : "不应选";
    assert.ok(feedback.analysis.includes(`选项${option.value}（${expected}）`),
      `${question.id} 缺少选项${option.value}的解析`);
  }
}
assert.match(assessment.publicReviewFields(index.get("GH-07-K02-r3-check-q1").question).analysis,
  /充分条件.*不是.*必要条件/);
const repaired = index.get("GH-06-K03-r3-check-q1").question;
assert.match(repaired.options[0].label, /所有原函数都只能/);
assert.equal(assessment.scoreObjectiveQuestion(repaired, "A").isCorrect, false);
assert.equal(assessment.scoreObjectiveQuestion(repaired, "B").isCorrect, true);
assert.equal(12 - 4, 8);
assert.equal(15 - 6, 9);
assert.equal(9 - 2, 7);
assert.equal(11 - 3, 8);
assert.deepEqual([1 + 0 ** 2, 1 + 1 ** 2], [1, 2]);
assert.deepEqual([2 + 0 ** 2, 2 + 1 ** 2], [2, 3]);
const publicRoute = assessment.buildPublicLearningRoute(route);
const publicIndex = assessment.buildAssessmentIndex(publicRoute);
for (const question of questions) {
  const visible = publicIndex.get(question.id).question;
  for (const field of ["answer", "analysis", "rubric", "commentPrompt"]) {
    assert.equal(Object.hasOwn(visible, field), false, `公开题目不得泄露${field}`);
  }
}
const once = JSON.stringify(chapter);
revision.applyToChapter(chapter);
assert.equal(JSON.stringify(chapter), once, "修订生成器须幂等");
console.log("34道修订题通过：新旧ID隔离、10对蓝图、判分键、简答量规和答案防泄露；实测等值仍待预试。");
