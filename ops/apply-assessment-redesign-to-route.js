"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const routePath = path.join(root, "data", "multi-scene-learning-route.json");
const assessmentsRoot = path.join(root, "prompts", "assessments");

const selections = {
  "V14-C2": ["GH-04:P01", "GH-04:P03", "GH-04:P05", "GH-04:P07", "GH-05:P01", "GH-05:P04", "GH-05:P06", "GH-04:P08", "GH-05:P09", "GH-04:P10"],
  "V14-C3": ["GH-06:P01", "GH-06:P05", "GH-07:P01", "GH-07:P04", "GH-07:P06", "GH-06:P02", "GH-07:P02", "GH-06:P08", "GH-07:P09", "GH-06:P10"],
  "V14-C4": ["GH-08:P01", "GH-08:P05", "GH-09:P01", "GH-09:P05", "GH-10:P01", "GH-10:P04", "GH-10:P06", "GH-08:P08", "GH-09:P08", "GH-10:P10"],
  "V14-C5": ["GH-11:P01", "GH-11:P04", "GH-11:P06", "GH-12:P01", "GH-12:P04", "GH-12:P06", "GH-11:P02", "GH-11:P09", "GH-12:P09", "GH-12:P10"],
  "V14-C6": ["GH-13:P01", "GH-13:P04", "GH-13:P06", "GH-14:P01", "GH-14:P03", "GH-14:P05", "GH-14:P07", "GH-13:P09", "GH-14:P09", "GH-14:P10"],
  "V14-X1": Array.from({ length: 10 }, (_, index) => `EXT-01:P${String(index + 1).padStart(2, "0")}`),
  "V14-X2": Array.from({ length: 10 }, (_, index) => `EXT-02:P${String(index + 1).padStart(2, "0")}`),
  "V14-X3": Array.from({ length: 10 }, (_, index) => `EXT-03:P${String(index + 1).padStart(2, "0")}`),
  "V14-X4": Array.from({ length: 10 }, (_, index) => `EXT-04:P${String(index + 1).padStart(2, "0")}`),
  "V14-X5": Array.from({ length: 10 }, (_, index) => `EXT-05:P${String(index + 1).padStart(2, "0")}`)
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function pair(moduleId, pairId) {
  const regular = path.join(assessmentsRoot, moduleId, "outputs", "pairs", `${pairId}.json`);
  const legacy = path.join(assessmentsRoot, moduleId, "pair-outputs", `${pairId}.json`);
  return readJson(fs.existsSync(regular) ? regular : legacy);
}

function normalizeQuestion(question, id, pairId, index) {
  const type = index === 9 ? "short_answer" : index >= 7 ? "multiple" : "single";
  const points = index === 9 ? 20 : index >= 7 ? 12 : 8;
  return {
    ...question,
    id,
    sourceId: question.id,
    type,
    points,
    pairId,
    hasAnswer: true,
    commentPrompt: Array.isArray(question.rubric)
      ? question.rubric.map((item) => `${item.criterion}（${item.points}分）`).join("；")
      : String(question.commentPrompt || "")
  };
}

function manualPair(pre, post) {
  return { pre, post };
}

function choice(id, kp, question, options, answer, analysis) {
  return {
    id,
    type: "single",
    question,
    options: options.map((label, index) => ({ value: "ABCD"[index], label })),
    answer: [answer],
    analysis,
    points: 8,
    knowledgePointIds: [kp],
    cognitiveLevel: "理解",
    estimatedSteps: 2,
    pairId: "",
    equivalence: {
      presentationMode: "text",
      knownConditionCount: 2,
      operationCount: 1,
      symbolComplexity: "low",
      conclusionClass: "concept-interpretation"
    }
  };
}

const gh01K2 = manualPair(
  choice("GH-01-manual-pre-k2", "GH-01-K02", "点 P 的坐标为 (-2,3)。以下解释正确的是？", ["从原点向右2格、向上3格", "从原点向左2格、向上3格", "从原点向左3格、向上2格", "点 P 位于横轴上"], "B", "横坐标 -2 表示向左2格，纵坐标3表示向上3格，因此 B 正确。"),
  choice("GH-01-manual-post-k2", "GH-01-K02", "小林把点 Q=(4,-1) 解释为“横坐标是 -1，纵坐标是4”。应怎样纠正？", ["解释正确，不需要纠正", "横坐标和纵坐标都应改成正数", "横坐标是4，纵坐标是-1", "横坐标是-4，纵坐标是1"], "C", "有序数对的第一个数是横坐标，第二个数是纵坐标，所以 Q 的横坐标为4、纵坐标为-1。")
);

const gh01K1 = manualPair(
  choice("GH-01-manual-pre-k1", "GH-01-K01", "某快递站按包裹重量计算运费。若把计费过程看作函数，下列说法正确的是？", ["包裹重量是输入，运费是输出，计费办法是对应规则", "运费是输入，包裹重量是输出", "包裹重量和运费都是输入", "计费办法是输出"], "A", "计费办法根据包裹重量确定运费，因此重量是输入、运费是输出，计费办法是对应规则。"),
  choice("GH-01-manual-post-k1", "GH-01-K01", "某停车场根据停车时长收取费用。若把收费过程看作函数，下列说法正确的是？", ["停车费是输入，停车时长是输出", "停车时长是输入，停车费是输出，收费标准是对应规则", "停车时长和停车费都是输出", "收费标准是输入，停车时长是输出"], "B", "收费标准根据停车时长确定停车费，因此时长是输入、费用是输出，收费标准是对应规则。")
);

const gh01K3 = manualPair(
  choice("GH-01-manual-pre-k3", "GH-01-K03", "按横坐标从小到大读取三个点：(1,2)、(2,4)、(3,5)。它们反映的函数值变化方向是？", ["持续上升", "持续下降", "先升后降", "保持不变"], "A", "横坐标依次增大时，纵坐标由2增至4再增至5，因此图像呈持续上升趋势。"),
  choice("GH-01-manual-post-k3", "GH-01-K03", "沿函数图像从左向右观察，曲线依次经过高度6、4、1。以下判断正确的是？", ["输入增大时输出整体下降", "输入增大时输出整体上升", "输出始终不变", "仅凭这些信息无法判断变化方向"], "A", "从左向右代表输入增大，而高度由6降至4再降至1，所以输出整体下降。")
);

function firstChapterPairs() {
  return [
    gh01K1,
    gh01K2,
    gh01K3,
    pair("GH-02", "P01"),
    pair("GH-02", "P03"),
    pair("GH-02", "P05"),
    pair("GH-03", "P01"),
    pair("GH-02", "P04"),
    pair("GH-03", "P09"),
    pair("GH-03", "P10")
  ];
}

function chapterPairs(chapterId) {
  if (chapterId === "V14-C1") return firstChapterPairs();
  return selections[chapterId].map((entry) => {
    const [moduleId, pairId] = entry.split(":");
    return pair(moduleId, pairId);
  });
}

function buildChapterQuiz(chapter, phase) {
  const pairs = chapterPairs(chapter.id);
  const questions = pairs.map((entry, index) => {
    const normalized = normalizeQuestion(
      entry[phase],
      `${chapter.id}-${phase}-q${index + 1}`,
      `P${String(index + 1).padStart(2, "0")}`,
      index
    );
    const module = chapter.modules.find((candidate) => candidate.knowledgePoints.some((kp) => normalized.knowledgePointIds.includes(kp.id)));
    const names = normalized.knowledgePointIds.map((id) => module?.knowledgePoints.find((kp) => kp.id === id)?.name).filter(Boolean);
    return {
      ...normalized,
      moduleId: module?.id,
      knowledgePointNames: names,
      concepts: names,
      knowledgePointCoverageSource: "semantic-curation-v1"
    };
  });
  return {
    title: `${phase === "pre" ? "前测" : "后测"}：${chapter.title}`,
    difficulty: "medium",
    questionCount: 10,
    questionTypes: ["single", "multiple", "short_answer"],
    questions
  };
}

function normalizeFormativeQuestion(question, kpId, role, index) {
  return {
    ...question,
    id: `${kpId}-check-q${index + 1}`,
    sourceId: question.id,
    type: role === "core" ? "single" : "multiple",
    points: 10,
    knowledgePointIds: [kpId],
    adaptiveRole: role,
    hasAnswer: true,
    commentPrompt: ""
  };
}

function checkOutput(moduleId, kpId) {
  const file = path.join(assessmentsRoot, moduleId, "outputs", `${kpId}-check.json`);
  if (!fs.existsSync(file)) return null;
  const payload = readJson(file);
  return payload.outlines[0].keyPoints.map((value) => typeof value === "string" ? JSON.parse(value) : value);
}

function manualDiagnostic(kpId, question, options, answer, analysis) {
  return {
    id: `${kpId}-manual-diagnostic`,
    type: "multiple",
    question,
    options: options.map((label, index) => ({ value: "ABCD"[index], label })),
    answer,
    analysis,
    points: 10,
    knowledgePointIds: [kpId]
  };
}

function legacyQuestion(module, id) {
  return module.flow.formativeQuiz.questions.find((question) => question.id === id);
}

function legacyChecks(module, kpId) {
  if (kpId === "GH-01-K01") return [legacyQuestion(module, "GH-01-formative-q1"), legacyQuestion(module, "GH-01-formative-q3")];
  if (kpId === "GH-01-K02") return [legacyQuestion(module, "GH-01-formative-q2"), manualDiagnostic(kpId, "关于平面直角坐标系中的点，哪些说法正确？请选择所有正确说法。", ["点(a,b)的第一个数表示横坐标", "点(a,b)的第二个数表示纵坐标", "点(0,0)是两条坐标轴的交点", "点(2,-3)位于横轴上"], ["A", "B", "C"], "A、B、C正确；点(2,-3)的纵坐标不为0，所以不在横轴上。")];
  if (kpId === "GH-01-K03") return [legacyQuestion(module, "GH-01-formative-q4"), manualDiagnostic(kpId, "从左向右阅读函数图像时，哪些观察能够说明函数值正在下降？请选择所有正确说法。", ["横坐标增大而纵坐标减小", "曲线整体从左上方向右下方延伸", "横坐标和纵坐标同时增大", "后一个点的纵坐标小于前一个点"], ["A", "B", "D"], "输入从左向右增大时，纵坐标降低就是下降，因此A、B、D正确。")];
  if (kpId === "GH-02-K01") return [legacyQuestion(module, "GH-02-formative-q1"), legacyQuestion(module, "GH-02-formative-q2")];
  if (kpId === "GH-02-K02") {
    const p3 = pair("GH-02", "P03").pre;
    const p4 = pair("GH-02", "P04").pre;
    return [p3, p4];
  }
  if (kpId === "GH-02-K03") return [pair("GH-02", "P05").pre, manualDiagnostic(kpId, "判断函数在某点连续时，以下哪些条件需要同时满足？请选择所有正确说法。", ["该点函数值有定义", "左右极限存在且相等", "函数值等于该点的极限值", "函数值必须等于0"], ["A", "B", "C"], "连续要求函数值有定义、双侧极限存在，并且二者相等；函数值不必等于0。")];
  return null;
}

function attachKnowledgeChecks(chapter) {
  chapter.modules.forEach((module) => {
    module.knowledgePoints.forEach((kp) => {
      const generated = checkOutput(module.id, kp.id);
      const existing = Array.isArray(kp.formativeQuiz?.questions) ? kp.formativeQuiz.questions : null;
      const questions = generated || existing || legacyChecks(module, kp.id);
      if (!questions || questions.length !== 2) throw new Error(`${kp.id} 缺少1+1形测题`);
      kp.formativeQuiz = {
        title: `知识点检测：${kp.name}`,
        difficulty: "medium",
        adaptive: true,
        questionCount: 2,
        questions: [
          normalizeFormativeQuestion(questions[0], kp.id, "core", 0),
          normalizeFormativeQuestion(questions[1], kp.id, "diagnostic", 1)
        ]
      };
    });
    if (module.flow) delete module.flow.formativeQuiz;
  });
}

function validateChapter(chapter) {
  for (const phase of ["preQuiz", "postQuiz"]) {
    const questions = chapter.flow[phase].questions;
    if (questions.length !== 10) throw new Error(`${chapter.id} ${phase} 题量错误`);
    questions.forEach((question, index) => {
      const expected = index === 9 ? "short_answer" : index >= 7 ? "multiple" : "single";
      if (question.type !== expected) throw new Error(`${chapter.id} ${phase} Q${index + 1} 题型错误`);
    });
    if (questions.reduce((sum, question) => sum + question.points, 0) !== 100) throw new Error(`${chapter.id} ${phase} 总分错误`);
  }
  const allKps = chapter.modules.flatMap((module) => module.knowledgePoints);
  const covered = new Set(chapter.flow.preQuiz.questions.flatMap((question) => question.knowledgePointIds || []));
  allKps.forEach((kp) => {
    if (!covered.has(kp.id)) throw new Error(`${chapter.id} 前测未覆盖 ${kp.id}`);
    if (kp.formativeQuiz?.questions?.length !== 2) throw new Error(`${kp.id} 形测结构错误`);
  });
}

const route = readJson(routePath);
route.chapters.forEach((chapter) => {
  chapter.flow ||= {};
  chapter.flow.preQuiz = buildChapterQuiz(chapter, "pre");
  chapter.flow.postQuiz = buildChapterQuiz(chapter, "post");
  delete chapter.flow.formativeQuiz;
  attachKnowledgeChecks(chapter);
  validateChapter(chapter);
});
route.assessmentDesign = {
  version: "knowledge-checks-v2",
  prePostQuestionCount: 10,
  formativePattern: "core-then-diagnostic-on-error",
  updatedAt: "2026-08-17"
};
const assessmentIdentity = route.chapters.flatMap((chapter) => [
  ...["preQuiz", "postQuiz"].flatMap((flowKey) => (chapter.flow?.[flowKey]?.questions || []).map((question) => ({
    chapterId: chapter.id,
    unitId: `${chapter.id}-${flowKey === "preQuiz" ? "pre" : "post"}`,
    id: question.id,
    sourceId: question.sourceId,
    type: question.type,
    knowledgePointIds: question.knowledgePointIds,
    points: question.points
  }))),
  ...chapter.modules.flatMap((module) => module.knowledgePoints.flatMap((kp) => (
    kp.formativeQuiz.questions.map((question) => ({
      chapterId: chapter.id,
      unitId: `${kp.id}-formative`,
      id: question.id,
      sourceId: question.sourceId,
      type: question.type,
      knowledgePointIds: question.knowledgePointIds,
      adaptiveRole: question.adaptiveRole,
      points: question.points
    }))
  )))
]);
route.quizKnowledgePointCuration = {
  version: "knowledge-checks-v2",
  questionSetPreserved: false,
  selectionReplacements: [],
  questionSetFingerprint: crypto.createHash("sha256").update(JSON.stringify(assessmentIdentity)).digest("hex")
};
fs.writeFileSync(routePath, `${JSON.stringify(route, null, 2)}\n`, "utf8");
console.log(`Updated ${route.chapters.length} chapters in ${routePath}`);
