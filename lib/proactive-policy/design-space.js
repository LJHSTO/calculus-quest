"use strict";

const { snapshot } = require("./evidence-audit");

// Public, answer-free projection of one real policy evaluation. Never infer
// unseen student intent, fill missing scores, or substitute delivery for policy.
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function publicSnapshot(value) {
  return value && typeof value === "object" ? snapshot(value, {
    at: value.capturedAt, knowledgePointId: value.knowledgePointId, unitId: value.unitId
  }) : null;
}

function observation({ decision = {}, evidence = {}, signal = {}, scopeKey = "", decisionId = "" } = {}) {
  const reasons = Array.isArray(decision.reasonCodes) ? [...decision.reasonCodes] : [];
  const delivered = decision.displayAllowed === true;
  const waiting = reasons.includes("quiet_dwell_waiting_for_boundary");
  const cancelled = reasons.some(reason => ["quiet_dwell_pending_absent",
    "quiet_dwell_verified_target_recovery"].includes(reason));
  return {
    version: "education-design-space-v1", scopeKey, decisionId,
    at: decision.createdAt || new Date().toISOString(),
    source: "server-policy",
    d1: {
      facts: {
        candidateKind: signal.kind || "", families: [...(evidence.families || [])],
        interventionPurpose:decision.interventionPurpose||null,
        explorationOpportunity:evidence.explorationOpportunity?{text:evidence.explorationOpportunity.text,version:evidence.explorationOpportunity.version,sourceIds:evidence.explorationOpportunity.sources.map(r=>r.id),needEstimateApplicable:false}:null,
        parameterCommits: finite(evidence.parameterCommitCount),
        confirmedIncorrect: finite(evidence.confirmedIncorrect),
        confirmedCorrect: finite(evidence.confirmedCorrect),
        pendingReview: finite(evidence.pendingReview), dwellSeconds: finite(evidence.dwellSeconds),
        confirmedGaps: finite(evidence.confirmedGapCount),
        commonProbe: evidence.commonProbe ? {
          id:String(evidence.commonProbe.id||""),subSkill:String(evidence.commonProbe.subSkill||""),
          correct:typeof evidence.commonProbe.correct==='boolean'?evidence.commonProbe.correct:null,
          independent:evidence.commonProbe.independent===true,serverGraded:evidence.commonProbe.serverGraded===true,
          at:evidence.commonProbe.at||""
        } : null,
        sceneAttempts: finite(evidence.sceneAttemptCount), sceneFailures: finite(evidence.sceneAttemptFailures),
        naturalBoundary: evidence.naturalBoundary === true,
        boundaryEvent: evidence.boundaryEventType || "",
        observableFeatures: evidence.behaviorFeatures || null,
        references: (evidence.evidenceRefs || []).slice(0, 40).map(row => ({
          id: String(row.id || ""), sourceType: String(row.sourceType || ""), capturedAt: row.capturedAt || ""
        }))
      },
      evidenceSnapshots: evidence.boundaryRecheckAudit ? {
        initial: publicSnapshot(evidence.boundaryRecheckAudit.initialEvidenceSnapshot),
        current: publicSnapshot(evidence.boundaryRecheckAudit.currentEvidenceSnapshot)
      } : null,
      estimates: {
        helpNeed: finite(decision.helpNeedScore), interruptibility: finite(decision.interruptibilityScore),
        uncertainty: finite(decision.uncertaintyScore), calibrated: false
      }
    },
    d2: { action: reasons.includes('need_confirmation_offered')?'confirmation':evidence.delayedTask?.status==="queued" ? "delayed" : evidence.delayedTask?.status==="cancelled" ? "cancel"
      : waiting ? "wait" : delivered ? (evidence.naturalBoundary ? "boundary" : "immediate") : cancelled ? "cancel" : "silent",
      delayedTask:evidence.delayedTask || null,
      policyDecision: decision.decision || "stay_silent", deliveryDecision: decision.deliveryDecision || "stay_silent", reasons,
      recheck: evidence.boundaryRecheckAudit ? {
        at: evidence.boundaryRecheckAudit.recheckedAt,
        pendingStatus: evidence.boundaryRecheckAudit.pendingStatus,
        reason: evidence.boundaryRecheckAudit.reason,
        recovery: {
          status: evidence.boundaryRecheckAudit.recovery?.status || "unknown",
          reason: evidence.boundaryRecheckAudit.recovery?.reason || "",
          evidenceRef: evidence.boundaryRecheckAudit.recovery?.evidenceRef || "",
          subSkill: evidence.boundaryRecheckAudit.recovery?.subSkill || ""
        },
        progressEstablishesMastery: false
      } : null },
    d3: { level: delivered ? decision.supportLevel || "L0" : "L0", action: delivered ? decision.action || "" : "",
      proposedLevel: decision.supportLevel || "L0", answerIsolation: "server-graded-check" },
    d4: { presentation: decision.presentation || "", source: "server-policy" },
    d5: { confirmationRequired: true, authority:evidence.authority || null, learnerOptions: { ...decision.learnerOptions } },
    d6: { outcome: decision.lifecycleOutcome || "", followupOutcome: decision.followupOutcome || "" }
  };
}

module.exports = { observation };
