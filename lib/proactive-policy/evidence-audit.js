"use strict";

const VERSION = "education-evidence-audit-v1";
const EXPOSURE_RULES = Object.freeze({ minimumFraction: 0.5, minimumDurationMs: 1000 });
const numberIn = (value, lower, upper) => typeof value === "number"
  && Number.isFinite(value) && value >= lower && value <= upper;
const text = value => typeof value === "string" ? value.slice(0, 180) : "";
const count = value => numberIn(value, 0, 1000000) ? value : null;

// These are client measurement receipts, never a grant of authority, proof of
// reading, or evidence of learning. The server owns the qualification threshold.
function exposureReceipt(body = {}) {
  const keys = ["exposureSource", "qualifiedVisible", "fraction", "visibleDurationMs",
    "minimumFraction", "minimumDurationMs"];
  if (!keys.some(key => Object.hasOwn(body, key))) {
    return { ok: true, value: { exposureSource: "legacy_unspecified",
      qualifiedVisible: false, measurementProvenance: "legacy_unqualified" } };
  }
  const source = body.exposureSource;
  if (!["qualified_visible", "explicit_interaction"].includes(source)
    || typeof body.qualifiedVisible !== "boolean"
    || !numberIn(body.visibleDurationMs, 0, 86400000)
    || !numberIn(body.fraction, 0, 1)
    || !numberIn(body.minimumFraction, 0, 1)
    || !numberIn(body.minimumDurationMs, 0, 86400000)) {
    return { ok: false, reason: "exposure_metadata_invalid" };
  }
  if (source === "qualified_visible") {
    if (body.qualifiedVisible !== true
      || body.minimumFraction !== EXPOSURE_RULES.minimumFraction
      || body.minimumDurationMs !== EXPOSURE_RULES.minimumDurationMs
      || body.fraction < EXPOSURE_RULES.minimumFraction
      || body.visibleDurationMs < EXPOSURE_RULES.minimumDurationMs) {
      return { ok: false, reason: "exposure_threshold_not_met" };
    }
  } else if (body.qualifiedVisible !== false || body.fraction !== 0
    || body.visibleDurationMs !== 0 || body.minimumFraction !== 0
    || body.minimumDurationMs !== 0) {
    return { ok: false, reason: "explicit_interaction_not_visibility" };
  }
  return { ok: true, value: Object.fromEntries([
    ...keys.map(key => [key, body[key]]), ["measurementProvenance", "client_reported"]
  ]) };
}

function pendingCandidate(row = {}, now = Date.now()) {
  const kind = String(row.pending_candidate_kind || "");
  const at = Date.parse(row.pending_candidate_at || "");
  const expires = Date.parse(row.pending_candidate_expires_at || "");
  const reason = kind !== "quiet_dwell" ? "pending_absent"
    : !Number.isFinite(at) || !Number.isFinite(expires) || expires <= at ? "pending_timestamp_invalid"
      : at > now ? "pending_in_future" : expires <= now ? "pending_expired" : "pending_valid";
  let evidence = {};
  try {
    const parsed = JSON.parse(row.pending_evidence_json || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) evidence = parsed;
  } catch {}
  return { valid: reason === "pending_valid", reason, kind: reason === "pending_valid" ? kind : "",
    candidateAt: reason === "pending_valid" ? at : 0,
    candidateAtIso: reason === "pending_valid" ? row.pending_candidate_at : "",
    expiresAt: reason === "pending_valid" ? expires : 0,
    expiresAtIso: reason === "pending_valid" ? row.pending_candidate_expires_at : "",
    evidence };
}

function snapshot(evidence = {}, { at = "", knowledgePointId = "", unitId = "" } = {}) {
  return { version: VERSION, capturedAt: text(at), knowledgePointId: text(knowledgePointId), unitId: text(unitId),
    families: Array.isArray(evidence.families) ? evidence.families.filter(x =>
      ["time", "result", "process", "task", "history", "preference"].includes(x)) : [],
    confirmedGapCount: count(evidence.confirmedGapCount),
    sceneAttemptCount: count(evidence.sceneAttemptCount), sceneAttemptFailures: count(evidence.sceneAttemptFailures),
    parameterCommitCount: count(evidence.parameterCommitCount), dwellSeconds: count(evidence.dwellSeconds),
    naturalBoundary: evidence.naturalBoundary === true, boundaryEventType: text(evidence.boundaryEventType),
    evidenceRefs: (Array.isArray(evidence.evidenceRefs) ? evidence.evidenceRefs : []).slice(0, 40).map(ref => ({
      id: text(ref.id), sourceType: text(ref.sourceType), eventType: text(ref.eventType), capturedAt: text(ref.capturedAt)
    })) };
}

