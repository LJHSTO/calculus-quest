const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const recommender = require("../app/main/scene-recommender");

const root = path.join(__dirname, "..");
const route = JSON.parse(
  fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8")
);
const firstKnowledgePoint = route.chapters[0].modules[0].knowledgePoints[0];

function rank(overrides = {}) {
  return recommender.rank({
    knowledgePoint: {
      id: firstKnowledgePoint.id,
      name: firstKnowledgePoint.name,
      goal: firstKnowledgePoint.goal,
      misconception: firstKnowledgePoint.misconception
    },
    candidates: firstKnowledgePoint.resourceCandidates,
    masteryLevel: null,
    experiencedTypes: [],
    reviewMode: false,
    ...overrides
  });
}

const firstVisit = rank();
// The scene set is a property of the imported courseware, not a fixed four: the
// chapter moved from a four-type-per-point template to function-driven scene
// selection, so different knowledge points now expose different sets.
assert.equal(
  firstVisit.ranked.length,
  firstKnowledgePoint.resourceCandidates.length,
  "every available resource scene should be ranked"
);
assert.ok(firstVisit.ranked.length >= 2, "scene choice needs at least two options to be a real choice");
assert.equal(
  new Set(firstVisit.ranked.map((candidate) => candidate.typeId)).size,
  firstVisit.ranked.length,
  "a widget type must not appear twice in one knowledge point's ranking"
);
assert.ok(firstVisit.recommended, "a first visit must produce a recommendation");
assert.equal(firstVisit.ranked[0].recommended, true);
assert.equal(
  firstVisit.ranked.filter((candidate) => candidate.recommended).length,
  1,
  "exactly one resource scene should be marked as the Coach suggestion"
);
assert.equal(
  Object.hasOwn(firstVisit, "selectedType"),
  false,
  "a recommendation must not become a student selection"
);

const candidatesBefore = JSON.stringify(firstKnowledgePoint.resourceCandidates);
assert.deepEqual(rank({ experiencedTypes: ["simulation"] }).ranked.map(({ typeId, score }) => ({ typeId, score })),
  firstVisit.ranked.map(({ typeId, score }) => ({ typeId, score })),
  "首次学习的推荐不能因刚选择或体验某个场景而跳走");
rank();
assert.equal(
  JSON.stringify(firstKnowledgePoint.resourceCandidates),
  candidatesBefore,
  "ranking must not mutate route resource order or selection state"
);

const remediation = rank({
  masteryLevel: 0.4,
  experiencedTypes: ["simulation"],
  reviewMode: true
});
assert.equal(remediation.recommended.typeId, "game", "low mastery review should prefer an unseen misconception challenge");
assert.ok(remediation.recommended.reasons.includes("low_mastery_game"));
assert.ok(remediation.recommended.reasons.includes("review_unseen"));

// High mastery should prefer the transfer view, but only where one exists: with
// function-driven scene selection, some knowledge points have no 3D scene at all
// (GH-01-K01 has none), so the assertion runs against a point that does.
const threeDKnowledgePoint = route.chapters[0].modules
  .flatMap((module) => module.knowledgePoints)
  .find((point) => point.resourceCandidates.some((candidate) => candidate.widgetType === "visualization3d"));
assert.ok(threeDKnowledgePoint, "the chapter should expose at least one 3D scene");
const highMasteryDefinition = rank({
  knowledgePoint: {
    id: threeDKnowledgePoint.id,
    name: threeDKnowledgePoint.name,
    goal: threeDKnowledgePoint.goal,
    misconception: threeDKnowledgePoint.misconception
  },
  candidates: threeDKnowledgePoint.resourceCandidates,
  masteryLevel: 1,
  experiencedTypes: [],
  reviewMode: false
});
assert.equal(
  highMasteryDefinition.recommended.typeId,
  "visualization3d",
  "high mastery should prefer transfer over repeating first-learning intuition"
);
assert.ok(highMasteryDefinition.recommended.reasons.includes("high_mastery_transfer"));
assert.ok(!highMasteryDefinition.recommended.reasons.includes("first_learning_intuition"));

const transfer = rank({
  knowledgePoint: {
    id: "MODEL-K01",
    name: "梯度下降与模型训练",
    goal: "能把梯度下降过程迁移到机器学习模型训练与空间优化情境。",
    misconception: "只会套公式，不能解释参数在空间中如何移动。"
  },
  // This case is about the scoring rule, not about what the chapter ships, so it
  // supplies its own full candidate set.
  candidates: [
    { type: "simulation", title: "参数实验" },
    { type: "mindMap", title: "关系图" },
    { type: "game", title: "操作挑战" },
    { type: "visualization3d", title: "空间视角" }
  ],
  masteryLevel: 0.86,
  experiencedTypes: [],
  reviewMode: false
});
assert.equal(transfer.recommended.typeId, "visualization3d", "high mastery modeling should prefer a 3D transfer view");
assert.ok(transfer.recommended.reasons.includes("high_mastery_transfer"));

const withoutGame = firstKnowledgePoint.resourceCandidates.filter((candidate) => candidate.type !== "game");
const availableOnly = rank({
  candidates: withoutGame,
  masteryLevel: 0.4,
  experiencedTypes: ["simulation"],
  reviewMode: true
});
assert.equal(availableOnly.ranked.length, withoutGame.length, "only available scenes may be ranked");
assert.notEqual(availableOnly.recommended.typeId, "game");

console.log("scene recommender tests passed");
