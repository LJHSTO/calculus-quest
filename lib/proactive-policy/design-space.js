"use strict";

// Public, answer-free projection of one real policy evaluation. Never infer
// unseen student intent, fill missing scores, or substitute delivery for policy.
function finite(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value) : null;
}

function observation({ decision = {}, evidence = {}, signal = {}, scopeKey = "", decisionId = "" } = {}) {
  const reasons = Array.isArray(decision.reasonCodes) ? [...decision.reasonCodes] : [];
  const delivered = decision.displayAllowed === true;
  const waiting = reasons.includes("quiet_dwell_waiting_for_boundary");
  return {
    version: "education-design-space-v1", scopeKey, decisionId,
    at: decision.createdAt || new Date().toISOString(),
    source: "server-policy",
    d1: {
      facts: {
        candidateKind: signal.kind || "", families: [...(evidence.families || [])],
        parameterCommits: finite(evidence.parameterCommitCount),
        confirmedIncorrect: finite(evidence.confirmedIncorrect),
        confirmedCorrect: finite(evidence.confirmedCorrect),
        pendingReview: finite(evidence.pendingReview), dwellSeconds: finite(evidence.dwellSeconds),
        naturalBoundary: evidence.naturalBoundary === true,
        boundaryEvent: evidence.boundaryEventType || "",
        references: (evidence.evidenceRefs || []).slice(0, 40).map(row => ({
          id: String(row.id || ""), sourceType: String(row.sourceType || ""), capturedAt: row.capturedAt || ""
        }))
      },
      estimates: {
        helpNeed: finite(decision.helpNeedScore), interruptibility: finite(decision.interruptibilityScore),
        uncertainty: finite(decision.uncertaintyScore), calibrated: false
      }
    },
    d2: { action: waiting ? "wait" : delivered ? (evidence.naturalBoundary ? "boundary" : "immediate") : "silent",
      policyDecision: decision.decision || "stay_silent", deliveryDecision: decision.deliveryDecision || "stay_silent", reasons },
    d3: { level: delivered ? decision.supportLevel || "L0" : "L0", action: delivered ? decision.action || "" : "",
      proposedLevel: decision.supportLevel || "L0", answerIsolation: "server-graded-check" },
    d4: { presentation: decision.presentation || "", source: "server-policy" },
    d5: { confirmationRequired: true, learnerOptions: { ...decision.learnerOptions } },
    d6: { outcome: decision.lifecycleOutcome || "", followupOutcome: decision.followupOutcome || "" }
  };
}

module.exports = { observation };
