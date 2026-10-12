const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const route = JSON.parse(
  fs.readFileSync(path.join(root, "data", "multi-scene-learning-route.json"), "utf8")
);
const chapter = route.chapters.find((item) => item.id === "V14-C3");

assert.ok(chapter, "V14-C3 chapter must exist");

const resources = [];
(chapter.modules || []).forEach((module) => {
  (module.knowledgePoints || []).forEach((knowledgePoint) => {
    (knowledgePoint.resourceCandidates || []).forEach((candidate) => {
      resources.push({ module, knowledgePoint, candidate });
    });
  });
});

assert.equal(resources.length, 28, "V14-C3 must keep all 28 interactive resources");
assert.equal(
  resources.filter(({ candidate }) => candidate.type === "game").length,
  7,
  "V14-C3 must keep all seven game scenes"
);

const learningEvidencePath = path.join(root, "app", "main", "courseware-learning-evidence.js");
assert.ok(fs.existsSync(learningEvidencePath), "courseware learning-evidence runtime is required");

const {
  createLearningEvidenceClient,
  evaluateDisplacementAttempt,
  expectedIntegralZone,
  relativeAccuracy
} = require(learningEvidencePath);

assert.equal(relativeAccuracy(12, 10), 0.8, "over-estimation must not become 100% accurate");
assert.equal(relativeAccuracy(8, 10), 0.8, "under-estimation must use the same relative-error rule");
assert.equal(relativeAccuracy(10, 10), 1);
assert.equal(relativeAccuracy(1, 0), 0);

assert.deepEqual(
  evaluateDisplacementAttempt({
    target: 0,
    position: 0,
    totalDistance: 0,
    hadPositiveVelocity: false,
    hadNegativeVelocity: false
  }),
  {
    passed: false,
    precisionPassed: true,
    conceptPassed: false,
    error: 0,
    reason: "需要用正、负速度形成相互抵消的位移"
  },
  "the final displacement level must not pass by waiting at the origin"
);
assert.equal(
  evaluateDisplacementAttempt({
    target: 0,
    position: 0.2,
    totalDistance: 4,
    hadPositiveVelocity: true,
    hadNegativeVelocity: true
  }).passed,
  true
);
assert.equal(expectedIntegralZone({ category: "determinate", isError: true }), "error");
assert.equal(expectedIntegralZone({ category: "indefinite", isError: false }), "indefinite");

const posted = [];
let now = Date.parse("2026-09-03T00:00:00.000Z");
const contract = {
  schema_version: "openmaic.semantic-contract.v1",
  contract_revision: "2026-09-03",
  course_version: route.versionId,
  chapter_id: chapter.id,
  module_id: "GH-06",
  knowledge_point_id: "GH-06-K01",
  concept_tag: "小矩形逼近面积",
  scene_type: "game",
  resource_id: "GH-06-K01:game",
  resource_title: "小矩形逼近面积：误解修复挑战"
};
const fakeWindow = {
  parent: {
    postMessage(message) {
      posted.push(message);
    }
  },
  dispatchEvent() {},
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
};
const fakeDocument = {
  querySelector(selector) {
    if (selector.includes("openmaic-semantic-contract")) {
      return { textContent: JSON.stringify(contract) };
    }
    return null;
  }
};
const evidence = createLearningEvidenceClient({
  window: fakeWindow,
  document: fakeDocument,
  now: () => now,
  createId: (() => {
    let id = 0;
    return () => `evidence-${++id}`;
  })()
});

evidence.recordHint({ hint_type: "conceptual" });
now += 1200;
evidence.recordChallenge({ challenge_id: "level-1", is_correct: false, error_type: "relative_error" });
now += 800;
evidence.recordChallenge({ challenge_id: "level-1", is_correct: true, score: 1, max_score: 1 });
evidence.completeScene({ completed: true, score: 1, max_score: 1 });

