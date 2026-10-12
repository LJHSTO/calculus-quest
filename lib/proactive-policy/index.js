"use strict";

const crypto = require("crypto");
let v14C3 = null;
try {
  v14C3 = require("./adapters/v14-c3");
} catch {
  // V14-C3 is optional legacy
}
const functionsLimits = require("./adapters/functions-limits-r2");
const lifecycle = require("./lifecycle");
const proactivityPolicyModule = require("./proactivity");
const { EvidencePackage } = require("./evidence-package");
const { TimingGate, TIMING_ACTIONS } = require("./timing-gate");
const { SupportAction, SUPPORT_DEPTHS, SUPPORT_FUNCTIONS } = require("./support-action");
const { AuthorityContract, AUTHORITY_LEVELS, STUDENT_ACTIONS } = require("./authority-contract");
const { OpportunityLogger } = require("./opportunity-logger");

const MODES = new Set(["off", "shadow", "active"]);
const DEFAULT_EXPERIMENT_ARMS = Object.freeze(["control", "treatment"]);
const DEFAULT_DISPLAY_ARMS = Object.freeze(["treatment"]);
const SUPPORT_LEVELS = Object.freeze(["L0", "L1", "L2", "L3", "L4", "L5"]);
const CONTRACT_VERSION = "proactive-learning-contract-v1";
const DEFAULT_EXPERIMENT_ID = "functions-limits-proactive-pilot-20260915";
const DEFAULT_POLICY_VERSION = "functions-limits-r2";
const DEFAULT_ASSIGNMENT_VERSION = "student-hash-v1";
const DEFAULT_ASSIGNMENT_STRATEGY = "hash";
const ASSIGNMENT_STRATEGIES = new Set(["hash", "stratified-balanced"]);
const DEFAULT_PARTICIPATION_MODE = "implicit-pilot";
const PARTICIPATION_MODES = new Set(["implicit-pilot", "explicit-consent"]);
const DEFAULT_CONSENT_VERSION = "engineering-pilot-v1";
const DEFAULT_DECISION_TTL_MS = 15 * 60 * 1000;
const PROTECTED_ASSESSMENT_PHASES = new Set([
  "pre",
  "post",
  "transfer",
  "near_transfer",
  "far_transfer",
  "retention",
  "delayed",
  "delayed_retention"
]);
const adapters = new Map([[functionsLimits.chapterId, functionsLimits]]);
if (v14C3) adapters.set(v14C3.chapterId, v14C3);

