"use strict";
const assert = require("node:assert/strict");
const { observation } = require("../lib/proactive-policy/design-space");
const empty = observation();
assert.equal(empty.d1.estimates.helpNeed, null);
assert.equal(empty.d1.facts.confirmedIncorrect, null);
assert.equal(empty.d2.action, "silent");
assert.equal(empty.d3.level, "L0");
const supplied = {
  decision: { displayAllowed: true, supportLevel: "L2", helpNeedScore: 0.74, interruptibilityScore: 0.8, uncertaintyScore: 0.1,
    reasonCodes: ["natural_task_boundary"], action: "conceptual_hint", learnerOptions: { canMuteScope: true } },
  evidence: { families: ["performance", "timing"], confirmedIncorrect: 2, naturalBoundary: true,
    evidenceRefs: [{ id: "event-1", sourceType: "quiz", answer: "PRIVATE", token: "PRIVATE", response: "PRIVATE" }], answer: "PRIVATE" },
  scopeKey: "GH-02-K02", decisionId: "decision-1"
};
const visible = observation(supplied);
assert.equal(visible.d2.action, "boundary");
assert.equal(visible.d3.level, "L2");
assert.equal(visible.d1.estimates.calibrated, false);
assert.ok(!JSON.stringify(visible).includes("PRIVATE"));
const suppressed = observation({ ...supplied, decision: { ...supplied.decision, displayAllowed: false } });
assert.equal(suppressed.d3.level, "L0");
assert.equal(suppressed.d3.proposedLevel, "L2");
assert.equal(suppressed.d2.action, "silent");
const waiting = observation({ decision: { reasonCodes: ["quiet_dwell_waiting_for_boundary"] } });
assert.equal(waiting.d2.action, "wait");
assert.deepEqual(supplied.evidence.evidenceRefs[0].answer, "PRIVATE");
console.log("六维公开投影通过：缺失值、策略与曝光分离、边界等待及答案隔离。");
