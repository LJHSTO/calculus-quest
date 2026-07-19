const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const presentation = require("../admin/presentation");

assert.equal(typeof presentation.publicCourseText, "function");
assert.equal(typeof presentation.feedbackContentHtml, "function");
assert.equal(typeof presentation.sceneTypeLabel, "function");
assert.equal(typeof presentation.knowledgeSceneLabel, "function");
assert.equal(typeof presentation.questionDisplayLabel, "function");
assert.equal(typeof presentation.questionInteractionLabel, "function");
assert.equal(typeof presentation.questionTypeLabel, "function");
assert.equal(typeof presentation.compareTableValues, "function");
assert.equal(typeof presentation.coachActionLabel, "function");
assert.equal(typeof presentation.plannerReasonsText, "function");

assert.equal(
  presentation.publicCourseText("V14-C1 GH-01-K01 输入、输出和函数规则"),
  "输入、输出和函数规则"
);
assert.equal(
  presentation.publicCourseText("GH-01 知识点：输入、输出和函数规则"),
  "知识点：输入、输出和函数规则"
);
assert.equal(presentation.publicCourseText("V14-C1", "未命名章节"), "未命名章节");
assert.equal(presentation.publicCourseText("V14-C1-post", "结业后测"), "结业后测");
assert.equal(presentation.publicCourseText("V14-X1 EXT-01-K01 微分方程", ""), "微分方程");
assert.equal(presentation.sceneTypeLabel("slide"), "讲解页");
assert.equal(presentation.sceneTypeLabel("simulation"), "动手调一调");
assert.equal(presentation.sceneTypeLabel("game"), "找错并改正");
assert.equal(
  presentation.knowledgeSceneLabel("GH-01-K01 输入、输出和函数规则", "game"),
  "输入、输出和函数规则 · 找错并改正"
);
assert.equal(
  presentation.knowledgeSceneLabel("输入、输出和函数规则", ""),
  "输入、输出和函数规则 · 历史记录未包含场景"
);
assert.equal(presentation.questionDisplayLabel("GH-01-PRE-Q3", "pre"), "前测第 3 题");
assert.equal(
  presentation.questionInteractionLabel({
    questionId: "GH-01-pre-q1",
    phase: "pre",
    order: 1,
    moduleTitle: "函数、坐标与图像读法入门",
    questionText: "输入 2 后，函数机器会输出什么？"
  }),
  "函数、坐标与图像读法入门 · 前测第 1 题「输入 2 后，函数机器会输出什么？」"
);
assert.doesNotMatch(
  presentation.questionInteractionLabel({
    questionId: "GH-01-pre-q1",
    phase: "pre",
    order: 1,
    moduleTitle: "GH-01 函数、坐标与图像读法入门"
  }),
  /GH-01/
);
assert.equal(presentation.questionTypeLabel("short_answer"), "简答题");
assert.equal(presentation.riskLevelLabel("high"), "高风险");
assert.equal(presentation.coachActionLabel("alternate_scene"), "换一种表征重学");
assert.equal(presentation.coachActionLabel("select_knowledge"), "自主勾选知识点");
assert.equal(presentation.coachActionLabel("review_knowledge"), "回看知识点");
assert.equal(presentation.coachActionLabel("unskip_knowledge"), "补学已跳过内容");
assert.equal(presentation.coachActionLabel("review_and_unskip_knowledge"), "回看并补学知识点");
assert.equal(presentation.coachActionLabel("unknown_internal_action"), "其他学习选择");
assert.equal(
  presentation.plannerReasonsText("same_concept_cluster;different_representation"),
  "属于同一知识簇、采用不同表征"
);
assert.equal(presentation.qaStatusLabel("pass"), "通过");
assert.ok(presentation.compareTableValues("10", "2", "asc") > 0);
assert.ok(presentation.compareTableValues("80%", "60%", "desc") < 0);
assert.ok(presentation.compareTableValues("2分 5秒", "45秒", "asc") > 0);
assert.ok(presentation.compareTableValues("2026-07-16 10:00", "2026-07-15 10:00", "desc") < 0);
assert.ok(presentation.compareTableValues("暂无", "1", "asc") > 0);

const shortContent = presentation.feedbackContentHtml("PPT乱码问题", (value) => value);
assert.equal(shortContent, '<p class="feedback-body">PPT乱码问题</p>');
assert.equal((shortContent.match(/PPT乱码问题/g) || []).length, 1);

const longText = "这是一条需要完整展示的较长反馈。".repeat(20);
const longContent = presentation.feedbackContentHtml(longText, (value) => value);
assert.equal((longContent.match(/这是一条需要完整展示的较长反馈。/g) || []).length, 20);
assert.doesNotMatch(longContent, /<summary>/);

const adminSource = fs.readFileSync(path.join(__dirname, "..", "admin", "admin.js"), "utf8");
assert.doesNotMatch(adminSource, /<td>\$\{d\.nickname\}<\/td>/);
assert.doesNotMatch(adminSource, /<td[^>]*>\$\{users\[i\]\}<\/td>/);
assert.doesNotMatch(adminSource, /<th>\$\{ch\}<\/th>/);

console.log("admin presentation tests passed");
