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
assert.equal(firstVisit.ranked.length, 4, "all four available resource scenes should be ranked");
assert.equal(firstVisit.recommended.typeId, "simulation", "definition-like first learning should prefer simulation");
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

const highMasteryDefinition = rank({
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
  masteryLevel: 0.86,
  experiencedTypes: [],
  reviewMode: false
});
assert.equal(transfer.recommended.typeId, "visualization3d", "high mastery modeling should prefer a 3D transfer view");
assert.ok(transfer.recommended.reasons.includes("high_mastery_transfer"));

const availableOnly = rank({
  candidates: firstKnowledgePoint.resourceCandidates.filter((candidate) => candidate.type !== "game"),
  masteryLevel: 0.4,
  experiencedTypes: ["simulation"],
  reviewMode: true
});
assert.equal(availableOnly.ranked.length, 3);
assert.notEqual(availableOnly.recommended.typeId, "game");

console.log("scene recommender tests passed");