function compact(value = "", limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function truthy(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizedArmList(value, fallback = []) {
  const normalize = (source) => Array.from(new Set(
    (Array.isArray(source) ? source : String(source || "").split(","))
      .map((item) => compact(item, 40).toLowerCase())
      .filter((item) => /^[a-z0-9][a-z0-9_-]{0,39}$/.test(item))
  )).slice(0, 12);
  const configured = value === undefined || value === null || value === ""
    ? []
    : normalize(value);
  return configured.length ? configured : normalize(fallback);
}

function parsedArmProfiles(value = "") {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function normalizedNoticeUrl(value = "") {
  const source = compact(value, 500);
  if (!source) return "";
  if (/^https:\/\//i.test(source)) return source;
  if (/^\/(?!\/)/.test(source)) return source;
  return "";
}

function normalizedSupportLevel(value = "", fallback = "L0") {
  const level = compact(value, 20).toUpperCase();
  return SUPPORT_LEVELS.includes(level) ? level : fallback;
}

function supportLevelRank(value = "L0") {
  return Math.max(0, SUPPORT_LEVELS.indexOf(normalizedSupportLevel(value)));
}

function adapterForChapter(chapterId = "") {
  return adapters.get(String(chapterId || "")) || null;
}

function configFromEnv(env = process.env) {
  const chapterId = compact(env.PROACTIVE_EXPERIMENT_CHAPTER_ID || functionsLimits.chapterId, 120);
  const adapter = adapterForChapter(chapterId);
  const requestedMode = compact(env.PROACTIVE_POLICY_MODE || "shadow", 20).toLowerCase();
  const mode = MODES.has(requestedMode) ? requestedMode : "off";
  const requestedAssignmentStrategy = compact(
    env.PROACTIVE_ASSIGNMENT_STRATEGY || DEFAULT_ASSIGNMENT_STRATEGY,
    40
  ).toLowerCase();
  const assignmentStrategy = ASSIGNMENT_STRATEGIES.has(requestedAssignmentStrategy)
    ? requestedAssignmentStrategy
    : DEFAULT_ASSIGNMENT_STRATEGY;
  const defaultAssignmentVersion = assignmentStrategy === "stratified-balanced"
    ? "stratified-balanced-v1"
    : DEFAULT_ASSIGNMENT_VERSION;
  const configuredAssignmentSalt = compact(env.PROACTIVE_ASSIGNMENT_SALT, 240);
  const requestedParticipationMode = compact(
    env.PROACTIVE_PARTICIPATION_MODE || DEFAULT_PARTICIPATION_MODE,
    40
  ).toLowerCase();
  const participationMode = PARTICIPATION_MODES.has(requestedParticipationMode)
    ? requestedParticipationMode
    : DEFAULT_PARTICIPATION_MODE;
  const consentVersion = compact(
    env.PROACTIVE_CONSENT_VERSION || (
      participationMode === "implicit-pilot"
        ? DEFAULT_CONSENT_VERSION
        : ""
    ),
    120
  );
  const consentNoticeUrl = normalizedNoticeUrl(
    env.PROACTIVE_CONSENT_NOTICE_URL
  );
  const participationReady = participationMode !== "explicit-consent"
    || Boolean(consentVersion && consentNoticeUrl);
  const experimentArms = normalizedArmList(
    env.PROACTIVE_EXPERIMENT_ARMS,
    DEFAULT_EXPERIMENT_ARMS
  );
  const requestedDisplayArms = normalizedArmList(
    env.PROACTIVE_DISPLAY_ARMS,
    experimentArms.includes("treatment")
      ? DEFAULT_DISPLAY_ARMS
      : experimentArms.filter((arm) => arm !== "control")
  ).filter((arm) => experimentArms.includes(arm));
  const configuredArmProfiles = parsedArmProfiles(
    env.PROACTIVE_ARM_PROFILES_JSON
  );
  const armProfiles = Object.freeze(Object.fromEntries(
    experimentArms.map((arm) => {
      const configured = configuredArmProfiles[arm]
        && typeof configuredArmProfiles[arm] === "object"
        && !Array.isArray(configuredArmProfiles[arm])
        ? configuredArmProfiles[arm]
        : {};
      const display = typeof configured.display === "boolean"
        ? configured.display
        : requestedDisplayArms.includes(arm);
      const maxSupportLevel = normalizedSupportLevel(
        configured.maxSupportLevel,
        display ? "L5" : "L0"
      );
      const allowRepresentationSwitch = typeof configured.allowRepresentationSwitch === "boolean"
        ? configured.allowRepresentationSwitch
        : display && supportLevelRank(maxSupportLevel) >= supportLevelRank("L2");
      return [arm, Object.freeze({
        display,
        maxSupportLevel,
        allowRepresentationSwitch
      })];
    })
  ));
  const displayArms = Object.freeze(
    experimentArms.filter((arm) => armProfiles[arm].display)
  );
  return Object.freeze({
    mode,
    experimentId: compact(
      env.PROACTIVE_EXPERIMENT_ID || DEFAULT_EXPERIMENT_ID,
      120
    ),
    chapterId,
    policyVersion: compact(
      env.PROACTIVE_POLICY_VERSION || DEFAULT_POLICY_VERSION,
      120
    ),
    contractVersion: compact(
      env.PROACTIVE_CONTRACT_VERSION || CONTRACT_VERSION,
      120
    ),
    adapterVersion: compact(
      env.PROACTIVE_ADAPTER_VERSION || adapter?.version || "unsupported-adapter",
      120
    ),
    assignmentVersion: compact(
      env.PROACTIVE_ASSIGNMENT_VERSION || defaultAssignmentVersion,
      120
    ),
    assignmentStrategy,
    assignmentSalt: configuredAssignmentSalt || compact(
      `${env.PROACTIVE_EXPERIMENT_ID || DEFAULT_EXPERIMENT_ID}:${env.PROACTIVE_ASSIGNMENT_VERSION || defaultAssignmentVersion}`,
      240
    ),
    assignmentSaltConfigured: Boolean(configuredAssignmentSalt),
    assignmentReady: Boolean(configuredAssignmentSalt),
    activationReady: mode !== "active"
      || (Boolean(configuredAssignmentSalt) && participationReady),
    cohort: compact(env.PROACTIVE_EXPERIMENT_COHORT || "pilot", 120),
    participationMode,
    participationReady,
    consentVersion,
    consentNoticeUrl,
    experimentArms: Object.freeze([...experimentArms]),
    displayArms,
    armProfiles,
    publicChapterOnly: truthy(env.PROACTIVE_PUBLIC_CHAPTER_ONLY, true),
    decisionTtlMs: Math.round(boundedNumber(
      env.PROACTIVE_DECISION_TTL_MS,
      DEFAULT_DECISION_TTL_MS,
      60 * 1000,
      24 * 60 * 60 * 1000
    )),
    thresholds: Object.freeze({
      helpNeed: boundedNumber(env.PROACTIVE_HELP_NEED_THRESHOLD, 0.7, 0, 1),
      interruptibility: boundedNumber(env.PROACTIVE_INTERRUPTIBILITY_THRESHOLD, 0.75, 0, 1),
      uncertainty: boundedNumber(env.PROACTIVE_UNCERTAINTY_THRESHOLD, 0.3, 0, 1)
    })
  });
}

function assignmentCondition({
  userId,
  experimentId,
  assignmentVersion,
  assignmentSalt,
  stratum = "unstratified",
  experimentArms = DEFAULT_EXPERIMENT_ARMS
} = {}) {
  const arms = normalizedArmList(experimentArms, DEFAULT_EXPERIMENT_ARMS);
  const digest = crypto
    .createHash("sha256")
    .update([
      compact(assignmentSalt, 240),
      compact(experimentId, 120),
      compact(assignmentVersion, 120),
      compact(stratum, 80),
      compact(userId, 180)
    ].join("\n"))
    .digest();
  return arms[digest.readUInt32BE(0) % arms.length];
}

function createAssignment({
  userId,
  config = configFromEnv(),
  stratum = "unstratified",
  assignmentCounts = {},
  assignedAt = new Date().toISOString()
} = {}) {
  const normalizedCounts = Object.fromEntries(
    config.experimentArms.map((arm) => [
      arm,
      Math.max(0, Math.trunc(Number(assignmentCounts?.[arm] || 0)))
    ])
  );
  const minimum = Math.min(...Object.values(normalizedCounts));
  const eligibleArms = config.assignmentStrategy === "stratified-balanced"
    ? config.experimentArms.filter((arm) => normalizedCounts[arm] === minimum)
    : config.experimentArms;
  const condition = assignmentCondition({
    userId,
    experimentId: config.experimentId,
    assignmentVersion: config.assignmentVersion,
    assignmentSalt: config.assignmentSalt,
    stratum,
    experimentArms: eligibleArms
  });
  return Object.freeze({
    user_id: compact(userId, 180),
    experiment_id: config.experimentId,
    condition,
    cohort: config.cohort,
    stratum: compact(stratum || "unstratified", 80),
    assignment_version: config.assignmentVersion,
    assigned_at: assignedAt
  });
}

function projectRoute(route = {}, config = configFromEnv()) {
  if (!config.publicChapterOnly) return route;
  const chapter = (route.chapters || []).find((item) => item.id === config.chapterId);
  if (!chapter) return { ...route, chapters: [], extensionIndex: [] };
  const modules = chapter.modules || [];
  const knowledgePoints = modules.flatMap((module) => module.knowledgePoints || []);
  const chapterQuizzes = ["preQuiz", "formativeQuiz", "postQuiz"]
    .filter((key) => Array.isArray(chapter.flow?.[key]?.questions)).length;
  const knowledgePointQuizzes = knowledgePoints
    .filter((point) => Array.isArray(point.formativeQuiz?.questions)).length;
  const quizzes = chapterQuizzes + knowledgePointQuizzes;
  const interactionChoices = knowledgePoints.reduce(
    (sum, point) => sum + (point.resourceCandidates || point.interactionTypes || []).length,
    0
  );
  return {
    ...route,
    displayName: `${chapter.title} · 主动学习试点`,
    chapters: [chapter],
    extensionIndex: [],
    totals: {
      ...(route.totals || {}),
      chapters: 1,
      mainChapters: chapter.extension ? 0 : 1,
      extensionChapters: chapter.extension ? 1 : 0,
      modules: modules.length,
      knowledgePoints: knowledgePoints.length,
      quizzes,
      interactionChoices,
      importedPackages: modules.length
    }
  };
}

function normalizedPolicyState(state = {}) {
  let lifecycleValue = state.lifecycle;
  if (!lifecycleValue || typeof lifecycleValue !== "object") {
    try {
      lifecycleValue = JSON.parse(state.lifecycle_json || "{}");
    } catch {
      lifecycleValue = {};
    }
  }
  return {
    dismissStreak: Math.max(0, Math.min(10, Math.trunc(Number(state.dismiss_streak ?? state.dismissStreak ?? 0)))),
    cooldownUntil: compact(state.cooldown_until || state.cooldownUntil, 80),
    currentLevel: compact(state.current_level || state.currentLevel || "L0", 20),
    fadeLevel: Math.max(0, Math.min(10, Math.trunc(Number(state.fade_level ?? state.fadeLevel ?? 0)))),
    studentPreference: compact(state.student_preference || state.studentPreference || "standard", 40),
    lastReasonCode: compact(state.last_reason_code || state.lastReasonCode, 120),
    pendingCandidateKind: compact(
      state.pending_candidate_kind || state.pendingCandidateKind,
      60
    ),
    pendingCandidateAt: compact(
      state.pending_candidate_at || state.pendingCandidateAt,
      80
    ),
    pendingCandidateExpiresAt: compact(
      state.pending_candidate_expires_at || state.pendingCandidateExpiresAt,
      80
    ),
    lifecycle: lifecycle.normalize(lifecycleValue)
  };
}

function normalizedAssessmentPhase(value = "") {
  return compact(value, 80)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function protectedAssessmentStage(context = {}) {
  if (!context.isQuiz) return false;
  const phase = normalizedAssessmentPhase(context.phase);
  return !context.quizSubmitted || PROTECTED_ASSESSMENT_PHASES.has(phase);
}

function silentResult(base, reasonCode, overrides = {}) {
  const reasonCodes = Array.from(new Set([
    ...(base.reasonCodes || []),
    reasonCode,
    ...(overrides.reasonCodes || [])
  ].filter(Boolean)));
  return Object.freeze({
    ...base,
    ...overrides,
    decision: "stay_silent",
    deliveryDecision: "stay_silent",
    displayAllowed: false,
    action: "stay_silent",
    supportLevel: "L0",
    presentation: "none",
    reasonCodes
  });
}

function lifecycleSilentScores(kind = "") {
  if (kind === "independent_attempt_success") {
    return {
      helpNeedScore: 0.1,
      interruptibilityScore: 1,
      uncertaintyScore: 0.05
    };
  }
  if (kind === "maximum_support_reached") {
    return {
      helpNeedScore: 0.95,
      interruptibilityScore: 1,
      uncertaintyScore: 0.05
    };
  }
  if (kind === "no_confirmed_error" || kind === "lifecycle_closed") {
    return {
      helpNeedScore: 0,
      interruptibilityScore: 1,
      uncertaintyScore: 0.05
    };
  }
  if (kind === "support_declined" || kind === "verification_declined") {
    return {
      helpNeedScore: 0,
      interruptibilityScore: 1,
      uncertaintyScore: 0
    };
  }
  return {
    helpNeedScore: 0,
    interruptibilityScore: 0,
    uncertaintyScore: 1
  };
}

function evaluate({
  config = configFromEnv(),
  assignment = {},
  context = {},
  signal = {},
  evidence = {},
  policyState = {},
  budget = {},
  runtime = {},
  now = Date.now()
} = {}) {
  const adapter = adapterForChapter(context.chapterId);
  const managed = Boolean(adapter && context.chapterId === config.chapterId);
  const state = normalizedPolicyState(policyState);
  const assignmentConditionValue = compact(
    assignment?.condition,
    40
  ).toLowerCase();
  const armProfile = config.experimentArms.includes(assignmentConditionValue)
    ? config.armProfiles[assignmentConditionValue]
    : null;
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + config.decisionTtlMs).toISOString();
  const evidenceFamilies = Array.from(new Set(
    (Array.isArray(evidence.families) ? evidence.families : [])
      .map((item) => compact(item, 40))
      .filter(Boolean)
  ));
  // 证据强度。原来 `families` 只是字符串集合，只有"有没有"，没有"多强"——于是
  // "有一点点过程证据"和"大量过程证据"无法区分，而且必须靠特例来绕过门槛。
  //
  // 现在每个族带一个 0–1 的强度。未提供强度时按"存在即 0.5"处理，所以调用方
  // 不必一次性全改，行为向后兼容。
  const FAMILY_DEFAULT_STRENGTH = 0.5;
  const providedStrength = evidence.familyStrength && typeof evidence.familyStrength === "object"
    ? evidence.familyStrength
    : {};
  const familyStrength = Object.fromEntries(evidenceFamilies.map((family) => {
    const raw = Number(providedStrength[family]);
    return [family, Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : FAMILY_DEFAULT_STRENGTH];
  }));
  const strengthOf = (family) => familyStrength[family] || 0;
  // 决策中途才被认定的证据族必须走这里，不能直接 `evidenceFamilies.push(...)`。
  // 强度表在下面几行就算好了，之后再 push 只会让族名出现在集合里、强度却还是 0，
  // 于是按强度判定的门槛照样拦住它——而且拦得毫无声息。
  // （实测踩过：independent_attempt_outcome 里补 "history" 用的就是这个后门，
  //  导致答错检查题后 L1→L2 的升级被永久卡死。）
  const ensureFamily = (family, strength = FAMILY_DEFAULT_STRENGTH) => {
    const name = compact(family, 40);
    if (!name) return;
    if (!evidenceFamilies.includes(name)) evidenceFamilies.push(name);
    familyStrength[name] = Math.max(
      strengthOf(name),
      Math.max(0, Math.min(1, Number(strength) || 0))
    );
  };
  const base = {
    managed,
    mode: config.mode,
    experimentId: config.experimentId,
    condition: armProfile ? assignmentConditionValue : "unassigned",
    chapterId: compact(context.chapterId, 120),
    unitId: compact(context.unitId, 180),
    knowledgePointId: compact(context.knowledgePointId, 180),
    scopeKey: compact(
      context.policyScopeKey || context.knowledgePointId || context.unitId,
      180
    ),
    sceneType: compact(context.sceneType, 80),
    candidateKind: compact(signal.kind, 60),
    policyVersion: config.policyVersion,
    contractVersion: config.contractVersion,
    adapterVersion: config.adapterVersion,
    helpNeedScore: 0,
    interruptibilityScore: 0,
    uncertaintyScore: 1,
    evidenceFamilies,
    reasonCodes: [],
    policyAdjustments: {
      fadeLevel: state.fadeLevel,
      requiredParameterCommits: 3 + Math.min(4, state.fadeLevel),
      effectiveHelpNeedThreshold: config.thresholds.helpNeed
    },
    createdAt,
    expiresAt
  };

  if (!managed) return silentResult(base, "chapter_not_managed");
  if (!adapter.supportsUnit(context.unitId, {
    isQuiz: context.isQuiz,
    knowledgePointId: context.knowledgePointId
  })) {
    return silentResult(base, "adapter_unit_unsupported");
  }
  if (protectedAssessmentStage(context)) {
    return silentResult(base, "protected_assessment_stage");
  }
  if (String(runtime.status || "").toLowerCase() === "paused") {
    return silentResult(base, "experiment_runtime_paused");
  }
  if (config.mode === "off") return silentResult(base, "policy_mode_off");
  if (!config.assignmentReady && config.mode === "active") {
    return silentResult(base, "assignment_salt_required");
  }
  if (!config.participationReady && config.mode === "active") {
    return silentResult(base, "participation_config_required");
  }
  const participationStatus = compact(
    runtime.participationStatus,
    40
  ).toLowerCase();
  if (participationStatus === "withdrawn") {
    return silentResult(base, "participant_withdrawn");
  }
  if (participationStatus && participationStatus !== "enrolled") {
    return silentResult(base, "participant_not_enrolled");
  }
  if (!armProfile) {
    return silentResult(base, "experiment_assignment_pending");
  }
  if (state.studentPreference === "off") {
    return silentResult(base, "student_preference_off");
  }
  if (
    state.studentPreference === "reduced"
    && ![
      "quiz_review",
      "formative_outcome",
      "independent_attempt_outcome"
    ].includes(signal.kind)
  ) {
    return silentResult(base, "student_preference_reduced");
  }
  const lifecycleOutcomeProbe = signal.kind === "independent_attempt_outcome"
    || signal.kind === "student_requested_alternative"
    || (
      signal.kind === "formative_outcome"
      && [
        "accepted_pending_response",
        "awaiting_independent_attempt"
      ].includes(state.lifecycle.phase)
    );
  const cooldownUntil = Date.parse(state.cooldownUntil || "");
  if (
    Number.isFinite(cooldownUntil)
    && cooldownUntil > now
    && !lifecycleOutcomeProbe
  ) {
    return silentResult(base, "policy_cooldown_active");
  }

  let profile = adapter.candidateProfile(signal.kind);
  if (!profile) return silentResult(base, "candidate_kind_unsupported");

  let helpNeedScore = profile.helpNeedScore;
  let interruptibilityScore = profile.interruptibilityScore;
  let uncertaintyScore = profile.uncertaintyScore;
  const reasonCodes = [];
  let lifecycleOutcome = "";
  let stateTransition = null;
  let followupOutcome = null;
  // The activity type the agent chose, when the decision is a representation
  // switch. Carried on the decision so it is logged, can be randomised in an MRT,
  // and can be joined to its proximal outcome afterwards.
  let representationChoice = null;

  if (signal.kind === "repeated_parameter") {
    const requiredParameterCommits = base.policyAdjustments.requiredParameterCommits;
    const parameterCommitCount = Number(evidence.parameterCommitCount || 0);
    if (parameterCommitCount < requiredParameterCommits) {
      return silentResult(
        base,
        state.fadeLevel > 0 && parameterCommitCount >= 3
          ? "fade_evidence_threshold_raised"
          : "repeated_parameter_not_verified"
      );
    }
    if (Number(evidence.taskProgressSinceFirstCommit || 0) > 0) {
      return silentResult(base, "progress_already_resumed");
    }
    reasonCodes.push("repeated_parameter_verified", "natural_parameter_boundary");
    if (state.fadeLevel > 0) {
      reasonCodes.push("fade_evidence_requirement_met");
    }
  } else if (signal.kind === "quiz_review") {
    if (Number(evidence.confirmedIncorrect || 0) <= 0) {
      return silentResult(base, "confirmed_error_absent");
    }
    if (Number(evidence.pendingReview || 0) > 0) {
      return silentResult(base, "grading_incomplete");
    }
    reasonCodes.push("confirmed_quiz_error", "quiz_submission_boundary");
  } else if (signal.kind === "quiet_dwell") {
    if (signal.boundaryRecheck === true && evidence.pendingCandidateValid !== true) {
      return silentResult({
        ...base,
        helpNeedScore,
        interruptibilityScore,
        uncertaintyScore,
        reasonCodes
      }, "quiet_dwell_pending_absent");
    }
    const confirmedGapCount = Number(evidence.confirmedGapCount || 0);
    // Struggle that shows up in the courseware rather than in a quiz. Without this
    // a learner could sit stuck in a scene for minutes and never be noticed: with
    // no confirmed quiz gap the need score stayed at the profile default of 0.45,
    // which is below the 0.70 gate, so no pending candidate was ever stored and the
    // boundary re-check had nothing to re-evaluate.
    const sceneAttemptFailures = Number(evidence.sceneAttemptFailures || 0);
    const parameterCommitCount = Number(evidence.parameterCommitCount || 0);
    const processStruggle = sceneAttemptFailures > 0 || parameterCommitCount >= 3;
    if (confirmedGapCount > 0 && evidenceFamilies.includes("result")) {
      helpNeedScore = 0.72;
      uncertaintyScore = 0.25;
      reasonCodes.push("quiet_dwell_with_confirmed_gap");
    } else if (processStruggle) {
      helpNeedScore = 0.72;
      uncertaintyScore = 0.28;
      reasonCodes.push(
        sceneAttemptFailures > 0
          ? "quiet_dwell_with_scene_failures"
          : "quiet_dwell_with_repeated_parameter"
      );
    } else {
      reasonCodes.push("quiet_dwell_time_only");
    }
    if (evidence.naturalBoundary === true) {
      interruptibilityScore = 0.8;
      reasonCodes.push("natural_task_boundary");
    } else if (
      (confirmedGapCount > 0 || processStruggle)
      && evidenceFamilies.includes("time")
    ) {
      // Defer to the next natural boundary instead of interrupting mid-task.
      return silentResult({
        ...base,
        helpNeedScore,
        interruptibilityScore,
        uncertaintyScore,
        reasonCodes
      }, signal.boundaryRecheck === true
        ? "quiet_dwell_boundary_not_verified"
        : "quiet_dwell_waiting_for_boundary");
    }
  } else if (signal.kind === "formative_outcome") {
    if (!context.isQuiz || normalizedAssessmentPhase(context.phase) !== "formative") {
      return silentResult(base, "formative_outcome_scope_invalid");
    }
    if (!context.knowledgePointId || !adapter.knowledgePoint(context.knowledgePointId)) {
      return silentResult(base, "formative_knowledge_point_absent");
    }
    const outcome = lifecycle.formativeOutcome({
      lifecycle: state.lifecycle,
      evidence
    });
    lifecycleOutcome = outcome.kind;
    stateTransition = outcome.transition || null;
    followupOutcome = outcome.followupOutcome || null;
    if (!outcome.action) {
      const outcomeScores = lifecycleSilentScores(outcome.kind);
      return silentResult({
        ...base,
        ...outcomeScores,
        lifecycleOutcome,
        stateTransition,
        followupOutcome,
        reasonCodes
      }, outcome.reasonCode);
    }
    profile = adapter.actionProfile(outcome.action);
    if (!profile) {
      return silentResult({
        ...base,
        lifecycleOutcome,
        stateTransition,
        followupOutcome
      }, "no_legal_action");
    }
    helpNeedScore = profile.helpNeedScore;
    interruptibilityScore = profile.interruptibilityScore;
    uncertaintyScore = profile.uncertaintyScore;
    reasonCodes.push(outcome.reasonCode);
  } else if (signal.kind === "independent_attempt_outcome") {
    if (!context.knowledgePointId || !adapter.knowledgePoint(context.knowledgePointId)) {
      return silentResult(base, "independent_attempt_scope_invalid");
    }
    const outcome = lifecycle.independentAttemptOutcome({
      lifecycle: state.lifecycle,
      currentLevel: state.currentLevel,
      fadeLevel: state.fadeLevel,
      evidence
    });
    if (evidence.independentAttemptVerified === true) {
      // 平台自有检查题被真实作答，就是最强的一种"历史"：学生刚在支架下尝试过。
      ensureFamily("history", 1);
    }
    lifecycleOutcome = outcome.kind;
    stateTransition = outcome.transition || null;
    followupOutcome = outcome.followupOutcome || null;
    if (!outcome.action) {
      const outcomeScores = lifecycleSilentScores(outcome.kind);
      return silentResult({
        ...base,
        ...outcomeScores,
        evidenceFamilies,
        lifecycleOutcome,
        stateTransition,
        followupOutcome,
        reasonCodes
      }, outcome.reasonCode);
    }
    profile = adapter.actionProfile(outcome.action);
    if (!profile) {
      return silentResult({
        ...base,
        evidenceFamilies,
        lifecycleOutcome,
        stateTransition,
        followupOutcome
      }, "no_legal_action");
    }
    helpNeedScore = profile.helpNeedScore;
    interruptibilityScore = profile.interruptibilityScore;
    uncertaintyScore = profile.uncertaintyScore;
    reasonCodes.push(outcome.reasonCode, "independent_task_boundary");
  } else if (signal.kind === "student_requested_alternative") {
    if (!context.knowledgePointId || !adapter.knowledgePoint(context.knowledgePointId)) {
      return silentResult(base, "representation_scope_invalid");
    }
    const sourceDecisionId = compact(signal.sourceDecisionId, 180);
    if (
      !sourceDecisionId
      || sourceDecisionId !== compact(evidence.sourceDecisionId, 180)
    ) {
      return silentResult(base, "representation_source_unverified");
    }
    reasonCodes.push(
      "student_requested_alternative",
      "student_choice_boundary"
    );
  } else if (signal.kind === "representation_switch") {
    // The agent, not the learner, decides that the current activity type is not
    // working. The candidate set and the target come from the server, which is the
    // only place that has the route; this branch decides whether acting is
    // justified right now.
    if (!context.knowledgePointId || !adapter.knowledgePoint(context.knowledgePointId)) {
      return silentResult(base, "representation_scope_invalid");
    }
    const choice = evidence.representationChoice;
    if (!choice || !Array.isArray(choice.candidates) || !choice.candidates.length) {
      return silentResult(base, "representation_candidates_absent");
    }
    if (!choice.targetTypeId) {
      return silentResult(base, "representation_target_absent");
    }
    // Check exhaustion first: it is the more fundamental reason, and it would
    // otherwise be masked by the "already in that activity" check below when the
    // fallback target happens to be the current scene.
    if (Array.isArray(choice.unseen) && choice.unseen.length === 0) {
      return silentResult(base, "all_representations_experienced");
    }
    // Suggesting the activity the learner is already in is not a switch.
    if (choice.targetTypeId === compact(context.sceneType, 40)) {
      return silentResult(base, "representation_target_is_current");
    }
    const sceneFailures = Number(evidence.sceneAttemptFailures || 0);
    const parameterCommitCount = Number(evidence.parameterCommitCount || 0);
    const representationGapCount = Number(evidence.confirmedGapCount || 0);
    if (sceneFailures > 0 || parameterCommitCount >= 3 || representationGapCount > 0) {
      helpNeedScore = 0.8;
      uncertaintyScore = 0.22;
      reasonCodes.push(
        sceneFailures > 0 ? "representation_switch_after_scene_failure"
          : parameterCommitCount >= 3 ? "representation_switch_after_repeated_parameter"
            : "representation_switch_after_confirmed_gap"
      );
    } else {
      reasonCodes.push("representation_switch_time_only");
    }
    // Record what was chosen and why, so the decision can be paired with its
    // proximal outcome and randomised in a micro-randomised trial.
    reasonCodes.push(
      "representation_target_unseen",
      `representation_target_${choice.targetTypeId}`,
      `representation_reason_${choice.targetReasonCode}`
    );
    representationChoice = {
      selectionId: compact(choice.selectionId, 200),
      targetTypeId: compact(choice.targetTypeId, 40),
      targetTitle: compact(choice.targetTitle, 200),
      reasonCode: compact(choice.targetReasonCode, 80),
      available: Array.isArray(choice.available) ? choice.available.slice(0, 12) : [],
      experienced: Array.isArray(choice.experienced) ? choice.experienced.slice(0, 12) : [],
      unseen: Array.isArray(choice.unseen) ? choice.unseen.slice(0, 12) : [],
      scores: (Array.isArray(choice.candidates) ? choice.candidates : [])
        .slice(0, 12)
        .map((option) => ({ typeId: compact(option.typeId, 40), score: Number(option.score) || 0 })),
      choiceVersion: compact(choice.choiceVersion, 60)
    };
  }

  // 证据族门槛改为按**强度**判定，而不是"在不在集合里"。
  //
  // 这里同时删掉了原来的 `singleConfirmedResult` 特例：
  //
  //     const singleConfirmedResult = evidenceFamilies.includes("result")
  //       && Number(evidence.confirmedIncorrect || evidence.confirmedGapCount || 0) > 0;
  //     if (missingFamilies.length && !singleConfirmedResult) { ... 静默 ... }
  //
  // 那个特例让"存在一个已确认的测验错误"绕过**所有** profile 的证据族要求。后果是：
  //   - `repeated_parameter`（要求 process+task）会在没有任何过程证据时触发——但它
  //     断言的是"学生在反复调参"，那必须由过程证据支撑；
  //   - `representation_switch`（要求 history+process）会在没有任何历史/过程证据时
  //     触发——一个错题并不说明"表征不匹配"；
  //   - `independent_attempt_outcome`（要求 history）同理。
  //
  // 需要 result 的 profile（quiz_review / formative_outcome）本来就只要求 result，
  // 所以删掉特例对它们是透明的。真正会变的是上面那三类「本来就不该触发」的情况。
  const FAMILY_MIN_STRENGTH = 0.4;
  const missingFamilies = profile.requiredEvidenceFamilies
    .filter((family) => strengthOf(family) < FAMILY_MIN_STRENGTH);
  if (missingFamilies.length) {
    return silentResult({
      ...base,
      helpNeedScore,
      interruptibilityScore,
      uncertaintyScore,
      reasonCodes
    }, "evidence_families_insufficient", {
      reasonCodes: missingFamilies.map((family) => `missing_${family}_evidence`)
    });
  }
  if (
    state.dismissStreak >= 2
    && !["quiz_review", "formative_outcome"].includes(signal.kind)
  ) {
    return silentResult({
      ...base,
      helpNeedScore,
      interruptibilityScore,
      uncertaintyScore,
      reasonCodes
    }, "repeated_rejection_guard");
  }
  const effectiveHelpNeedThreshold = signal.kind === "quiet_dwell"
    && state.fadeLevel > 0
    ? Math.min(1, config.thresholds.helpNeed + Math.min(0.24, state.fadeLevel * 0.08))
    : config.thresholds.helpNeed;
  base.policyAdjustments.effectiveHelpNeedThreshold = effectiveHelpNeedThreshold;
  if (helpNeedScore < effectiveHelpNeedThreshold) {
    return silentResult({
      ...base,
      helpNeedScore,
      interruptibilityScore,
      uncertaintyScore,
      reasonCodes
    }, signal.kind === "quiet_dwell" && state.fadeLevel > 0
      ? "fade_threshold_raised"
      : "help_need_below_threshold");
  }
  if (interruptibilityScore < config.thresholds.interruptibility) {
    return silentResult({
      ...base,
      helpNeedScore,
      interruptibilityScore,
      uncertaintyScore,
      reasonCodes
    }, "interruptibility_below_threshold");
  }
  if (uncertaintyScore > config.thresholds.uncertainty) {
    return silentResult({
      ...base,
      helpNeedScore,
      interruptibilityScore,
      uncertaintyScore,
      reasonCodes
    }, "uncertainty_above_threshold");
  }

  const conditionAllowsDisplay = armProfile.display === true;
  const modeAllowsDisplay = config.mode === "active";
  const budgetAllowsDisplay = Number(budget.remaining ?? 1) > 0;
  const supportCeilingAllowsDisplay = supportLevelRank(profile.supportLevel)
    <= supportLevelRank(armProfile.maxSupportLevel);
  const representationSwitchAllowed = profile.action !== "switch_representation"
    || armProfile.allowRepresentationSwitch === true;
  const displayAllowed = conditionAllowsDisplay
    && modeAllowsDisplay
    && budgetAllowsDisplay
    && supportCeilingAllowsDisplay
    && representationSwitchAllowed;
  if (!modeAllowsDisplay) reasonCodes.push("shadow_mode_suppressed");
  if (!conditionAllowsDisplay) {
    reasonCodes.push(
      assignmentConditionValue === "control"
        ? "control_condition_suppressed"
        : "experiment_arm_display_suppressed"
    );
  }
  if (!budgetAllowsDisplay) reasonCodes.push("intervention_budget_exhausted");
  if (!supportCeilingAllowsDisplay) reasonCodes.push("arm_support_ceiling");
  if (!representationSwitchAllowed) {
    reasonCodes.push("arm_representation_switch_disabled");
  }

  // 主动水平层。文献（arXiv:2212.10346）发现主动水平越高，专注度越好但信任与
  // 可用性越低。本文把它做成**策略**而不是固定条件：固定档恒为 Suggestion，
  // 自适应档由校准置信度决定该多主动——判断不准时只"告知"，不替学生做主。
  //
  // 这一层叠加在实验臂之上：臂决定"这个参与者是否启用主动帮助"，主动水平决定
  // "这一次帮到多主动"。
  const proactivity = proactivityPolicyModule.proactivityBehavior({
    policy: context.proactivityPolicy || "fixed",
    confidence: evidence.agentConfidence,
    needsHelp: helpNeedScore
  });
  const proactivityAllowsDisplay = proactivity.display === true;
  if (!proactivityAllowsDisplay) reasonCodes.push(proactivity.reasonCode);

  const finalDisplayAllowed = displayAllowed && proactivityAllowsDisplay;

  return Object.freeze({
    ...base,
    decision: "intervene",
    deliveryDecision: finalDisplayAllowed ? "intervene" : "stay_silent",
    displayAllowed: finalDisplayAllowed,
    action: profile.action,
    supportLevel: profile.supportLevel,
    presentation: proactivityAllowsDisplay ? proactivity.presentation : profile.presentation,
    // 本次决策点抽到的条件，随决策一起落库，便于事后核对分配与做依从性分析
    proactivityPolicy: proactivity.policy,
    proactivityLevel: proactivity.level,
    proactivityLabel: proactivity.label,
    proactivityAutoExecute: proactivity.autoExecute === true,
    proactivityIncludesContent: proactivity.includeContent === true,
    triggerTiming: context.triggerTiming || "agent",
    agentConfidence: Number.isFinite(Number(evidence.agentConfidence))
      ? Number(evidence.agentConfidence)
      : null,
    decisionSource: evidence.decisionSource || "rule",
    helpNeedScore,
    interruptibilityScore,
    uncertaintyScore,
    lifecycleOutcome,
    stateTransition,
    followupOutcome,
    representationChoice,
    learnerOptions: {
      canSnooze: true,
      canMuteScope: true,
      canRequestAlternative: profile.action !== "switch_representation"
        && armProfile.allowRepresentationSwitch === true
    },
    reasonCodes: Array.from(new Set([...reasonCodes, "policy_thresholds_met"]))
  });
}

function publicConfig(config = configFromEnv()) {
  return {
    mode: config.mode,
    experimentId: config.experimentId,
    chapterId: config.chapterId,
    policyVersion: config.policyVersion,
    contractVersion: config.contractVersion,
    adapterVersion: config.adapterVersion,
    assignmentVersion: config.assignmentVersion,
    assignmentStrategy: config.assignmentStrategy,
    cohort: config.cohort,
    participationMode: config.participationMode,
    participationReady: config.participationReady,
    consentVersion: config.consentVersion,
    consentNoticeUrl: config.consentNoticeUrl,
    publicChapterOnly: config.publicChapterOnly,
    assignmentReady: config.assignmentReady,
    activationReady: config.activationReady,
    armCount: config.experimentArms.length,
    displayArmCount: config.displayArms.length
  };
}

function adminConfig(config = configFromEnv()) {
  return {
    ...publicConfig(config),
    experimentArms: [...config.experimentArms],
    displayArms: [...config.displayArms],
    armProfiles: Object.fromEntries(
      config.experimentArms.map((arm) => [arm, { ...config.armProfiles[arm] }])
    ),
    thresholds: { ...config.thresholds }
  };
}

module.exports = Object.freeze({
  configFromEnv,
  createAssignment,
  assignmentCondition,
  projectRoute,
  evaluate,
  publicConfig,
  adminConfig,
  adapterForChapter,
  lifecycle,
  EvidencePackage,
  TimingGate,
  TIMING_ACTIONS,
  SupportAction,
  SUPPORT_DEPTHS,
  SUPPORT_FUNCTIONS,
  AuthorityContract,
  AUTHORITY_LEVELS,
  STUDENT_ACTIONS,
  OpportunityLogger,
  _internals: Object.freeze({
    normalizedPolicyState,
    protectedAssessmentStage
  })
});
