const kg = require("../kg");

function parseUnitId(unitId = "") {
  const match = String(unitId).match(/^(.+)-scene-(\d+)$/);
  return match ? { chapterId: match[1], order: Number(match[2]) } : null;
}

function normalizeUnit(unit) {
  const order = Number(unit.order || parseUnitId(unit.id)?.order || 0);
  const conceptClusterId = unit.conceptClusterId || unit.moduleId || "";
  return {
    id: unit.id,
    chapterId: unit.chapterId || parseUnitId(unit.id)?.chapterId || "",
    order,
    title: unit.title || unit.label || unit.id,
    type: unit.type || "",
    role: unit.role || "",
    modality: unit.modality || unit.representation || "",
    modalities: unit.modalities || [],
    conceptClusterId,
    conceptClusterLabel: unit.conceptClusterLabel || conceptClusterId,
    conceptClusterFocus: unit.conceptClusterFocus || "",
    concepts: Array.isArray(unit.concepts) ? unit.concepts : [],
    representation: unit.representation || unit.modality || "",
    scenarioType: unit.scenarioType || scenarioTypeFor(unit),
    difficultyBand: unit.difficultyBand || difficultyBandFor(unit),
    flowKind: unit.flowKind || "core"
  };
}

function scenarioTypeFor(unit) {
  if (unit.role === "pre_test") return "diagnose";
  if (unit.role === "post_test") return "transfer";
  if (unit.role === "formative_quiz") return "check";
  if (unit.role === "knowledge") return "student_choice";
  return "explain";
}

function difficultyBandFor(unit) {
  if (unit.role === "pre_test") return "diagnostic";
  if (unit.role === "post_test") return "transfer";
  if (unit.flowKind === "extension") return "extension";
  return "core";
}

function chapterUnits(chapterId) {
  return kg.unitsInChapter(chapterId).map(normalizeUnit);
}

function sameClusterUnits(units, current) {
  if (!current) return [];
  if (current.conceptClusterId) {
    const exact = units.filter((unit) => unit.conceptClusterId === current.conceptClusterId);
    if (exact.length > 1) return exact;
  }
  if (current.role === "knowledge") {
    const nearbyKnowledge = units.filter((unit) => unit.role === "knowledge" && Math.abs(unit.order - current.order) <= 2);
    if (nearbyKnowledge.length > 1) return nearbyKnowledge;
  }
  return units.filter((unit) => Math.abs(unit.order - current.order) <= 2);
}

function weaknessMatches(unit, assessment) {
  const weak = (assessment?.weakConcepts || []).map((item) => String(item.concept || item.tag || item || "").toLowerCase()).filter(Boolean);
  if (!weak.length) return false;
  const haystack = [unit.title, unit.conceptClusterLabel, ...(unit.concepts || [])].join(" ").toLowerCase();
  return weak.some((item) => item && haystack.includes(item));
}

function deriveSuggestedMove(assessment, analyticsResult, interactionEvidence) {
  const current = interactionEvidence?.current || {};
  if (current.suggestedMove) return current.suggestedMove;
  if (analyticsResult?.suggestedMove) return analyticsResult.suggestedMove;
  if (assessment?.suggestedAction === "remediate") return "alternate_scene";
  if (assessment?.suggestedAction === "extend" || assessment?.suggestedAction === "skip") return "extend";
  return "continue";
}

