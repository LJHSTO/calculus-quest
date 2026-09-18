const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const assistantSource = read("app/main/knowledge-assistant.js");
assert.match(assistantSource, /const awaitingFollowup = candidate\?\.kind === "independent_attempt_outcome"\s*&& proactiveScopeState\(meta\)\?\.lifecycle\?\.phase === "awaiting_independent_attempt"/);
assert.match(assistantSource, /\|\| \(isOpen && !awaitingFollowup\)/,
  "面板打开时只允许已接受帮助后的结果核对，不放开所有主动候选");
const assistantCss = read("app/main/knowledge-assistant.css");
const proactiveSource = read("app/main/proactive-learning.js");
const analyticsSource = read("app/main/analytics.js");
const notesSource = read("app/main/learning-notes.js");
const contextSource = read("app/main/courseware-context.js");
const bridgeSource = read("app/main/courseware-bridge.js");
const renderLearningSource = read("app/main/render-learning.js");
const bootstrapSource = read("app/main/bootstrap.js");
const agenticSource = read("app/main/agentic-path.js");
const narrationSource = read("app/main/narration.js");
const eventsSource = read("app/main/events.js");
const indexHtml = read("index.html");
const stylesCss = read("styles.css");
const serverSource = read("server.js");
const llmSource = read("lib/llm.js");
const envExample = read(".env.example");

