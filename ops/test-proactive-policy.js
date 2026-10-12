const assert = require("node:assert/strict");
const route = require("../data/multi-scene-learning-route.json");
const proactivePolicy = require("../lib/proactive-policy");
const fs = require("node:fs");
const path = require("node:path");

const pilotExample = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("PROACTIVE_") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);
const pilotConfig = proactivePolicy.configFromEnv(pilotExample);
assert.deepEqual(pilotConfig.experimentArms, ["control", "treatment_full"]);
assert.deepEqual(pilotConfig.displayArms, ["treatment_full"]);
assert.equal(pilotConfig.armProfiles.control.maxSupportLevel, "L0");
assert.equal(pilotConfig.armProfiles.treatment_full.maxSupportLevel, "L5");
assert.equal(pilotConfig.mode, "shadow");

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

const incompleteConsentConfig = config({
  PROACTIVE_POLICY_MODE: "active",
  PROACTIVE_PARTICIPATION_MODE: "explicit-consent",
  PROACTIVE_CONSENT_VERSION: "",
  PROACTIVE_CONSENT_NOTICE_URL: ""
});
assert.equal(incompleteConsentConfig.participationMode, "explicit-consent");
assert.equal(incompleteConsentConfig.participationReady, false);
assert.equal(incompleteConsentConfig.activationReady, false);

const explicitConsentConfig = config({
  PROACTIVE_POLICY_MODE: "active",
  PROACTIVE_PARTICIPATION_MODE: "explicit-consent",
  PROACTIVE_CONSENT_VERSION: "v14-c3-consent-v1",
  PROACTIVE_CONSENT_NOTICE_URL: "/research/v14-c3-consent-v1.html"
});
assert.equal(explicitConsentConfig.participationReady, true);
assert.equal(explicitConsentConfig.activationReady, true);
assert.equal(
  proactivePolicy.publicConfig(explicitConsentConfig).consentNoticeUrl,
  "/research/v14-c3-consent-v1.html"
);
const externalConsentConfig = config({
  PROACTIVE_PARTICIPATION_MODE: "explicit-consent",
  PROACTIVE_CONSENT_VERSION: "v14-c3-consent-v1",
  PROACTIVE_CONSENT_NOTICE_URL: "https://example.edu/research/v14-c3"
});
assert.equal(externalConsentConfig.participationReady, true);
const insecureConsentConfig = config({
  PROACTIVE_PARTICIPATION_MODE: "explicit-consent",
  PROACTIVE_CONSENT_VERSION: "v14-c3-consent-v1",
  PROACTIVE_CONSENT_NOTICE_URL: "http://example.edu/research/v14-c3"
});
assert.equal(insecureConsentConfig.participationReady, false);
assert.equal(insecureConsentConfig.consentNoticeUrl, "");

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
const supportLadder = [
  ["L1", "elicit_self_explanation"],
  ["L2", "concept_hint"],
  ["L3", "decompose_subgoal"],
  ["L4", "next_step_hint"],
  ["L5", "partial_worked_example"]
];
supportLadder.forEach(([supportLevel]) => {
  assert.equal(
    proactivePolicy.lifecycle.verificationStageForSupportLevel(supportLevel),
    `after_${supportLevel.toLowerCase()}`
  );
});
assert.equal(
  proactivePolicy.lifecycle.verificationStageForSupportLevel("L0"),
  "",
  "L0 表示不提供可见支架，不应生成支架后验证阶段"
);
Object.keys(chapterAdapter.knowledgePoints).forEach((knowledgePointId) => {
  supportLadder.forEach(([supportLevel, action]) => {
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
    const rendered = chapterAdapter.renderAction(action, {
      knowledgePointId,
      currentSceneType: "simulation",
      availableSceneTypes: [
        "simulation",
        "mindMap",
        "game",
        "visualization3d"
      ]
    });
    assert.equal(rendered.action, action);
    assert.ok(rendered.assistantPrompt);
    assert.equal(rendered.interactionMode, "student_reply");
  });
});
const representationAlternative = chapterAdapter.renderAction(
  "switch_representation",
  {
    knowledgePointId: "GH-06-K01",
    currentSceneType: "simulation",
    availableSceneTypes: [
      "simulation",
      "mindMap",
      "game",
      "visualization3d"
    ]
  }
);
assert.equal(representationAlternative.action, "switch_representation");
assert.equal(representationAlternative.interactionMode, "scene_switch");
assert.notEqual(representationAlternative.targetSceneType, "simulation");
assert.ok(representationAlternative.targetSceneLabel);
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
assert.equal(config().assignmentStrategy, "hash");

