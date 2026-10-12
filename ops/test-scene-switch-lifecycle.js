"use strict";
// B6c: a representation switch must be a real support round.
//
// `switch_representation` was missing from LIFECYCLE_ACTIONS, so when a learner
// accepted "try this scene instead" the lifecycle never moved: the acceptance did
// not enter accepted_pending_response, never reached awaiting_independent_attempt,
// and never wrote a followup_outcome_json. Without that record the
// micro-randomisation has no proximal outcome, i.e. "we suggested this scene —
// did the next independent attempt succeed?" cannot be answered at all.

const assert = require("node:assert/strict");
const lifecycle = require("../lib/proactive-policy/lifecycle");

const AT = "2026-09-21T12:00:00.000Z";

function accept(action, supportLevel = "L2") {
  return lifecycle.afterResolution({
    lifecycle: { phase: "none", supportLevel: "L0" },
    decision: { id: `decision-${action}`, action, support_level: supportLevel },
    interventionId: `intervention-${action}`,
    resolution: "accepted",
    resolvedAt: AT
  });
}

// --- 1. Accepting a representation switch opens a round ---------------------
assert.equal(
  lifecycle.isLifecycleAction("switch_representation"),
  true,
  "a representation switch must count as a lifecycle action"
);
const accepted = accept("switch_representation");
assert.equal(accepted.phase, "accepted_pending_response", "acceptance must open a support round");
assert.equal(accepted.activeAction, "switch_representation");
// 支架等级保持接受前的值（helper 里初始是 L0），而不是决策自带的 L2——
// 这正是"拆轴"要的行为，见下面 1b。
assert.equal(accepted.supportLevel, "L0");
assert.equal(accepted.activeInterventionId, "intervention-switch_representation");

// --- 1b. 拆轴：换表征不是支架阶梯上的一级 -----------------------------------
// 支架阶梯（L1–L5）量的是"给多少解释性帮助"；换表征量的是"换成哪种活动类型"。
// 两者正交——换表征不增加解释性帮助。所以接受换表征**不能**把 supportLevel 顶到
// 决策上带的那个等级，否则日志里分不清"给了 L2 提示"和"换了个场景"。
{
  const before = lifecycle.afterResolution({
    lifecycle: { phase: "none", supportLevel: "L1" },
    decision: {
      id: "decision-switch", action: "switch_representation", support_level: "L2",
      representation_choice: { targetTypeId: "mindMap" }
    },
    interventionId: "intervention-switch",
    resolution: "accepted",
    resolvedAt: AT
  });
  assert.equal(before.supportLevel, "L1",
    "接受换表征不应把支架等级顶到 L2 —— 它是横向移动，不是升级");
  assert.equal(before.representationSwitchCount, 1, "换表征应独立计数");
  assert.equal(before.lastRepresentationTarget, "mindMap", "应记下换到了哪个活动类型");

  // 普通支架仍然要更新等级，否则阶梯就失效了
  const scaffold = lifecycle.afterResolution({
    lifecycle: { phase: "none", supportLevel: "L1" },
    decision: { id: "decision-hint", action: "concept_hint", support_level: "L2" },
    interventionId: "intervention-hint",
    resolution: "accepted",
    resolvedAt: AT
  });
  assert.equal(scaffold.supportLevel, "L2", "接受普通支架应把等级更新为 L2");
  assert.equal(scaffold.representationSwitchCount, 0, "普通支架不应计入换表征次数");
  // 换表征计数必须能穿过 normalize（它是白名单，不登记就会被静默丢掉）
  assert.equal(lifecycle.normalize(before).representationSwitchCount, 1,
    "换表征计数必须能被 normalize 保留");
}

// --- 2. The learner responds; the round moves to the independent attempt ----
const awaiting = lifecycle.afterStudentResponse({
  lifecycle: accepted,
  interventionId: "intervention-switch_representation",
  respondedAt: AT
});
assert.equal(awaiting.phase, "awaiting_independent_attempt", "the round must require an independent attempt");
assert.equal(awaiting.activeAction, "switch_representation", "the action must survive into the attempt stage");

