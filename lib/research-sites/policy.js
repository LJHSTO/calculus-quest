"use strict";

const { digest } = require("./catalog");
const PROTECTED = new Set(["baseline", "pre", "t0", "t1", "outcome", "post", "transfer", "retention", "return_probe", "return_outcome", "survey", "withdrawn", "complete"]);

function usableCheck(check, scope, now) {
  return Boolean(check && check.scope === scope && check.serverGraded === true
    && check.independent === true && Number.isFinite(check.at) && check.at <= now
    && (check.correct === true || check.correct === false));
}

/** A categorical decision rule. The output is never a calibrated probability. */
function decide({ study, arm, evidence = {}, context = {}, authority = {}, budget = {}, now = Date.now() }) {
  if (!study?.arms.includes(arm)) throw new Error("研究条件无效");
  const p = study.parameters;
  const result = (action, reason, extra = {}) => ({
    action, reason, at: now, policyVersion: p.version, parameterHash: digest(p),
    inferenceKind: "rule_based_possible_need", calibrated: false,
    supportGoal: study.id === "value" && arm === "value_connection" ? "motivational" : "cognitive",
    placement: study.id === "placement" ? arm : "inline", ...extra
  });
  if (PROTECTED.has(context.phase)) return result("silent", "independent_measurement_or_closed");
  if (authority.withdrawn || authority.paused || authority.declinedPoint === context.scope)
    return result("silent", "student_declined_or_paused");
  if ((budget.pointOffers || 0) >= p.maximumOffersPerPoint || (budget.sessionOffers || 0) >= p.maximumOffersPerSession)
    return result("silent", "offer_budget_exhausted");

  const initial = usableCheck(evidence.initial, context.scope, now) ? evidence.initial : null;
  const current = usableCheck(evidence.current, context.scope, now) ? evidence.current : null;
  const explicit = evidence.explicitNeed?.confirmed === true && evidence.explicitNeed.scope === context.scope;
  const historical = usableCheck(evidence.historical, context.scope, now) ? evidence.historical : null;
  let basis = explicit ? "student_explicit_need" : initial?.correct === false || current?.correct === false ? "independent_probe_gap" : null;
  if (study.id === "memory") basis = historical?.correct === false ? "historical_independent_gap" : explicit ? "student_explicit_need" : null;
  if (!basis) return result("silent", "no_task_evidence_quiet_is_not_need");

  const latestResolves = !explicit && current?.correct === true && current.at >= (initial?.at ?? historical?.at ?? 0);
  const rechecks = study.id === "recheck" && arm === "delivery_recheck"
    || study.id === "timing" && arm === "boundary_recheck"
    || study.id === "memory" && arm === "current_evidence";
  if (latestResolves && rechecks) return result("cancel", "new_independent_evidence", { basis, masteryClaim: false });
  if (Number.isFinite(evidence.candidateAt) && now - evidence.candidateAt >= p.candidateTtlMs)
    return result("cancel", "candidate_expired", { basis });
  if (budget.lastOfferAt != null && now - budget.lastOfferAt < p.cooldownMs)
    return result("wait", "cooldown", { basis, eligibleAt: budget.lastOfferAt + p.cooldownMs });
  if (context.visible !== true || context.typing === true || context.dragging === true || context.busy === true)
    return result("wait", "active_task_or_hidden", { basis });
  if (context.boundary !== true && (!Number.isFinite(context.idleMs) || context.idleMs < p.safeIdleMs))
    return result("wait", "waiting_for_safe_opportunity", { basis });
  if (study.id === "timing" && arm === "boundary_recheck" && context.boundary !== true)
    return result("wait", "waiting_for_natural_boundary", { basis });
  if (study.id === "recheck" && (!current || context.boundary !== true))
    return result("wait", "shared_recheck_measurement_not_complete", { basis });
  if (study.id === "memory" && (!context.returnSession || !current))
    return result("wait", "cross_session_current_probe_required", { basis });

  const grant = authority.grant;
  const permitted = study.id === "authorization" && arm === "scoped_permission" && grant
    && grant.scope === context.scope && grant.sessionId === context.sessionId
    && grant.goal === "cognitive" && grant.revoked !== true && grant.expiresAt > now;
  return result(permitted ? "present" : "inquire", permitted ? "valid_scoped_permission" : "confirm_possible_need", {
    basis, possibleNeedNotDiagnosis: true,
    needsClarification: study.id === "clarification" && arm === "confirm_and_match",
    allowScopedPermission: study.id === "authorization" && arm === "scoped_permission",
    evidenceRefs: [initial, current, historical].filter(Boolean).map(c => c.id),
    explicitNeedRef: explicit ? evidence.explicitNeed.id : null,
    knownContradiction: Boolean(latestResolves)
  });
}

module.exports = { decide, usableCheck, PROTECTED };