assert.deepEqual(
  posted.map((entry) => entry.payload.event_type),
  [
    "hint_requested",
    "attempt_submitted",
    "challenge_result",
    "independent_check_completed",
    "attempt_submitted",
    "challenge_result",
    "independent_check_completed",
    "scene_completed"
  ]
);
assert.equal(posted[1].payload.independent, false);
assert.equal(posted[1].payload.hint_count, 1);
assert.equal(posted[4].payload.independent, true);
assert.equal(posted[4].payload.attempt_number, 2);
assert.equal(posted[5].payload.is_correct, true);
posted.forEach((entry) => {
  assert.equal(entry.type, "maic_learning_event");
  assert.equal(entry.payload.chapter_id, "V14-C3");
  assert.equal(entry.payload.knowledge_point_id, "GH-06-K01");
  assert.equal(entry.payload.scene_type, "game");
});

function parseSemanticContract(html, file) {
  const match = html.match(
    /<script\s+type="application\/json"\s+id="openmaic-semantic-contract"[^>]*>([\s\S]*?)<\/script>/i
  );
  assert.ok(match, `${file} is missing openmaic-semantic-contract`);
  return JSON.parse(match[1]);
}

const gameSources = new Map();
resources.forEach(({ module, knowledgePoint, candidate }) => {
  const file = path.join(root, "resources", candidate.root, candidate.file);
  const html = fs.readFileSync(file, "utf8");
  const semantic = parseSemanticContract(html, file);

  assert.equal(semantic.schema_version, "openmaic.semantic-contract.v1");
  const revisedGame = candidate.type === "game"
    && ["GH-06-K02", "GH-07-K01", "GH-07-K02"].includes(knowledgePoint.id);
  const revisedEvidence = candidate.type === "game"
    && ["GH-07-K01", "GH-07-K04"].includes(knowledgePoint.id);
  const revisedSimulation = candidate.type === "simulation" && knowledgePoint.id === "GH-07-K03";
  assert.equal(semantic.contract_revision, revisedSimulation ? "2026-09-09-simulation-audit-r2"
    : revisedEvidence ? "2026-09-09-game-audit-r3"
    : revisedGame ? "2026-09-09-game-audit-r2" : "2026-09-03");
  assert.equal(semantic.course_version, route.versionId);
  assert.equal(semantic.chapter_id, chapter.id);
  assert.equal(semantic.module_id, module.id);
  assert.equal(semantic.knowledge_point_id, knowledgePoint.id);
  assert.equal(semantic.concept_tag, knowledgePoint.name);
  assert.equal(semantic.scene_type, candidate.type);
  assert.equal(semantic.resource_title, candidate.title);
  assert.equal(semantic.learning_objective, knowledgePoint.goal);
  assert.equal(semantic.misconception, knowledgePoint.misconception);
  assert.ok(Array.isArray(semantic.evidence_events));
  assert.ok(semantic.evidence_events.includes("scene_entered"));
  assert.ok(semantic.evidence_events.includes("interaction_change"));
  if (candidate.type === "game") {
    [
      "attempt_submitted",
      "challenge_result",
      "hint_requested",
      "reset_used",
      "independent_check_completed",
      "scene_completed"
    ].forEach((eventType) => {
      assert.ok(
        semantic.evidence_events.includes(eventType),
        `${candidate.title} contract must declare ${eventType}`
      );
    });
    gameSources.set(knowledgePoint.id, html);
    assert.match(html, /recordChallenge\s*\(\s*\{/);
    assert.match(html, /recordHint\s*\(\s*\{/);
    assert.match(html, /recordReset\s*\(\s*\{/);
    assert.match(html, /completeScene\s*\(\s*\{/);
    assert.doesNotMatch(
      html,
      /__calculusQuestReportChallengeResult/,
      `${candidate.title} must not use the retired challenge-result bridge`
    );
  }
});

const stableChallengeIds = new Map([
  ["GH-06-K01", /GH-06-K01-area-level-/],
  ["GH-06-K02", /GH-06-K02-displacement-level-/],
  ["GH-06-K03", /GH-06-K03-antiderivative-level-/],
  ["GH-07-K01", /GH-07-K01-strip-level-/],
  ["GH-07-K02", /GH-07-K02-classification-item-/],
  ["GH-07-K03", /GH-07-K03-substitution-level-/],
  ["GH-07-K04", /GH-07-K04-parts-level-/]
]);
stableChallengeIds.forEach((pattern, knowledgePointId) => {
  assert.match(
    gameSources.get(knowledgePointId),
    pattern,
    `${knowledgePointId} must emit a stable challenge identifier`
  );
});

const areaGame = gameSources.get("GH-06-K01");
assert.doesNotMatch(areaGame, /Math\.min\(approxArea\s*\/\s*trueArea,\s*1\.0\)/);
assert.doesNotMatch(areaGame, /approxArea\s*\+=\s*r\.h\s*\*\s*r\.w/);
assert.match(areaGame, /relativeAccuracy\s*\(/);
assert.match(areaGame, /meaningfulChanges\s*>\s*0/);

const accumulationGame = gameSources.get("GH-06-K02");
assert.match(accumulationGame, /evaluateDisplacementAttempt\s*\(/);
assert.match(accumulationGame, /bindHoldControl\s*\(/);
assert.match(accumulationGame, /lastLevelPassed/);

const antiderivativeGame = gameSources.get("GH-06-K03");
assert.equal(
  (antiderivativeGame.match(/state\.timerInterval\s*=\s*setInterval\(updateTimer,\s*1000\)/g) || []).length,
  1,
  "the antiderivative game must own exactly one timer interval"
);
assert.match(antiderivativeGame, /addEventListener\('click',\s*\(\)\s*=>\s*placeCard/);

const upperLimitGame = gameSources.get("GH-07-K01");
const levelsBlock = upperLimitGame.match(/const levels = (\[[\s\S]*?\n\]);/);
assert.ok(levelsBlock, "变上限游戏必须提供可审查的关卡参数");
const upperLimitLevels = vm.runInNewContext(`(${levelsBlock[1]})`, {}, { timeout: 1000 });
for (const level of upperLimitLevels) {
  const [left, right] = level.xRange;
  assert.ok(Math.abs(level.stripWidth * level.stripCount - (right - left)) < 1e-9,
    `${level.name}的等宽分割必须覆盖整个积分区间`);
  let numericalArea = 0;
  const n = 10000;
  const dx = (right - left) / n;
  for (let i = 0; i < n; i += 1) numericalArea += level.func(left + (i + 0.5) * dx) * dx;
  assert.ok(Math.abs(numericalArea - level.targetArea) < 1e-6,
    `${level.name}的目标面积应等于指定区间的有向积分`);
}
const placedBlock = upperLimitGame.match(/function drawPlacedStrips\(\) \{[\s\S]*?\n\}/);
assert.ok(placedBlock);
for (const level of upperLimitLevels) {
  const rectangles = [];
  const strips = Array.from({ length: level.stripCount }, (_, i) => {
    const x = level.xRange[0] + (i + 0.5) * level.stripWidth;
    return { x, y: level.func(x), width: level.stripWidth, placed: true, color: "blue" };
  });
  vm.runInNewContext(`${placedBlock[0]}\ndrawPlacedStrips();`, {
    levels: [level], currentLevel: 0, strips,
    toCanvasX: (x) => x, toCanvasY: (y) => -y,
    ctx: { fillRect: (...rect) => rectangles.push(rect), strokeRect() {} }
  }, { timeout: 1000 });
  assert.equal(rectangles.length, level.stripCount);
  assert.ok(Math.abs(rectangles[0][0] - level.xRange[0]) < 1e-9);
  assert.ok(Math.abs(rectangles.at(-1)[0] + rectangles.at(-1)[2] - level.xRange[1]) < 1e-9,
    `${level.name}绘图必须以中点取样位置为矩形中心，不得右移半格`);
  rectangles.forEach((rect, index) => {
    assert.ok(Math.abs(rect[3] - strips[index].y) < 1e-9,
      "矩形必须保留被积函数的正负方向");
  });
}
const hitBlock = upperLimitGame.match(/function findUnplacedStripAt\(x, y\) \{[\s\S]*?\n\}/);
assert.ok(hitBlock);
assert.equal(vm.runInNewContext(`${hitBlock[0]}\nBoolean(findUnplacedStripAt(100, 100));`, {
  unplacedStrips: [{ x: 100, y: 100, width: 40, height: -100, strip: { placed: false } }]
}, { timeout: 1000 }), true, "负高度微元也必须可以点击并拖动");
assert.match(upperLimitGame, /maxCombo\s*=\s*0/);
assert.match(upperLimitGame, /recordHint\s*\(/);
assert.match(
  upperLimitGame,
  /window\.restartGame\s*=\s*function\(\)\s*\{[\s\S]*?initLevel\(\);\s*startRenderLoop\(\);\s*\};/
);
const upperLimitPauseBlock = upperLimitGame.match(
  /window\.togglePause\s*=\s*function\(\)\s*\{([\s\S]*?)\n\};/
);
assert.ok(upperLimitPauseBlock, "the upper-limit game must expose its pause handler");
assert.doesNotMatch(upperLimitPauseBlock[1], /requestAnimationFrame\(render\)/);
assert.doesNotMatch(upperLimitGame, /name:\s*"[^"]*[“”],\s*desc:/);

const fundamentalTheoremGame = gameSources.get("GH-07-K02");
const expressionPoolBlock = fundamentalTheoremGame.match(/const expressionPool = (\[[\s\S]*?\n  \]);/);
assert.ok(expressionPoolBlock);
const classificationItems = vm.runInNewContext(`(${expressionPoolBlock[1]})`, {}, { timeout: 1000 });
const classificationKey = [
  ["∫₀¹ x dx", "= 1/2", "determinate"],
  ["∫₀² x² dx", "= 8/3", "determinate"],
  ["∫₁³ 2x dx", "= 8", "determinate"],
  ["∫₀^π sin x dx", "= 2", "determinate"],
  ["∫₀¹ eˣ dx", "= e-1", "determinate"],
  ["∫₁² (1/x) dx", "= ln2", "determinate"],
  ["∫₋₁¹ x³ dx", "= 0", "determinate"],
  ["∫₀³ 3x² dx", "= 27", "determinate"],
  ["∫₀^(π/2) cos x dx", "= 1", "determinate"],
  ["∫ x dx", "= x²/2 + C", "indefinite"],
  ["∫ x² dx", "= x³/3 + C", "indefinite"],
  ["∫ sin x dx", "= -cos x + C", "indefinite"],
  ["∫ eˣ dx", "= eˣ + C", "indefinite"],
  ["∫ (1/x) dx", "= ln|x| + C", "indefinite"],
  ["∫ cos x dx", "= sin x + C", "indefinite"],
  ["∫ 2x dx", "= x² + C", "indefinite"],
  ["∫ x³ dx", "= x⁴/4 + C", "indefinite"]
];
assert.equal(classificationItems.length, 22);
assert.equal(classificationItems.filter((entry) => entry.isError).length, 5);
for (const entry of classificationItems) {
  const expected = classificationKey.find(([text]) => text === entry.text);
  assert.ok(expected, `未审校的分类题：${entry.text}`);
  assert.equal(entry.category, expected[2]);
  assert.equal(entry.isError, entry.result !== expected[1], `分类数学判定错误：${entry.text} ${entry.result}`);
  assert.equal(expectedIntegralZone(entry), entry.isError ? "error" : expected[2]);
}
const expressionClass = fundamentalTheoremGame.match(/class Expression \{[\s\S]*?\n  \}/);
assert.ok(expressionClass);
function classificationDrawing(data) {
  const drawing = [];
  const ctx = new Proxy({}, {
    set(target, name, value) {
      drawing.push([name, value]);
      target[name] = value;
      return true;
    },
    get(target, name) {
      if (name === "createLinearGradient") return () => ({
        addColorStop: (...args) => drawing.push(["colorStop", ...args])
      });
      if (name === "fillText") return (text, ...args) => drawing.push([
        name, text === data.text ? "expression" : text === data.result ? "result" : text, ...args
      ]);
      return (...args) => drawing.push([name, ...args]);
    }
  });
  vm.runInNewContext(`${expressionClass[0]}\nnew Expression(data, 20, 40).draw(ctx);`, {
    data, ctx, W: 390, level: 1, levelConfig: [{ speed: 0.4 }]
  }, { timeout: 1000 });
  return JSON.stringify(drawing);
}
const neutralDrawing = classificationDrawing(classificationItems[0]);
classificationItems.forEach((entry) => assert.equal(classificationDrawing(entry), neutralDrawing,
  "作答前卡片不能以颜色、图标、字体或边框暴露正确分类"));
assert.match(fundamentalTheoremGame, /id="zoneError"/);
assert.match(fundamentalTheoremGame, /expectedIntegralZone\s*\(/);
assert.match(fundamentalTheoremGame, /ctx\.setTransform\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/);
assert.match(fundamentalTheoremGame, /window\.showStart\s*=\s*showStart/);
assert.match(fundamentalTheoremGame, /#hintBtn\s*\{[\s\S]*?position:\s*absolute/);
assert.doesNotMatch(fundamentalTheoremGame, /name:\s*"[^"]*[“”],\s*desc:/);

const substitutionGame = gameSources.get("GH-07-K03");
assert.match(substitutionGame, /ctx\.setTransform\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/);
assert.match(substitutionGame, /totalPaused\s*=\s*0;\s*\r?\n\s*pauseStart\s*=\s*0;/);
assert.match(substitutionGame, /window\.useHint\s*=\s*useHint/);
assert.match(
  substitutionGame,
  /nextBtn\.onclick\s*=\s*function\(\)\s*\{[\s\S]*?initLevel\(\);\s*requestAnimationFrame\(gameLoop\);\s*\};/
);

const integrationByPartsGame = gameSources.get("GH-07-K04");
assert.doesNotMatch(
  integrationByPartsGame,
  /function initLevel\([\s\S]*?levelAttempts\[gameState\.currentLevel\][\s\S]*?\/\/ Set target/
);
assert.match(
  integrationByPartsGame,
  /function confirmChoice\([\s\S]*?levelAttempts\[gameState\.currentLevel\]/
);
assert.match(integrationByPartsGame, /clearInterval\(gameState\.timerInterval\)/);
assert.match(integrationByPartsGame, /window\.resetSelection\s*=\s*resetSelection/);
assert.match(integrationByPartsGame, /window\.confirmChoice\s*=\s*confirmChoice/);
assert.doesNotMatch(integrationByPartsGame, /uReason:\s*"[^"]*[“”],\s*dvReason:/);

const renderLearning = fs.readFileSync(path.join(root, "app", "main", "render-learning.js"), "utf8");
[
  "attempt_submitted",
  "hint_requested",
  "reset_used",
  "independent_check_completed",
  "scene_completed"
].forEach((eventType) => assert.match(renderLearning, new RegExp(`${eventType}:`)));
[
  "schema_version",
  "chapter_id",
  "knowledge_point_id",
  "scene_type",
  "independent",
  "hint_count",
  "reset_count",
  "error_type"
].forEach((key) => assert.match(renderLearning, new RegExp(`"${key}"`)));

const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
assert.match(server, /coursewareLearningEvidenceScript/);
assert.match(server, /data-openmaic-learning-evidence-runtime/);

const routeSource = fs.readFileSync(
  path.join(root, "data", "multi-scene-learning-route.json"),
  "utf8"
);
assert.doesNotMatch(routeSource, /导数等于被积函数在下限处的值/);
assert.match(routeSource, /导数等于被积函数在上限处的值/);

console.log("V14-C3 courseware semantics tests passed");