assert.match(
  indexHtml,
  /app\/main\/knowledge-assistant\.css\?v=20260909-outcome-figures-v3/
);
assert.match(
  indexHtml,
  /app\/main\/knowledge-assistant\.js\?v=20260909-navigation-v10/
);
assert.match(
  indexHtml,
  /app\/main\/proactive-learning\.js\?v=20260909-independent-evidence-v2/
);
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
assert.match(
  serverSource,
  /verification:\s*live \? "pending" : "local"[\s\S]*?label:\s*live \? "待首次提问" : "本地引导"/,
  "已配置的真实模型必须先显示为待验证，不能提前冒充在线 AI 助教"
);
assert.match(
  assistantSource,
  /verification === "verified"[\s\S]*?"AI 助教"[\s\S]*?"待首次提问"/,
  "学生端必须区分待验证配置与已经成功返回的模型"
);
assert.match(
  assistantSource,
  /event\.fallback[\s\S]*?verification:\s*"failed"[\s\S]*?模型服务暂时不可用，已切换到本地引导/,
  "真实模型失败时必须明确降级为本地引导"
);
assert.match(
  assistantSource,
  /assistantMessage\.fallback = event\.fallback === true[\s\S]*?模型服务未接通，本次回答来自本地引导；仍可继续追问/,
  "模型失败后的最终状态不能被通用成功提示覆盖"
);
assert.match(
  assistantSource,
  /!\["mock", "fallback"\]\.includes\(assistantMessage\.provider\)[\s\S]*?verification:\s*"verified"[\s\S]*?label:\s*"AI 助教"/,
  "只有真实模型回答成功后才能显示 AI 助教"
);
assert.match(assistantSource, /data-knowledge-proactive/);
assert.match(assistantSource, /data-knowledge-proactive-accept/);
assert.match(assistantSource, /data-knowledge-proactive-snooze/);
assert.match(assistantSource, /data-knowledge-proactive-alternative/);
assert.match(assistantSource, /data-knowledge-proactive-mute/);
assert.match(assistantSource, /data-knowledge-proactive-scope-restore/);
assert.match(indexHtml, /id="chapter-outcome-panel"/);
assert.match(indexHtml, /data-proactive-outcomes-open/);
assert.match(assistantSource, /document\.querySelector\("\[data-proactive-outcomes-open\]"\)/);
assert.match(assistantSource, /data-knowledge-outcomes/);
assert.match(assistantSource, /data-knowledge-outcomes-content/);
assert.match(assistantSource, /data-knowledge-outcomes-status/);
assert.match(assistantSource, /data-knowledge-proactive-preference/);
assert.match(assistantSource, /data-knowledge-proactive-scope-restore/);
assert.match(
  assistantSource,
  /function syncFullscreenHost\(\)[\s\S]*?fullscreenHost\.appendChild\(root\)[\s\S]*?fullscreenHomeParent\.insertBefore\(root,\s*restoreBefore\)/,
  "知点必须进入当前 Fullscreen top layer，并在退出后恢复原位"
);
assert.match(
  assistantSource,
  /document\.addEventListener\("fullscreenchange",\s*syncFullscreenHost\)/,
  "知点必须跟随浏览器全屏目标变化"
);
assert.doesNotMatch(
  assistantSource,
  /data-proactive-preference=/,
  "正式 Pilot 不得让学生选择全局主动提示强度"
);
assert.doesNotMatch(
  assistantSource,
  /api\/learning\/proactive\/preference/,
  "学生端不得调用会改变实验干预剂量的全局偏好接口"
);
assert.match(
  assistantSource,
  /api\/learning\/proactive\/scope-preference/,
  "关闭当前知识点提醒必须由服务端持久化"
);
assert.match(
  assistantSource,
  /api\/learning\/proactive\/outcomes\?chapterId=/,
  "学生端必须从服务端读取独立测量阶段"
);
assert.match(
  assistantSource,
  /api\/learning\/proactive\/outcomes\/submit/,
  "学生端必须把独立测量提交到服务端评分"
);
assert.match(assistantSource, /api\/learning\/proactive\/outcomes\/\$\{nextAction\}/);
assert.match(assistantSource, /api\/learning\/proactive\/outcomes\/skip/);
assert.match(assistantSource, /保存草稿并暂时离开/);
assert.match(assistantSource, /永久跳过/);
assert.match(
  assistantSource,
  /let proactiveOutcomeDraftGeneration = 0[\s\S]*?proactiveOutcomeDraftGeneration \+= 1/,
  "重置独立测量状态时必须使旧草稿队列失效"
);
assert.match(
  assistantSource,
  /const draftOwnerKey = proactiveOutcomesOwner\(meta\)[\s\S]*?const draftGeneration = proactiveOutcomeDraftGeneration[\s\S]*?const draftAuthToken = state\.authToken/,
  "草稿请求必须绑定创建时的账号、队列代次和凭据"
);
assert.match(
  assistantSource,
  /draftGeneration === proactiveOutcomeDraftGeneration[\s\S]*?draftOwnerKey === proactiveOutcomesOwner\(\)/,
  "旧账号草稿完成后不得改写新账号的测量界面状态"
);
assert.match(
  assistantSource,
  /Authorization: `Bearer \$\{draftAuthToken\}`/,
  "排队中的草稿必须使用原账号凭据"
);
assert.match(
  assistantSource,
  /function proactiveCollectionEnabled[\s\S]*?proactiveOutcomesOpen[\s\S]*?return false;/,
  "独立测量打开期间必须暂停主动候选检测"
);
assert.match(
  assistantSource,
  /function render\(\)[\s\S]*?renderProactiveOutcomes\(\);/,
  "独立测量必须纳入主渲染周期"
);
assert.match(
  assistantSource,
  /applyProactiveStudy\(payload\.data \|\| \{\}, meta\);[\s\S]*?renderUnit\(\);/,
  "主动状态异步加载后必须立即重绘偏好与测量入口，不能依赖后续偶发 render"
);
assert.match(
  assistantSource,
  /\(unitChanged && !proactiveStudy\.assignment\)/,
  "前测后进入首个学习单元时必须刷新可能过早缓存的未分组状态"
);
assert.match(
  assistantSource,
  /isOpen[\s\S]*?!proactiveStudy\.assignment[\s\S]*?loadProactiveStudy\(courseMeta\(\), \{ force: true \}\)/,
  "打开知点时必须为缺失 assignment 提供可靠的状态同步边界"
);
assert.match(
  assistantSource,
  /els\.proactiveOutcomesOpen\.addEventListener\("click", openProactiveOutcomes\)/,
  "独立测量入口必须完成事件接线"
);
assert.match(
  assistantSource,
  /if \(proactiveOutcomesOpen\)[\s\S]*?event\.key === "Escape"[\s\S]*?closeProactiveOutcomes\(\)/,
  "独立测量必须支持键盘退出"
);
assert.match(
  assistantSource,
  /proactiveOutcomeOwnerKey !== proactiveOutcomesOwner\(meta\)[\s\S]*?resetProactiveOutcomes/,
  "学生或章节变化后不得保留上一位学生的测量状态"
);
assert.doesNotMatch(
  assistantSource.match(
    /function activeProactiveOutcomeNode[\s\S]*?(?=\s*function renderProactiveOutcomes)/
  )?.[0] || "",
  /\banswer\b/,
  "独立测量渲染器不得包含或检查答案键"
);
assert.match(
  serverSource,
  /proactive_global_preference_locked/,
  "正式 Pilot 必须在服务端锁住学生全局主动提示偏好"
);
assert.match(assistantCss, /\.knowledge-proactive-preference\s*\{/);
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
assert.match(
  proactiveActionBody,
  /new Set\(\[[\s\S]*?"ask_clarification"[\s\S]*?"review_mistake"[\s\S]*?"elicit_self_explanation"[\s\S]*?"concept_hint"[\s\S]*?"decompose_subgoal"[\s\S]*?"next_step_hint"[\s\S]*?"partial_worked_example"[\s\S]*?\]\)/
);
assert.match(
  proactiveActionBody,
  /allowedActions = \[[\s\S]*?"elicit_self_explanation"[\s\S]*?"concept_hint"[\s\S]*?"decompose_subgoal"[\s\S]*?"next_step_hint"[\s\S]*?"partial_worked_example"[\s\S]*?"switch_representation"[\s\S]*?\]/
);
assert.match(
  proactiveActionBody,
  /suggestion\?\.action === "switch_representation"[\s\S]*?selectUnit\(targetUnitId\)[\s\S]*?setKnowledgeSceneType\(targetUnitId, targetSceneType\)[\s\S]*?showInteractive/,
  "换表征必须在学生确认后调用现有场景选择和单元导航"
);
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
  /async function submitQuestion\(\)[\s\S]*?const proactivePrompt = usableProactivePrompt\(pendingProactivePrompt, meta\)[\s\S]*?proactiveInterventionId:/,
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
assert.match(assistantSource, /continueButton\.textContent = "继续问"/);
assert.match(assistantSource, /nextButton\.textContent = "下一题"/);
assert.match(assistantSource, /stopButton\.textContent = "就到这"/);
assert.match(
  assistantSource,
  /api\/learning\/assistant\/quiz-review\/action/,
  "quiz-review choices must be validated and restored by the server"
);
assert.match(
  assistantSource,
  /pendingQuizReviewPrompt/,
  "history loading must restore an unfinished quiz-review prompt"
);
assert.match(
  assistantSource,
  /function usableProactivePrompt[\s\S]*?prompt\.content[\s\S]*?prompt\.interventionId/,
  "empty or unsigned assistant prompts must never render as blank reply cards"
);
assert.match(
  assistantSource,
  /visible !== false/,
  "continuing the same mistake may carry hidden review context without duplicating the assistant prompt"
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
  /function quizParticipationAccessAllowed\(meta = courseMeta\(\)\)/
);
assert.match(
  assistantSource,
  /function setOpen\(next, options = \{\}\) \{[\s\S]*?quizAssistantLocked\(\)[\s\S]*?!quizParticipationAccessAllowed\(\)[\s\S]*?return false;/,
  "an unsubmitted quiz may only open the assistant panel for participation settings"
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
assert.match(assistantCss, /\.is-quiz-participation-only[\s\S]*?\[data-knowledge-form\]/);
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
assert.match(
  indexHtml,
  /knowledge-assistant\.css\?v=20260909-outcome-figures-v3/,
  "the proactive verification UI must ship behind a fresh stylesheet cache key"
);
assert.doesNotMatch(
  assistantCss,
  /@media \(max-width: 760px\)\s*\{\s*\.knowledge-proactive-nudge\s*\{\s*display:\s*none;/,
  "mobile learners must be able to see and resolve a server-issued proactive suggestion"
);
assert.match(
  assistantCss,
  /@media \(max-width: 760px\)[\s\S]*?\.knowledge-assistant-root\.has-proactive-nudge \.knowledge-launcher-shell\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*flex-end;/,
  "mobile proactive suggestions must stack above the launcher within the viewport"
);
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
assert.match(assistantSource, /data-knowledge-study-withdraw-confirm/);
assert.match(assistantSource, /data-knowledge-study-withdraw-cancel/);
assert.match(assistantSource, /data-knowledge-study-withdraw-submit/);
assert.match(assistantSource, /proactiveWithdrawalConfirming/);
assert.match(assistantSource, /knowledge_proactive_consent_notice_opened/);
assert.match(assistantSource, /knowledge_proactive_withdrawal_confirm_opened/);
assert.match(assistantSource, /knowledge_proactive_withdrawal_confirm_cancelled/);
assert.match(assistantCss, /\.knowledge-study-withdraw-confirm\s*\{/);
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
assert.match(assistantSource, /api\/learning\/proactive\/state/);
assert.match(assistantSource, /api\/learning\/proactive\/\$\{encodeURIComponent\(decisionId\)\}\/resolution/);
assert.match(assistantSource, /api\/learning\/proactive\/check/);
assert.match(assistantSource, /proactiveDecisionRequest\?\.abort/);
assert.match(assistantSource, /decision\.intervene/);
assert.match(assistantSource, /function serverAuthorizedProactiveDecision/);
assert.match(assistantSource, /study\.deliveryDecision === "intervene"/);
assert.doesNotMatch(
  assistantSource,
  /study\.assignment\?\.condition/,
  "the student client must not receive or inspect the randomized condition"
);
assert.match(assistantSource, /suggestion\.serverIssued === true/);
assert.match(assistantSource, /const PROACTIVE_NATURAL_BOUNDARY_EVENTS = new Set/);
assert.match(assistantSource, /function proactivePendingQuietState/);
assert.match(assistantSource, /function proactiveBoundaryCandidate/);
assert.match(
  proactiveDecisionBody,
  /boundaryRecheck: candidate\.boundaryRecheck === true[\s\S]*?boundaryEventType:/,
  "the client must label a boundary recheck while leaving boundary verification to the server"
);
assert.match(
  assistantSource,
  /pendingBoundaryCandidate[\s\S]*?requestProactiveDecision\([\s\S]*?persistedBoundary: true/,
  "a persisted quiet-dwell candidate must be reconsidered at the next natural task boundary"
);
assert.match(
  assistantSource,
  /if \(proactiveDecision\?\.serverIssued\) \{[\s\S]*?renderProactiveSuggestion\(\);[\s\S]*?return;/,
  "a server-issued boundary intervention must remain visible after the local dwell candidate is cleared"
);
assert.match(
  proactiveDecisionBody,
  /await Promise\.resolve\(\)[\s\S]*?analyticsFlushUntilSettled\(20000\)[\s\S]*?api\/learning\/assistant\/intervention/,
  "managed proactive decisions must flush the triggering evidence before asking the server"
);
assert.match(
  proactiveDecisionBody,
  /if \(proactiveStudyManaged\(meta\) \|\| candidate\.kind !== "repeated_parameter"\)[\s\S]*?managed_policy_unavailable/,
  "the managed chapter must fail silent instead of showing the historical local fallback"
);
["shown", "accepted", "dismissed", "ignored", "snoozed"].forEach((resolution) => {
  assert.match(
    assistantSource,
    new RegExp(`queueProactiveResolution\\([^\\n]+, "${resolution}"\\)`),
    `the student client must persist the ${resolution} resolution`
  );
});
assert.match(
  assistantSource,
  /async function requestProactiveAlternative[\s\S]*?student_requested_alternative[\s\S]*?sourceDecisionId/,
  "换一种帮助必须携带原服务端决策作为证据"
);
assert.match(
  assistantSource,
  /function snoozeProactiveSuggestion[\s\S]*?queueProactiveResolution\(presented, "snoozed"\)/,
  "稍后处理必须同步为独立的 snoozed 状态"
);
assert.match(assistantSource, /function executeProactiveAction/);
assert.match(assistantSource, /function proactiveVerificationNode/);
assert.match(assistantSource, /function proactiveInlineOfferNode/);
assert.match(assistantSource, /function proactiveCheckFeedbackNode/);
assert.match(
  assistantSource,
  /resolution:\s*declined\s*\?\s*"declined"\s*:\s*""/,
  "the learner must be able to end a verification round without triggering escalation"
);
const proactiveVerificationBody = assistantSource.match(
  /function proactiveVerificationNode\([^)]*\)[\s\S]*?(?=\s*function setMessageQuizReviewProgress)/
)?.[0] || "";
assert.doesNotMatch(
  proactiveVerificationBody,
  /\banswer\b/,
  "the student verification renderer must never contain or inspect an answer key"
);
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
assert.match(assistantCss, /\.knowledge-proactive-verification\s*,/);
assert.match(assistantCss, /\.knowledge-proactive-verification-options\s+button\s*\{/);
assert.match(assistantCss, /\.knowledge-proactive-inline-offer\s*\{/);
assert.match(assistantCss, /\.knowledge-proactive-inline-options\s+button\s*\{/);
assert.match(assistantCss, /\.knowledge-proactive-secondary-actions\s*\{/);
assert.match(assistantCss, /\.knowledge-proactive-scope-restore/);
assert.match(assistantCss, /\.knowledge-outcomes-layer\s*\{/);
assert.match(assistantCss, /\.knowledge-outcomes-dialog\s*\{/);
assert.match(assistantCss, /\.knowledge-outcome-stage\s*\{/);
assert.match(assistantCss, /\.knowledge-outcome-active\s+label\s*\{/);
assert.match(assistantCss, /body\.knowledge-outcomes-open\s*\{/);
assert.match(assistantCss, /\.knowledge-proactive-check-feedback\.is-success\s*\{/);
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
  /<body class="pilot-single-chapter">/,
  "the dedicated pilot site must declare its single-chapter presentation mode"
);
assert.match(
  indexHtml,
  /id="chapter-rail-toggle"[^>]*hidden/,
  "the chapter switcher must not be exposed in the single-chapter pilot"
);
assert.match(indexHtml, /id="lesson-rail-toggle"[\s\S]*?data-learning-toggle-label>路径</);
assert.match(
  indexHtml,
  /id="lesson-list"[\s\S]*?id="chapter-outcome-panel"[\s\S]*?data-proactive-outcomes-path-stages[\s\S]*?<\/aside>/,
  "independent outcome measurements must appear inside the learner path"
);
assert.match(indexHtml, /高等数学互动学习/);
assert.doesNotMatch(indexHtml, />Calculus Quest 加载中/);
assert.match(indexHtml, />学习平台加载中/);
assert.doesNotMatch(indexHtml, /不提供 Agent 帮助/);
assert.match(indexHtml, /learning-rail-control-icon/);
assert.match(bootstrapSource, /cq:knowledge-assistant-visibility/);
assert.match(bootstrapSource, /setLessonRailCollapsed\(true/);
assert.match(bootstrapSource, /pointerenter/);
assert.match(bootstrapSource, /pointerleave/);
assert.match(bootstrapSource, /CHAPTER_HOVER_OPEN_DELAY_MS/);
assert.match(bootstrapSource, /cq:learning-layout-change/);
assert.match(bootstrapSource, /setupLearningCanvasLayoutSync/);
assert.match(bootstrapSource, /document\.querySelector\("#learning-action-dock"\)/);
assert.match(bootstrapSource, /wrapper\.replaceChildren\(\)/);
assert.match(bootstrapSource, /KnowledgeAssistant\?\.outcomeNavigationAction/);
assert.match(bootstrapSource, /KnowledgeAssistant\?\.openOutcomeStage/);
assert.match(bootstrapSource, /function syncLearningActionDockPosition/);
assert.match(agenticSource, /targetUnitId:\s*next\.id/);
assert.match(agenticSource, /完成并进入「\$\{targetLabel\}」/);
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
assert.match(
  stylesCss,
  /\.learning-action-dock\s*\{[\s\S]*?position:\s*fixed;/,
  "the active path controls must remain fixed at the viewport bottom"
);
assert.match(
  stylesCss,
  /\.question-math-fragment:not\(\.is-display\)\s*\{[\s\S]*?overflow:\s*visible;/,
  "short inline symbols such as S_n and T_n must never render a scrollbar"
);
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
assert.match(contextSource, /BRIDGE_VERSION\s*=\s*"20260909-v10"/);
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
assert.match(renderLearningSource, /candidate\.contentWindow === event\.source/);
assert.match(renderLearningSource, /event\.data\?\.type === "cq:bridge-ready"/);
assert.match(renderLearningSource, /scheduleLearningCanvasLayoutSync\("courseware-bridge-ready"\)/);
assert.match(renderLearningSource, /event\.data\?\.type === "cq:interaction"/);
assert.match(renderLearningSource, /trackCoursewareBridgeInteraction\(frame, event\.data\)/);
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