const balancedConfig = config({
  PROACTIVE_EXPERIMENT_ARMS: "control,minimal,adaptive",
  PROACTIVE_DISPLAY_ARMS: "minimal,adaptive",
  PROACTIVE_ASSIGNMENT_STRATEGY: "stratified-balanced",
  PROACTIVE_ASSIGNMENT_VERSION: ""
});
assert.equal(balancedConfig.assignmentStrategy, "stratified-balanced");
assert.equal(balancedConfig.assignmentVersion, "stratified-balanced-v1");
const balancedCounts = { control: 0, minimal: 0, adaptive: 0 };
for (let index = 0; index < 30; index += 1) {
  const assignment = proactivePolicy.createAssignment({
    userId: `balanced-student-${index}`,
    config: balancedConfig,
    stratum: "pre-low",
    assignmentCounts: balancedCounts
  });
  balancedCounts[assignment.condition] += 1;
}
assert.ok(
  Math.max(...Object.values(balancedCounts)) - Math.min(...Object.values(balancedCounts)) <= 1,
  `层内平衡分配的实验臂人数差不应超过 1：${JSON.stringify(balancedCounts)}`
);
const leastUsedArmAssignment = proactivePolicy.createAssignment({
  userId: "balanced-student-least-used",
  config: balancedConfig,
  stratum: "pre-high",
  assignmentCounts: { control: 4, minimal: 2, adaptive: 3 }
});
assert.equal(leastUsedArmAssignment.condition, "minimal");
assert.equal(
  proactivePolicy.publicConfig(balancedConfig).assignmentStrategy,
  "stratified-balanced"
);

const multiArmConfig = config({
  PROACTIVE_EXPERIMENT_ARMS: "control,minimal,adaptive",
  PROACTIVE_DISPLAY_ARMS: "minimal,adaptive",
  PROACTIVE_ARM_PROFILES_JSON: JSON.stringify({
    control: {
      display: false,
      maxSupportLevel: "L0",
      allowRepresentationSwitch: false
    },
    minimal: {
      display: true,
      maxSupportLevel: "L2",
      allowRepresentationSwitch: false
    },
    adaptive: {
      display: true,
      maxSupportLevel: "L5",
      allowRepresentationSwitch: true
    }
  })
});
assert.deepEqual(multiArmConfig.experimentArms, [
  "control",
  "minimal",
  "adaptive"
]);
assert.deepEqual(multiArmConfig.displayArms, ["minimal", "adaptive"]);
assert.equal(multiArmConfig.armProfiles.minimal.maxSupportLevel, "L2");
assert.equal(multiArmConfig.armProfiles.adaptive.allowRepresentationSwitch, true);
const multiArmAssignment = proactivePolicy.createAssignment({
  userId: "student-multi-arm",
  config: multiArmConfig,
  stratum: "pre-low"
});
assert.ok(multiArmConfig.experimentArms.includes(multiArmAssignment.condition));
assert.equal(proactivePolicy.publicConfig(multiArmConfig).armCount, 3);
assert.deepEqual(
  proactivePolicy.adminConfig(multiArmConfig).experimentArms,
  multiArmConfig.experimentArms
);
const invalidDisplayArmConfig = config({
  PROACTIVE_EXPERIMENT_ARMS: "control,treatment",
  PROACTIVE_DISPLAY_ARMS: "not a valid arm"
});
assert.deepEqual(
  invalidDisplayArmConfig.displayArms,
  ["treatment"],
  "无效展示臂配置必须回退到安全的默认展示臂，不能把 Control 变成展示臂"
);
assert.equal(invalidDisplayArmConfig.armProfiles.control.display, false);

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

