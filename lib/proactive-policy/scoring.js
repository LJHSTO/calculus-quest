"use strict";

// Proactive gate scoring — OFFLINE ANALYSIS ONLY.
//
// ⚠️ This module is deliberately NOT required by `lib/proactive-policy/index.js`.
// `evaluate()` keeps its shipped, frozen gate. Nothing here changes a live
// decision. These functions exist so that `ops/proactive-gate-sensitivity.js`
// can ask a counterfactual question of already-recorded decisions:
//
//   "If the acceptance threshold had been derived from asymmetric costs
//    (PRISM Eq. 3.1) instead of fixed at 0.75, what would have changed?"
//
// That question is answered offline and reported as a result. It is not applied
// to the running policy, because the running policy is part of a frozen
// protocol: changing it would invalidate the recorded policy version and every
// decision already attributed to it.
//
// Design rules
// ------------
// * Pure and total. Unknown or malformed input degrades to the conservative
//   branch; nothing throws.
// * Every number below is a DECLARED policy constant, not a fitted parameter.
//   The sensitivity report exists precisely so that a reader can see how much
//   the conclusion depends on them.
// * No number here was chosen to reproduce the shipped gate. Where the shipped
//   gate and this module disagree, the report says so instead of hiding it.

const clamp01 = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
};

const nonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

// ── Evidence-derived need ───────────────────────────────────────────────────
// Each term answers: "on its own, how much does this justify interrupting?"
// Saturation is the count at which the term is considered fully established.
const NEED_TERMS = Object.freeze([
  Object.freeze({ key: "confirmedIncorrect", weight: 0.35, saturation: 2 }),
  Object.freeze({ key: "confirmedGapCount", weight: 0.30, saturation: 1 }),
  Object.freeze({ key: "sceneAttemptFailures", weight: 0.20, saturation: 2 }),
  Object.freeze({ key: "parameterCommitCount", weight: 0.15, saturation: 3 })
]);

function helpNeed({ evidence = {} } = {}) {
  let score = 0;
  for (const { key, weight, saturation } of NEED_TERMS) {
    score += weight * clamp01(nonNegative(evidence[key]) / saturation);
  }
  return clamp01(score);
}

// ── Boundary-derived interruptibility ───────────────────────────────────────
// Ordered by how unambiguously the learner is at a stopping point. This is a
// property of the moment, not of the candidate, so the same candidate can score
// differently depending on whether a natural boundary was observed.
const BOUNDARY_SCORE = Object.freeze({
  naturalBoundary: 0.9,    // engine explicitly flagged a natural boundary
  studentInitiated: 0.85,  // the learner asked for something
  quizBoundary: 0.8,       // a quiz was just submitted
  taskBoundary: 0.8,       // an attempt or sub-task was just graded
  parameterBoundary: 0.7,  // parameters committed, no progress since
  agentInitiated: 0.6,     // agent judges the current activity is not working
  dwellOnly: 0.5,          // only elapsed time; nothing else confirmed
  unverified: 0.35         // default
});

const KIND_BOUNDARY = Object.freeze({
  quiz_review: "quizBoundary",
  formative_outcome: "taskBoundary",
  independent_attempt_outcome: "taskBoundary",
  repeated_parameter: "parameterBoundary",
  representation_switch: "agentInitiated",
  student_requested_alternative: "studentInitiated",
  quiet_dwell: "dwellOnly"
});

function interruptibility({ evidence = {}, signal = {} } = {}) {
  if (evidence.naturalBoundary === true) return BOUNDARY_SCORE.naturalBoundary;
  const key = KIND_BOUNDARY[String(signal.kind || signal.candidateKind || "")];
  return key ? BOUNDARY_SCORE[key] : BOUNDARY_SCORE.unverified;
}

