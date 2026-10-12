const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "resources/open-maic",
  "GH-07-微积分基本定理与积分方法", "interactive", "21_分部积分直觉：误解修复挑战.html");
const html = fs.readFileSync(file, "utf8");
const levelsSource = html.slice(html.indexOf("const LEVELS = ["), html.indexOf("// ============ GAME STATE"));
const confirmSource = html.slice(html.indexOf("function confirmChoice()"), html.indexOf("window.confirmChoice ="));
assert.ok(levelsSource && confirmSource);
const context = vm.createContext({
  gameState: {}, result: null, displayedSteps: null,
  document: { querySelectorAll: () => [] },
  $: () => ({}),
  window: { OpenMaicLearningEvidence: { recordChallenge: (event) => { context.result = event; } } },
  handleCorrectChoice: (level) => { context.displayedSteps = level.steps; },
  handleWrongChoice: () => {}
});
vm.runInContext(`${levelsSource}\n${confirmSource}\nglobalThis.levels = LEVELS;`, context);
const validPairs = [
  [["ln(x)", "x"]],
  [["x²", "eˣ"]],
  [["x", "sin(x)"]],
  [["cos(x)", "eˣ"], ["eˣ", "cos(x)"]],
  [["arctan(x)", "x"]]
];
let choices = 0;
context.levels.forEach((level, index) => {
  for (const u of level.cards) {
    for (const dv of level.cards) {
      context.gameState = { currentLevel: index, selectedU: u, selectedDv: dv,
        levelResolved: false, paused: false, levelAttempts: {} };
      context.displayedSteps = null;
      vm.runInContext("confirmChoice()", context);
      const expected = validPairs[index].some(([a, b]) => a === u.label && b === dv.label);
      assert.equal(context.result.is_correct, expected, `第${index + 1}关 ${u.label} / ${dv.label}`);
      assert.equal(context.result.evidence_scope, "factor_selection");
      const reverse = level.wrong?.u === u.label && level.wrong?.dv === dv.label;
      assert.equal(context.result.mathematically_valid_split, expected || reverse);
      assert.equal(context.result.error_type, expected ? "" : reverse ? "inefficient_strategy" : "factor_mismatch");
      if (expected) {
        assert.ok(context.displayedSteps.some((step) =>
          step.type === "choice" && step.formula.includes(`u = ${u.label}, dv = ${dv.label} dx`)));
      }
      choices += 1;
    }
  }
});
assert.equal(choices, 80);

// The analytic functions below correspond to each displayed final expression.
const primitives = [
  (x) => x * x / 2 * Math.log(x) - x * x / 4,
  (x) => Math.exp(x) * (x * x - 2 * x + 2),
  (x) => -x * Math.cos(x) + Math.sin(x),
  (x) => Math.exp(x) * (Math.cos(x) + Math.sin(x)) / 2,
  (x) => (x * x + 1) / 2 * Math.atan(x) - x / 2
];
const integrands = [
  (x) => x * Math.log(x), (x) => x * x * Math.exp(x),
  (x) => x * Math.sin(x), (x) => Math.exp(x) * Math.cos(x),
  (x) => x * Math.atan(x)
];
const finalExpressions = [
  "= (x²/2)·ln(x) - x²/4 + C",
  "= eˣ(x² - 2x + 2) + C",
  "= -x·cos(x) + sin(x) + C",
  "I = eˣ(cos(x)+sin(x))/2 + C",
  "= (x²/2)·arctan(x) - x/2 + (1/2)arctan(x) + C"
];
context.levels.forEach((level, index) => {
  assert.equal(level.steps.at(-1).formula, finalExpressions[index]);
  for (const x of [0.2, 0.5, 1, 1.7, 3]) {
    const h = 1e-5;
    const derivative = (primitives[index](x + h) - primitives[index](x - h)) / (2 * h);
    const expected = integrands[index](x);
    assert.ok(Math.abs(derivative - expected) < 1e-7 * Math.max(1, Math.abs(expected)));
  }
});
const inversePrimitive = (x) => x * Math.atan(x) - 0.5 * Math.log(1 + x * x);
assert.equal(context.levels[4].wrong.dvResult, "x·arctan(x) - (1/2)ln(1+x²)");
for (const x of [-2, -0.5, 0, 0.5, 2]) {
  assert.ok(Math.abs((inversePrimitive(x + 1e-5) - inversePrimitive(x - 1e-5)) / 2e-5
    - Math.atan(x)) < 1e-8);
}
assert.equal(context.levels[3].alternatives[0].steps.at(-1).formula, finalExpressions[3]);
console.log("分部积分五关通过：80种选择判分、6种有效拆法、五个最终原函数及反向拆法积分复算。");
