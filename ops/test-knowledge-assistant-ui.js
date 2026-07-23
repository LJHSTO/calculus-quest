const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const assistantSource = read("app/main/knowledge-assistant.js");
const assistantCss = read("app/main/knowledge-assistant.css");
const contextSource = read("app/main/courseware-context.js");
const bridgeSource = read("app/main/courseware-bridge.js");
const renderLearningSource = read("app/main/render-learning.js");
const bootstrapSource = read("app/main/bootstrap.js");
const indexHtml = read("index.html");
const stylesCss = read("styles.css");
const serverSource = read("server.js");
const envExample = read(".env.example");

assert.match(assistantSource, /aria-label="打开知点"/);
assert.match(assistantSource, /id="knowledge-assistant-panel"[^>]*tabindex="-1"/);
assert.match(assistantSource, /data-knowledge-panel-dragbar/);
assert.match(assistantSource, /data-knowledge-scroll/);
assert.match(
  assistantSource,
  /data-knowledge-scroll[\s\S]*?data-knowledge-messages[\s\S]*?<\/div>\s*<form class="knowledge-composer"/,
  "the composer must remain outside the scrollable learning-content region"
);
assert.match(assistantSource, /data-knowledge-pick-instructions/);
assert.match(assistantSource, /选取课件焦点/);
assert.match(assistantSource, /刚才的操作/);
assert.match(assistantSource, /轻点已标示的内容完成选择/);
assert.match(assistantSource, /移动鼠标可预览可选范围/);
assert.match(assistantSource, /global\.innerWidth > 760/);
assert.match(assistantSource, /PANEL_STORAGE_KEY/);
assert.match(assistantSource, /function clampPanelPosition/);
assert.match(assistantSource, /function setupPanelDrag/);
assert.match(assistantSource, /在「\$\{currentSceneLabel\(meta\)\}」中调整了\$\{component\}/);
assert.doesNotMatch(
  assistantSource,
  /els\.echoTitle\.textContent\s*=\s*`\$\{currentSceneLabel\(meta\)\}\s*·/,
  "recent-operation copy should read as a Chinese learning action rather than a symbol-separated debug label"
);
assert.match(
  assistantSource,
  /function render\(\) \{[\s\S]*?els\.panel\.setAttribute\("aria-hidden"/,
  "restored open state should synchronize accessibility attributes"
);

["指着问", "指着课件问明白", "操作回声"].forEach((legacyCopy) => {
  assert.doesNotMatch(
    `${assistantSource}\n${indexHtml}`,
    new RegExp(legacyCopy),
    `student-facing legacy copy must not return: ${legacyCopy}`
  );
});

assert.match(assistantCss, /scrollbar-width:\s*none/);
assert.match(
  assistantCss,
  /\.knowledge-assistant-panel\s*\{[\s\S]*?grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/s
);
assert.match(
  assistantCss,
  /\.knowledge-assistant-scroll\s*\{[\s\S]*?overflow-y:\s*auto/s
);
assert.match(assistantCss, /\.knowledge-panel-dragbar\s*\{/);
assert.match(
  assistantCss,
  /\.knowledge-assistant-launcher:is\(:hover,\s*:focus-visible\)[\s\S]*?width:\s*196px/s
);
assert.doesNotMatch(
  assistantCss,
  /\.is-launcher-compact\s+\.knowledge-launcher-shell\s*\{[\s\S]*?(?:right|left):\s*-\d+px/s,
  "the floating knowledge launcher must never hide outside the viewport"
);
assert.match(assistantCss, /overflow-wrap:\s*anywhere/);
assert.match(assistantCss, /safe-area-inset-bottom/);

const targetSelector = contextSource.match(
  /const QUESTION_TARGET_SELECTOR = \[([\s\S]*?)\]\.join\(", "\);/
)?.[1] || "";
assert.match(targetSelector, /\[data-slide-canvas\]/);
assert.doesNotMatch(
  targetSelector,
  /\.resource-body/,
  "object pick should not capture the entire resource and its audio panel as one Slide target"
);

assert.match(indexHtml, /id="lesson-rail-toggle"/);
assert.match(indexHtml, /id="lesson-rail"/);
assert.match(indexHtml, /id="chapter-rail-toggle"[\s\S]*?data-learning-toggle-label>章节</);
assert.match(indexHtml, /id="lesson-rail-toggle"[\s\S]*?data-learning-toggle-label>路径</);
assert.match(indexHtml, /learning-rail-control-icon/);
assert.match(bootstrapSource, /cq:knowledge-assistant-visibility/);
assert.match(bootstrapSource, /setLessonRailCollapsed\(true/);
assert.match(bootstrapSource, /pointerenter/);
assert.match(bootstrapSource, /pointerleave/);
assert.match(bootstrapSource, /CHAPTER_HOVER_OPEN_DELAY_MS/);
assert.match(bootstrapSource, /cq:learning-layout-change/);
assert.match(bootstrapSource, /setupLearningCanvasLayoutSync/);
assert.doesNotMatch(
  bootstrapSource,
  /toggle\.textContent\s*=/,
  "rail state changes must not erase the button icon and label structure"
);
assert.match(stylesCss, /\.learning-shell\.lesson-collapsed/);
assert.match(stylesCss, /\.learning-rail-control-icon/);
assert.match(stylesCss, /\.learning-rail-control-caret/);
assert.match(stylesCss, /--learning-slide-max-width:\s*1440px/);
assert.match(stylesCss, /min-height:\s*clamp\(680px,\s*78vh,\s*900px\)/);
assert.match(contextSource, /BRIDGE_VERSION\s*=\s*"20260723-v4"/);
assert.match(renderLearningSource, /function setupLearningCanvasLayoutSync/);
assert.match(renderLearningSource, /new ResizeObserver/);
assert.match(renderLearningSource, /player\.querySelectorAll\("\[data-slide-canvas\]"\)\.forEach\(syncSlideCanvasScale\)/);
assert.match(renderLearningSource, /type:\s*"cq:host-layout"/);
assert.match(renderLearningSource, /frame\.dataset\.hostLayoutWidth/);
assert.match(renderLearningSource, /event\.data\?\.type !== "cq:bridge-ready"/);
assert.match(renderLearningSource, /scheduleLearningCanvasLayoutSync\("courseware-bridge-ready"\)/);
assert.match(bridgeSource, /type === "cq:host-layout"/);
assert.match(bridgeSource, /window\.dispatchEvent\(new Event\("resize"\)\)/);
assert.match(bridgeSource, /window\.dispatchEvent\(new CustomEvent\("cq:host-layout"/);
assert.match(bridgeSource, /window\.__calculusQuestHostLayout\s*=\s*detail/);
assert.match(bridgeSource, /version:\s*4/);
assert.match(serverSource, /process\.env\.LEARNING_ASSISTANT_MODEL/);
assert.match(envExample, /LEARNING_ASSISTANT_MODEL=replace-with-your-fast-chat-model/);

console.log("knowledge assistant UI tests passed");
