const assert = require("node:assert/strict");
const adapter = require("../lib/proactive-policy/adapters/v14-c3");
const lifecycle = require("../lib/proactive-policy/lifecycle");
const { checks } = require("../lib/proactive-policy/adapters/v14-c3-verification-v2");

const keys = {
  "GH-06-K01": ["b", "a", "c", "b", "c"],
  "GH-06-K02": ["a", "b", "c", "a", "b"],
  "GH-06-K03": ["c", "b", "a", "b", "c"],
  "GH-07-K01": ["b", "a", "c", "b", "a"],
  "GH-07-K02": ["c", "a", "b", "a", "c"],
  "GH-07-K03": ["b", "a", "c", "b", "a"],
  "GH-07-K04": ["a", "c", "b", "a", "c"]
};
const legacyKeys = {
  "GH-06-K01": ["b", "a", "a", "b", "c"],
  "GH-06-K02": ["a", "b", "b", "a", "c"],
  "GH-06-K03": ["b", "b", "b", "a", "b"],
  "GH-07-K01": ["b", "b", "c", "b", "a"],
  "GH-07-K02": ["b", "a", "b", "c", "a"],
  "GH-07-K03": ["b", "a", "b", "c", "b"],
  "GH-07-K04": ["a", "a", "a", "b", "c"]
};
const counts = { a: 0, b: 0, c: 0 };
const promptSet = new Set();
let optionCount = 0;
for (const [knowledgePointId, answers] of Object.entries(keys)) {
  for (let index = 0; index < 5; index += 1) {
    const supportLevel = `L${index + 1}`;
    const current = adapter.publicVerificationCheck(knowledgePointId, supportLevel,
      `${knowledgePointId}-probe-l${index + 1}-v2`);
    assert.equal(current.id, `${knowledgePointId}-probe-l${index + 1}-v2`);
    assert.equal(current.instrumentVersion, "v14-c3-verification-v2");
    assert.equal(current.evidenceScope, "post_support_local_check");
    assert.equal(Object.hasOwn(current, "answer"), false);
    assert.ok(current.subSkill && current.subSkill !== "legacy_unspecified");
    assert.ok(!promptSet.has(current.prompt), "同一检查题不能换个层级重复使用");
    promptSet.add(current.prompt);
    counts[answers[index]] += 1;
    for (const option of current.options) {
      const grade = adapter.gradeVerificationCheck({ knowledgePointId, supportLevel,
        checkId: current.id, response: option.value });
      assert.equal(grade.correct, option.value === answers[index], `${current.id}/${option.value}`);
      optionCount += 1;
    }
    assert.equal(adapter.gradeVerificationCheck({ knowledgePointId, supportLevel,
      checkId: current.id, response: "missing" }), null);
    const oldId = `${knowledgePointId}-probe-l${index + 1}-v1`;
    const old = adapter.publicVerificationCheck(knowledgePointId, supportLevel, oldId);
    assert.equal(old.id, oldId);
    assert.equal(old.instrumentVersion, "v14-c3-verification-v1");
    for (const option of old.options) {
      assert.equal(adapter.gradeVerificationCheck({ knowledgePointId, supportLevel,
        checkId: old.id, response: option.value }).correct,
      option.value === legacyKeys[knowledgePointId][index], `保留原题判分：${old.id}/${option.value}`);
    }
    assert.equal(adapter.publicVerificationCheck(knowledgePointId, supportLevel, "unknown-id"), null);
    const anotherLevel = supportLevel === "L1" ? "L2" : "L1";
    assert.equal(adapter.gradeVerificationCheck({ knowledgePointId, supportLevel: anotherLevel,
      checkId: current.id, response: answers[index] }), null, "跨层级题号不可判分");
  }
}
assert.deepEqual(counts, { a: 12, b: 12, c: 11 });
assert.equal(optionCount, 105);
assert.match(checks["GH-06-K01"].L1.prompt, /闭区间/);
assert.match(checks["GH-06-K02"].L2.prompt, /速度图像/);
assert.match(checks["GH-06-K03"].L2.prompt, /同一个区间/);
assert.match(checks["GH-07-K01"].L1.prompt, /连续/);
assert.match(checks["GH-07-K02"].L1.prompt, /连续/);
assert.match(checks["GH-07-K04"].L4.prompt, /x>0/);
const label = (knowledgePointId, level) => {
  const check = checks[knowledgePointId][level];
  return check.options.find((option) => option.value === check.answer).label;
};
assert.equal(Number(label("GH-06-K01", "L4")), (4 - 1) / 6);
assert.equal(Number(label("GH-06-K01", "L5")), 0.5 * (2 + 4 + 3 + 1));
assert.equal(Number(label("GH-06-K02", "L4")), -3 * 4);
assert.equal(Number(label("GH-07-K01", "L4")), -2 * 0.03);
assert.equal(Number(label("GH-07-K01", "L5")), 2 * 3 + 1);
assert.equal(Number(label("GH-07-K02", "L4")), 2 * (2 ** 3 - 1 ** 3));
assert.equal(Number(label("GH-07-K02", "L5")), 4 - (-2));
assert.equal(Number(label("GH-07-K03", "L5")), 1 + 0.5);
const candidates = [(x) => (x - 1) * Math.exp(2 * x),
  (x) => (x / 2 + 1 / 4) * Math.exp(2 * x), (x) => (x / 2 - 1 / 4) * Math.exp(2 * x)];
for (const [index, fn] of candidates.entries()) {
  const matches = [0.5, 1, 2].every((x) => {
    const h = 1e-5;
    return Math.abs((fn(x + h) - fn(x - h)) / (2 * h) - x * Math.exp(2 * x)) < 1e-4;
  });
  assert.equal(matches, index === 2, "分部积分新例题反求导数检查");
}
const pinned = lifecycle.normalize({ phase: "awaiting_independent_attempt",
  activeVerificationCheckId: "GH-06-K01-probe-l1-v2" });
assert.equal(pinned.activeVerificationCheckId, "GH-06-K01-probe-l1-v2");
const next = lifecycle.afterResolution({ lifecycle: pinned, resolution: "accepted",
  decision: { action: "concept_hint", support_level: "L2" } });
assert.equal(next.activeVerificationCheckId, "", "接受新层级必须清除上一层题号");
console.log("支架后检查v2通过：35题105选项、旧版35题判分保留、数值复算与跨层级隔离。");
