"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bank = require("../lib/assessments/functions-limits-r2");
const adapter = require("../lib/proactive-policy/adapters/functions-limits-r2");
const root = path.resolve(__dirname, "..");
const routeFile = path.join(root, "data/multi-scene-learning-route.json");
const route = JSON.parse(fs.readFileSync(routeFile, "utf8"));
const chapter = route.chapters.find(c => c.id === "V14-C1");
const derivative = chapter.modules.find(m => m.id === "GH-03");
const next = route.chapters.find(c => c.id === "V14-C2");
if (derivative && !next.modules.some(m => m.id === derivative.id)) {
  next.modules.unshift(derivative);
  next.moduleIds.unshift(derivative.id);
}
chapter.modules = chapter.modules.filter(m => ["GH-01", "GH-02"].includes(m.id));
// Retain the derivative material outside the pilot and keep its assessment coverage.
const derivativeModule = next.modules.find(m => m.id === "GH-03");
if (derivativeModule) {
  for (const phase of ["pre", "post"]) {
    const quiz = next.flow[`${phase}Quiz`];
    for (const point of derivativeModule.knowledgePoints) {
      if (quiz.questions.some(q => q.knowledgePointIds?.includes(point.id))) continue;
      const source = point.formativeQuiz.questions.find(q => q.adaptiveRole === (phase === "pre" ? "core" : "diagnostic"));
      quiz.questions.push({ ...structuredClone(source), id: `V14-C2-${phase}-${point.id}`,
        moduleId: "GH-03", knowledgePointNames: [point.name], concepts: [point.name],
        knowledgePointCoverageSource: "semantic-curation-v1" });
    }
    quiz.questionCount = quiz.questions.length;
  }
}
chapter.moduleIds = chapter.modules.map(m => m.id);
chapter.title = "函数与极限";
chapter.summary = "从输入、输出和坐标图像出发，理解变化方向、极限和连续。只要求基本四则运算。";
chapter.assessmentVersion = bank.version;
for (const phase of ["pre", "post"]) {
  const questions = bank.questions(phase);
  for (const q of questions) {
    const module = chapter.modules.find(m => m.knowledgePoints.some(p => p.id === q.knowledgePointIds[0]));
    q.moduleId = module.id;
    q.knowledgePointNames = q.knowledgePointIds.map(id => module.knowledgePoints.find(p => p.id === id).name);
    q.concepts = q.knowledgePointNames;
    q.knowledgePointCoverageSource = "semantic-curation-v1";
  }
  chapter.flow[`${phase}Quiz`] = {
    title: phase === "pre" ? "前测：函数与极限" : "后测：函数与极限",
    difficulty: "introductory", questionCount: questions.length, questionTypes: ["single", "multiple", "short_answer"],
    instrumentVersion: bank.version, questions
  };
  chapter.flow[`${phase}Quiz`].archivedQuestions = require("../lib/assessments/functions-limits-r1").questions(phase);
}
const formative = [];
for (const module of chapter.modules) {
  module.legacyAssessmentStatus = "archived";
  for (const point of module.knowledgePoints) {
    const index = bank.ids.indexOf(point.id);
    assert.ok(index >= 0);
    const profile = adapter.knowledgePoint(point.id);
    point.goal = profile.selfExplanationPrompt;
    point.misconception = profile.misconception;
    const existing = point.formativeQuiz.questions.filter(q => q.adaptiveRole !== "supplemental");
    for (const q of existing) {
      if (q.options && !q.options.some(o => o.value === bank.unknown.value)) q.options.push({ ...bank.unknown });
      q.instrumentVersion = bank.version;
    }
    // A finite list supports a conjecture, not a mathematical assertion of a limit.
    if (point.id === "GH-02-K02") {
      const q = existing[0];
      q.question = "已知当 x 从小于3的一侧趋近3时，f(x) 趋近6。函数在 x=3 处的左极限是？";
      q.analysis = "题目明确给出左侧趋近条件，因此左极限为6；不能仅凭有限个观测值证明极限。";
    }
    if (point.id === "GH-02-K01") {
      const q = existing[0];
      q.question = "已知 x≠1 时 f(x)=x+2。当 x 从两侧趋近1时，f(x) 趋近多少？";
      q.options = [{ value: "A", label: "1" }, { value: "B", label: "2" }, { value: "C", label: "3" }, { value: "D", label: "不存在" }, { ...bank.unknown }];
      q.answer = ["C"];
      q.analysis = "根据明确的函数规则，x+2趋近3。数表只能提供直觉，有限项数值本身不能证明极限。";
    }
    point.formativeQuiz.questions = existing;
    point.formativeQuiz.questionCount = point.formativeQuiz.questions.length;
    formative.push({ ...existing[0], id: `V14-C1-fl-r2-formative-${index + 1}` });
  }
}
chapter.flow.formativeQuiz = { title: "章中检测：函数与图像", questionCount: 3,
  questionTypes: ["single"], difficulty: "introductory", questions: formative.slice(0, 3) };
