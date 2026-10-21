"use strict";

// Actions that open a support round. A representation switch belongs here: when a
// learner accepts "try this scene instead", that IS a support action, and leaving
// it out meant the acceptance never entered accepted_pending_response, never
// reached awaiting_independent_attempt, and so never produced a
// followup_outcome_json — the proximal outcome the micro-randomisation needs.
const LIFECYCLE_ACTIONS = new Set([
  "elicit_self_explanation",
  "concept_hint",
  "decompose_subgoal",
  "next_step_hint",
  "partial_worked_example",
  "switch_representation"
]);

// The escalation TARGET is keyed by support level, but the reason code must name
// the action that actually preceded it. A representation switch and a concept hint
// both sit at L2, so a level-keyed reason would label every L2 escalation
// "after_concept_hint" and corrupt any analysis of why support escalated.
const ESCALATION_REASON_BY_ACTION = Object.freeze({
  elicit_self_explanation: "continued_friction_after_self_explanation",
  concept_hint: "continued_friction_after_concept_hint",
  switch_representation: "continued_friction_after_representation_switch",
  decompose_subgoal: "continued_friction_after_subgoal_decomposition",
  next_step_hint: "continued_friction_after_next_step_hint",
  partial_worked_example: "continued_friction_after_partial_worked_example"
});

const ESCALATION_BY_LEVEL = Object.freeze({
  L1: Object.freeze({
    action: "concept_hint",
    supportLevel: "L2",
    reasonCode: "continued_friction_after_self_explanation"
  }),
  L2: Object.freeze({
    action: "decompose_subgoal",
    supportLevel: "L3",
    reasonCode: "continued_friction_after_concept_hint"
  }),
  L3: Object.freeze({
    action: "next_step_hint",
    supportLevel: "L4",
    reasonCode: "continued_friction_after_subgoal_decomposition"
  }),
  L4: Object.freeze({
    action: "partial_worked_example",
    supportLevel: "L5",
    reasonCode: "continued_friction_after_next_step_hint"
  })
});

