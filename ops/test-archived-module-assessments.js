const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const assessment = require("../lib/course-assessment");
const { routeUnits } = require("../lib/kg-build");
const route = require("../data/multi-scene-learning-route.json");
const chapter = route.chapters.find((item) => item.id === "V14-C3");
const index = assessment.buildAssessmentIndex(route);
const entries = [...index.values()].filter((entry) => entry.chapterId === chapter.id);
const archived = entries.filter((entry) => entry.assessmentStatus === "archived");
assert.equal(archived.length, 22);
assert.equal(crypto.createHash("sha256").update(JSON.stringify(archived.map((entry) => entry.question))).digest("hex"),
  "4300a0d60125e6b4c5e2a187ddf9814694ce6539959a9231d7bed27f78e6102a",
  "历史题内容变动后必须重新审阅，不能复用旧的22题审校结论");
assert.deepEqual(chapter.modules.map((module) => ["preQuiz", "postQuiz"].map((key) =>
  module.flow[key].questions.reduce((sum, question) => sum + question.points, 0))), [[65, 105], [65, 110]]);
assert.equal(entries.length - archived.length, 34);
assert.ok(archived.every((entry) => /^GH-0[67]-(pre|post)$/.test(entry.unitId)));
const publicIndex = assessment.buildAssessmentIndex(assessment.buildPublicLearningRoute(route));
const units = routeUnits(chapter);
for (const entry of archived) {
  assert.equal(publicIndex.has(entry.question.id), false);
  assert.equal(units.some((unit) => unit.id === entry.unitId), false);
  assert.equal(assessment.assessmentEntry(index, { questionId: entry.question.id }), entry,
    "归档不能抹掉历史题面和原判分键");
  assert.deepEqual(assessment.authoritativeGradingQuestions(index, [{
    questionId: entry.question.id, unitId: entry.unitId, chapterId: entry.chapterId,
    response: "历史回答", status: "pending_review", isCorrect: -1
  }]), [], "有缺陷的旧量规不能继续驱动自动重评分");
}
assert.match(index.get("GH-06-pre-q5").question.analysis, /3600 个 0.1 秒/,
  "历史原文保留，不应原位改写题意");
const otherChapter = [...index.values()].find((entry) => entry.chapterId !== chapter.id
  && entry.question.type === "short_answer");
assert.equal(assessment.authoritativeGradingQuestions(index, [{
  questionId: otherChapter.question.id, response: "正常回答"
}]).length, 1, "不得影响其他章节的有效题目");
console.log("22道旧模块题隔离通过：导航不投递、公开不下发、历史可审计、自动重评不使用；34道当前题保留。");
