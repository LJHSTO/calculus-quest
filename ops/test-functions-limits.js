"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const bank = require("../lib/assessments/functions-limits-r2");
const adapter = require("../lib/proactive-policy/adapters/functions-limits-r2");
const assessment = require("../lib/course-assessment");
const outcomes = require("../lib/proactive-outcomes/functions-limits");
const policy = require("../lib/proactive-policy");
const route = require("../data/multi-scene-learning-route.json");
const chapter = route.chapters.find(c => c.id === "V14-C1");
assert.equal(policy.configFromEnv({}).chapterId, chapter.id);
assert.deepEqual(chapter.moduleIds, ["GH-01", "GH-02"]);
const points = chapter.modules.flatMap(m => m.knowledgePoints);
assert.deepEqual(points.map(p => p.id), bank.ids);
assert.equal(points.flatMap(p => p.resourceCandidates).length, 24);
for (const phase of ["pre", "post"]) {
  const questions = chapter.flow[`${phase}Quiz`].questions;
  assert.equal(questions.length, 12);
  assert.equal(questions.reduce((s, q) => s + q.points, 0), 100);
  assert.equal(questions.filter(q => q.type === "single").length, 8);
  assert.equal(questions.filter(q => q.type === "multiple").length, 2);
  assert.equal(questions.filter(q => q.type === "short_answer").length, 2);
  for (const q of questions) {
    assert.ok(bank.ids.includes(q.knowledgePointIds[0]));
    assert.doesNotMatch(q.question, /积分|导数|切线|刚才.*游戏/);
    if (q.type === "short_answer") {
      assert.ok(q.referenceAnswer && q.commentPrompt);
      continue;
    }
    assert.equal(q.options.filter(o => o.value === "__unknown__").length, 1);
    assert.deepEqual(q.options.map(o => o.value), ["A", "B", "C", "D", "__unknown__"]);
    assert.equal(new Set(q.options.map(o => o.label)).size, 5);
    assert.equal(q.instrumentVersion, bank.version);
    assert.equal(assessment.scoreObjectiveQuestion(q, "__unknown__").score, 0);
    assert.equal(assessment.scoreObjectiveQuestion(q, q.answer).score, q.points);
    assert.ok(q.answer.every(a => q.options.some(o => o.value === a)));
  }
}
const pre = chapter.flow.preQuiz.questions;
const post = chapter.flow.postQuiz.questions;
pre.forEach((q, i) => {
  assert.equal(q.type, post[i].type);
  assert.equal(q.points, post[i].points);
  assert.deepEqual(q.knowledgePointIds, post[i].knowledgePointIds);
  assert.notEqual(q.question, post[i].question);
});
let probes = 0;
for (const p of points) {
  assert.ok(adapter.supportsUnit(p.id));
  for (const [i, action] of ["elicit_self_explanation", "concept_hint", "decompose_subgoal",
    "next_step_hint", "partial_worked_example"].entries()) {
    const level = `L${i + 1}`;
    const rendered = adapter.renderAction(action, { knowledgePointId: p.id });
    assert.ok(rendered.assistantPrompt);
    assert.doesNotMatch(rendered.assistantPrompt, /积分|微分元|原函数/);
    const check = adapter.publicVerificationCheck(p.id, level);
    assert.ok(check);
    assert.deepEqual(check.options.map(o => o.value), ["A", "B", "C", "D", "__unknown__"]);
    assert.equal(check.answer, undefined);
    const grade = response => adapter.gradeVerificationCheck({
      knowledgePointId: p.id, supportLevel: level, checkId: check.id, response
    });
    assert.equal(grade("__unknown__").correct, false);
    assert.equal(check.options.filter(o => grade(o.value).correct).length, 1);
    assert.equal(grade("forged-option"), null);
    probes++;
  }
  assert.equal(adapter.coursewareVerificationMatch({
    knowledgePointId: p.id, supportLevel: "L1", data: { is_correct: true }
  }).eligible, false, "未验证教学对齐的游戏操作不能代替独立概念验证");
  for (const candidate of p.resourceCandidates) {
    const filename = path.join(__dirname, "../resources", candidate.root, candidate.file);
    const html = fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, "");
    const contract = JSON.parse(html.match(/id="openmaic-semantic-contract"[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.equal(contract.chapter_id, chapter.id);
    assert.equal(contract.knowledge_point_id, p.id);
    assert.equal(contract.scene_type, candidate.type);
    assert.doesNotMatch(html, /\uFFFD/);
    if (candidate.type === "game") {
      assert.match(html, /OpenMaicLearningEvidence\?\.recordChallenge/);
      assert.match(html, /independent:\s*false/);
    }
    if (candidate.type === "visualization3d") {
      assert.match(html, /functions-limits-visible-container/);
    }
  }
}
const stage = outcomes.publicStage("retention");
assert.equal(stage.items.length, 18);
assert.equal(outcomes.forVersion("functions-limits-retention-r1").publicStage("retention").items.length, 6);
const expanded = require("../lib/assessments/functions-limits-retention-r3");
const correct = Object.fromEntries(expanded.items.map(q => [q.id, String.fromCharCode(65 + q.row[2])]));
assert.equal(outcomes.grade("retention", correct).score, 18);
assert.equal(outcomes.grade("retention", { ...correct, [stage.items[0].id]: "__unknown__" }).score, 17);
for (const id of bank.ids) assert.equal(stage.items.filter(q => q.knowledgePointId === id).length, 3);
assert.equal(new Set(stage.items.map(q => q.id)).size, 18);
assert.equal(new Set(stage.items.map(q => q.question)).size, 18);
assert.ok(stage.items.every(q => q.answer === undefined && q.options.at(-1).value === "__unknown__"));
for (const q of stage.items) assert.deepEqual(q.options.map(o => o.value), ["A", "B", "C", "D", "__unknown__"]);
for (const p of points) for (const q of p.formativeQuiz.questions) {
  if (q.type !== "short_answer") assert.deepEqual(q.options.map(o => o.value), ["A", "B", "C", "D", "__unknown__"]);
}
const archived = outcomes.forVersion("functions-limits-retention-r2");
assert.equal(archived.publicStage("retention").items[0].options.length, 4, "Historical three-choice instruments must remain unchanged");
assert.equal(outcomes.grade("retention", { [stage.items[0].id]: "A" }), null);
assert.equal(outcomes.forVersion("functions-limits-retention-r1").sanitizeResponses("retention", correct), null);
assert.equal(outcomes.grade("retention", Object.fromEntries(stage.items.map(q => [q.id, "__unknown__"]))).score, 0);
assert.equal(outcomes.sanitizeResponses("retention", { fake: "A" }), null);
const publicRoute = assessment.buildPublicLearningRoute(chapter);
const { scoreState } = require("../lib/research-analysis-export");
assert.equal(scoreState({ response: "__unknown__", question_type: "short_answer",
  score: 0, max_score: 10, is_correct: 0, status: "incorrect" }), "dont_know_scored");
assert.equal(scoreState({ response: '["__unknown__"]', question_type: "multiple",
  score: 0, max_score: 8, is_correct: 0, status: "incorrect" }), "dont_know_scored");
assert.equal(scoreState({ response: "__unknown__", score: 10, max_score: 10, is_correct: 1 }), "invalid_score");
assert.equal(publicRoute.flow.preQuiz.questions[0].answer, undefined);
assert.equal(publicRoute.flow.preQuiz.questions[0].analysis, undefined);
const short = pre.find(q => q.type === "short_answer");
assert.deepEqual(assessment.authoritativeGradingQuestions(assessment.buildAssessmentIndex(route), [{
  questionId: short.id, chapterId: chapter.id, unitId: `${chapter.id}-pre`, response: "__unknown__"
}]), []);

const handlers = {};
const choices = [{ name: "u-q", value: "A", checked: true }, { name: "u-q", value: "__unknown__", checked: true }];
let draft;
const sandbox = {
  document: {
    addEventListener: (type, handler) => { (handlers[type] ||= []).push(handler); },
    getElementsByName: () => choices,
    querySelectorAll: () => [],
    getElementById: () => ({ value: "原有草稿" })
  },
  window: { addEventListener() {} }, console, Map, Set,
  selectedChoiceValues: () => choices.filter(c => c.checked).map(c => c.value),
  getUnit: () => ({ scene: { content: { questions: [] } } }),
  analyticsTrack() {}, rememberQuizDraft: (u, q, value) => { draft = value; }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/main/events.js"), "utf8"), sandbox);
function change(choice) {
  choice.dataset = { unitId: "u", questionId: "q" };
  choice.type = "checkbox";
  const target = { closest: selector => selector === "[data-choice-answer]" ? choice : null };
  for (const handler of handlers.change) handler({ target });
}
change(choices[1]);
assert.equal(choices[0].checked, false);
assert.equal(JSON.stringify(draft), '["__unknown__"]');
choices[0].checked = true;
change(choices[0]);
assert.equal(choices[1].checked, false);
console.log(`函数与极限：24份课件合同、24道配对题、${probes}道验证题、18道保持题及旧版隔离、不会作答及互斥行为通过。`);
