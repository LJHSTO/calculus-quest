// Shared deterministic resource ranking for both browser UI and server-side planning.
(function attachSceneRecommender(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SceneRecommender = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSceneRecommender() {
  const TYPE_ORDER = ["simulation", "game", "mindMap", "visualization3d"];
  const BASE_SCORES = {
    definition: { simulation: 2.4, game: 1, mindMap: 1.4, visualization3d: 0.8 },
    method: { simulation: 1.4, game: 1.2, mindMap: 2.4, visualization3d: 0.8 },
    modeling: { simulation: 1.2, game: 2.2, mindMap: 1, visualization3d: 2.2 },
    concept: { simulation: 1.8, game: 1.2, mindMap: 1.6, visualization3d: 1 }
  };
  const REASON_LABELS = {
    definition_match: "适合先建立直观定义",
    method_match: "适合梳理方法与步骤",
    modeling_match: "适合迁移到应用情境",
    first_learning_intuition: "首次学习优先建立直觉",
    unseen_representation: "尚未体验的新表征",
    experienced_representation: "已体验过，降低重复优先级",
    low_mastery_game: "低掌握度优先用挑战暴露误解",
    low_mastery_structure: "低掌握度适合关系梳理",
    low_mastery_spatial: "低掌握度补充空间视角",
    high_mastery_transfer: "高掌握度适合迁移观察",
    review_unseen: "补学时优先未体验表征"
  };

  function clean(value = "") {
    return String(value || "").trim();
  }

  function normalizeType(candidate = {}) {
    const raw = clean(candidate.type || candidate.id || candidate.widgetType).toLowerCase();
    const widget = clean(candidate.widgetType).toLowerCase();
    if (raw === "mindmap" || raw === "diagram" || widget === "diagram") return "mindMap";
    if (raw === "visualization3d" || raw === "3d" || widget === "visualization3d") return "visualization3d";
    if (raw === "simulation") return "simulation";
    if (raw === "game") return "game";
    return "";
  }

  function classifyKnowledgePoint(knowledgePoint = {}) {
    const text = [
      knowledgePoint.name,
      knowledgePoint.goal,
      knowledgePoint.misconception,
      knowledgePoint.coreQuestion,
      knowledgePoint.moduleTitle
    ].filter(Boolean).join(" ");
    const scores = {
      definition: (text.match(/定义|含义|是什么|输入|输出|对应|映射|坐标|极限|连续|意义|直觉/g) || []).length,
      method: (text.match(/规则|计算|求导|积分|方法|步骤|公式|链式|变换|推导|判定|算法/g) || []).length,
      modeling: (text.match(/建模|应用|优化|训练|空间|曲面|梯度|向量|矩阵|概率|统计|微分方程|机器学习|情境|迁移/g) || []).length
    };
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return ranked[0][1] > 0 ? ranked[0][0] : "concept";
  }

  function addScore(item, amount, reason) {
    item.score += amount;
    if (reason) item.reasons.push(reason);
  }

  function scoreCandidate(typeId, context) {
    const item = { typeId, score: 0, reasons: [] };
    const profile = BASE_SCORES[context.conceptKind] || BASE_SCORES.concept;
    const baseReason = {
      definition: "definition_match",
      method: "method_match",
      modeling: "modeling_match"
    }[context.conceptKind] || "";

    addScore(item, profile[typeId] || 0, baseReason);

    const needsFirstLearningIntuition = context.masteryLevel === null || context.masteryLevel < 0.8;
    if (!context.experienced.size && needsFirstLearningIntuition && ["simulation", "game"].includes(typeId)) {
      addScore(item, 0.8, "first_learning_intuition");
    }

    if (context.experienced.has(typeId)) {
      addScore(item, -1.5, "experienced_representation");
    } else {
      addScore(item, 1.2, "unseen_representation");
    }

    if (context.masteryLevel !== null && context.masteryLevel < 0.6) {
      if (typeId === "game") addScore(item, 2.4, "low_mastery_game");
      if (typeId === "mindMap") addScore(item, 1.6, "low_mastery_structure");
      if (typeId === "visualization3d") addScore(item, 1.2, "low_mastery_spatial");
    }

    if (context.masteryLevel !== null && context.masteryLevel >= 0.8 && typeId === "visualization3d") {
      addScore(item, 2.2, "high_mastery_transfer");
    }

    if (context.reviewMode && !context.experienced.has(typeId)) {
      addScore(item, 1.8, "review_unseen");
    }

    item.score = Math.round(item.score * 100) / 100;
    item.reasons = Array.from(new Set(item.reasons));
    item.reasonLabels = item.reasons.map((reason) => REASON_LABELS[reason]).filter(Boolean);
    return item;
  }

  function rank({
    knowledgePoint = {},
    candidates = [],
    masteryLevel = null,
    experiencedTypes = [],
    reviewMode = false
  } = {}) {
    const normalizedMastery = masteryLevel !== null
      && masteryLevel !== undefined
      && masteryLevel !== ""
      && Number.isFinite(Number(masteryLevel))
      ? Math.max(0, Math.min(1, Number(masteryLevel)))
      : null;
    const experienced = new Set(
      (Array.isArray(experiencedTypes) ? experiencedTypes : [])
        .map((type) => normalizeType({ type }))
        .filter(Boolean)
    );
    const conceptKind = classifyKnowledgePoint(knowledgePoint);
    const available = new Map();
    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      const typeId = normalizeType(candidate);
      if (typeId && !available.has(typeId)) available.set(typeId, candidate);
    });
    const context = {
      conceptKind,
      masteryLevel: normalizedMastery,
      experienced,
      reviewMode: Boolean(reviewMode)
    };
    const ranked = TYPE_ORDER
      .filter((typeId) => available.has(typeId))
      .map((typeId) => ({
        ...scoreCandidate(typeId, context),
        candidate: available.get(typeId),
        recommended: false
      }))
      .sort((a, b) => b.score - a.score || TYPE_ORDER.indexOf(a.typeId) - TYPE_ORDER.indexOf(b.typeId));
    if (ranked[0]) ranked[0].recommended = true;

    return {
      conceptKind,
      masteryLevel: normalizedMastery,
      reviewMode: Boolean(reviewMode),
      ranked,
      recommended: ranked[0] || null
    };
  }

  return {
    classifyKnowledgePoint,
    normalizeType,
    rank,
    reasonLabel(reason = "") {
      return REASON_LABELS[clean(reason)] || "";
    }
  };
});
