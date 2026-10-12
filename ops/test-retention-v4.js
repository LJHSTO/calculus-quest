const assert = require("node:assert/strict");
const outcomes = require("../lib/proactive-outcomes/v14-c3");
assert.equal(outcomes.version, "v14-c3-retention-v4");
assert.deepEqual(outcomes.stageIds, ["retention"]);
const stage = outcomes.publicStage("retention");
const keys = ["c", "b", "a", "a", "c", "c", "b"];
assert.equal(stage.itemCount, 7);
assert.equal(new Set(stage.items.map((item) => item.knowledgePointId)).size, 7);
const responses = Object.fromEntries(stage.items.map((item, i) => [item.id, keys[i]]));
assert.equal(outcomes.grade("retention", responses).score, 7);
for (const [i, item] of stage.items.entries()) {
  assert.equal(Object.hasOwn(item, "answer"), false);
  for (const option of item.options) {
    assert.equal(outcomes.grade("retention", { ...responses, [item.id]: option.value }).score,
      option.value === keys[i] ? 7 : 6);
  }
}
assert.equal(outcomes.publicStage("near_transfer"), null);
assert.equal(outcomes.grade("retention", {}), null);
assert.equal(outcomes.sanitizeResponses("retention", { "V14-C3-DR-r3-01": "c" }), null);
assert.equal(outcomes.forVersion("v14-c3-outcomes-v3").stageIds.length, 3);
assert.equal(outcomes.forVersion("v14-c3-outcomes-v2").stageIds.length, 3);
console.log("保持测量v4：七知识点、21选项判分、版本隔离通过。");