// Only a server-owned caller may supply these scored results. A matching
// knowledge point alone is insufficient: the target sub-skill and independence
// must also be known. Current unmapped courseware/quiz events remain unknown.
function recoveryAssessment({ target, results = [], candidateAt, now, knowledgePointId } = {}) {
  if (!target || typeof target.subSkill !== "string" || !target.subSkill
    || target.knowledgePointId !== knowledgePointId || target.evidenceScope !== "sub_skill") {
    return { status: "unknown", reason: "target_sub_skill_unmapped" };
  }
  const eligible = results.filter(row => row.serverGraded === true && row.independent === true
    && typeof row.id === "string" && row.id.length > 0
    && row.knowledgePointId === knowledgePointId && row.subSkill === target.subSkill
    && row.evidenceScope === "sub_skill" && typeof row.correct === "boolean"
    && Number.isFinite(Date.parse(row.capturedAt)) && Date.parse(row.capturedAt) > candidateAt
    && Date.parse(row.capturedAt) <= now).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  if (!eligible.length) return { status: "unknown", reason: "independent_target_evidence_absent" };
  const latest = eligible[0];
  if (eligible.some(row => row.capturedAt === latest.capturedAt && row.correct !== latest.correct)) {
    return { status: "unknown", reason: "conflicting_target_evidence" };
  }
  return { status: latest.correct ? "verified_recovered" : "not_recovered",
    reason: latest.correct ? "server_graded_independent_target_success" : "server_graded_independent_target_failure",
    evidenceRef: text(latest.id), subSkill: text(target.subSkill) };
}

function boundaryAudit({ pending, evidence, now, knowledgePointId, unitId,
  observedProgressCount = 0, authoritativeResults = [] } = {}) {
  const current = snapshot(evidence, { at: new Date(now).toISOString(), knowledgePointId, unitId });
  const initial = pending?.evidence?.initialEvidenceSnapshot || (pending?.evidence && Object.keys(pending.evidence).length
    ? snapshot(pending.evidence, { at: pending.evidence.capturedAt || pending.candidateAtIso, knowledgePointId, unitId }) : null);
  const recovery = recoveryAssessment({ target: pending?.evidence?.recoveryTarget,
    results: authoritativeResults, candidateAt: pending?.candidateAt, now, knowledgePointId });
  const reason = !pending?.valid ? pending?.reason || "pending_absent"
    : !evidence.naturalBoundary ? "natural_boundary_not_verified"
      : recovery.status === "verified_recovered" ? "independent_target_recovery_verified"
        : current.confirmedGapCount > 0 ? "current_confirmed_gap_persists"
          : current.sceneAttemptFailures > 0 || current.parameterCommitCount >= 3
            ? "current_process_struggle_persists" : "current_help_need_unconfirmed";
  return { version: VERSION, recheckedAt: current.capturedAt,
    initialDecisionId: text(pending?.evidence?.candidateDecisionId),
    candidateAt: pending?.candidateAtIso || "", candidateExpiresAt: pending?.expiresAtIso || "",
    pendingStatus: pending?.reason || "pending_absent", reason,
    initialSnapshotStatus: !initial ? "unavailable" : pending.evidence.initialEvidenceSnapshot ? "recorded" : "legacy_reconstructed",
    initialEvidenceSnapshot: initial, currentEvidenceSnapshot: current,
    observedProgressCount: count(observedProgressCount), recovery,
    // A click or a broad progress event never establishes recovery.
    progressEstablishesMastery: false };
}

module.exports = { VERSION, EXPOSURE_RULES, exposureReceipt, pendingCandidate, snapshot,
  recoveryAssessment, boundaryAudit };
