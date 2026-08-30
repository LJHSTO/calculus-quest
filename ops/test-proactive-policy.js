const assert = require("node:assert/strict");
const route = require("../data/multi-scene-learning-route.json");
const proactivePolicy = require("../lib/proactive-policy");

function config(overrides = {}) {
  return proactivePolicy.configFromEnv({
    PROACTIVE_POLICY_MODE: "shadow",
    PROACTIVE_EXPERIMENT_ID: "test-v14-c3",
    PROACTIVE_EXPERIMENT_CHAPTER_ID: "V14-C3",
    PROACTIVE_ASSIGNMENT_VERSION: "test-hash-v1",
    PROACTIVE_ASSIGNMENT_SALT: "test-only-salt",
    PROACTIVE_PUBLIC_CHAPTER_ONLY: "true",
    ...overrides
  });
}

const sourceChapter = route.chapters.find((chapter) => chapter.id === "V14-C3");
const projected = proactivePolicy.projectRoute(route, config());
assert.equal(projected.chapters.length, 1);
assert.equal(projected.chapters[0].id, "V14-C3");
assert.deepEqual(
  projected.chapters[0],
  sourceChapter,
  "单章实验路由必须直接继承 v2 的 V14-C3 内容和题目，不能生成第二份副本"
);
assert.deepEqual(projected.totals, {
  ...route.totals,
  chapters: 1,
  mainChapters: 1,
  extensionChapters: 0,
  modules: 2,
  knowledgePoints: 7,
  quizzes: 9,
  interactionChoices: 28,
  importedPackages: 2
});

const chapterAdapter = proactivePolicy.adapterForChapter("V14-C3");
Object.keys(chapterAdapter.knowledgePoints).forEach((knowledgePointId) => {
  ["L1", "L2"].forEach((supportLevel) => {
    const check = chapterAdapter.publicVerificationCheck(
      knowledgePointId,
      supportLevel
    );
    assert.ok(check, `${knowledgePointId} ${supportLevel} 必须有无提示验证题`);
    assert.equal(check.supportLevel, supportLevel);
    assert.ok(check.prompt);
    assert.ok(check.options.length >= 3);
    assert.equal(
      Object.hasOwn(check, "answer"),
      false,
      "学生端验证题不得包含答案键"
    );
    const firstOption = check.options[0];
    const grade = chapterAdapter.gradeVerificationCheck({
      knowledgePointId,
      supportLevel,
      checkId: check.id,
      response: firstOption.value
    });
    assert.ok(grade);
    assert.equal(typeof grade.correct, "boolean");
  });
});
assert.equal(
  chapterAdapter.gradeVerificationCheck({
    knowledgePointId: "GH-06-K01",
    supportLevel: "L1",
    checkId: "forged-check",
    response: "b"
  }),
  null,
  "服务端必须拒绝伪造或过期的验证题 ID"
);

const assignmentA = proactivePolicy.createAssignment({
  userId: "student-a",
  config: config(),
  stratum: "pre-low",
  assignedAt: "2026-08-27T12:00:00.000Z"
});
const assignmentARepeat = proactivePolicy.createAssignment({
  userId: "student-a",
  config: config(),
  stratum: "pre-low",
  assignedAt: "2026-08-27T12:05:00.000Z"
});
assert.equal(assignmentA.condition, assignmentARepeat.condition);
assert.ok(["control", "treatment"].includes(assignmentA.condition));
assert.equal(assignmentA.assignment_version, "test-hash-v1");

const treatment = { ...assignmentA, condition: "treatment" };
const control = { ...assignmentA, condition: "control" };
const repeatedEvidence = {
  families: ["process", "task"],
  parameterCommitCount: 3,
  taskProgressSinceFirstCommit: 0
};
const baseContext = {
  chapterId: "V14-C3",
  unitId: "GH-06-K01",
  sceneType: "simulation",
  isQuiz: false,
  quizSubmitted: false
};
const repeatedSignal = { kind: "repeated_parameter" };

