const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const assistantSource = read("app/main/knowledge-assistant.js");
const assistantCss = read("app/main/knowledge-assistant.css");
const proactiveSource = read("app/main/proactive-learning.js");
const analyticsSource = read("app/main/analytics.js");
const notesSource = read("app/main/learning-notes.js");
const contextSource = read("app/main/courseware-context.js");
const bridgeSource = read("app/main/courseware-bridge.js");
const renderLearningSource = read("app/main/render-learning.js");
const bootstrapSource = read("app/main/bootstrap.js");
const narrationSource = read("app/main/narration.js");
const eventsSource = read("app/main/events.js");
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
assert.doesNotMatch(assistantSource, /Ctrl \+ Enter/, "the note editor should not spend visible space explaining shortcuts");
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
assert.match(assistantSource, /data-knowledge-proactive/);
assert.match(assistantSource, /data-knowledge-proactive-accept/);
assert.match(assistantSource, /data-knowledge-proactive-dismiss/);
assert.match(assistantSource, /function executeProactiveAction/);
assert.match(
  assistantSource,
  /let pendingProactivePrompt = null/,
  "an accepted assistant question needs explicit pending reply state"
);
const proactiveActionBody = assistantSource.match(
  /function executeProactiveAction\([^)]*\)[\s\S]*?(?=\s*function acceptProactiveSuggestion)/
)?.[0] || "";
assert.match(
  proactiveActionBody,
  /studentReplyActions\.has\(suggestion\?\.action\)[\s\S]*?pendingProactivePrompt\s*=[\s\S]*?els\.input\.value = ""/,
  "assistant clarification and quiz-review questions must be shown above an empty student composer"
);
assert.match(proactiveActionBody, /new Set\(\["ask_clarification", "review_mistake"\]\)/);
assert.match(
  proactiveActionBody,
  /pendingAssistantIntent = suggestion\.action === "self_explain" \? "self_check" : ""[\s\S]*?els\.input\.value = String\(suggestion\.draftQuestion\)/,
  "student-draft proactive actions must remain editable and preserve only self-explanation intent"
);
assert.match(
  assistantSource,
  /function acceptProactiveSuggestion[\s\S]*?executeProactiveAction\([\s\S]*?proactiveCoach\.resolve\("accept"/,
  "accepting should resolve the active suggestion after preparing the correct interaction"
);
assert.doesNotMatch(
  proactiveActionBody,
  /submitQuestion\(/,
  "a proactive suggestion must never call the model or consume quota before the student sends it"
);
assert.match(assistantSource, /function proactivePromptNode/);
assert.match(assistantSource, /knowledge-proactive-reply-options/);
assert.match(
  assistantSource,
  /选一个最接近的情况，仅放入输入框/,
  "diagnostic options must visibly explain that selection does not auto-send"
);
assert.match(
  assistantSource,
  /prompt\?\.replyOptions[\s\S]*?els\.input\.value = option[\s\S]*?els\.input\.focus/,
  "diagnostic reply options should only enter text into the composer"
);
assert.doesNotMatch(
  assistantSource.match(/function proactivePromptNode[\s\S]*?(?=\s*function messageNode)/)?.[0] || "",
  /submitQuestion\(/,
  "diagnostic reply options must never auto-send"
);
assert.match(
  assistantSource,
  /改为自由提问[\s\S]*?pendingGeneratedDraft && els\.input\.value === pendingGeneratedDraft[\s\S]*?els\.input\.value = ""/,
  "leaving a proactive reply must clear an untouched machine-provided option"
);
assert.match(
  assistantSource,
  /function renderMessages\(\)[\s\S]*?pendingProactivePrompt[\s\S]*?proactivePromptNode/,
  "the pending assistant question must render in the conversation above the composer"
);
assert.match(
  assistantSource,
  /async function submitQuestion\(\)[\s\S]*?const proactivePrompt = pendingProactivePrompt[\s\S]*?proactiveInterventionId:/,
  "the student's reply must carry the server-issued intervention id"
);
assert.match(
  assistantSource,
  /async function submitQuestion\(\)[\s\S]*?proactivePrompt:[\s\S]*?pendingProactivePrompt = null/,
  "the pending assistant question should clear only after the student sends a reply"
);
const proactiveDecisionBody = assistantSource.match(
  /async function requestProactiveDecision\([^)]*\)[\s\S]*?(?=\s*function considerProactiveSuggestion)/
)?.[0] || "";
assert.match(
  proactiveDecisionBody,
  /catch \(error\)[\s\S]*?candidate\.kind !== "repeated_parameter"[\s\S]*?proactiveCoach\.resolve\("agent-silent"/,
  "quiz review and clarification must fail quietly when no server-issued context can be obtained"
);
assert.match(
  proactiveDecisionBody,
  /action: "observe_change"[\s\S]*?draftQuestion: candidate\.question[\s\S]*?assistantPrompt: ""/,
  "only repeated-parameter guidance may safely degrade to an editable local student draft"
);
assert.doesNotMatch(
  proactiveDecisionBody,
  /fallbackNeedsReply|fallbackAssistantPrompt/,
  "the browser must not forge assistant-role questions without a server-issued intervention id"
);
assert.match(
  assistantSource,
  /if \(sceneChanged\)[\s\S]*?proactiveDecisionRequest\?\.abort\(\)[\s\S]*?pendingProactivePrompt = null/,
  "switching scenes must invalidate pending proactive decisions and assistant questions"
);
assert.match(
  assistantSource,
  /const streamState = await readNdjson[\s\S]*?!streamState\.sawDone[\s\S]*?assistant_stream_incomplete/,
  "an incomplete NDJSON stream must not be reported as a successful answer"
);
assert.match(
  assistantSource,
  /requestError\.code = payload\.code[\s\S]*?promptStillValid[\s\S]*?pendingProactivePrompt = promptStillValid \? proactivePrompt : null/,
  "a rejected request must preserve a still-valid proactive question for student retry"
);
assert.match(
  assistantSource,
  /messages\.splice\(localUserIndex,[\s\S]*?els\.input\.value = question[\s\S]*?render\(\)/,
  "a rejected request must remove optimistic chat bubbles and restore the student's draft"
);
assert.match(assistantSource, /function quizReviewFollowUpNode/);
assert.match(assistantSource, /继续第 \$\{Number\(followUp\.reviewIndex/);
assert.match(assistantSource, /先到这里/);
assert.match(
  assistantSource,
  /pendingProactivePrompt = \{ \.\.\.followUp\.prompt \}[\s\S]*?els\.input\.value = ""[\s\S]*?render\(\)/,
  "continuing a quiz review must show the next assistant question without auto-sending it"
);
assert.match(assistantCss, /\.knowledge-quiz-review-follow-up\s*\{/);
assert.match(assistantSource, /cq:learning-signal/);
assert.match(assistantSource, /proactiveCoach\.tick/);
assert.match(assistantSource, /function learningViewActive/);
assert.match(
  assistantSource,
  /if \(participantChanged\)[\s\S]*?proactiveCoach\?\.reset\?\.\(\{ clearCooldowns: true \}\)/,
  "participant changes must clear proactive cooldowns owned by the previous student"
);
assert.match(
  assistantSource,
  /function runProactiveTick[\s\S]*?!learningViewActive\(\)/,
  "proactive dwell decisions must pause outside the learning view"
);
assert.match(assistantSource, /quizAssistantLocked\(meta\)/);
assert.match(assistantSource, /api\/learning\/assistant\/conversations/);
assert.doesNotMatch(
  assistantSource,
  /fetch\("api\/learning\/assistant\/conversations"/,
  "clicking new conversation must stay client-side until an assistant reply exists"
);
assert.match(
  assistantSource,
  /function createNewConversation[\s\S]*?activeConversationId = "";[\s\S]*?messages = \[\];[\s\S]*?pendingAssistantIntent = "";/,
  "new conversation should reset the workspace to an unsaved draft"
);
assert.match(
  assistantSource,
  /function questionMatchesAssistantIntent/,
  "edited follow-up drafts need an explicit intent compatibility check"
);
assert.match(
  assistantSource,
  /els\.input\.addEventListener\("input", \(\) => \{[\s\S]*?if \(pendingAssistantIntent && !questionMatchesAssistantIntent\(pendingAssistantIntent, els\.input\.value\)\)[\s\S]*?pendingAssistantIntent = "";[\s\S]*?resizeComposer\(\)/,
  "manual edits should clear an intent only after the draft no longer matches it"
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
assert.match(assistantSource, /data-knowledge-message-source/);
assert.match(assistantSource, /let openMessageSourceId = ""/);
assert.match(assistantSource, /source\.classList\.toggle\("is-open", openMessageSourceId === message\.id\)/);
assert.doesNotMatch(
  assistantSource,
  /useContext\(message\.contextRef, "message-source"\);\s*source\.classList\.toggle/,
  "message source state must survive the render triggered by restoring context"
);
assert.match(assistantSource, /data-knowledge-message-actions/);
assert.match(assistantSource, /data-knowledge-self-check/);
assert.match(assistantSource, /assistantIntent/);
const assistantIntentBody = assistantSource.match(
  /function beginAssistantIntent\(intent\)[\s\S]*?(?=\s*function renderQuickQuestions)/
)?.[0] || "";
assert.doesNotMatch(
  assistantIntentBody,
  /submitQuestion\(/,
  "follow-up actions must fill an editable draft instead of sending immediately"
);
assert.match(assistantIntentBody, /els\.input\.focus/);
const quickQuestionBody = assistantSource.match(
  /function renderQuickQuestions\(\)[\s\S]*?(?=\s*function messageNode)/
)?.[0] || "";
assert.match(
  quickQuestionBody,
  /messages\.length[\s\S]*?els\.quick\.hidden = true/,
  "opening prompts should disappear after the conversation starts"
);
assert.doesNotMatch(
  quickQuestionBody,
  /submitQuestion\(/,
  "opening prompts must fill the composer without sending"
);
assert.match(quickQuestionBody, /els\.input\.focus/);
assert.match(assistantSource, /message\.contextRef/);
assert.match(assistantSource, /event\.guidance/);
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
  /function renderQuickQuestions\(\) \{[\s\S]*?if \([\s\S]*?quizAssistantLocked\(meta\)[\s\S]*?\) \{[\s\S]*?els\.quick\.hidden = true;[\s\S]*?return;/,
  "quiz lock state must not expose question shortcuts"
);
assert.match(assistantSource, /提交本次测验后即可使用知点复盘/);
assert.match(serverSource, /assistant_quiz_locked_until_submit/);
assert.match(serverSource, /assistantHistoryMessageLimit = 60/);
assert.match(serverSource, /assistantConversationTurnLimit = 30/);
assert.match(serverSource, /assistant_conversation_turn_limit/);
assert.match(assistantSource, /const CONVERSATION_TURN_LIMIT = 30/);
assert.match(assistantSource, /function conversationAtLimit\(\) \{[\s\S]*?CONVERSATION_TURN_LIMIT/);
assert.match(
  assistantSource,
  /const conversationLimited = conversationAtLimit\(\);[\s\S]*?els\.input\.disabled = [^;]*conversationLimited/,
  "a conversation at 30 turns must disable the composer"
);
assert.match(
  assistantSource,
  /if \(conversationAtLimit\(\)\) \{[\s\S]*?请新建对话继续/,
  "the assistant must stop sending after the conversation turn limit"
);
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
assert.match(assistantCss, /\.knowledge-proactive-nudge\s*\{/);
assert.match(assistantCss, /\.knowledge-assistant-root\.is-open \.knowledge-proactive-nudge/);
assert.match(assistantCss, /font-variant-numeric:\s*tabular-nums/);
assert.match(assistantSource, /data-knowledge-history-search/);
assert.match(assistantSource, /data-knowledge-history-filter="current"/);
assert.match(assistantSource, /data-knowledge-history-filter="archived"/);
assert.match(assistantSource, /data-conversation-action="rename"/);
assert.match(assistantSource, /data-conversation-action="archive"/);
assert.match(assistantSource, /data-conversation-action="delete"/);
assert.match(assistantSource, /function updateConversation/);
assert.match(assistantSource, /function deleteConversation/);
assert.doesNotMatch(assistantSource, /\bconfirm\s*\(/, "conversation deletion must use an inline confirmation");
assert.match(assistantCss, /\.knowledge-history-search\s*\{/);
assert.match(assistantCss, /\.knowledge-history-filters\s*\{/);
assert.match(assistantCss, /\.knowledge-conversation-menu\s*\{/);
assert.match(assistantCss, /\.knowledge-conversation-confirm\s*\{/);
assert.match(
  assistantSource,
  /document\.addEventListener\("pointerdown"[\s\S]*?data-conversation-menu-shell/,
  "clicking outside a conversation menu should close it"
);
assert.match(assistantSource, /data-knowledge-note-sync-status/);
assert.match(
  assistantSource,
  /function renderNoteSyncStatus\(\)[\s\S]*?!els\.noteEditor\.hidden[\s\S]*?!editingNoteId[\s\S]*?保存后同步到账号/,
  "a new unsaved note must not claim that it has already synced"
);
assert.match(assistantSource, /function syncLearningNotes/);
assert.match(assistantSource, /api\/learning\/notes\/sync/);
assert.match(assistantSource, /method:\s*"PUT"/);
assert.match(assistantSource, /method:\s*"DELETE"/);
assert.doesNotMatch(assistantSource, /仅当前浏览器可见/);
assert.match(assistantCss, /\.knowledge-note-sync-status\s*\{/);
assert.match(assistantSource, /NOTE_PENDING_STORAGE_PREFIX/);
assert.match(assistantSource, /deletedIds/);
assert.match(assistantSource, /function notePendingOperations/);
assert.match(assistantSource, /function requestProactiveDecision/);
assert.match(assistantSource, /api\/learning\/assistant\/intervention/);
assert.match(assistantSource, /proactiveDecisionRequest\?\.abort/);
assert.match(assistantSource, /decision\.intervene/);
assert.match(assistantSource, /function executeProactiveAction/);
assert.match(assistantSource, /observe_change/);
assert.match(assistantSource, /review_mistake/);
assert.match(assistantSource, /self_explain/);
const proactiveExecutorBody = assistantSource.match(
  /function executeProactiveAction\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/
)?.[1] || "";
assert.doesNotMatch(proactiveExecutorBody, /submitQuestion\s*\(/, "agent actions must never send a question automatically");
assert.match(
  assistantCss,
  /\.knowledge-composer\s*>\s*div:not\(\.knowledge-composer-meta\)\s*\{/,
  "composer input styling must not force the status and quota row into a 40px grid column"
);
assert.match(
  assistantCss,
  /\.knowledge-composer\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important;/,
  "history mode must hide the composer even when later cascade layers define its layout"
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
assert.match(
  indexHtml,
  /app\/main\/proactive-learning\.js[\s\S]*?app\/main\/analytics\.js/,
  "the proactive policy must load before analytics starts emitting learning signals"
);
assert.match(proactiveSource, /function createProactiveCoach/);
assert.match(analyticsSource, /cq:learning-signal/);
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
assert.match(
  stylesCss,
  /\.learning-shell:fullscreen \.learning-nav-cluster,[\s\S]*?\.learning-shell:fullscreen \.chapter-rail,[\s\S]*?\.learning-shell:fullscreen \.lesson-rail[\s\S]*?display:\s*none;/,
  "fullscreen learning must hide chapter and path controls instead of leaving incorrect labels over the canvas"
);
assert.match(stylesCss, /\.learning-shell\.is-local-fullscreen-target\s*\{/);
assert.match(narrationSource, /scheduleLearningCanvasLayoutSync\("learning-fullscreen-toggle"\)/);
assert.match(eventsSource, /scheduleLearningCanvasLayoutSync\("fullscreen-change"\)/);
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
assert.doesNotMatch(
  renderLearningSource,
  /allow="[^"]*\bfullscreen\b[^"]*"[^>]*\ballowfullscreen\b/i,
  "courseware iframes should not declare both fullscreen permission forms"
);
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
