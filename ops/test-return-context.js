const assert = require("node:assert/strict");

let returnContext = {};
try {
  returnContext = require("../app/main/return-context");
} catch {}

assert.equal(typeof returnContext.captureLearningContext, "function");
assert.equal(typeof returnContext.resolveLearningContext, "function");
assert.equal(typeof returnContext.shouldReturnToLearning, "function");

assert.equal(returnContext.shouldReturnToLearning("progress"), true);
assert.equal(returnContext.shouldReturnToLearning("feedback"), true);
assert.equal(returnContext.shouldReturnToLearning("home"), false);

assert.deepEqual(
  returnContext.captureLearningContext({
    chapterId: "V14-C1",
    unitId: "GH-01-K01",
    sceneType: "simulation"
  }),
  {
    chapterId: "V14-C1",
    unitId: "GH-01-K01",
    sceneType: "simulation"
  }
);

assert.deepEqual(
  returnContext.resolveLearningContext(
    { chapterId: "V14-C1", unitId: "GH-01-K01", sceneType: "simulation" },
    { chapterId: "V14-C2", unitId: "GH-02-K01" }
  ),
  { chapterId: "V14-C1", unitId: "GH-01-K01", sceneType: "simulation" }
);

assert.deepEqual(
  returnContext.resolveLearningContext(
    null,
    { chapterId: "V14-C2", unitId: "GH-02-K01", sceneType: "simulation" }
  ),
  { chapterId: "V14-C2", unitId: "GH-02-K01", sceneType: "simulation" }
);

console.log("return context tests passed");
