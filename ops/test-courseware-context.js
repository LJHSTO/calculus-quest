const assert = require("node:assert/strict");
const {
  contextThreadKey,
  createObjectPickStateMachine,
  formatInteractionChange,
  friendlyInteractionLabel,
  friendlySceneLabel,
  isQuestionExcluded,
  normalizeLauncherPlacement,
  normalizeContextRef,
  suggestionsForContext
} = require("../app/main/courseware-context");

const normalized = normalizeContextRef({
  schemaVersion: 99,
  kind: "formula",
  scope: "slide",
  chapterId: "V14-C1",
  unitId: "GH-03-K01",
  unitLabel: "从平均变化率到瞬时变化率",
  knowledgePointId: "GH-03-K01",
  knowledgePointLabel: "平均变化率",
  semanticId: "slide:canvas-1:latex-1",
  label: "割线斜率",
  excerpt: "Δx 趋近于 0",
  latex: "\\Delta x \\to 0",
  confidence: "high",
  selector: "#lesson-player .slide-latex:nth-child(2)",
  outerHTML: "<div onclick=\"steal()\">...</div>",
  style: "position:fixed",
  state: {
    parameter: "h",
    oldValue: "0.5",
    newValue: "0.1",
    secret: "must-not-survive"
  }
});

assert.equal(normalized.schemaVersion, 1);
assert.equal(normalized.kind, "formula");
assert.equal(normalized.latex, "\\Delta x \\to 0");
assert.equal(normalized.selector, undefined);
assert.equal(normalized.outerHTML, undefined);
assert.equal(normalized.style, undefined);
assert.deepEqual(normalized.state, {
  parameter: "h",
  oldValue: "0.5",
  newValue: "0.1",
  min: "",
  max: "",
  action: ""
});
assert.equal(
  contextThreadKey(normalized),
  "knowledge:GH-03-K01",
  "knowledge-point conversations must remain isolated from neighbouring units"
);

const quizSuggestions = suggestionsForContext({
  scope: "quiz",
  quizSubmitted: false
});
assert.deepEqual(quizSuggestions, [
  "解释题意",
  "给我一级提示",
  "检查我的第一步",
  "这个选项表达了什么？"
]);
assert.ok(
  suggestionsForContext({ kind: "interaction" }).includes("我应该观察哪里？"),
  "recent interactions should suggest an observation-oriented question"
);

const states = [];
const picker = createObjectPickStateMachine({
  onChange: (state) => states.push(state.phase)
});
assert.equal(picker.getState().phase, "idle");
picker.begin({ singleShot: true });
assert.equal(picker.getState().phase, "picking");
assert.equal(picker.consume({ semanticId: "slide:canvas-1:text-1" }).semanticId, "slide:canvas-1:text-1");
assert.equal(picker.getState().phase, "idle");
assert.equal(picker.consume({ semanticId: "ignored" }), null, "single-shot picker must ignore later clicks");
picker.begin({ singleShot: true });
assert.equal(picker.cancel("escape"), true);
assert.equal(picker.getState().phase, "idle");
assert.deepEqual(states, ["picking", "idle", "picking", "idle"]);

const audioPackageElement = {
  closest(selector) {
    return selector.includes("[data-knowledge-audio-slot]") ? this : null;
  }
};
assert.equal(
  isQuestionExcluded(audioPackageElement),
  true,
  "voice-package content must stay outside the question context scope"
);
assert.equal(
  isQuestionExcluded({ closest: () => null }),
  false,
  "ordinary lesson content should remain selectable"
);

assert.equal(
  friendlyInteractionLabel("interactive:id:hSlider"),
  "步长 h",
  "technical slider ids should become student-facing Chinese component names"
);
assert.equal(friendlyInteractionLabel("angle-slider"), "观察角度");
assert.equal(friendlyInteractionLabel("🎚️ 步长 h"), "步长 h");
assert.equal(
  friendlyInteractionLabel("输入值 x"),
  "输入值 x",
  "visible Chinese component labels should take precedence over generic symbol aliases"
);
assert.equal(
  formatInteractionChange({ oldValue: "0.5", newValue: "0.1" }),
  "从 0.5 调整为 0.1"
);
assert.equal(
  formatInteractionChange({ newValue: "3" }),
  "当前值为 3"
);
assert.equal(
  friendlySceneLabel({
    resourceTitle: "输入、输出和函数规则：拖动实验",
    unitLabel: "输入、输出和函数规则",
    sceneType: "simulation"
  }),
  "拖动实验",
  "recent interactions should name the concrete courseware scene rather than a generic scene type"
);
assert.equal(
  friendlySceneLabel({ sceneType: "visualization3d" }),
  "空间视角",
  "scene labels should keep a Chinese fallback when a resource title is unavailable"
);
assert.deepEqual(
  normalizeLauncherPlacement({ side: "left", topRatio: 0.02, compact: true }),
  { side: "left", topRatio: 0.12, compact: true }
);

console.log("courseware context tests passed");
