const assert = require("node:assert/strict");
const adapter = require("../lib/proactive-policy/adapters/v14-c3");
const previous = require("../lib/proactive-policy/adapters/v14-c3-verification-v2");
const current = require("../lib/proactive-policy/adapters/v14-c3-verification-v3");
const math = require("../lib/question-math");
const katex = require("katex");

let changed = 0;
let choices = 0;
for (const [point, levels] of Object.entries(current.checks)) {
  for (const [level, check] of Object.entries(levels)) {
    const published = adapter.publicVerificationCheck(point, level);
    assert.equal(published.id, check.id);
    assert.equal(published.instrumentVersion, current.version);
    assert.equal(Object.hasOwn(published, "answer"), false);
    const old = previous.checks[point][level];
    assert.equal(adapter.publicVerificationCheck(point, level, old.id).instrumentVersion, previous.version);
    for (const option of check.options) {
      assert.equal(adapter.gradeVerificationCheck({
        knowledgePointId: point, supportLevel: level, checkId: check.id, response: option.value
      }).correct, option.value === check.answer);
      choices += 1;
    }
    const content = ({ prompt, options, answer, subSkill }) => ({ prompt, options, answer, subSkill });
    if (point === "GH-07-K04" && level === "L4") {
      changed += 1;
      assert.notDeepEqual(content(check), content(old));
      assert.equal(old.subSkill, "logarithm_split");
      assert.equal(check.subSkill, "parts_differentials_and_substitution");
    } else assert.deepEqual(content(check), content(old), `${point}/${level}不应改变内容`);
    assert.equal(adapter.gradeVerificationCheck({
      knowledgePointId: point, supportLevel: level, checkId: check.id.replace("-v3", "-v99"), response: "a"
    }), null);
  }
}
assert.equal(changed, 1);
assert.equal(choices, 105);
const check = current.checks["GH-07-K04"].L4;
assert.equal(check.options[0].label, "du=dx，v=-cos(2x)/2，得到 -x cos(2x)/2+(1/2)∫cos(2x)dx");
assert.equal(check.options[1].label, "du=dx，v=-cos(2x)/2，得到 -x cos(2x)/2-(1/2)∫cos(2x)dx");
assert.equal(check.options[2].label, "du=dx，v=-cos(2x)，得到 -x cos(2x)+∫cos(2x)dx");
const primitives = [
  (x) => -x * Math.cos(2 * x) / 2 + Math.sin(2 * x) / 4,
  (x) => -x * Math.cos(2 * x) / 2 - Math.sin(2 * x) / 4,
  (x) => -x * Math.cos(2 * x) + Math.sin(2 * x) / 2
];
for (const x of [0.2, 0.5, 1, 1.2]) {
  primitives.forEach((fn, index) => {
    const derivative = (fn(x + 1e-5) - fn(x - 1e-5)) / 2e-5;
    const error = Math.abs(derivative - x * Math.sin(2 * x));
    assert.equal(error < 1e-8, index === 0, `选项${index + 1}，x=${x}`);
  });
}
for (const text of [check.prompt, ...check.options.map((option) => option.label)]) {
  for (const part of math.segment(text).filter((entry) => entry.type === "math")) {
    assert.match(math.renderToString(part.raw || part.value, katex), /class="katex"/);
  }
}
console.log("支架检查v3通过：35题105选项，仅修订L4一题；保留v2、未知版本拒绝及公式反求导复算。");