const incompleteConsentDecision = proactivePolicy.evaluate({
  config: incompleteConsentConfig,
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  runtime: { participationStatus: "enrolled" },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(incompleteConsentDecision.deliveryDecision, "stay_silent");
assert.ok(
  incompleteConsentDecision.reasonCodes.includes(
    "participation_config_required"
  )
);

const notEnrolledDecision = proactivePolicy.evaluate({
  config: explicitConsentConfig,
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  runtime: { participationStatus: "not_enrolled" },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(notEnrolledDecision.deliveryDecision, "stay_silent");
assert.ok(
  notEnrolledDecision.reasonCodes.includes("participant_not_enrolled")
);

const withdrawnParticipantDecision = proactivePolicy.evaluate({
  config: explicitConsentConfig,
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  runtime: { participationStatus: "withdrawn" },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(withdrawnParticipantDecision.deliveryDecision, "stay_silent");
assert.ok(
  withdrawnParticipantDecision.reasonCodes.includes("participant_withdrawn")
);

const runtimePausedDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  budget: { remaining: 10 },
  runtime: { status: "paused" },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(runtimePausedDecision.decision, "stay_silent");
assert.equal(runtimePausedDecision.deliveryDecision, "stay_silent");
assert.ok(
  runtimePausedDecision.reasonCodes.includes("experiment_runtime_paused")
);

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
assert.equal(
  quietBoundaryDecision.supportLevel,
  "L1",
  "L0 必须严格表示静默，任何可见澄清动作至少是 L1"
);
assert.equal(quietBoundaryDecision.displayAllowed, true);
assert.ok(quietBoundaryDecision.reasonCodes.includes("natural_task_boundary"));

const fadedRepeatedDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: repeatedEvidence,
  policyState: { fade_level: 2 },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(fadedRepeatedDecision.decision, "stay_silent");
assert.ok(
  fadedRepeatedDecision.reasonCodes.includes("fade_evidence_threshold_raised"),
  "已经独立恢复过的学生，应需要更强行为证据才再次触发弱信号提示"
);
assert.equal(fadedRepeatedDecision.policyAdjustments.requiredParameterCommits, 5);

const fadedRepeatedConfirmed = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: baseContext,
  signal: repeatedSignal,
  evidence: {
    ...repeatedEvidence,
    parameterCommitCount: 5
  },
  policyState: { fade_level: 2 },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(fadedRepeatedConfirmed.decision, "intervene");
assert.ok(
  fadedRepeatedConfirmed.reasonCodes.includes("fade_evidence_requirement_met")
);

const fadedQuietDecision = proactivePolicy.evaluate({
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
  policyState: { fade_level: 2 },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:10:00.000Z")
});
assert.equal(fadedQuietDecision.decision, "stay_silent");
assert.ok(fadedQuietDecision.reasonCodes.includes("fade_threshold_raised"));

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

const snoozedFormativeCooldownDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: formativeContext,
  signal: { kind: "formative_outcome" },
  evidence: formativeWrongEvidence,
  policyState: {
    cooldown_until: "2026-08-27T12:30:00.000Z",
    lifecycle: { phase: "deferred" }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:20:00.000Z")
});
assert.equal(snoozedFormativeCooldownDecision.decision, "stay_silent");
assert.ok(
  snoozedFormativeCooldownDecision.reasonCodes.includes(
    "policy_cooldown_active"
  ),
  "学生选择稍后后，新的形成性结果也必须遵守冷却，不能立即再次弹出"
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
    // `independent_attempt_outcome` 的画像要求 history 族——它断言的是"支架后的
    // 独立尝试有了结果"，而 `independentAttemptVerified` 就是那一族证据。
    // 这里原来只写 ["task"]，靠已删除的 singleConfirmedResult 特例才通过；
    // 特例删除后这个不准确的声明就暴露出来了。
    families: ["task", "history"],
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
    families: ["task", "history"],
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
assert.ok(
  independentRecoveryDecision.stateTransition.cooldownMs >= 20 * 60 * 1000,
  "独立恢复后的渐退必须延长后续知识点冷却，而不只是把 fadeLevel 加一"
);
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
    families: ["task", "history"],
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

const subgoalDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task", "history"],
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
assert.equal(subgoalDecision.decision, "intervene");
assert.equal(subgoalDecision.action, "decompose_subgoal");
assert.equal(subgoalDecision.supportLevel, "L3");
assert.ok(
  subgoalDecision.reasonCodes.includes("continued_friction_after_concept_hint")
);

const nextStepDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task", "history"],
    independentAttemptVerified: true,
    independentAttemptSuccess: false,
    confirmedIncorrect: 1,
    questionCount: 1
  },
  policyState: {
    current_level: "L3",
    lifecycle: {
      phase: "awaiting_independent_attempt",
      activeAction: "decompose_subgoal",
      activeInterventionId: "intervention-l3",
      attemptCount: 2
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T12:50:00.000Z")
});
assert.equal(nextStepDecision.decision, "intervene");
assert.equal(nextStepDecision.action, "next_step_hint");
assert.equal(nextStepDecision.supportLevel, "L4");

const partialExampleDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task", "history"],
    independentAttemptVerified: true,
    independentAttemptSuccess: false,
    confirmedIncorrect: 1,
    questionCount: 1
  },
  policyState: {
    current_level: "L4",
    lifecycle: {
      phase: "awaiting_independent_attempt",
      activeAction: "next_step_hint",
      activeInterventionId: "intervention-l4",
      attemptCount: 3
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T13:00:00.000Z")
});
assert.equal(partialExampleDecision.decision, "intervene");
assert.equal(partialExampleDecision.action, "partial_worked_example");
assert.equal(partialExampleDecision.supportLevel, "L5");

const maximumSupportDecision = proactivePolicy.evaluate({
  config: config({ PROACTIVE_POLICY_MODE: "active" }),
  assignment: treatment,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task", "history"],
    independentAttemptVerified: true,
    independentAttemptSuccess: false,
    confirmedIncorrect: 1,
    questionCount: 1
  },
  policyState: {
    current_level: "L5",
    lifecycle: {
      phase: "awaiting_independent_attempt",
      activeAction: "partial_worked_example",
      activeInterventionId: "intervention-l5",
      attemptCount: 4
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T13:10:00.000Z")
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
  5
);
assert.equal(
  maximumSupportDecision.stateTransition.lifecycle.lastOutcome,
  "continued_friction_after_partial_worked_example"
);
assert.equal(maximumSupportDecision.helpNeedScore, 0.95);
assert.equal(maximumSupportDecision.uncertaintyScore, 0.05);

const minimalArm = { ...assignmentA, condition: "minimal" };
const minimalCeilingDecision = proactivePolicy.evaluate({
  config: {
    ...multiArmConfig,
    mode: "active"
  },
  assignment: minimalArm,
  context: independentContext,
  signal: { kind: "independent_attempt_outcome" },
  evidence: {
    families: ["task", "history"],
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
      activeInterventionId: "minimal-intervention-l2"
    }
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T13:15:00.000Z")
});
assert.equal(minimalCeilingDecision.decision, "intervene");
assert.equal(minimalCeilingDecision.deliveryDecision, "stay_silent");
assert.ok(minimalCeilingDecision.reasonCodes.includes("arm_support_ceiling"));

const adaptiveArm = { ...assignmentA, condition: "adaptive" };
const representationDecision = proactivePolicy.evaluate({
  config: {
    ...multiArmConfig,
    mode: "active"
  },
  assignment: adaptiveArm,
  context: {
    ...independentContext,
    sceneType: "simulation"
  },
  signal: {
    kind: "student_requested_alternative",
    sourceDecisionId: "source-decision"
  },
  evidence: {
    families: ["history", "preference"],
    sourceDecisionId: "source-decision"
  },
  budget: { remaining: 10 },
  now: Date.parse("2026-08-27T13:20:00.000Z")
});
assert.equal(representationDecision.decision, "intervene");
assert.equal(representationDecision.action, "switch_representation");
assert.equal(representationDecision.supportLevel, "L2");
assert.ok(
  representationDecision.reasonCodes.includes("student_requested_alternative")
);

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
