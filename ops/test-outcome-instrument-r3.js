const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const outcomes = require("../lib/proactive-outcomes/archive/v14-c3-v3");
const { build } = require("./build-outcome-figures-r3");
const root = path.resolve(__dirname, "..");

// Independent answer key from the item-by-item mathematical audit.
const keys = {
  near_transfer: ["b", "a", "c", "c", "b"],
  representation_transfer: ["a", "c", "b", "b", "a"],
  retention: ["c", "b", "a", "a", "c"]
};
assert.equal(outcomes.version, "v14-c3-outcomes-v3");
assert.equal(outcomes.forVersion(outcomes.version), outcomes);
assert.equal(outcomes.forVersion("unknown"), null);
assert.equal(outcomes.forVersion(""), null);
const archive = outcomes.forVersion("v14-c3-outcomes-v2");
assert.equal(archive.version, "v14-c3-outcomes-v2");
const archivedText = fs.readFileSync(path.join(root, "lib/proactive-outcomes/archive/v14-c3-v2.js"), "utf8");
assert.equal(crypto.createHash("sha256").update(archivedText.replace(/\r\n/g, "\n")).digest("hex"),
  "1f1a5b889da9cba41c7bba85dfb14f79ecf8518e367e2f6ed0774b42aa524e92",
  "归档v2原题库不得被后续修订覆盖");
const counts = { a: 0, b: 0, c: 0 };
for (const stageId of outcomes.stageIds) {
  const stage = outcomes.publicStage(stageId);
  const legacy = archive.publicStage(stageId);
  const answers = Object.fromEntries(stage.items.map((item, i) => [item.id, keys[stageId][i]]));
  assert.equal(outcomes.grade(stageId, answers).score, 5);
  assert.equal(archive.grade(stageId, answers), null, "旧题库不得判新题");
  assert.equal(outcomes.grade(stageId, Object.fromEntries(legacy.items.map((item) => [item.id, "a"]))),
    null, "新题库不得判旧题");
  assert.equal(outcomes.sanitizeResponses(stageId, { [legacy.items[0].id]: "a" }), null,
    "版本错配草稿不能被悄悄清空");
  for (const [i, item] of stage.items.entries()) {
    assert.match(item.id, /-r3-/);
    assert.equal(Object.hasOwn(item, "answer"), false);
    counts[keys[stageId][i]] += 1;
    for (const option of item.options) {
      const grade = outcomes.grade(stageId, { ...answers, [item.id]: option.value });
      assert.equal(grade.score, option.value === keys[stageId][i] ? 5 : 4,
        `${item.id}/${option.value} 实际判分错误`);
    }
    if (stageId === "representation_transfer") {
      assert.ok(item.figure?.alt.length > 15);
      assert.equal(item.figure.width / item.figure.height, 640 / 300);
      const content = fs.readFileSync(path.join(root, item.figure.src), "utf8");
      assert.equal(content, build()[path.basename(item.figure.src)]);
      assert.doesNotMatch(content, /<script|<foreignObject|href=|https?:\/\/(?!www\.w3\.org)/i);
      assert.doesNotMatch(content, /正确答案|答案为|选择[ABCabc]|\uFFFD/);
    } else {
      assert.equal(Object.hasOwn(item, "figure"), false);
    }
  }
}
assert.deepEqual(counts, { a: 5, b: 5, c: 5 });
assert.match(outcomes.publicStage("near_transfer").items[2].prompt, /u=2\+x²/);
assert.match(outcomes.publicStage("representation_transfer").items[2].prompt, /x sin\(x\)/);
assert.match(outcomes.publicStage("retention").items[0].prompt, /5x⁴/);
assert.doesNotMatch(outcomes.publicStage("representation_transfer").items[2].prompt, /x eˣ/,
  "跨表征测量不能直接复用主动支架半成品例题");
assert.equal(archive.grade("near_transfer", {
  "V14-C3-NT-01": "a", "V14-C3-NT-02": "a", "V14-C3-NT-03": "c",
  "V14-C3-NT-04": "a", "V14-C3-NT-05": "a"
}).score, 5, "保留v2历史正确键");
console.log("独立测量v3通过：15题45选项判分、答案位置5/5/5、五图可重建、v2/v3题号隔离。");
