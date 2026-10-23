"use strict";
const assert = require("node:assert/strict");
const { getStudy, listStudies, PARAMETERS } = require("../lib/research-sites/catalog");
const { decide, PROTECTED } = require("../lib/research-sites/policy");
const now = 1000000, scope = "GH-01-K01";
const initial = { id: "t0", scope, at: now - 10000, correct: false, independent: true, serverGraded: true };
const current = { ...initial, id: "t1", at: now - 1000, correct: false };
const context = { phase: "explore", visible: true, idleMs: 5000, boundary: true, scope, sessionId: "s1", returnSession: true };
let checked = 0;
for (const study of listStudies()) for (const arm of study.arms) {
  const base = { study, arm, evidence: { initial, current, historical: initial, candidateAt: now - 10000 }, context, now };
  assert.equal(decide(base).action, "inquire");
  for (const phase of PROTECTED) assert.equal(decide({ ...base, context: { ...context, phase } }).action, "silent");
  for (const patch of [{ typing: true }, { dragging: true }, { visible: false }, { busy: true }])
    assert.equal(decide({ ...base, context: { ...context, ...patch } }).action, "wait");
  assert.equal(decide({ ...base, authority: { declinedPoint: scope } }).action, "silent");
  assert.equal(decide({ ...base, authority: { withdrawn: true } }).action, "silent");
  assert.equal(decide({ ...base, evidence: { quietMs: 99999999, clicks: 0 } }).action, "silent");
  assert.equal(decide({ ...base, evidence: { initial: { ...initial, serverGraded: false } } }).action, "silent");
  assert.equal(decide({ ...base, evidence: { initial: { ...initial, at: now + 1 } } }).action, "silent");
  assert.equal(decide({ ...base, budget: { pointOffers: 2 } }).action, "silent");
  assert.equal(decide({ ...base, budget: { lastOfferAt: now - 1 } }).reason, "cooldown");
  assert.equal(decide({ ...base, evidence: { ...base.evidence, candidateAt: now - PARAMETERS.candidateTtlMs } }).action, "cancel");
  checked++;
}
for (const [id, previousArm, updatedArm] of [["recheck", "initial_snapshot", "delivery_recheck"], ["memory", "historical_candidate", "current_evidence"]]) {
  const base = { study: getStudy(id), evidence: { initial, current: { ...current, correct: true }, historical: initial }, context, now };
  assert.equal(decide({ ...base, arm: previousArm }).action, "inquire");
  assert.equal(decide({ ...base, arm: updatedArm }).action, "cancel");
}
const auth = { study: getStudy("authorization"), arm: "scoped_permission", evidence: { initial }, context, now };
const grant = { scope, sessionId: "s1", goal: "cognitive", expiresAt: now + 1000 };
assert.equal(decide({ ...auth, authority: { grant } }).action, "present");
for (const patch of [{ scope: "GH-01-K02" }, { sessionId: "s2" }, { goal: "emotion" }, { revoked: true }, { expiresAt: now }])
  assert.equal(decide({ ...auth, authority: { grant: { ...grant, ...patch } } }).action, "inquire");
assert.equal(decide({ ...auth, arm: "confirm_each", authority: { grant } }).action, "inquire");
const timing = { study: getStudy("timing"), evidence: { initial }, context: { ...context, boundary: false }, now };
assert.equal(decide({ ...timing, arm: "first_safe" }).action, "inquire");
assert.equal(decide({ ...timing, arm: "boundary_recheck" }).action, "wait");
assert.equal(listStudies().length, 9);
console.log(JSON.stringify({ passed: true, conditionProfiles: checked, checks: "protected phases, quiet-only, task evidence, budgets, timing, recheck, memory and scoped authorization" }));
