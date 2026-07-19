const assert = require("node:assert/strict");

const selection = require("../app/main/knowledge-scene-selection");

const types = [
  { id: "simulation" },
  { id: "game" },
  { id: "mindMap" },
  { id: "visualization3d" }
];

const scenes = {};
assert.equal(selection.selectedType("GH-01-K01", scenes, types), "");
assert.deepEqual(scenes, {}, "reading the selection must not create a default scene");

scenes["GH-01-K01"] = "simulation";
assert.equal(selection.selectedType("GH-01-K01", scenes, types), "simulation");
assert.equal(
  selection.shouldRecordSelection("GH-01-K01", scenes, "simulation", types),
  false,
  "clicking the active scene must not create a duplicate record"
);
assert.equal(selection.shouldRecordSelection("GH-01-K01", scenes, "game", types), true);
assert.equal(selection.shouldRecordSelection("GH-01-K01", scenes, "unknown", types), false);

scenes["GH-01-K01"] = "removed-scene";
assert.equal(selection.selectedType("GH-01-K01", scenes, types), "");

console.log("knowledge scene selection tests passed");