function compact(value = "", limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalize(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  return {
    phase: compact(source.phase || "idle", 48),
    activeAction: compact(source.activeAction, 60),
    activeDecisionId: compact(source.activeDecisionId, 180),
    activeInterventionId: compact(source.activeInterventionId, 180),
    supportLevel: compact(source.supportLevel || "L0", 20),
    escalationCount: Math.max(0, Math.min(4, Math.trunc(Number(source.escalationCount || 0)))),
    // 表征轴与支架阶梯分开累计（见 afterResolution 的说明）。
    // normalize 是白名单，新字段必须在这里登记，否则会被静默丢掉。
    representationSwitchCount: Math.max(
      0,
      Math.min(100, Math.trunc(Number(source.representationSwitchCount || 0)))
    ),
    lastRepresentationTarget: compact(source.lastRepresentationTarget, 40),
    reasonCode: compact(source.reasonCode, 120),
    acceptedAt: compact(source.acceptedAt, 80),
    responseSubmittedAt: compact(source.responseSubmittedAt, 80),
    activeVerificationCheckId: compact(source.activeVerificationCheckId, 180),
    lastOutcome: compact(source.lastOutcome, 80),
    lastOutcomeAt: compact(source.lastOutcomeAt, 80),
    lastVerificationCheckId: compact(source.lastVerificationCheckId, 180),
    attemptCount: Math.max(
      0,
      Math.min(100, Math.trunc(Number(source.attemptCount || 0)))
    ),
    successEvidenceCount: Math.max(
      0,
      Math.min(100, Math.trunc(Number(source.successEvidenceCount || 0)))
    ),
    frictionEvidenceCount: Math.max(
      0,
      Math.min(100, Math.trunc(Number(source.frictionEvidenceCount || 0)))
    )
  };
}

function isLifecycleAction(action = "") {
  return LIFECYCLE_ACTIONS.has(String(action || ""));
}

function verificationStageForSupportLevel(supportLevel = "") {
  const match = /^L([1-5])$/.exec(
    String(supportLevel || "").trim().toUpperCase()
  );
  return match ? `after_l${match[1]}` : "";
}

function formativeOutcome({
  lifecycle = {},
  evidence = {}
} = {}) {
  const state = normalize(lifecycle);
  const incorrect = Math.max(0, Number(evidence.confirmedIncorrect || 0));
  const correct = Math.max(0, Number(evidence.confirmedCorrect || 0));
  const pendingReview = Math.max(0, Number(evidence.pendingReview || 0));
  const questionCount = Math.max(
    incorrect + correct,
    Number(evidence.questionCount || 0)
  );

  if (pendingReview > 0) {
    return {
      kind: "grading_incomplete",
      reasonCode: "grading_incomplete"
    };
  }

  if (state.phase === "accepted_pending_response") {
    return {
      kind: "accepted_response_pending",
      reasonCode: "accepted_response_pending"
    };
  }

  if (state.phase === "awaiting_independent_attempt") {
    return {
      kind: "independent_attempt_required",
      reasonCode: "independent_attempt_required"
    };
  }

  if (state.phase === "declined") {
    return {
      kind: "support_declined",
      reasonCode: "support_declined"
    };
  }

  if (
    state.phase === "exited"
    || state.phase === "closed"
    || state.phase === "maximum_support_reached"
  ) {
    return {
      kind: "lifecycle_closed",
      reasonCode: "lifecycle_closed"
    };
  }

  if (incorrect <= 0) {
    return {
      kind: "no_confirmed_error",
      reasonCode: "confirmed_error_absent"
    };
  }

  return {
    kind: "initial_confirmed_friction",
    reasonCode: "confirmed_formative_error",
    action: "elicit_self_explanation",
    supportLevel: "L1"
  };
}

function independentAttemptOutcome({
  lifecycle = {},
  currentLevel = "L0",
  fadeLevel = 0,
  maxEscalations = 4,
  evidence = {}
} = {}) {
  const state = normalize(lifecycle);
  if (state.phase !== "awaiting_independent_attempt") {
    return {
      kind: "independent_attempt_not_expected",
      reasonCode: "independent_attempt_not_expected"
    };
  }
  const probeMetadata = evidence.verificationSource === "policy_owned_probe" ? {
    instrumentVersion: compact(evidence.verificationInstrumentVersion, 120),
    evidenceScope: "post_support_local_check",
    subSkill: compact(evidence.verificationSubSkill, 120)
  } : evidence.verificationSource === "courseware_semantic_event" ? {
    evidenceScope: compact(evidence.verificationEvidenceScope, 120),
    subSkill: compact(evidence.verificationSubSkill, 120),
    matchingVersion: compact(evidence.verificationMatchingVersion, 120),
    matchReason: compact(evidence.verificationMatchReason, 120)
  } : {};
  if (evidence.independentAttemptDeclined === true) {
    const verificationCheckId = compact(evidence.verificationCheckId, 180);
    const followupOutcome = {
      ...probeMetadata,
      outcome: "verification_declined",
      checkId: verificationCheckId,
      source: compact(evidence.verificationSource, 80)
    };
    return {
      kind: "verification_declined",
      reasonCode: "verification_declined_without_escalation",
      followupOutcome,
      transition: {
        phase: "declined",
        currentLevel: String(currentLevel || state.supportLevel || "L0"),
        fadeLevel: Math.max(0, Number(fadeLevel || 0)),
        lifecycle: {
          ...state,
          phase: "declined",
          reasonCode: "verification_declined_without_escalation",
          lastOutcome: "verification_declined",
          lastVerificationCheckId: verificationCheckId
            || state.lastVerificationCheckId,
          activeAction: "",
          activeDecisionId: "",
          activeInterventionId: ""
        },
        followupOutcome
      }
    };
  }
  if (evidence.independentAttemptVerified !== true) {
    return {
      kind: "independent_attempt_unverified",
      reasonCode: "independent_attempt_not_verified"
    };
  }

  const verificationCheckId = compact(evidence.verificationCheckId, 180);
  if (
    verificationCheckId
    && state.lastVerificationCheckId === verificationCheckId
  ) {
    return {
      kind: "verification_replayed",
      reasonCode: "verification_check_already_submitted"
    };
  }

  const incorrect = Math.max(0, Number(evidence.confirmedIncorrect || 0));
  const correct = Math.max(0, Number(evidence.confirmedCorrect || 0));
  const questionCount = Math.max(
    incorrect + correct,
    Number(evidence.questionCount || 0)
  );
  const success = evidence.independentAttemptSuccess === true
    || (incorrect <= 0 && correct > 0);
  const followupOutcome = {
    ...probeMetadata,
    outcome: success ? "independent_attempt_success" : "continued_friction",
    correct,
    incorrect,
    questionCount,
    checkId: verificationCheckId,
    source: compact(evidence.verificationSource, 80),
    stage: compact(evidence.verificationStage, 80),
    eventType: compact(evidence.verificationEventType, 120)
  };

  if (success) {
    const nextFadeLevel = Math.max(0, Number(fadeLevel || 0)) + 1;
    const cooldownMs = 10 * 60 * 1000 * (1 + Math.min(5, nextFadeLevel));
    return {
      kind: "independent_attempt_success",
      reasonCode: "independent_attempt_success",
      followupOutcome,
      transition: {
        phase: "exited",
        currentLevel: "L0",
        fadeLevel: nextFadeLevel,
        cooldownMs,
        lifecycle: {
          ...state,
          phase: "exited",
          supportLevel: "L0",
          reasonCode: "independent_attempt_success",
          lastOutcome: "independent_attempt_success",
          lastVerificationCheckId: verificationCheckId
            || state.lastVerificationCheckId,
          attemptCount: state.attemptCount + 1,
          successEvidenceCount: state.successEvidenceCount + Math.max(1, correct),
          activeAction: "",
          activeDecisionId: "",
          activeInterventionId: ""
        },
        followupOutcome
      }
    };
  }

  if (incorrect <= 0) {
    return {
      kind: "independent_attempt_unverified",
      reasonCode: "independent_attempt_not_verified"
    };
  }

  const activeLevel = String(currentLevel || state.supportLevel || "L0")
    .toUpperCase();
  const escalation = state.escalationCount < maxEscalations ? ESCALATION_BY_LEVEL[activeLevel] || null : null;
  if (escalation) {
    const escalationReason = ESCALATION_REASON_BY_ACTION[compact(state.activeAction, 60)]
      || escalation.reasonCode;
    return {
      kind: "continued_friction",
      reasonCode: escalationReason,
      action: escalation.action,
      supportLevel: escalation.supportLevel,
      followupOutcome,
      transition: {
        phase: "awaiting_independent_attempt",
        currentLevel: activeLevel,
        fadeLevel: Math.max(0, Number(fadeLevel || 0)),
        lifecycle: {
          ...state,
          phase: "awaiting_independent_attempt",
          supportLevel: activeLevel,
          reasonCode: escalationReason,
          lastOutcome: "continued_friction",
          lastVerificationCheckId: verificationCheckId
            || state.lastVerificationCheckId,
          attemptCount: state.attemptCount + 1,
          frictionEvidenceCount: state.frictionEvidenceCount + Math.max(1, incorrect)
          ,escalationCount: state.escalationCount + 1
        },
        followupOutcome
      }
    };
  }

  const maximumOutcome = {
    ...followupOutcome,
    outcome: state.escalationCount >= maxEscalations ? "configured_escalation_limit" : "continued_friction_after_partial_worked_example"
  };
  return {
    kind: "maximum_support_reached",
    reasonCode: "maximum_support_reached",
    followupOutcome: maximumOutcome,
    transition: {
      phase: "maximum_support_reached",
      currentLevel: String(currentLevel || state.supportLevel || "L2"),
      fadeLevel: Math.max(0, Number(fadeLevel || 0)),
      lifecycle: {
        ...state,
        phase: "maximum_support_reached",
        reasonCode: "maximum_support_reached",
        lastOutcome: maximumOutcome.outcome,
        lastVerificationCheckId: verificationCheckId
          || state.lastVerificationCheckId,
        attemptCount: state.attemptCount + 1,
        frictionEvidenceCount: state.frictionEvidenceCount + Math.max(1, incorrect),
        activeAction: "",
        activeDecisionId: "",
        activeInterventionId: ""
      },
      followupOutcome: maximumOutcome
    }
  };
}

function afterResolution({
  lifecycle = {},
  decision = {},
  interventionId = "",
  resolution = "",
  resolvedAt = ""
} = {}) {
  const state = normalize(lifecycle);
  const action = compact(decision.action, 60);
  if (!isLifecycleAction(action)) return state;
  if (resolution === "accepted") {
    // 拆轴：支架阶梯（L1–L5）量的是"给多少解释性帮助"，换表征量的是"换成哪种活动
    // 类型"。两者是正交的——换表征**不增加解释性帮助**，它只是换了个看法。
    //
    // 所以接受一次换表征时，**不能**把 supportLevel 顶到 decision 上带的那个等级；
    // 否则日志里就分不清"给了 L2 的提示"和"换了个场景"，升级链的归因也全乱。
    // 换表征另行累计，支架等级保持原样，下一次摩擦照常从当前等级往上走。
    const isRepresentationSwitch = action === "switch_representation";
    const priorLevel = compact(state.supportLevel || "L0", 20);
    return {
      ...state,
      phase: "accepted_pending_response",
      activeAction: action,
      activeDecisionId: compact(decision.id, 180),
      activeInterventionId: compact(interventionId, 180),
      supportLevel: isRepresentationSwitch
        ? priorLevel
        : compact(decision.support_level || "L0", 20),
      escalationCount:["exited","closed","maximum_support_reached","declined"].includes(state.phase)?0:state.escalationCount,
      // 表征轴独立累计
      representationSwitchCount: Number(state.representationSwitchCount || 0)
        + (isRepresentationSwitch ? 1 : 0),
      lastRepresentationTarget: isRepresentationSwitch
        ? compact(decision.representation_choice?.targetTypeId
          || decision.representationChoice?.targetTypeId, 40)
        : compact(state.lastRepresentationTarget || "", 40),
      reasonCode: "accepted_pending_response",
      acceptedAt: compact(resolvedAt, 80),
      responseSubmittedAt: "",
      activeVerificationCheckId: "",
      lastOutcome: "",
      lastOutcomeAt: "",
      attemptCount: state.attemptCount,
      frictionEvidenceCount: state.frictionEvidenceCount
    };
  }
  if (resolution === "dismissed" || resolution === "ignored") {
    return {
      ...state,
      phase: "declined",
      activeAction: "",
      activeDecisionId: "",
      activeInterventionId: "",
      reasonCode: `${resolution}_without_escalation`,
      lastOutcome: resolution,
      lastOutcomeAt: compact(resolvedAt, 80)
    };
  }
  if (resolution === "snoozed") {
    return {
      ...state,
      phase: "deferred",
      activeAction: "",
      activeDecisionId: "",
      activeInterventionId: "",
      reasonCode: "student_snoozed_support",
      lastOutcome: "snoozed",
      lastOutcomeAt: compact(resolvedAt, 80)
    };
  }
  if (resolution === "alternative_requested") {
    return {
      ...state,
      phase: "declined",
      activeAction: "",
      activeDecisionId: "",
      activeInterventionId: "",
      reasonCode: "student_requested_alternative",
      lastOutcome: "alternative_requested",
      lastOutcomeAt: compact(resolvedAt, 80)
    };
  }
  return state;
}

function afterStudentResponse({
  lifecycle = {},
  interventionId = "",
  respondedAt = ""
} = {}) {
  const state = normalize(lifecycle);
  if (
    state.phase !== "accepted_pending_response"
    || !state.activeInterventionId
    || state.activeInterventionId !== compact(interventionId, 180)
  ) return state;
  return {
    ...state,
    phase: "awaiting_independent_attempt",
    reasonCode: "student_response_submitted",
    responseSubmittedAt: compact(respondedAt, 80),
    lastOutcome: "student_response_submitted",
    lastOutcomeAt: compact(respondedAt, 80)
  };
}

function closeUndeliveredAction({
  transition = {},
  deliveryReason = "delivery_suppressed"
} = {}) {
  const state = normalize(transition.lifecycle || {});
  const reason = compact(deliveryReason, 120) || "delivery_suppressed";
  const priorFollowup = transition.followupOutcome
    && typeof transition.followupOutcome === "object"
    && !Array.isArray(transition.followupOutcome)
    ? transition.followupOutcome
    : {};
  const followupOutcome = {
    ...priorFollowup,
    escalation: {
      outcome: "not_delivered",
      reasonCode: reason
    }
  };
  return {
    phase: "closed",
    currentLevel: "L0",
    fadeLevel: Math.max(0, Number(transition.fadeLevel || 0)),
    lifecycle: {
      ...state,
      phase: "closed",
      supportLevel: "L0",
      reasonCode: "support_escalation_not_delivered",
      lastOutcome: "support_escalation_not_delivered",
      activeAction: "",
      activeDecisionId: "",
      activeInterventionId: ""
    },
    followupOutcome
  };
}

module.exports = Object.freeze({
  normalize,
  isLifecycleAction,
  verificationStageForSupportLevel,
  formativeOutcome,
  independentAttemptOutcome,
  afterResolution,
  afterStudentResponse,
  closeUndeliveredAction
});
