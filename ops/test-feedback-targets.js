const assert = require("node:assert/strict");

let targetModule = {};
try {
  targetModule = require("../app/main/feedback-targets");
} catch {}

assert.equal(
  typeof targetModule.buildCoursewareFeedbackTargets,
  "function",
  "target builder must exist"
);
assert.equal(
  typeof targetModule.feedbackTargetIdFromPointer,
  "function",
  "pointer target resolver must exist"
);

const { buildCoursewareFeedbackTargets, feedbackTargetIdFromPointer } = targetModule;

const directPointerTarget = feedbackTargetIdFromPointer({
  closest: () => ({ dataset: { feedbackTarget: "courseware:game:game.html" } })
});
assert.equal(directPointerTarget, "courseware:game:game.html");

const capturedPointerTarget = feedbackTargetIdFromPointer(
  { closest: () => null },
  { startTargetId: "courseware:game:game.html" }
);
assert.equal(capturedPointerTarget, "courseware:game:game.html");

const unit = {
  id: "V14-C1-M1-KP1",
  type: "knowledge",
  chapterId: "V14-C1",
  moduleId: "V14-C1-M1",
  label: "函数与变化"
};
const types = [
  { id: "simulation", label: "动手调一调" },
  { id: "game", label: "挑战一下" },
  { id: "mindMap", label: "关系图" },
  { id: "missing", label: "暂无资源" }
];
const candidates = {
  simulation: { file: "simulation.html", title: "函数拖动实验" },
  game: { file: "game.html", title: "函数挑战" },
  mindMap: { file: "game.html", title: "重复资源" }
};

const rows = buildCoursewareFeedbackTargets({
  unit,
  types,
  selectedTypeId: "simulation",
  candidateForType: (typeId) => candidates[typeId] || null,
  cleanTitle: (candidate) => candidate.title
});

assert.deepEqual(rows.map((row) => row.id), [
  "global",
  "courseware:simulation:simulation.html",
  "courseware:game:game.html"
]);
assert.equal(rows[0].targetScope, "global");
assert.equal(rows[1].isCurrent, true);
assert.equal(rows[1].resourceTitle, "函数拖动实验");
assert.equal(rows[1].knowledgePoint, "函数与变化");
assert.equal(rows[2].isCurrent, false);

const noUnitRows = buildCoursewareFeedbackTargets({
  unit: null,
  types,
  selectedTypeId: "simulation",
  candidateForType: () => null,
  cleanTitle: () => ""
});
assert.deepEqual(noUnitRows.map((row) => row.id), ["global"]);

const nonKnowledgeRows = buildCoursewareFeedbackTargets({
  unit: { ...unit, type: "quiz" },
  types,
  selectedTypeId: "simulation",
  candidateForType: (typeId) => candidates[typeId] || null,
  cleanTitle: (candidate) => candidate.title
});
assert.deepEqual(nonKnowledgeRows.map((row) => row.id), ["global"]);

console.log("feedback target tests passed");
