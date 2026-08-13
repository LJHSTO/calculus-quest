const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const index = read("index.html");
const core = read("app/main/core.js");
const analytics = read("app/main/analytics.js");
const render = read("app/main/render-learning.js");
const pathSource = read("app/main/agentic-path.js");
const styles = read("styles.css");

assert.ok(
  index.indexOf("app/main/scene-recommender.js") < index.indexOf("app/main/core.js"),
  "the shared recommender must load before core rendering helpers"
);
assert.match(core, /SceneRecommender\.rank/);
assert.match(core, /experiencedSceneTypes/);
assert.match(core, /previewKnowledgeScenes/);
assert.match(core, /recordSelectionForAccess/);
assert.match(core, /agenticUnitCompletionAllowed/);
assert.match(render, /Coach 建议/);
assert.match(render, /系统不会替你选择/);
assert.match(render, /data-coach-score/);
assert.match(render, /agenticUnitCompletionAllowed/);
assert.match(styles, /\.coach-recommendation-badge/);
assert.match(styles, /\.multi-scene-scene-option\.coach-recommended/);
assert.match(analytics, /experiencedSceneTypes/);
assert.match(render, /event\.data\?\.type === "cq:interaction"/);
assert.match(render, /trackCoursewareBridgeInteraction/);
assert.doesNotMatch(
  analytics,
  /event\.data\.eventType === "parameter_commit"/,
  "courseware bridge events must be persisted only by the learning renderer"
);
assert.match(pathSource, /agenticKnowledgeMasteryForUnit/);
assert.match(pathSource, /agenticDiscardUnavailableSceneSelections/);
assert.doesNotMatch(
  pathSource,
  /function agenticPlannerRankedCandidates/,
  "legacy cross-knowledge-point Planner ranking must stay disconnected"
);

console.log("scene recommendation UI wiring tests passed");
