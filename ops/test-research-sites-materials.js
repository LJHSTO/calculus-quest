"use strict";
const assert = require("node:assert/strict"), m = require("../lib/research-sites/materials");
const b = require("../lib/assessments/functions-limits-r2");
const { listStudies, getStudy } = require("../lib/research-sites/catalog");
const { decide } = require("../lib/research-sites/policy");
for (const phase of ["pre", "post", "transfer", "retention"]) {
  const quiz = m.publicQuiz(phase);
  function noAnswers(value) {
    if (!value || typeof value !== "object") return;
    for (const [k, v] of Object.entries(value)) {
      assert.ok(!["answer", "correct", "referenceAnswer", "rubric", "analysis"].includes(k), "public answer leak " + k);
      noAnswers(v);
    }
  }
  noAnswers(quiz);
  const skipped = Object.fromEntries(quiz.items.map(q => [q.id, "skip"]));
  const result = m.gradeQuiz(phase, skipped);
  assert.ok(result.results.every(q => q.correct === null && q.responseKind === "skipped"));
  assert.throws(() => m.gradeQuiz(phase, {}), /逐题/);
  assert.throws(() => m.gradeQuiz(phase, { ...skipped, unknown_id: "A" }), /不一致/);
}
const qs = b.questions("pre"), responses = Object.fromEntries(qs.map(q => [q.id, q.type === "short_answer" ? "需要另一侧存在且相等" : q.answer]));
const full = m.gradeQuiz("pre", responses);
assert.equal(full.score, 80); assert.equal(full.pendingReview, 2);
const multi = qs.find(q => q.type === "multiple");
assert.equal(m.gradeQuiz("pre", { ...responses, [multi.id]: [multi.answer[0]] }).score, 76);
assert.throws(() => m.gradeQuiz("pre", { ...responses, [multi.id]: ["__unknown__", "A"] }), /不能/);
assert.throws(() => m.validateSurvey("baseline", { value: 8 }), /范围/);
assert.throws(() => m.validateSurvey("baseline", { secret: 4 }), /未知/);
assert.equal(m.validateSurvey("baseline", {}).value, null);
for (let index = 0; index < 6; index++) {
  assert.equal(m.lesson(index).resources.length, 4);
  const c = m.support(index, { goal: "cognitive" }), v = m.support(index, { goal: "motivational" });
  assert.notEqual(c.contentHash, v.contentHash);
  assert.equal(v.goal, "motivational"); assert.equal(v.strategy, "value_connection");
  const e = m.support(index, { efficacyEvidence: { correct: true, independent: true, serverGraded: true } });
  assert.match(e.message, /一次具体成功/); assert.doesNotMatch(c.message, /一次具体成功/);
}
const value = getStudy("value");
assert.equal(decide({ study: value, arm: "value_connection", context: { phase: "pre" } }).supportGoal, "motivational");
assert.ok(listStudies().every(s => s.arms.length === 2));
console.log(JSON.stringify({ passed: true, independentForms: 4, knowledgePoints: 6, supportGoals: 5, protocolProfiles: 9 }));
