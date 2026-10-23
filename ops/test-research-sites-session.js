"use strict";
const assert = require("node:assert/strict");
const { getStudy, listStudies } = require("../lib/research-sites/catalog");
const m = require("../lib/research-sites/materials");
const { createSession, applyAction, publicView } = require("../lib/research-sites/session");
let runs = 0;
function run(id, armIndex, mode = "demo") {
  let now = 1000000;
  const study = getStudy(id), protocol = { id: id + "-test", study, fingerprint: "test-frozen-hash", consentVersion: "test-consent-1", mode,
    consent: "合成测试材料，不是实际审批", readiness: "test" };
  let s = createSession({ userId: "synthetic-user", protocol, mode, consent: { acknowledged: true, version: protocol.consentVersion, adult: true, eligible: true }, now });
  const events = [];
  const act = (action, payload = {}, advance = 1000) => {
    now += advance;
    const result = applyAction(s, protocol, { action, fingerprint: protocol.fingerprint, revision: s.revision, ...payload }, now, {
      allocate: () => ({ conditionIndex: armIndex, arm: study.arms[armIndex], algorithm: "synthetic-fixture" })
    });
    s = result.state; events.push(...result.events);
    const view = publicView(s, protocol, now);
    assert.equal(view.session.phase, s.phase);
    assert.equal(view.session.allocation, undefined); assert.equal(view.protocol.study?.arms, undefined);
    if (["pre", "post", "transfer", "retention", "t0", "t1", "outcome", "return_probe", "return_outcome"].includes(s.phase)) {
      assert.equal(view.session.offer, null); assert.equal(view.session.lesson, null); assert.equal(view.session.controls.canAsk, false);
      assert.deepEqual(view.session.conversation, []);
    }
    return result;
  };
  function submitQuiz() { act("quiz_submit", { responses: Object.fromEntries(m.publicQuiz(s.phase).items.map(q => [q.id, "__unknown__"])) }); }
  function probe(correct = false) {
    const phase = s.phase === "return_probe" ? "t0" : s.phase === "return_outcome" ? "outcome" : s.phase;
    const answer = ["0", "1", "2"].find(v => m.gradeProbe(s.index, phase, v).correct === correct);
    act("probe_submit", { probeId: m.publicProbe(s.index, phase).id, response: answer, confidence: 40 });
  }
  function opportunity() {
    act("context", { context: { visible: true, typing: false, dragging: false, idleMs: 5000 } }, 121000);
    if (s.activeOffer?.status === "inquiry") {
      act("offer_exposed", { opportunityId: s.activeOffer.id, visible: true, kind: "inquiry" });
      act("accept", { opportunityId: s.activeOffer.id, goal: "motivational", grant: id === "authorization" && armIndex === 1 });
      assert.equal(s.units[s.index].offers.at(-1).status, "support", "accepted content must survive serialized state");
    }
    if (s.activeOffer?.status === "support") {
      act("offer_exposed", { opportunityId: s.activeOffer.id, visible: true, kind: "support" });
      assert.ok(s.units[s.index].offers.at(-1).exposure);
    }
  }
  act("baseline_submit", { responses: id === "design-space" ? { teaching_experience: 3 } : { value: 3 } });
  if (id === "design-space") {
    assert.equal(s.phase, "case_coding");
    act("case_submit", { responses: [0, 1, 2, 3].map(caseId => ({ caseId, interpretation: "合成案例不能证明六维完备", dimensions: ["D1", "D2"] })) });
    act("design_submit", { response: "在独立证据后询问，尊重拒绝；观察操作不等于心理诊断。" });
    act("survey_submit", { responses: { clarity: 5 } });
    assert.equal(s.phase,"complete"); assert.deepEqual(s.quizzes, {}); runs++; return {s,protocol,now,events};
  }
  const stale = { action: "quiz_submit", fingerprint: protocol.fingerprint, revision: s.revision - 1, responses: {} };
  assert.throws(() => applyAction(s, protocol, stale, now), /页面已更新/);
  submitQuiz();
  for (let i = 0; i < 6; i++) {
    probe();
    opportunity();
    act("begin_t1"); probe(); opportunity();
    act("begin_outcome"); probe(); act("next_point");
  }
  if (id === "memory") {
    assert.equal(s.phase, "return_wait");
    assert.throws(() => act("begin_return", {}, 0), /尚未到/);
    now = s.returnDueAt;
    act("begin_return");
    for (let i = 0; i < 6; i++) {
      probe(true); opportunity();
      if (armIndex === 1) assert.equal(s.activeOffer, null, "new independent success should cancel historical help");
      act("begin_outcome"); probe(true); act("next_point");
    }
    assert.ok(events.some(e => e.type === "decision" && e.decision.reason === (armIndex ? "new_independent_evidence" : "confirm_possible_need")));
  }
  assert.equal(s.phase, "post"); submitQuiz(); submitQuiz(); act("survey_submit", { responses: { choice_accept: 6 } });
  if (id === "design-space") {
    act("case_submit", { responses: [0, 1, 2, 3].map(caseId => ({ caseId, interpretation: "无法从安静判断学生缺乏动机", dimensions: ["D1", "D2"] })) });
    act("design_submit", { response: "在学生完成独立判断后先询问，不用安静推断心理状态。" });
  }
  assert.equal(s.phase, "retention_wait"); now = Math.max(now, s.retentionDueAt); act("begin_retention"); submitQuiz();
  assert.equal(s.phase, "complete"); assert.equal(s.quizzes.retention.results.length, 18);
  assert.equal(s.quizzes.transfer.results.length, 12);
  assert.ok(events.some(e => e.type === "randomized"));
  runs++;
  return { s, protocol, now, events };
}
for (const study of listStudies()) for (let arm = 0; arm < 2; arm++) run(study.id, arm);
const formal = run("memory", 1, "formal");
assert.ok(formal.s.returnStartedAt - formal.s.returnDueAt >= 0);
const p = { id: "test", fingerprint: "f", study: getStudy("authorization"), consentVersion: "v" };
assert.throws(() => createSession({ userId: "a", protocol: p, mode: "formal", consent: { acknowledged: true }, now: 1 }), /参与条件/);
const state = createSession({ userId: "a", protocol: p, mode: "demo", consent: { acknowledged: true }, now: 1 });
const withdrawn = applyAction(state, p, { action: "withdraw", fingerprint: "f", revision: 0 }, 2).state;
assert.throws(() => applyAction(withdrawn, p, { action: "resume", fingerprint: "f", revision: 1 }, 3), /退出/);
console.log(JSON.stringify({ passed: true, fullConditionFlows: runs, stages: "baseline/pre/six units/post/transfer/survey/retention plus memory return and framework tasks" }));