// --- 3. A verified independent attempt produces the proximal outcome --------
const success = lifecycle.independentAttemptOutcome({
  lifecycle: awaiting,
  currentLevel: "L2",
  evidence: {
    independentAttemptVerified: true,
    independentAttemptSuccess: true,
    confirmedCorrect: 1,
    verificationSource: "courseware_semantic_event",
    verificationCheckId: "courseware-event:scene-switch-1",
    verificationEvidenceScope: "courseware_task_result",
    verificationSubSkill: "scene_judged_task",
    verificationMatchingVersion: "v14-c3-courseware-match-v3",
    verificationMatchReason: "courseware_independent_attempt_verified"
  }
});
assert.ok(success.followupOutcome, "a verified attempt must write the proximal outcome");
assert.equal(success.kind, "independent_attempt_success");
assert.equal(success.followupOutcome.outcome, "independent_attempt_success");
assert.equal(success.followupOutcome.correct, 1);
assert.equal(success.followupOutcome.checkId, "courseware-event:scene-switch-1");
assert.equal(success.followupOutcome.evidenceScope, "courseware_task_result");
assert.equal(success.followupOutcome.matchingVersion, "v14-c3-courseware-match-v3");
assert.equal(success.transition.lifecycle.lastVerificationCheckId, "courseware-event:scene-switch-1");
// Success exits the round cleanly, clearing activeAction / activeDecisionId /
// activeInterventionId. Attribution therefore happens server-side at write time:
// server.js reads priorLifecycle.activeInterventionId BEFORE applying this
// transition and writes followup_outcome_json onto that intervention row, which
// carries the action. So what must survive here is the evidence identity.
assert.equal(success.followupOutcome.checkId, "courseware-event:scene-switch-1");
assert.equal(success.transition.phase, "exited");
assert.equal(success.transition.lifecycle.phase, "exited");
assert.equal(
  awaiting.activeInterventionId,
  "intervention-switch_representation",
  "the round must still name the accepted intervention when the attempt arrives"
);

// --- 4. Friction after a switch escalates, and the reason names the switch --
// Both a concept hint and a representation switch sit at L2. A level-keyed reason
// would call this "continued_friction_after_concept_hint", which is simply false
// and would corrupt any analysis of why support escalated.
const friction = lifecycle.independentAttemptOutcome({
  lifecycle: awaiting,
  currentLevel: "L2",
  evidence: {
    independentAttemptVerified: true,
    independentAttemptSuccess: false,
    confirmedIncorrect: 1,
    verificationCheckId: "courseware-event:scene-switch-2"
  }
});
assert.equal(friction.kind, "continued_friction");
assert.equal(friction.action, "decompose_subgoal", "L2 escalates to L3");
assert.equal(friction.supportLevel, "L3");
assert.equal(
  friction.reasonCode,
  "continued_friction_after_representation_switch",
  `escalation must name the real preceding action, got ${friction.reasonCode}`
);
assert.equal(friction.transition.lifecycle.reasonCode, "continued_friction_after_representation_switch");
assert.ok(friction.followupOutcome, "a failed attempt is still an outcome");

// --- 5. The existing actions keep their own reason codes --------------------
for (const [action, expected] of [
  ["elicit_self_explanation", "continued_friction_after_self_explanation"],
  ["concept_hint", "continued_friction_after_concept_hint"],
  ["decompose_subgoal", "continued_friction_after_subgoal_decomposition"],
  ["next_step_hint", "continued_friction_after_next_step_hint"]
]) {
  const level = { elicit_self_explanation: "L1", concept_hint: "L2", switch_representation: "L2",
    decompose_subgoal: "L3", next_step_hint: "L4", partial_worked_example: "L5" }[action];
  const round = lifecycle.afterStudentResponse({
    lifecycle: accept(action, level),
    interventionId: `intervention-${action}`,
    respondedAt: AT
  });
  const outcome = lifecycle.independentAttemptOutcome({
    lifecycle: round,
    currentLevel: level,
    evidence: { independentAttemptVerified: true, independentAttemptSuccess: false, confirmedIncorrect: 1 }
  });
  assert.equal(outcome.reasonCode, expected, `${action} must keep its own reason code`);
}

// L5 is the ceiling: friction there cannot escalate further, and it must say so
// rather than claim an escalation that did not happen.
const atCeiling = lifecycle.independentAttemptOutcome({
  lifecycle: lifecycle.afterStudentResponse({
    lifecycle: accept("partial_worked_example", "L5"),
    interventionId: "intervention-partial_worked_example",
    respondedAt: AT
  }),
  currentLevel: "L5",
  evidence: { independentAttemptVerified: true, independentAttemptSuccess: false, confirmedIncorrect: 1 }
});
assert.equal(atCeiling.reasonCode, "maximum_support_reached");

console.log("场景切换生命周期通过：接受后进入支架回合、独立尝试写入近端结果、升级理由码指向真实动作、其余动作理由码不变。");
