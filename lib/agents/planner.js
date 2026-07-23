const kg = require("../kg");
const sceneRecommender = require("../../app/main/scene-recommender");

function cleanTypes(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => sceneRecommender.normalizeType({ type: value }))
      .filter(Boolean)
  ));
}

function knowledgePointFor(unit = {}) {
  return {
    id: unit.id,
    name: unit.title || unit.label || unit.id,
    goal: unit.conceptClusterFocus || "",
    misconception: unit.misconception || "",
    coreQuestion: unit.conceptClusterFocus || "",
    moduleTitle: unit.moduleTitle || unit.conceptClusterLabel || ""
  };
}

function publicChoice(unit, ranked) {
  const candidate = ranked.candidate || {};
  return {
    id: `${unit.id}:${ranked.typeId}`,
    knowledgePointId: unit.id,
    knowledgePointLabel: unit.title || unit.id,
    typeId: ranked.typeId,
    title: candidate.title || candidate.file || ranked.typeId,
    file: candidate.file || "",
    root: candidate.root || "",
    widgetType: candidate.widgetType || "",
    score: ranked.score,
    reasons: ranked.reasons,
    reasonLabels: ranked.reasonLabels,
    recommended: Boolean(ranked.recommended)
  };
}

function plan({ chapterId, currentUnitId, assessment, interactionEvidence } = {}) {
  const current = kg.nodeById(currentUnitId);
  if (!current || current.kind !== "unit" || current.role !== "knowledge") {
    return {
      ok: false,
      agent: "planner",
      mode: "resource_scene_ranking",
      reason: "planner_requires_current_knowledge_point",
      chapterId: chapterId || current?.chapterId || "",
      currentUnitId: currentUnitId || "",
      rankedSceneChoices: [],
      rankedResourceChoices: [],
      recommendedResource: null
    };
  }

  const evidence = interactionEvidence?.current || {};
  const experiencedTypes = cleanTypes(evidence.experiencedSceneTypes || evidence.experiencedTypes || []);
  const masteryLevel = evidence.masteryLevel ?? assessment?.masteryLevel ?? null;
  const reviewMode = Boolean(
    evidence.reviewMode
    || evidence.suggestedMove === "alternate_scene"
    || assessment?.suggestedAction === "remediate"
  );
  const result = sceneRecommender.rank({
    knowledgePoint: knowledgePointFor(current),
    candidates: current.resourceCandidates || [],
    masteryLevel,
    experiencedTypes,
    reviewMode
  });
  const rankedResourceChoices = result.ranked.map((ranked) => publicChoice(current, ranked));
  const recommendedResource = rankedResourceChoices[0] || null;

  return {
    ok: Boolean(recommendedResource),
    agent: "planner",
    mode: "resource_scene_ranking",
    chapterId: current.chapterId,
    currentUnitId: current.id,
    knowledgePointId: current.id,
    knowledgePointLabel: current.title || current.id,
    conceptKind: result.conceptKind,
    masteryLevel: result.masteryLevel,
    reviewMode: result.reviewMode,
    strategy: "current_knowledge_resource_reference",
    suggestedMove: reviewMode ? "recommend_alternate_resource" : "recommend_resource",
    evidenceUsed: {
      masteryLevel: result.masteryLevel,
      experiencedSceneTypes: experiencedTypes,
      reviewMode
    },
    rankedResourceChoices,
    recommendedResource,
    rankedSceneChoices: [],
    recommendedPath: {
      action: "reference_only",
      targetId: current.id,
      targetLabel: current.title || current.id,
      resourceType: recommendedResource?.typeId || "",
      confidence: recommendedResource
        ? Math.max(0.35, Math.min(0.95, 0.45 + recommendedResource.score / 12))
        : 0,
      rationale: recommendedResource?.reasons || []
    }
  };
}

module.exports = { plan };
