const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const katex = require("katex");
const QuestionMath = require("../lib/question-math");
const outcomes = require("../lib/proactive-outcomes/v14-c3");
const proactiveAdapter = require("../lib/proactive-policy/adapters/v14-c3");
const route = require("../data/multi-scene-learning-route.json");

const root = path.resolve(__dirname, "..");
let validatedMathSegments = 0;

function rendered(value) {
  return QuestionMath.renderToString(value, katex);
}

function assertMath(value, label) {
  const html = rendered(value);
  assert.match(html, /class="question-math-fragment"/, `${label} should create a math fragment`);
  assert.match(html, /class="katex"/, `${label} should be rendered by KaTeX`);
  assert.doesNotMatch(html, /\uFFFD/, `${label} must not contain replacement characters`);
  assert.doesNotMatch(html, /katex-error/, `${label} must not expose KaTeX error markup`);
  return html;
}

function assertEveryMathSegment(value, label) {
  QuestionMath.segment(value).forEach((entry, index) => {
    if (entry.type !== "math") return;
    validatedMathSegments += 1;
    assertMath(entry.raw || entry.value, `${label} segment ${index + 1}`);
  });
}

assertMath("计算 ∫₁³2x dx，并说明 F'(x)=2x。", "Unicode integral and derivative");
assertMath("令 u=1+x²，考察 0<x<1。", "superscript and inequality");
assertMath("更新式为 x_{k+1} = x_k - B_k^{-1}g_k。", "LaTeX-style subscripts");
assertMath("梯度满足 ∂L/∂w = (∂L/∂z)·x。", "partial derivative");
assertMath("使用 m_hat_t、v_hat_t 与 √v_hat_t。", "ASCII hats and square root");
assertMath("当 $n\\to\\infty$ 时，$S_n$ 收敛。", "explicit dollar delimiters");
assertMath("当 \\(h\\to0\\) 时计算 \\[F(x+h)-F(x)\\]。", "explicit bracket delimiters");
const partsCheck = proactiveAdapter.publicVerificationCheck("GH-07-K04", "L5");
assert.match(partsCheck.prompt, /e\^\{2x\}/);
partsCheck.options.forEach((option) => {
  assert.match(option.label, /e\^\{2x\}/);
  assert.match(rendered(option.label), /<msup><mi>e<\/mi><mrow><mn>2<\/mn><mi>x<\/mi><\/mrow><\/msup>/,
    "指数必须是完整的2x，而不是仅将左括号提升为指数");
});

const escaped = rendered("普通中文 <script>alert(1)</script> 与 SGD with Momentum");
assert.doesNotMatch(escaped, /<script>/i);
assert.doesNotMatch(escaped, /class="katex"/, "plain prose should not be mistaken for math");
assert.match(escaped, /&lt;script&gt;/);

const nearTransfer = outcomes.forVersion("v14-c3-outcomes-v3").publicStage("near_transfer");
assert.ok(nearTransfer?.items?.length, "near-transfer outcome fixture is missing");
nearTransfer.items.forEach((item) => {
  assertEveryMathSegment(item.prompt, `outcome prompt ${item.id}`);
  item.options.forEach((option) => {
    assertEveryMathSegment(option.label, `outcome option ${item.id}`);
  });
});

assert.equal(outcomes.version, "v14-c3-retention-v4");
const outcomeStages = outcomes.stageIds.map((stageId) => outcomes.publicStage(stageId));
assert.deepEqual(
  outcomeStages.map((stage) => stage.itemCount),
  [7],
  "新版应仅包含七题保持测量"
);
const outcomeCoverage = new Map();
outcomeStages.flatMap((stage) => stage.items).forEach((item) => {
  assert.ok(item.knowledgePointId, `${item.id} 缺少知识点标记`);
  assert.ok(item.cognitiveProcess, `${item.id} 缺少认知过程标记`);
  assertEveryMathSegment(item.prompt, `outcome prompt ${item.id}`);
  item.options.forEach((option) => {
    assertEveryMathSegment(option.label, `outcome option ${item.id}`);
  });
  outcomeCoverage.set(
    item.knowledgePointId,
    (outcomeCoverage.get(item.knowledgePointId) || 0) + 1
  );
});
[
  "GH-06-K01",
  "GH-06-K02",
  "GH-06-K03",
  "GH-07-K01",
  "GH-07-K02",
  "GH-07-K03",
  "GH-07-K04"
].forEach((knowledgePointId) => {
  assert.ok(
    outcomeCoverage.get(knowledgePointId) === 1,
    `${knowledgePointId} 在保持测量中应恰好出现一次`
  );
});

