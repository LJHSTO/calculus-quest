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

const committedScenes = {};
const previewScenes = {};
const previewResult = selection.recordSelectionForAccess(
  "GH-01-K02",
  committedScenes,
  previewScenes,
  "game",
  types,
  false
);
assert.deepEqual(previewResult, { changed: true, persisted: false });
assert.deepEqual(committedScenes, {}, "previewing a locked lesson must not persist its scene choice");
assert.equal(previewScenes["GH-01-K02"], "game");
assert.equal(
  selection.selectedTypeForAccess("GH-01-K02", committedScenes, previewScenes, types, false),
  "game",
  "the preview session should keep its temporary scene choice"
);
assert.equal(
  selection.selectedTypeForAccess("GH-01-K02", committedScenes, previewScenes, types, true),
  "",
  "unlocking the lesson must require a fresh recommendation and scene choice"
);
const committedResult = selection.recordSelectionForAccess(
  "GH-01-K02",
  committedScenes,
  previewScenes,
  "simulation",
  types,
  true
);
assert.deepEqual(committedResult, { changed: true, persisted: true });
assert.equal(committedScenes["GH-01-K02"], "simulation");
assert.equal(previewScenes["GH-01-K02"], undefined, "committing a learning choice must clear the preview choice");

console.log("knowledge scene selection tests passed");