chapter.flow.review = {
  title: "函数与极限回顾", summary: chapter.summary,
  keyPoints: chapter.modules.flatMap(m => m.knowledgePoints.map(p => p.name))
};
route.versionId = "multi-scene-functions-limits-20260917-r2";
const identity = route.chapters.flatMap(c => [
  ...["preQuiz", "postQuiz"].flatMap(phase => (c.flow?.[phase]?.questions || []).map(q => ({
    chapterId: c.id, unitId: `${c.id}-${phase === "preQuiz" ? "pre" : "post"}`,
    id: q.id, sourceId: q.sourceId, type: q.type, knowledgePointIds: q.knowledgePointIds, points: q.points
  }))),
  ...c.modules.flatMap(m => m.knowledgePoints.flatMap(p => (p.formativeQuiz?.questions || []).map(q => ({
    chapterId: c.id, unitId: `${p.id}-formative`, id: q.id, sourceId: q.sourceId,
    type: q.type, knowledgePointIds: q.knowledgePointIds, adaptiveRole: q.adaptiveRole, points: q.points
  }))))
]);
route.quizKnowledgePointCuration.questionSetFingerprint = crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
const output = JSON.stringify(route, null, 2) + "\n";
const contractsFile = path.join(root, "data/functions-limits-courseware-contracts.json");
const contracts = {
  schemaVersion: 1, chapterId: chapter.id, courseVersion: route.versionId,
  purpose: "函数与极限实验任务；界面操作不等于概念掌握，独立验证由平台题库完成。",
  knowledgePoints: Object.fromEntries(chapter.modules.flatMap(m => m.knowledgePoints).map(p => [p.id, {
    learningTask: p.goal, successEvidence: ["产生与知识点相关的操作", "独立解释概念或完成平台验证题"],
    misconceptionSignals: [p.misconception], supports: ["ask_reflection", "highlight_target", "show_comparison", "open_hint"]
  }]))
};
const contractOutput = JSON.stringify(contracts, null, 2) + "\n";
const motionStyle = '<style id="functions-limits-reduced-motion">@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0s!important;animation-iteration-count:1!important;transition-duration:0s!important}}</style>';
for (const point of chapter.modules.flatMap(m => m.knowledgePoints)) {
  for (const candidate of point.resourceCandidates) {
    const file = path.resolve(root, "resources", candidate.root, candidate.file);
    assert.ok(file.startsWith(path.join(root, "resources") + path.sep));
    const source = fs.readFileSync(file, "utf8");
    const existing = /<style id="functions-limits-reduced-motion">[\s\S]*?<\/style>/;
    let nextSource = existing.test(source) ? source.replace(existing, motionStyle)
      : source.replace("</head>", `${motionStyle}\n</head>`);
    if (candidate.type === "visualization3d" && !nextSource.includes("functions-limits-visible-container")) {
      const anchor = "const container = document.getElementById('canvas-container');";
      assert.ok(nextSource.includes(anchor), `${file}: missing 3D initialization anchor`);
      nextSource = nextSource.replace(anchor, `${anchor}
        // functions-limits-visible-container: hidden host panes have no initial viewport.
        if (!container.clientWidth || !container.clientHeight) {
          await new Promise(resolve => {
            const observer = new ResizeObserver(() => {
              if (container.clientWidth > 0 && container.clientHeight > 0) {
                observer.disconnect();
                resolve();
              }
            });
            observer.observe(container);
          });
        }`);
    }
    assert.ok(nextSource.includes(motionStyle));
    if (process.argv.includes("--check")) assert.equal(nextSource, source, `${file}: missing motion preprocessing`);
    else if (nextSource !== source) fs.writeFileSync(file, nextSource, "utf8");
  }
}
if (process.argv.includes("--check")) {
  assert.equal(fs.readFileSync(routeFile, "utf8").replace(/\r\n/g, "\n"), output);
  assert.equal(fs.readFileSync(contractsFile, "utf8").replace(/\r\n/g, "\n"), contractOutput);
} else {
  fs.writeFileSync(routeFile, output, "utf8");
  fs.writeFileSync(contractsFile, contractOutput, "utf8");
}
console.log("函数与极限预处理完成：6个知识点、24个互动入口、前后测各12题100分。");