const chapter = route.chapters.find((item) => item.id === "V14-C3");
assert.ok(chapter, "V14-C3 route fixture is missing");
const variableUpperLimitPretest = chapter.flow.preQuiz.questions.find(
  (question) => question.id === "V14-C3-r3-pre-q3"
);
assert.ok(variableUpperLimitPretest, "V14-C3-r3-pre-q3 is missing");
assert.match(
  variableUpperLimitPretest.analysis,
  /上限处的值/,
  "变上限积分的导数解析应指向积分上限处的函数值"
);
assert.doesNotMatch(
  variableUpperLimitPretest.analysis,
  /下限处/,
  "变上限积分的导数解析不能误写为积分下限处的函数值"
);
const routeSamples = [
  chapter.flow.preQuiz.questions[2].question,
  chapter.flow.preQuiz.questions[8].question,
  chapter.flow.postQuiz.questions[2].analysis
];
routeSamples.forEach((value, index) => assertMath(value, `route question sample ${index + 1}`));

const mathTextKeys = new Set([
  "question",
  "prompt",
  "analysis",
  "label",
  "answer",
  "answerText",
  "referenceAnswer",
  "commentPrompt",
  "criterion"
]);

function validateRouteMath(value, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateRouteMath(entry, pathParts.concat(index)));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, entry]) => {
    const nextPath = pathParts.concat(key);
    if (typeof entry === "string" && mathTextKeys.has(key)) {
      assert.doesNotMatch(entry, /\uFFFD/, `${nextPath.join(".")} contains a replacement character`);
      assertEveryMathSegment(entry, nextPath.join("."));
      return;
    }
    validateRouteMath(entry, nextPath);
  });
}

validateRouteMath(route);

const knowledgePointIds = [
  "GH-06-K01",
  "GH-06-K02",
  "GH-06-K03",
  "GH-07-K01",
  "GH-07-K02",
  "GH-07-K03",
  "GH-07-K04"
];
const supportLevels = ["L1", "L2", "L3", "L4", "L5"];
knowledgePointIds.forEach((knowledgePointId) => {
  supportLevels.forEach((supportLevel) => {
    const check = proactiveAdapter.publicVerificationCheck(knowledgePointId, supportLevel);
    assert.ok(check, `${knowledgePointId} ${supportLevel} verification fixture is missing`);
    assertEveryMathSegment(check.prompt, `${knowledgePointId} ${supportLevel} prompt`);
    check.options.forEach((option) => {
      assertEveryMathSegment(option.label, `${knowledgePointId} ${supportLevel} option ${option.value}`);
    });
  });
});

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const flowHtml = fs.readFileSync(path.join(root, "flow-test.html"), "utf8");
const coreSource = fs.readFileSync(path.join(root, "app", "main", "core.js"), "utf8");
const quizSource = fs.readFileSync(path.join(root, "app", "main", "quiz.js"), "utf8");
const renderSource = fs.readFileSync(path.join(root, "app", "main", "render-learning.js"), "utf8");
const assistantSource = fs.readFileSync(path.join(root, "app", "main", "knowledge-assistant.js"), "utf8");
const flowSource = fs.readFileSync(path.join(root, "app", "flow-test", "flow-test.js"), "utf8");

assert.match(indexHtml, /lib\/question-math\.js/);
assert.match(flowHtml, /lib\/question-math\.js/);
assert.match(coreSource, /function renderQuestionMath\(/);
assert.match(coreSource, /function setQuestionMathContent\(/);
assert.match(quizSource, /renderQuestionMath\(/);
assert.match(renderSource, /renderQuestionMath\(/);
assert.match(assistantSource, /setQuestionMathContent\(legend,/);
assert.match(assistantSource, /setQuestionMathContent\(prompt,/);
assert.match(flowSource, /function renderQuestionMath\(/);

[
  "index.html",
  "flow-test.html",
  "styles.css",
  "app/flow-test/flow-test.css",
  "app/flow-test/flow-test.js",
  "app/main/core.js",
  "app/main/knowledge-assistant.js",
  "app/main/quiz.js",
  "app/main/render-learning.js",
  "lib/question-math.js"
].forEach((relativePath) => {
  const content = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(content, /\uFFFD|Ã|Â/, `${relativePath} contains likely encoding damage`);
});

console.log(JSON.stringify({
  ok: true,
  outcomeItems: outcomeStages.reduce((sum, stage) => sum + stage.itemCount, 0),
  outcomeKnowledgePoints: outcomeCoverage.size,
  routeSamples: routeSamples.length,
  validatedMathSegments
}, null, 2));