// ── Evidence-coverage uncertainty ───────────────────────────────────────────
// 0 when every evidence family the action requires is present, 1 when none is.
// An action that declares no requirement is treated as maximally uncertain
// rather than maximally certain, so a missing declaration fails closed.
function uncertainty({ evidence = {}, evidenceFamilies = [], requiredFamilies = [] } = {}) {
  const required = Array.isArray(requiredFamilies) ? requiredFamilies.filter(Boolean) : [];
  if (!required.length) return 1;
  const have = new Set(
    Array.isArray(evidenceFamilies) && evidenceFamilies.length
      ? evidenceFamilies
      : (Array.isArray(evidence.families) ? evidence.families : [])
  );
  const covered = required.filter((family) => have.has(family)).length;
  return clamp01(1 - covered / required.length);
}

// ── Cost-derived acceptance threshold ───────────────────────────────────────
// tau(p_need) = C_FA / (C_FA + p_need * C_FN)
//
// Monotonically non-increasing in need: the surer we are that help is needed,
// the worse a moment we are willing to accept. At need = 0 the threshold is 1
// (stay silent unless acceptance is certain); at need = 1 it is C_FA/(C_FA+C_FN).
//
// DEFAULT_COST is the ratio this project would ship IF the gate were ever
// migrated. It is reported, not applied.
const DEFAULT_COST = Object.freeze({ falseAlarm: 3, falseNegative: 1 });
const COST_GRID = Object.freeze([1, 2, 3, 4, 5]);

function acceptanceThreshold(need, cost = DEFAULT_COST) {
  const falseAlarm = nonNegative(cost && cost.falseAlarm);
  const falseNegative = nonNegative(cost && cost.falseNegative);
  if (falseAlarm <= 0) return 0;
  const denominator = falseAlarm + clamp01(need) * falseNegative;
  if (!(denominator > 0)) return 1;
  return clamp01(falseAlarm / denominator);
}

// ── Slow-mode margin ────────────────────────────────────────────────────────
// True when a decision sits close enough to the boundary that a more expensive
// deliberation pass could plausibly change it.
function nearDecisionBoundary({ interruptibilityScore, threshold, margin = 0.1 } = {}) {
  const left = clamp01(interruptibilityScore);
  const right = clamp01(threshold);
  const width = Number.isFinite(Number(margin)) ? Math.max(0, Number(margin)) : 0;
  return Math.abs(left - right) <= width;
}

// ── Gate application ────────────────────────────────────────────────────────
// Reproduces the three-condition gate for one decision, under a chosen
// threshold policy. `legacy` uses the shipped fixed threshold; `cost` uses
// tau(need). Returns why it stayed silent, so the report can break flips down
// by cause rather than only counting them.
function applyGate({
  need,
  interruptibility: interruptibilityScore,
  uncertainty: uncertaintyScore,
  needFloor = 0.7,
  uncertaintyCeiling = 0.3,
  fixedThreshold = 0.75,
  mode = "legacy",
  cost = DEFAULT_COST
} = {}) {
  const needValue = clamp01(need);
  const interruptValue = clamp01(interruptibilityScore);
  const uncertaintyValue = clamp01(uncertaintyScore);
  const threshold = mode === "cost" ? acceptanceThreshold(needValue, cost) : clamp01(fixedThreshold);

  if (needValue < clamp01(needFloor)) {
    return Object.freeze({ intervene: false, threshold, reason: "help_need_below_threshold" });
  }
  if (interruptValue < threshold) {
    return Object.freeze({
      intervene: false,
      threshold,
      reason: mode === "cost" ? "interruptibility_below_cost_threshold" : "interruptibility_below_threshold"
    });
  }
  if (uncertaintyValue > clamp01(uncertaintyCeiling)) {
    return Object.freeze({ intervene: false, threshold, reason: "uncertainty_above_threshold" });
  }
  return Object.freeze({ intervene: true, threshold, reason: "policy_thresholds_met" });
}

module.exports = Object.freeze({
  helpNeed,
  interruptibility,
  uncertainty,
  acceptanceThreshold,
  nearDecisionBoundary,
  applyGate,
  NEED_TERMS,
  BOUNDARY_SCORE,
  KIND_BOUNDARY,
  DEFAULT_COST,
  COST_GRID
});
