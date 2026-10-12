const assert = require("node:assert/strict");
const adapter = require("../lib/proactive-policy/adapters/v14-c3");
const functionsLimits = require("../lib/proactive-policy/adapters/functions-limits-r2");
const lifecycle = require("../lib/proactive-policy/lifecycle");

// --- V14-C1: the chapter used to be unverifiable from courseware at all -----
// Its branch names V14-C3 challenge ids, so every courseware result fell through
// to courseware_target_alignment_unverified and a post-support independent
// attempt could never be satisfied. The rule is now chapter-level: any scene that
// judged the learner can serve, provided the attempt was unassisted.
for (const knowledgePointId of Object.keys(functionsLimits.knowledgePoints)) {
  for (const supportLevel of ["L1", "L2", "L3", "L4", "L5"]) {
    const judged = functionsLimits.coursewareVerificationMatch({
      knowledgePointId, supportLevel,
      data: { independent: true, is_correct: true, evidence_scope: "courseware_task_result" }
    });
    assert.equal(judged.eligible, true, `${knowledgePointId}/${supportLevel} must accept a judged independent attempt`);
    assert.equal(judged.reasonCode, "courseware_independent_attempt_verified");
    assert.equal(judged.subSkill, "scene_judged_task");
    // A wrong answer is still usable evidence: the lifecycle needs failures too.
    assert.equal(functionsLimits.coursewareVerificationMatch({
      knowledgePointId, supportLevel, data: { independent: true, is_correct: false }
    }).eligible, true);
  }
}
// Games report independent:false by the chapter's own completion semantics, so
// they stay supporting behaviour rather than a mastery verdict.
assert.equal(functionsLimits.coursewareVerificationMatch({
  knowledgePointId: "GH-01-K02", supportLevel: "L2",
  data: { independent: false, is_correct: true, challenge_id: "showWin-1" }
}).reasonCode, "courseware_attempt_not_independent");
// A submission the scene could not judge cannot end or escalate support.
assert.equal(functionsLimits.coursewareVerificationMatch({
  knowledgePointId: "GH-01-K02", supportLevel: "L2", data: { independent: true }
}).reasonCode, "courseware_result_without_correctness");

// --- V14-C3: unchanged ------------------------------------------------------
for (const level of ["L1", "L2", "L3", "L4", "L5"]) {
  for (const data of [
    { challenge_id: "GH-07-K04-parts-level-1" },
    { evidence_scope: "factor_selection", challenge_id: "GH-07-K04-parts-level-5" }
  ]) {
    const result = adapter.coursewareVerificationMatch({ knowledgePointId: "GH-07-K04", supportLevel: level, data });
    assert.equal(result.eligible, ["L1", "L3"].includes(level));
    assert.equal(result.subSkill, "factor_choice");
    assert.equal(result.matchingVersion, "v14-c3-courseware-match-v3");
    if (!result.eligible) assert.equal(result.reasonCode, "factor_selection_insufficient_for_support_target");
  }
  for (const data of [
    { challenge_id: "GH-07-K01-strip-level-1-strip-1" },
    { evidence_scope: "motor_placement" }
  ]) {
    assert.equal(adapter.coursewareVerificationMatch({
      knowledgePointId: "GH-07-K01", supportLevel: level, data
    }).eligible, false);
  }
}
assert.equal(adapter.coursewareVerificationMatch({
  knowledgePointId: "GH-07-K03", supportLevel: "L1",
  data: { evidence_scope: "factor_selection" }
}).reasonCode, "courseware_evidence_unit_mismatch");
for (const knowledgePointId of Object.keys(adapter.knowledgePoints)) {
  for (const supportLevel of ["L1", "L2", "L3", "L4", "L5"]) {
    for (const data of [{}, { challenge_id: "unknown-game", evidence_scope: "concept_check" }]) {
      const result = adapter.coursewareVerificationMatch({ knowledgePointId, supportLevel, data });
      assert.equal(result.eligible, false, "未核对目标的成绩不能升级或结束支架");
      assert.equal(result.reasonCode, "courseware_target_alignment_unverified");
    }
  }
}

const outcome = lifecycle.independentAttemptOutcome({
  lifecycle: { phase: "awaiting_independent_attempt", supportLevel: "L1" },
  currentLevel: "L1",
  evidence: {
    independentAttemptVerified: true, independentAttemptSuccess: true, confirmedCorrect: 1,
    verificationSource: "courseware_semantic_event",
    verificationCheckId: "courseware-event:event-a",
    verificationEvidenceScope: "factor_selection",
    verificationSubSkill: "factor_choice",
    verificationMatchingVersion: "v14-c3-courseware-match-v1",
    verificationMatchReason: "factor_selection_matches_support_target"
  }
});
assert.equal(outcome.followupOutcome.evidenceScope, "factor_selection");
assert.equal(outcome.followupOutcome.subSkill, "factor_choice");
assert.equal(outcome.followupOutcome.matchingVersion, "v14-c3-courseware-match-v1");
assert.equal(outcome.transition.lifecycle.lastVerificationCheckId, "courseware-event:event-a");
const replay = lifecycle.independentAttemptOutcome({
  lifecycle: { phase: "awaiting_independent_attempt", lastVerificationCheckId: "courseware-event:event-a" },
  evidence: { independentAttemptVerified: true, verificationCheckId: "courseware-event:event-a" }
});
assert.equal(replay.kind, "verification_replayed");
console.log("课件证据匹配通过：V14-C1章节级独立尝试判定、V14-C3五层范围约束、跨知识点拒绝、匹配元数据与事件去重。");
