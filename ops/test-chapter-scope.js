"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const route = require("../data/multi-scene-learning-route.json");
const graph = require("../data/knowledge-graph.json");
const index = require("../resources/open-maic/course-index.json");
assert.deepEqual(route.chapters.map(c => c.id), ["V14-C1"]);
assert.deepEqual(graph.chapters.map(c => c.id), ["V14-C1"]);
assert.equal(route.extensionIndex.length, 0);
assert.deepEqual(route.chapters[0].moduleIds, ["GH-01", "GH-02"]);
assert.equal(index.chapters.length, 2);
assert.ok(index.chapters.every(c => /^GH-0[12]-/.test(c.id)));
for (const dir of fs.readdirSync(path.join(root, "resources/open-maic"), { withFileTypes: true })) {
  if (dir.isDirectory()) assert.match(dir.name, /^GH-0[12]-/);
}
assert.equal(require("../lib/proactive-policy").adapterForChapter("V14-C3"), null);
assert.equal(require("../lib/proactive-outcomes/functions-limits").forVersion("v14-c3-outcomes-v3"), null);
for (const module of route.chapters[0].modules) {
  for (const point of module.knowledgePoints) {
    for (const resource of point.resourceCandidates) {
      assert.ok(fs.existsSync(path.join(root, "resources", resource.root, resource.file)), resource.file);
    }
  }
}
for (const dir of ["lib/assessments", "lib/proactive-policy/adapters", "lib/proactive-outcomes"]) {
  assert.ok(fs.readdirSync(path.join(root, dir)).every(name => !name.includes("v14-c3")));
}
console.log("独立章节范围通过：1章、2模块、6知识点、24互动，无其他章节题库或课件。");
