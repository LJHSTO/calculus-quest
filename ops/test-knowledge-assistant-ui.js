const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const assistantSource = read("app/main/knowledge-assistant.js");
const assistantCss = read("app/main/knowledge-assistant.css");
const notesSource = read("app/main/learning-notes.js");
const contextSource = read("app/main/courseware-context.js");
const bridgeSource = read("app/main/courseware-bridge.js");
const renderLearningSource = read("app/main/render-learning.js");
const bootstrapSource = read("app/main/bootstrap.js");
const indexHtml = read("index.html");
const stylesCss = read("styles.css");
const serverSource = read("server.js");
const llmSource = read("lib/llm.js");
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
assert.match(assistantSource, /刚才在这里/);
assert.match(assistantSource, /data-knowledge-selection-toolbar/);
assert.match(assistantSource, /data-knowledge-selection-ask[\s\S]*?问知点/);
assert.match(assistantSource, /data-knowledge-selection-note[\s\S]*?记一笔/);
assert.match(assistantSource, /data-knowledge-note-editor/);
assert.doesNotMatch(
  assistantSource,
  /data-knowledge-note-shelf|data-knowledge-note-list/,
  "划线笔记不应占用知点对话框的工作区"
);
assert.match(assistantSource, /data-knowledge-note-colors/);
assert.match(assistantSource, /data-note-color="amber"/);
assert.match(assistantSource, /data-note-color="mint"/);
assert.match(assistantSource, /data-note-color="blue"/);
assert.match(assistantSource, /data-note-color="pink"/);
assert.match(assistantSource, /Ctrl \+ Enter/);
assert.match(assistantSource, /data-knowledge-note-delete/);
assert.match(
  assistantSource,
  /addEventListener\("scroll",\s*\(event\)\s*=>[\s\S]*?els\.noteEditor\.contains\(event\.target\)/,
  "scrolling inside the note editor must not close it"
);
assert.match(assistantSource, /LearningNotesCore/);
assert.match(assistantSource, /CoursewareContext\??\.renderNotes/);
assert.match(assistantSource, /data-knowledge-history-view/);
assert.match(assistantSource, /data-knowledge-conversation-list/);
assert.match(assistantSource, /data-knowledge-new-conversation/);
assert.match(assistantSource, /data-knowledge-quota/);
assert.match(assistantSource, /api\/learning\/assistant\/conversations/);
assert.doesNotMatch(
  assistantSource,
  /fetch\("api\/learning\/assistant\/conversations"/,
  "clicking new conversation must stay client-side until an assistant reply exists"
);
assert.match(
  assistantSource,
  /function createNewConversation[\s\S]*?activeConversationId = "";[\s\S]*?messages = \[\];/,
  "new conversation should reset the workspace to an unsaved draft"
);
assert.doesNotMatch(
  assistantSource,
  /fetch\((?:`|")\/api\/learning\/assistant\//,
  "assistant requests must respect the document base path on subpath deployments"
);
assert.match(assistantSource, /conversationId/);
assert.match(assistantSource, /function placeFloatingElement/);
assert.match(assistantSource, /Math\.min\(viewportHeight - height - 8,\s*desiredTop\)/);
assert.match(notesSource, /calculus-quest-learning-notes-v1/);
assert.doesNotMatch(notesSource, /outerHTML|selector/);
assert.match(assistantSource, /轻点已标示的内容完成选择/);
assert.match(assistantSource, /移动鼠标可预览可选范围/);
assert.match(assistantSource, /global\.innerWidth > 760/);
assert.match(assistantSource, /PANEL_STORAGE_KEY/);
assert.match(assistantSource, /function clampPanelPosition/);
assert.match(assistantSource, /function setupPanelDrag/);
assert.match(assistantSource, /function interactionSceneCopy\(meta = courseMeta\(\)\)/);
assert.match(assistantSource, /els\.echoTitle\.textContent = interactionSceneCopy\(meta\)/);
assert.match(assistantSource, /els\.echoCopy\.textContent = `\$\{component\}：\$\{echoSummary\(ref\)\}`/);
assert.doesNotMatch(
  assistantSource,
  /在「拖动实验」中调整了/,
  "recent-operation copy should name the current knowledge point and student-facing scene"
);
assert.match(
  assistantSource,
  /function render\(\) \{[\s\S]*?els\.panel\.setAttribute\("aria-hidden"/,
  "restored open state should synchronize accessibility attributes"
);
assert.match(assistantSource, /let currentSupported = false/);
assert.match(assistantSource, /const supportChanged = meta\.supported !== currentSupported/);
assert.match(assistantSource, /function quizAssistantLocked\(meta = courseMeta\(\)\)/);
assert.match(
  assistantSource,
  /function setOpen\(next, options = \{\}\) \{[\s\S]*?if \(nextOpen && quizAssistantLocked\(\)\) \{[\s\S]*?return false;/,
  "an unsubmitted quiz must not open the assistant panel"
);
assert.match(
  assistantSource,
  /async function submitQuestion\(\) \{[\s\S]*?if \(quizAssistantLocked\(meta\)\) \{[\s\S]*?return;/,
  "an unsubmitted quiz must be rejected before a question is added locally"
);
assert.match(
  assistantSource,
  /const quizLocked = quizAssistantLocked\(meta\);[\s\S]*?els\.input\.disabled = [^;]*quizLocked[\s\S]*?els\.pick\.disabled = [^;]*quizLocked/,
  "quiz lock state must disable both the composer and object picker"
);
assert.match(
  assistantSource,
  /function renderQuickQuestions\(\) \{[\s\S]*?if \(quizAssistantLocked\(meta\)\) \{[\s\S]*?els\.quick\.hidden = true;[\s\S]*?return;/,
  "quiz lock state must not expose question shortcuts"
);
assert.match(assistantSource, /提交本次测验后即可使用知点复盘/);
assert.match(serverSource, /assistant_quiz_locked_until_submit/);
assert.match(
  assistantSource,
  /if \(unitChanged \|\| participantChanged \|\| supportChanged\) \{[\s\S]*?loadConversations\(meta\)/,
  "assistant history must reload when a restored unit changes from unresolved to supported"
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
assert.match(assistantCss, /\.knowledge-selection-toolbar\s*\{/);
assert.match(assistantCss, /\.knowledge-note-editor\s*\{/);
assert.match(assistantCss, /\.knowledge-history-view\s*\{/);
assert.match(assistantCss, /\.knowledge-conversation-card\s*\{/);
assert.match(assistantCss, /font-variant-numeric:\s*tabular-nums/);
assert.match(
  assistantCss,
  /\.knowledge-composer\s*>\s*div:not\(\.knowledge-composer-meta\)\s*\{/,
  "composer input styling must not force the status and quota row into a 40px grid column"
);
assert.match(assistantCss, /::highlight\(cq-learning-notes\)/);

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
assert.match(
  indexHtml,
  /class="learning-nav-cluster"[\s\S]*?id="chapter-rail-toggle"[\s\S]*?id="lesson-rail-toggle"[\s\S]*?<\/div>/,
  "chapter and path controls should read as one compact navigation cluster"
);
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
assert.match(stylesCss, /\.learning-nav-cluster\s*\{/);
assert.match(
  stylesCss,
  /\.learning-nav-cluster \.rail-toggle,[\s\S]*?grid-column:\s*auto;[\s\S]*?grid-row:\s*auto;/,
  "the compact navigation controls must clear legacy grid placement instead of overflowing into the lesson title"
);
assert.match(stylesCss, /\.learning-rail-control-icon/);
assert.match(stylesCss, /\.learning-rail-control-caret/);
assert.match(stylesCss, /--learning-slide-max-width:\s*1440px/);
assert.match(stylesCss, /min-height:\s*clamp\(680px,\s*78vh,\s*900px\)/);
assert.match(contextSource, /BRIDGE_VERSION\s*=\s*"20260723-v5"/);
assert.match(contextSource, /function selectionLocator/);
assert.match(contextSource, /function renderNotes/);
assert.match(contextSource, /type:\s*"cq:notes-sync"/);
assert.match(contextSource, /onNoteSelect/);
assert.match(contextSource, /cq-learning-notes-amber/);
assert.match(contextSource, /cq-learning-notes-mint/);
assert.match(contextSource, /cq-learning-notes-blue/);
assert.match(contextSource, /cq-learning-notes-pink/);
assert.match(renderLearningSource, /function setupLearningCanvasLayoutSync/);
assert.match(renderLearningSource, /new ResizeObserver/);
assert.match(renderLearningSource, /player\.querySelectorAll\("\[data-slide-canvas\]"\)\.forEach\(syncSlideCanvasScale\)/);
assert.match(renderLearningSource, /type:\s*"cq:host-layout"/);
assert.match(renderLearningSource, /frame\.dataset\.hostLayoutWidth/);
assert.match(renderLearningSource, /event\.data\?\.type !== "cq:bridge-ready"/);
assert.match(renderLearningSource, /scheduleLearningCanvasLayoutSync\("courseware-bridge-ready"\)/);
assert.match(bridgeSource, /type === "cq:host-layout"/);
assert.match(bridgeSource, /type === "cq:notes-sync"/);
assert.match(bridgeSource, /cq-learning-notes/);
assert.match(bridgeSource, /cq:note-open/);
assert.match(bridgeSource, /function scheduleSelectionReport\(/);
assert.match(bridgeSource, /document\.addEventListener\("mouseup", scheduleSelectionReport, true\)/);
assert.match(bridgeSource, /document\.addEventListener\("keyup", handleSelectionKeyUp, true\)/);
assert.match(contextSource, /replace\(\/拖动实验\/g, "动手调一调"\)/);
assert.match(bridgeSource, /window\.dispatchEvent\(new Event\("resize"\)\)/);
assert.match(bridgeSource, /window\.dispatchEvent\(new CustomEvent\("cq:host-layout"/);
assert.match(bridgeSource, /window\.__calculusQuestHostLayout\s*=\s*detail/);
assert.match(bridgeSource, /version:\s*5/);
assert.match(serverSource, /process\.env\.LEARNING_ASSISTANT_MODEL/);
assert.match(serverSource, /LEARNING_ASSISTANT_DAILY_QUOTA \|\| 30/);
assert.match(
  llmSource,
  /redirect:\s*"error"/,
  "OpenAI-compatible requests must reject redirects instead of forwarding credentials"
);
assert.match(envExample, /LEARNING_ASSISTANT_MODEL=replace-with-your-fast-chat-model/);
assert.match(envExample, /LEARNING_ASSISTANT_DAILY_QUOTA=30/);
assert.match(assistantSource, /let quota = \{ limit: 30, used: 0, remaining: 30/);
assert.match(assistantSource, /今日还可提问 30 次/);

console.log("knowledge assistant UI tests passed");
