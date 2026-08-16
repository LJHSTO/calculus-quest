"use strict";

const assert = require("assert");
const route = require("../data/multi-scene-learning-route.json");
const { validatePairedAssessment, validateFormativeAssessment } = require("./assessment-output-validator");

const moduleDefinition = route.chapters
  .flatMap((chapter) => chapter.modules || [])
  .find((module) => module.id === "GH-02");

function options(correctValue, labels = ["1", "2", "3", "4"]) {
  return labels.map((label, index) => ({ value: String.fromCharCode(65 + index), label }));
}

function choice(id, phase, index, type, kpId, pairId, overrides = {}) {
  const multiple = type === "multiple";
  return {
    id: `GH-02-${phase}-q${index}`,
    type,
    question: `${phase} 第 ${index} 题的完整题干`,
    options: options(),
    answer: multiple ? ["A", "C"] : ["B"],
    analysis: "依据已知条件逐步判断，答案与选项一致。",
    points: 8,
    knowledgePointIds: [kpId],
    cognitiveLevel: index === 4 ? "分析" : "理解",
    estimatedSteps: index === 4 ? 3 : 2,
    pairId,
    equivalence: {
      presentationMode: "text",
      knownConditionCount: index === 4 ? 3 : 2,
      operationCount: 1,
      symbolComplexity: "low",
      conclusionClass: index === 5 ? "continuous" : "limit-reading"
    },
    ...overrides
  };
}

function tableChoice(phase, targetX, targetY, pairId) {
  const left = [0.3, 0.2, 0.1].map((delta) => ({ x: targetX - delta, y: targetY - delta }));
  const right = [0.1, 0.2, 0.3].map((delta) => ({ x: targetX + delta, y: targetY + delta }));
  return choice(`GH-02-${phase}-q1`, phase, 1, "single", "GH-02-K01", pairId, {
    question: `完整数表显示 x 从两侧趋近 ${targetX}，判断 f(x) 的趋近值。`,
    options: options("B", [String(targetY - 1), String(targetY), String(targetY + 1), "不存在"]),
    answer: ["B"],
    equivalence: {
      presentationMode: "table",
      knownConditionCount: 6,
      operationCount: 0,
      symbolComplexity: "low",
      conclusionClass: "finite-limit"
    },
    evidence: {
      kind: "two-sided-table",
      targetX,
      targetY,
      correctOptionId: "B",
      rows: [...left, ...right]
    }
  });
}

function textQuestion(phase, value) {
  return {
    id: `GH-02-${phase}-q6`,
    type: "text",
    question: `已知左极限、右极限和函数值都为 ${value}，判断并说明连续性。`,
    answer: "连续。左右极限相等，且极限值等于函数值。",
    analysis: "分别核对左右极限、双侧极限和函数值三个条件。",
    points: 20,
    knowledgePointIds: ["GH-02-K03"],
    cognitiveLevel: "分析",
    estimatedSteps: 3,
    pairId: "P06",
    equivalence: {
      presentationMode: "text",
      knownConditionCount: 3,
      operationCount: 0,
      symbolComplexity: "low",
      conclusionClass: "continuous"
    },
    rubric: [
      { criterion: "说明左极限存在", points: 6 },
      { criterion: "说明右极限存在且左右相等", points: 6 },
      { criterion: "比较极限值与函数值并作结论", points: 8 }
    ]
  };
}

function pairedPayload() {
  const pre = [
    tableChoice("pre", 2, 4, "P01"),
    choice(null, "pre", 2, "single", "GH-02-K01", "P02"),
    choice(null, "pre", 3, "single", "GH-02-K02", "P03"),
    choice(null, "pre", 4, "multiple", "GH-02-K02", "P04"),
    choice(null, "pre", 5, "single", "GH-02-K03", "P05"),
    textQuestion("pre", 4)
  ];
  const post = [
    tableChoice("post", 3, 5, "P01"),
    choice(null, "post", 2, "single", "GH-02-K01", "P02"),
    choice(null, "post", 3, "single", "GH-02-K02", "P03"),
    choice(null, "post", 4, "multiple", "GH-02-K02", "P04"),
    choice(null, "post", 5, "single", "GH-02-K03", "P05"),
    textQuestion("post", 6)
  ];
  return {
    languageDirective: "zh-CN",
    courseTitle: "极限与连续：直觉探索测评",
    outlines: [
      { id: "GH-02-pre", type: "quiz", title: "前测：极限与连续：直觉探索（A卷）", order: 1, difficulty: "medium", keyPoints: pre.map(JSON.stringify) },
      { id: "GH-02-post", type: "quiz", title: "后测：极限与连续：直觉探索（B卷）", order: 2, difficulty: "medium", keyPoints: post.map(JSON.stringify) }
    ]
  };
}

const validPaired = validatePairedAssessment(pairedPayload(), moduleDefinition);
assert.deepEqual(validPaired.errors, [], JSON.stringify(validPaired.errors, null, 2));
assert.equal(validPaired.valid, true);

const malformed = pairedPayload();
const malformedPre = malformed.outlines[0].keyPoints.map(JSON.parse);
malformedPre.push({ ...malformedPre[5], id: "GH-02-pre-q6b" });
malformed.outlines[0].keyPoints = malformedPre.map(JSON.stringify);
const malformedPost = malformed.outlines[1].keyPoints.map(JSON.parse);
malformedPost.splice(1, 1);
malformedPost[0].evidence.targetY = 99;
malformedPost[0].answer = ["A"];
malformedPost[0].analysis = "这是示意性设计，实际趋近行为需结合题目设定。";
malformed.outlines[1].keyPoints = malformedPost.map(JSON.stringify);
const invalidPaired = validatePairedAssessment(malformed, moduleDefinition);
assert.equal(invalidPaired.valid, false);
for (const code of ["QUESTION_COUNT_INVALID", "TABLE_TREND_INCORRECT", "FORBIDDEN_CONTENT", "QUESTION_ID_INVALID", "PAIR_MISMATCH"]) {
  assert.ok(invalidPaired.errors.some((error) => error.code === code), `missing expected error ${code}`);
}

const formativeQuestions = [
  choice(null, "check", 1, "single", "GH-02-K01", "F01", { id: "GH-02-K01-check-q1", points: 10 }),
  choice(null, "check", 2, "single", "GH-02-K01", "F02", { id: "GH-02-K01-check-q2", points: 10 }),
  choice(null, "check", 3, "multiple", "GH-02-K01", "F03", { id: "GH-02-K01-check-q3", points: 10 })
];
const formativePayload = {
  outlines: [{
    id: "GH-02-K01-check",
    type: "quiz",
    title: "即时检查：从数表观察趋近",
    order: 1,
    quizConfig: { questionCount: 3, difficulty: "medium", questionTypes: ["single", "multiple"] },
    keyPoints: formativeQuestions.map(JSON.stringify)
  }]
};
const validFormative = validateFormativeAssessment(formativePayload, moduleDefinition, "GH-02-K01");
assert.deepEqual(validFormative.errors, [], JSON.stringify(validFormative.errors, null, 2));

process.stdout.write("Assessment output validator tests passed.\n");