const shadowDecision = proactivePolicy.evaluate({
  config: config(),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(shadowDecision.decision, "intervene");
assert.equal(shadowDecision.action, "observe_change");
assert.equal(shadowDecision.supportLevel, "L1");
assert.equal(shadowDecision.deliveryDecision, "stay_silent");
assert.equal(shadowDecision.displayAllowed, false);
assert.ok(shadowDecision.reasonCodes.includes("shadow_mode_suppressed"));

const activeTreatmentDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(activeTreatmentDecision.deliveryDecision, "intervene");
assert.equal(activeTreatmentDecision.displayAllowed, true);

const activeControlDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: control,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(activeControlDecision.decision, "intervene");
assert.equal(activeControlDecision.deliveryDecision, "stay_silent");
assert.ok(activeControlDecision.reasonCodes.includes("control_condition_suppressed"));

const reducedBehaviorDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  policyState: { student_preference: "reduced" },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(reducedBehaviorDecision.decision, "stay_silent");
assert.ok(
  reducedBehaviorDecision.reasonCodes.includes("student_preference_reduced"),
  "少提醒模式应屏蔽低风险行为候选"
);

const disabledPreferenceDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  policyState: { student_preference: "off" },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(disabledPreferenceDecision.decision, "stay_silent");
assert.ok(disabledPreferenceDecision.reasonCodes.includes("student_preference_off"));

const pendingAssignmentDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: null,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(pendingAssignmentDecision.condition, "unassigned");
assert.equal(pendingAssignmentDecision.decision, "stay_silent");
assert.ok(
  pendingAssignmentDecision.reasonCodes.includes("experiment_assignment_pending")
);

const protectedDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: null,
  context: {
    chapterId: "V14-C3",
    unitId: "V14-C3-pre",
    sceneType: "",
    isQuiz: true,
    quizSubmitted: false
  },
  signal: { kind: "quiet_dwell" },
  evidence: { families: ["time"], dwellSeconds: 600 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(protectedDecision.decision, "stay_silent");
assert.ok(protectedDecision.reasonCodes.includes("protected_assessment_stage"));
assert.equal(
  protectedDecision.reasonCodes.includes("experiment_assignment_pending"),
  false,
  "受保护测量阶段应优先于未分组原因"
);

const submittedPretestDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: {
    chapterId: "V14-C3",
    unitId: "V14-C3-pre",
    sceneType: "",
    isQuiz: true,
    quizSubmitted: true,
    phase: "pre"
  },
  signal: { kind: "quiz_review" },
  evidence: {
    families: ["result"],
    confirmedIncorrect: 2,
    pendingReview: 0
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(submittedPretestDecision.decision, "stay_silent");
assert.ok(
  submittedPretestDecision.reasonCodes.includes("protected_assessment_stage"),
  "章前测即使已经提交，也必须保持为独立测量保护区"
);

const activeWithoutPrivateSalt = proactivePolicy.evaluate({
  config: config({
    PROACTIVE_POLICY_MODE: "active",
    PROACTIVE_ASSIGNMENT_SALT: ""
  }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(activeWithoutPrivateSalt.deliveryDecision, "stay_silent");
assert.ok(activeWithoutPrivateSalt.reasonCodes.includes("assignment_salt_required"));

const quietOnlyDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: { kind: "quiet_dwell" },
  evidence: { families: ["time"], dwellSeconds: 180 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(quietOnlyDecision.decision, "stay_silent");
assert.ok(quietOnlyDecision.reasonCodes.includes("help_need_below_threshold"));

const quietPendingDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: { kind: "quiet_dwell" },
  evidence: {
    families: ["time", "result"],
    dwellSeconds: 180,
    confirmedGapCount: 1,
    naturalBoundary: false
  },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(quietPendingDecision.decision, "stay_silent");
assert.ok(
  quietPendingDecision.reasonCodes.includes("quiet_dwell_waiting_for_boundary"),
  "确认 HelpNeed 后仍应等待自然任务边界，不能直接打断"
);

const quietBoundaryDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: { kind: "quiet_dwell", boundaryRecheck: true },
  evidence: {
    families: ["time", "result"],
    dwellSeconds: 180,
    confirmedGapCount: 1,
    naturalBoundary: true,
    pendingCandidateValid: true
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(quietBoundaryDecision.decision, "intervene");
assert.equal(quietBoundaryDecision.action, "ask_clarification");
assert.equal(quietBoundaryDecision.displayAllowed, true);
assert.ok(quietBoundaryDecision.reasonCodes.includes("natural_task_boundary"));

const quietBoundaryWithoutPending = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: { kind: "quiet_dwell", boundaryRecheck: true },
  evidence: {
    families: ["time", "result"],
    dwellSeconds: 180,
    confirmedGapCount: 1,
    naturalBoundary: true,
    pendingCandidateValid: false
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(quietBoundaryWithoutPending.decision, "stay_silent");
assert.ok(
  quietBoundaryWithoutPending.reasonCodes.includes("quiet_dwell_pending_absent")
);

const cooldownDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  policyState: { cooldown_until: "2026-08-27T12:20:00.000Z" },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(cooldownDecision.decision, "stay_silent");
assert.ok(cooldownDecision.reasonCodes.includes("policy_cooldown_active"));

const quizReviewDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: {
    chapterId: "V14-C3",
    unitId: "V14-C3-formative",
    sceneType: "",
    isQuiz: true,
    quizSubmitted: true
  },
  signal: { kind: "quiz_review" },
  evidence: {
    families: ["result"],
    confirmedIncorrect: 2,
    pendingReview: 0
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(quizReviewDecision.decision, "intervene");
assert.equal(quizReviewDecision.action, "review_mistake");
assert.equal(quizReviewDecision.displayAllowed, true);

const formativeContext = {
  chapterId: "V14-C3",
  unitId: "GH-06-K01-formative",
  knowledgePointId: "GH-06-K01",
  policyScopeKey: "GH-06-K01",
  sceneType: "",
  isQuiz: true,
  quizSubmitted: true,
  phase: "formative"
};
const formativeWrongEvidence = {
  families: ["result"],
  confirmedIncorrect: 1,
  confirmedCorrect: 1,
  pendingReview: 0,
  questionCount: 2
};
const initialFormativeDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: formativeContext,
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(initialFormativeDecision.decision, "intervene");
assert.equal(initialFormativeDecision.action, "elicit_self_explanation");
assert.equal(initialFormativeDecision.supportLevel, "L1");
assert.equal(initialFormativeDecision.displayAllowed, true);
assert.equal(
  initialFormativeDecision.lifecycleOutcome,
  "initial_confirmed_friction"
);
assert.ok(
  initialFormativeDecision.reasonCodes.includes("confirmed_formative_error")
);

const reducedFormativeDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: formativeContext,
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  policyState: { student_preference: "reduced" },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(reducedFormativeDecision.decision, "intervene");
assert.equal(
  reducedFormativeDecision.action,
  "elicit_self_explanation",
  "少提醒模式仍应允许形成性错误等强结果证据启动最小支架"
);

const initialFormativeCooldownDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: formativeContext,
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  policyState: {
    cooldown_until: "2026-08-27T12:30:00.000Z",
    lifecycle: { phase: "idle" }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(initialFormativeCooldownDecision.decision, "stay_silent");
assert.ok(
  initialFormativeCooldownDecision.reasonCodes.includes(
    "policy_cooldown_active"
  ),
  "尚未开启的形成性支架必须遵守当前知识点冷却"
);

const pendingSelfExplanationDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: formativeContext,
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  policyState: {
    current_level: "L1",
    lifecycle: {
      phase: "accepted_pending_response",
      activeAction: "elicit_self_explanation"
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(pendingSelfExplanationDecision.decision, "stay_silent");
assert.ok(
  pendingSelfExplanationDecision.reasonCodes.includes(
    "accepted_response_pending"
  )
);

const independentContext = {
  chapterId: "V14-C3",
  unitId: "GH-06-K01",
  knowledgePointId: "GH-06-K01",
  policyScopeKey: "GH-06-K01",
  sceneType: "simulation",
  isQuiz: false,
  quizSubmitted: false,
  phase: "lesson"
};
const awaitingIndependentState = {
  cooldown_until: "2026-08-27T12:30:00.000Z",
  current_level: "L1",
  lifecycle: {
    phase: "awaiting_independent_attempt",
    activeAction: "elicit_self_explanation",
    activeInterventionId: "intervention-l1"
  }
};

const staleFormativeReuseDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: formativeContext,
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  policyState: awaitingIndependentState,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(staleFormativeReuseDecision.decision, "stay_silent");
assert.ok(
  staleFormativeReuseDecision.reasonCodes.includes(
    "independent_attempt_required"
  ),
  "一次性形成测验的旧结果不能充当支架后的独立重测"
);

const acceptedPendingIndependentDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: [],
    independentAttemptVerified: false
  },
  policyState: {
    current_level: "L1",
    lifecycle: {
      phase: "accepted_pending_response",
      activeAction: "elicit_self_explanation",
      activeInterventionId: "intervention-l1"
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(acceptedPendingIndependentDecision.decision, "stay_silent");
assert.ok(
  acceptedPendingIndependentDecision.reasonCodes.includes(
    "independent_attempt_not_expected"
  ),
  "学生尚未实际回复时不得把课件事件解释为支架后的独立验证"
);

const unverifiedIndependentDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: [],
    independentAttemptVerified: false
  },
  policyState: awaitingIndependentState,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(unverifiedIndependentDecision.decision, "stay_silent");
assert.ok(
  unverifiedIndependentDecision.reasonCodes.includes(
    "independent_attempt_not_verified"
  ),
  "没有服务端事件证据时必须保持静默"
);
assert.equal(unverifiedIndependentDecision.helpNeedScore, 0);
assert.equal(unverifiedIndependentDecision.uncertaintyScore, 1);

const continuedFrictionDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task"],
    independentAttemptVerified: true,
    independentAttemptSuccess: false,
    confirmedIncorrect: 1,
    confirmedCorrect: 0,
    questionCount: 1
  },
  policyState: awaitingIndependentState,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(continuedFrictionDecision.decision, "intervene");
assert.equal(continuedFrictionDecision.action, "concept_hint");
assert.equal(continuedFrictionDecision.supportLevel, "L2");
assert.equal(
  continuedFrictionDecision.lifecycleOutcome,
  "continued_friction"
);
assert.ok(
  continuedFrictionDecision.reasonCodes.includes(
    "continued_friction_after_self_explanation"
  )
);
assert.equal(
  continuedFrictionDecision.stateTransition.lifecycle.attemptCount,
  1,
  "独立失败应计为一次独立尝试"
);

const independentRecoveryDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task"],
    independentAttemptVerified: true,
    independentAttemptSuccess: true,
    confirmedIncorrect: 0,
    confirmedCorrect: 1,
    questionCount: 1
  },
  policyState: awaitingIndependentState,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(independentRecoveryDecision.decision, "stay_silent");
assert.equal(
  independentRecoveryDecision.lifecycleOutcome,
  "independent_attempt_success"
);
assert.equal(independentRecoveryDecision.stateTransition.phase, "exited");
assert.equal(independentRecoveryDecision.stateTransition.currentLevel, "L0");
assert.equal(independentRecoveryDecision.stateTransition.fadeLevel, 1);
assert.equal(independentRecoveryDecision.helpNeedScore, 0.1);
assert.equal(independentRecoveryDecision.uncertaintyScore, 0.05);
assert.ok(
  independentRecoveryDecision.reasonCodes.includes(
    "independent_attempt_success"
  )
);

const declinedFormativeDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: formativeContext,
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  policyState: {
    current_level: "L0",
    lifecycle: {
      phase: "declined",
      lastOutcome: "dismissed"
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:40:00.000Z")
});
assert.equal(declinedFormativeDecision.decision, "stay_silent");
assert.ok(
  declinedFormativeDecision.reasonCodes.includes("support_declined"),
  "拒绝后不能在冷却结束时用同一份错题重新开启或升级支架"
);

const declinedIndependentDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task"],
    independentAttemptVerified: true,
    independentAttemptSuccess: false,
    confirmedIncorrect: 1,
    questionCount: 1
  },
  policyState: {
    current_level: "L0",
    lifecycle: {
      phase: "declined",
      lastOutcome: "dismissed"
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:40:00.000Z")
});
assert.equal(declinedIndependentDecision.decision, "stay_silent");
assert.ok(
  declinedIndependentDecision.reasonCodes.includes(
    "independent_attempt_not_expected"
  )
);

const maximumSupportDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task"],
    independentAttemptVerified: true,
    independentAttemptSuccess: false,
    confirmedIncorrect: 1,
    questionCount: 1
  },
  policyState: {
    current_level: "L2",
    lifecycle: {
      phase: "awaiting_independent_attempt",
      activeAction: "concept_hint",
      activeInterventionId: "intervention-l2",
      attemptCount: 1
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:40:00.000Z")
});
assert.equal(maximumSupportDecision.decision, "stay_silent");
assert.equal(
  maximumSupportDecision.lifecycleOutcome,
  "maximum_support_reached"
);
assert.equal(
  maximumSupportDecision.stateTransition.phase,
  "maximum_support_reached"
);
assert.equal(
  maximumSupportDecision.stateTransition.lifecycle.attemptCount,
  2
);
assert.equal(maximumSupportDecision.helpNeedScore, 0.95);
assert.equal(maximumSupportDecision.uncertaintyScore, 0.05);

const verificationDeclinedDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["history"],
    independentAttemptDeclined: true,
    verificationCheckId: "GH-06-K01-probe-l1-v1",
    verificationSource: "policy_owned_probe"
  },
  policyState: awaitingIndependentState,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:40:00.000Z")
});
assert.equal(verificationDeclinedDecision.decision, "stay_silent");
assert.equal(
  verificationDeclinedDecision.lifecycleOutcome,
  "verification_declined"
);
assert.equal(verificationDeclinedDecision.stateTransition.phase, "declined");
assert.ok(
  verificationDeclinedDecision.reasonCodes.includes(
    "verification_declined_without_escalation"
  )
);
assert.equal(verificationDeclinedDecision.helpNeedScore, 0);
assert.equal(verificationDeclinedDecision.uncertaintyScore, 0);

const closedUndeliveredEscalation = proactivePolicy.lifecycle.closeUndeliveredAction({
  transition: continuedFrictionDecision.stateTransition,
  deliveryReason: "intervention_budget_exhausted"
});
assert.equal(closedUndeliveredEscalation.phase, "closed");
assert.equal(closedUndeliveredEscalation.currentLevel, "L0");
assert.equal(
  closedUndeliveredEscalation.lifecycle.lastOutcome,
  "support_escalation_not_delivered"
);
assert.equal(
  closedUndeliveredEscalation.followupOutcome.escalation.reasonCode,
  "intervention_budget_exhausted"
);
assert.equal(
  closedUndeliveredEscalation.lifecycle.attemptCount,
  continuedFrictionDecision.stateTransition.lifecycle.attemptCount,
  "未交付升级仍应保留已经发生的独立失败证据"
);

const protectedPostOutcome = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: {
    ...formativeContext,
    unitId: "V14-C3-post",
    knowledgePointId: "",
    policyScopeKey: "V14-C3-post",
    phase: "post"
  },
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(protectedPostOutcome.decision, "stay_silent");
assert.ok(
  protectedPostOutcome.reasonCodes.includes("protected_assessment_stage")
);

const protectedTransferOutcome = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: {
    ...formativeContext,
    unitId: "GH-06-K01-transfer",
    phase: "transfer"
  },
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(protectedTransferOutcome.decision, "stay_silent");
assert.ok(
  protectedTransferOutcome.reasonCodes.includes("protected_assessment_stage")
);

const outsideChapter = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: { ...baseContext, chapterId: "V14-C2" },
  signal: repeatedSignal,
  evidence: repeatedEvidence
});
assert.equal(outsideChapter.managed, false);
assert.equal(outsideChapter.decision, "stay_silent");

console.log("proactive policy tests passed");
