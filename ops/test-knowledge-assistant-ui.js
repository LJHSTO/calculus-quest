const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const assistantSource = read("app/main/knowledge-assistant.js");
const assistantCss = read("app/main/knowledge-assistant.css");
const contextSource = read("app/main/courseware-context.js");
const bootstrapSource = read("app/main/bootstrap.js");
const indexHtml = read("index.html");
const stylesCss = read("styles.css");

assert.match(assistantSource, /aria-label="打开知点"/);
assert.match(assistantSource, /id="knowledge-assistant-panel"[^>]*tabindex="-1"/);
assert.match(assistantSource, /data-knowledge-pick-instructions/);
assert.match(assistantSource, /聚焦课件内容/);
assert.match(assistantSource, /最近操作/);
assert.match(assistantSource, /轻点已标示的内容完成选择/);
assert.match(assistantSource, /移动鼠标可预览可选范围/);
assert.match(assistantSource, /global\.innerWidth > 760/);
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
assert.match(assistantCss, /grid-template-rows:[^;]*minmax\(64px,\s*1fr\)/s);
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
assert.match(bootstrapSource, /cq:knowledge-assistant-visibility/);
assert.match(bootstrapSource, /setLessonRailCollapsed\(true/);
assert.match(stylesCss, /\.learning-shell\.lesson-collapsed/);

console.log("knowledge assistant UI tests passed");