function scoreCandidate(unit, current, context) {
  const { assessment, analyticsResult, interactionEvidence, completed, suggestedMove } = context;
  const evidence = interactionEvidence?.current || {};
  const riskLevel = evidence.riskLevel || analyticsResult?.riskLevel || "low";
  const friction = Number(evidence.frictionScore ?? analyticsResult?.frictionScore ?? 0);
  const engagement = Number(evidence.engagementScore ?? analyticsResult?.engagementScore ?? 0);
  const mastery = Number(assessment?.masteryLevel ?? 0.5);
  const reasons = [];
  let score = 0;

  if (unit.id === current.id) score -= 5;
  if (unit.conceptClusterId && unit.conceptClusterId === current.conceptClusterId) {
    score += 4;
    reasons.push("same_concept_cluster");
  }
  if (unit.representation && current.representation && unit.representation !== current.representation) {
    score += 1.2;
    reasons.push("different_representation");
  }
  if (unit.type === "interactive") score += 0.8;
  if (completed.has(unit.id)) score -= 1.5;

  if (suggestedMove === "alternate_scene" || assessment?.suggestedAction === "remediate") {
    if (["remediate", "manipulate", "compare", "explain"].includes(unit.scenarioType)) score += 2.2;
    if (unit.difficultyBand === "remedial") score += 2.4;
    if (unit.flowKind === "adaptive") score += 1.8;
    reasons.push("remediation_fit");
  }

  if (suggestedMove === "make_interactive" || engagement < 0.25) {
    if (unit.type === "interactive" || unit.representation === "manipulative") score += 2;
    reasons.push("engagement_recovery");
  }

  if (suggestedMove === "extend" || assessment?.suggestedAction === "extend" || mastery >= 0.8) {
    if (["extend", "preview", "transfer"].includes(unit.scenarioType)) score += 2.2;
    if (unit.difficultyBand === "extension") score += 2;
    reasons.push("extension_fit");
  }

  if (riskLevel === "high" || friction >= 0.65) {
    if (unit.difficultyBand === "remedial" || unit.scenarioType === "remediate") score += 2.5;
    if (unit.type === "quiz") score -= 1.5;
    reasons.push("high_friction_support");
  }

  if (weaknessMatches(unit, assessment)) {
    score += 1.5;
    reasons.push("weak_concept_match");
  }

  score -= Math.max(0, unit.order - current.order) * 0.02;
  return { score: Math.round(score * 1000) / 1000, reasons: Array.from(new Set(reasons)) };
}

function candidateFor(unit, ranking, current) {
  return {
    id: unit.id,
    title: unit.title,
    label: unit.title,
    chapterId: unit.chapterId,
    order: unit.order,
    type: unit.type,
    role: unit.role,
    modality: unit.modality,
    modalities: unit.modalities,
    conceptClusterId: unit.conceptClusterId,
    conceptClusterLabel: unit.conceptClusterLabel,
    conceptClusterFocus: unit.conceptClusterFocus,
    representation: unit.representation,
    scenarioType: unit.scenarioType,
    difficultyBand: unit.difficultyBand,
    score: ranking.score,
    reasons: ranking.reasons,
    reason: ranking.reasons.join("+") || "planner_ranked",
    replaces: current.id
  };
}

function plan({ chapterId, currentUnitId, assessment, analyticsResult, interactionEvidence, quizSummary, completedUnitIds = [] }) {
  const units = chapterUnits(chapterId);
  const current = units.find((unit) => unit.id === currentUnitId);
  if (!current?.id || !units.length) {
    return { ok: false, reason: "planner_missing_current_or_units", rankedSceneChoices: [] };
  }

  const completed = new Set(completedUnitIds || []);
  const suggestedMove = deriveSuggestedMove(assessment, analyticsResult, interactionEvidence);
  const context = { assessment, analyticsResult, interactionEvidence, quizSummary, completed, suggestedMove };
  const siblings = sameClusterUnits(units, current).filter((unit) => unit.id !== current.id);
  const rankedSceneChoices = siblings
    .map((unit) => ({ unit, ranking: scoreCandidate(unit, current, context) }))
    .sort((a, b) => b.ranking.score - a.ranking.score || a.unit.order - b.unit.order)
    .map(({ unit, ranking }) => candidateFor(unit, ranking, current));

  const top = rankedSceneChoices[0] || null;
  const action = suggestedMove === "extend"
    ? "extend"
    : suggestedMove === "alternate_scene" || assessment?.suggestedAction === "remediate"
      ? "remediate"
      : "continue";

  return {
    ok: true,
    agent: "planner",
    chapterId,
    currentUnitId,
    suggestedMove,
    strategy: action === "continue" ? "continue_mainline" : "same_concept_scene_choice",
    evidenceUsed: {
      assessmentAction: assessment?.suggestedAction || "",
      masteryLevel: assessment?.masteryLevel ?? null,
      analyticsRisk: analyticsResult?.riskLevel || "",
      interactionRisk: interactionEvidence?.current?.riskLevel || "",
      frictionScore: interactionEvidence?.current?.frictionScore ?? analyticsResult?.frictionScore ?? null,
      engagementScore: interactionEvidence?.current?.engagementScore ?? analyticsResult?.engagementScore ?? null
    },
    currentScene: candidateFor(current, { score: 0, reasons: ["current_scene"] }, current),
    rankedSceneChoices,
    recommendedPath: {
      action,
      targetId: top?.id || "",
      targetLabel: top?.label || "",
      confidence: top ? Math.max(0.35, Math.min(0.95, 0.5 + top.score / 10)) : 0.35,
      rationale: top?.reasons || []
    }
  };
}

module.exports = { plan };
