(function initKnowledgeAssistant(global) {
  const Core = global.CoursewareContextCore;
  const Notes = global.LearningNotesCore;
  const Proactive = global.ProactiveLearningCore;
  const root = document.querySelector("#knowledge-assistant-root");
  if (!Core || !Notes || !root) return;
  const fullscreenHomeParent = root.parentNode;
  const fullscreenHomeNextSibling = root.nextSibling;

  const OPEN_STORAGE_KEY = "calculus-quest-knowledge-assistant-open-v1";
  const LAUNCHER_STORAGE_KEY = "calculus-quest-knowledge-launcher-v1";
  const PANEL_STORAGE_KEY = "calculus-quest-knowledge-panel-position-v1";
  const NOTE_MIGRATION_STORAGE_PREFIX = "calculus-quest-learning-notes-synced-v2:";
  const NOTE_PENDING_STORAGE_PREFIX = "calculus-quest-learning-notes-pending-v2:";
  const QUIZ_LOCKED_MESSAGE = "提交本次测验后即可使用知点复盘。";
  const CONVERSATION_TURN_LIMIT = 30;
  const PROACTIVE_STUDY_CHAPTER_ID = "V14-C1";
  const PROACTIVE_NATURAL_BOUNDARY_EVENTS = new Set([
    "parameter_commit",
    "interactive_submit",
    "courseware_interaction_complete",
    "courseware_formative_check_submitted",
    "courseware_challenge_result"
  ]);
  let isOpen = false;
  let isAsking = false;
  let loadingHistory = false;
  let activeContext = null;
  let recentInteraction = null;
  let pendingSelection = null;
  let noteEditorSelection = null;
  let currentUnitKey = "";
  let currentSceneType = "";
  let currentQuizSubmitted = false;
  let currentParticipantId = "";
  let currentSupported = false;
  let historyRequestId = 0;
  let activeRequest = null;
  let syncTimer = null;
  let messages = [];
  let conversations = [];
  let activeConversationId = "";
  let activeWorkspace = "chat";
  let loadingConversations = false;
  let historySearch = "";
  let historyFilter = "current";
  let historySearchTimer = null;
  let openConversationMenuId = "";
  let renamingConversationId = "";
  let deletingConversationId = "";
  let pendingAssistantIntent = "";
  let pendingProactivePrompt = null;
  let pendingGeneratedDraft = "";
  let openMessageSourceId = "";
  let editingNoteId = "";
  let selectedNoteColor = "amber";
  let noteSyncState = "local";
  let noteSyncRequestId = 0;
  let provider = {
    id: "mock",
    live: false,
    verification: "local",
    label: "本地引导"
  };
  let quota = { limit: 30, used: 0, remaining: 30, usageDate: "" };
  let launcherPlacement = Core.normalizeLauncherPlacement();
  let panelPosition = null;
  let suppressLauncherClickUntil = 0;
  const proactiveCoach = Proactive?.createProactiveCoach?.() || null;
  let lastPresentedSuggestionId = "";
  let proactiveTickTimer = null;
  let proactiveDecision = null;
  let proactiveDecisionRequest = null;
  let proactiveCandidateId = "";
  let proactiveStudyRequestId = 0;
  let proactiveStudyKey = "";
  let proactiveResolutionChain = Promise.resolve();
  let proactiveCheckKey = "";
  let proactiveCheckSelection = "";
  let proactiveCheckStartedAt = 0;
  let proactiveCheckSubmitting = false;
  let proactiveCheckFeedback = null;
  let proactiveChoiceSaving = false;
  let proactiveParticipationSaving = false;
  let proactiveWithdrawalConfirming = false;
  let proactiveOutcomesOpen = false;
  let proactiveOutcomesLoading = false;
  let proactiveOutcomesSubmitting = false;
  let proactiveOutcomeDraftSaving = false;
  let proactiveOutcomeDraftPending = 0;
  let proactiveOutcomeDraftChain = Promise.resolve();
  let proactiveOutcomeDraftGeneration = 0;
  let proactiveOutcomeWithdrawing = false;
  let proactiveOutcomeSkipConfirming = false;
  let proactiveOutcomes = null;
  let proactiveOutcomeStageId = "";
  let proactiveOutcomeReviewStageId = "";
  let proactiveOutcomeResponses = {};
  let proactiveOutcomeStatus = "";
  let proactiveOutcomeOwnerKey = "";
  let proactiveStudy = {
    loaded: false,
    managed: false,
    mode: "off",
    chapterId: PROACTIVE_STUDY_CHAPTER_ID,
    candidateCollectionEnabled: false,
    assignment: null,
    participation: {
      mode: "implicit-pilot",
      status: "not_enrolled",
      enrolled: false,
      withdrawn: false
    },
    studentPreference: "standard",
    policyStates: []
  };

  try {
    isOpen = localStorage.getItem(OPEN_STORAGE_KEY) === "1";
    launcherPlacement = Core.normalizeLauncherPlacement(
      JSON.parse(localStorage.getItem(LAUNCHER_STORAGE_KEY) || "{}")
    );
    const storedPanelPosition = JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) || "null");
    panelPosition = storedPanelPosition && typeof storedPanelPosition === "object"
      ? storedPanelPosition
      : null;
  } catch {}

  root.innerHTML = `
    <div class="knowledge-launcher-shell" data-knowledge-launcher-shell>
      <aside class="knowledge-proactive-nudge" data-knowledge-proactive hidden role="status" aria-live="polite">
        <span class="knowledge-proactive-mark" aria-hidden="true"><i></i></span>
        <div class="knowledge-proactive-copy">
          <small data-knowledge-proactive-eyebrow>知点留意到</small>
          <strong data-knowledge-proactive-title></strong>
          <p data-knowledge-proactive-body></p>
          <div class="knowledge-proactive-actions">
            <button type="button" data-knowledge-proactive-accept>带我看看</button>
            <button type="button" data-knowledge-proactive-snooze>稍后</button>
          </div>
          <div class="knowledge-proactive-secondary-actions">
            <button type="button" data-knowledge-proactive-alternative>换一种帮助</button>
            <button type="button" data-knowledge-proactive-mute>关闭此知识点提醒</button>
          </div>
        </div>
      </aside>
      <button class="knowledge-assistant-launcher" type="button" data-knowledge-open aria-controls="knowledge-assistant-panel" aria-expanded="false" aria-label="打开知点" title="打开知点：围绕当前课件提问">
        <span class="knowledge-launcher-grip" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="knowledge-pin" aria-hidden="true"><i></i></span>
        <span class="knowledge-launcher-copy"><strong>知点</strong><small data-knowledge-launcher-subtitle>陪你理清眼前这一处</small></span>
      </button>
    </div>

    <section class="knowledge-assistant-panel" id="knowledge-assistant-panel" aria-label="知点上下文学习侧栏" aria-hidden="true" tabindex="-1">
      <button class="knowledge-panel-dragbar" type="button" data-knowledge-panel-dragbar aria-label="拖动知点窗口" title="拖动调整窗口位置；双击恢复默认位置">
        <span aria-hidden="true"></span>
        <small>拖动窗口</small>
      </button>

      <header class="knowledge-assistant-header">
        <div class="knowledge-assistant-brand">
          <span class="knowledge-pin large" aria-hidden="true"><i></i></span>
          <div>
            <strong>知点</strong>
            <small>沿着当前内容继续理解</small>
          </div>
        </div>
        <div class="knowledge-assistant-header-actions">
          <span class="knowledge-provider-badge" data-knowledge-provider>本地引导</span>
          <button type="button" class="knowledge-icon-button knowledge-new-chat" data-knowledge-new-conversation aria-label="创建新对话" title="创建新对话">＋</button>
          <button type="button" class="knowledge-icon-button knowledge-history-toggle" data-knowledge-history-toggle aria-label="查看历史对话" title="查看历史对话" aria-pressed="false">↶</button>
          <button type="button" class="knowledge-icon-button" data-knowledge-close aria-label="关闭知点侧栏">×</button>
        </div>
      </header>

      <div class="knowledge-assistant-workspace">
      <div class="knowledge-assistant-scroll" data-knowledge-scroll data-knowledge-chat-view>
        <div class="knowledge-assistant-unit">
          <span>当前学习位置</span>
          <strong data-knowledge-unit>等待课件加载</strong>
          <small data-knowledge-unit-detail>打开 Quiz、Slide 或互动课件后即可提问。</small>
        </div>

        <section class="knowledge-study-participation" data-knowledge-study-participation hidden>
          <div>
            <strong data-knowledge-study-participation-title>本章主动伴学研究</strong>
            <small data-knowledge-study-participation-status></small>
          </div>
          <a data-knowledge-study-consent-link hidden target="_blank" rel="noopener noreferrer">查看研究说明</a>
          <label data-knowledge-study-consent-confirm hidden>
            <input type="checkbox" data-knowledge-study-consent-checkbox>
            <span>我已阅读当前版本的研究说明，并自愿参加。</span>
          </label>
          <div class="knowledge-study-participation-actions">
            <button type="button" data-knowledge-study-enroll hidden>同意参加</button>
            <button type="button" data-knowledge-study-withdraw hidden>退出研究</button>
          </div>
          <div class="knowledge-study-withdraw-confirm" data-knowledge-study-withdraw-confirm hidden role="group" aria-label="确认退出研究">
            <p>退出后将停止新的实验性主动提示和研究测量；课程、普通知点提问和已有学习记录不受影响。本实验中的退出记录不可撤销。</p>
            <div>
              <button type="button" data-knowledge-study-withdraw-cancel>保留参加</button>
              <button type="button" data-knowledge-study-withdraw-submit>确认退出</button>
            </div>
          </div>
        </section>

        <section class="knowledge-proactive-preference" data-knowledge-proactive-preference hidden>
          <div>
            <strong>当前知识点提醒已关闭</strong>
            <small data-knowledge-proactive-preference-status>恢复后，系统会继续按本组既定方案判断是否提供帮助。</small>
          </div>
          <button type="button" class="knowledge-proactive-scope-restore" data-knowledge-proactive-scope-restore>恢复当前知识点提醒</button>
        </section>

        <div class="knowledge-quiz-policy" data-knowledge-quiz-policy hidden>
          <span aria-hidden="true">!</span>
          <p><strong>提交后开启知点</strong>先独立完成本次测验；提交后可以复盘题目、分析错因并继续追问。</p>
        </div>

        <section class="knowledge-context-card" data-knowledge-context hidden>
          <div class="knowledge-context-heading">
            <span><i class="knowledge-pin mini" aria-hidden="true"></i> 学习焦点</span>
            <div>
              <button type="button" data-knowledge-restore>回到原处</button>
              <button type="button" data-knowledge-clear-context aria-label="清除当前选区">×</button>
            </div>
          </div>
          <div class="knowledge-context-summary">
            <strong data-knowledge-context-title></strong>
            <small data-knowledge-context-confidence></small>
          </div>
          <blockquote data-knowledge-context-copy></blockquote>
        </section>

        <section class="knowledge-operation-echo" data-knowledge-echo hidden>
          <div>
            <span>刚才在这里</span>
            <strong data-knowledge-echo-title></strong>
            <small data-knowledge-echo-copy></small>
          </div>
          <button type="button" data-knowledge-use-echo>带上这个变化</button>
        </section>

        <div class="knowledge-assistant-tools">
          <button type="button" class="knowledge-pick-button" data-knowledge-pick>
            <span class="knowledge-crosshair" aria-hidden="true"></span>
            <span data-knowledge-pick-label>选取课件焦点</span>
          </button>
          <p>文字和公式可直接划选；图形、选项或互动控件可先设为焦点，再继续提问。</p>
        </div>

        <div class="knowledge-quick-questions" data-knowledge-quick aria-label="快捷问题"></div>

        <div class="knowledge-message-list" data-knowledge-messages role="log" aria-live="polite" aria-relevant="additions text">
          <div class="knowledge-empty-state" data-knowledge-empty>
            <span class="knowledge-pin empty" aria-hidden="true"><i></i></span>
            <strong>从眼前这一步继续</strong>
            <p>直接说出疑问，或先选取一段文字、一个公式或一个互动控件。</p>
          </div>
        </div>
      </div>
      <section class="knowledge-history-view" data-knowledge-history-view hidden aria-label="历史对话">
        <div class="knowledge-history-heading">
          <div>
            <span>本学习位置</span>
            <strong>历史对话</strong>
          </div>
          <button type="button" data-knowledge-history-new>新建</button>
        </div>
        <label class="knowledge-history-search">
          <span aria-hidden="true"></span>
          <input type="search" data-knowledge-history-search maxlength="120" autocomplete="off" placeholder="搜索这处的对话" aria-label="搜索历史对话">
        </label>
        <div class="knowledge-history-filters" role="group" aria-label="对话范围">
          <button type="button" data-knowledge-history-filter="current" aria-pressed="true">当前</button>
          <button type="button" data-knowledge-history-filter="archived" aria-pressed="false">已归档</button>
        </div>
        <div class="knowledge-conversation-list" data-knowledge-conversation-list></div>
      </section>
      </div>

      <form class="knowledge-composer" data-knowledge-form>
        <label for="knowledge-question-input">输入你的问题</label>
        <div>
          <textarea id="knowledge-question-input" data-knowledge-input rows="1" maxlength="1200" placeholder="例如：为什么 h 变小时，割线更接近切线？"></textarea>
          <button type="submit" data-knowledge-send aria-label="发送问题">↑</button>
        </div>
        <div class="knowledge-composer-meta">
          <small data-knowledge-status>回答会参考当前知识点与已聚焦的课件内容。</small>
          <span data-knowledge-quota>今日还可提问 30 次</span>
        </div>
      </form>
    </section>

    <section class="knowledge-outcomes-layer" data-knowledge-outcomes hidden role="dialog" aria-modal="true" aria-labelledby="knowledge-outcomes-title">
      <div class="knowledge-outcomes-dialog" id="knowledge-outcomes-dialog" tabindex="-1">
        <header>
          <div>
            <small>本章研究测量</small>
            <strong id="knowledge-outcomes-title">保持测量</strong>
          </div>
          <button type="button" data-knowledge-outcomes-close aria-label="关闭学习结果记录">×</button>
        </header>
        <div class="knowledge-outcomes-intro">
          <strong>请独立完成</strong>
          <p data-outcome-policy>作答期间暂停学习助手和路径建议。提交后可以回看作答和结果。</p>
        </div>
        <div class="knowledge-outcomes-content" data-knowledge-outcomes-content></div>
        <p class="knowledge-outcomes-status" data-knowledge-outcomes-status role="status"></p>
      </div>
    </section>

    <div class="knowledge-pick-notice" data-knowledge-pick-notice hidden role="status">
      <span class="knowledge-crosshair" aria-hidden="true"></span>
      <p><strong>选择一处作为学习焦点</strong><small data-knowledge-pick-instructions>移动鼠标可预览可选范围；本次点击只作标记，不会触发课件操作。按 Esc 退出。</small></p>
      <button type="button" data-knowledge-cancel-pick>取消</button>
    </div>

    <div class="knowledge-selection-toolbar" data-knowledge-selection-toolbar hidden role="toolbar" aria-label="选中文字后的学习操作">
      <button type="button" data-knowledge-selection-ask>
        <span class="knowledge-selection-icon ask" aria-hidden="true"></span>
        问知点
      </button>
      <span class="knowledge-selection-divider" aria-hidden="true"></span>
      <button type="button" data-knowledge-selection-note>
        <span class="knowledge-selection-icon note" aria-hidden="true"></span>
        记一笔
      </button>
    </div>

    <form class="knowledge-note-editor" data-knowledge-note-editor hidden>
      <header>
        <div>
          <span class="knowledge-note-mark" aria-hidden="true"></span>
          <strong>划线笔记</strong>
        </div>
        <button type="button" data-knowledge-note-cancel aria-label="取消记录笔记">×</button>
      </header>
      <blockquote data-knowledge-note-excerpt></blockquote>
      <label class="knowledge-note-input-label" for="knowledge-note-input">写下你的理解、疑问或提醒</label>
      <textarea id="knowledge-note-input" data-knowledge-note-input rows="5" maxlength="1200" placeholder="写下你的笔记……"></textarea>
      <fieldset class="knowledge-note-colors" data-knowledge-note-colors>
        <legend>划线颜色</legend>
        <button type="button" data-note-color="amber" aria-label="琥珀色划线" aria-pressed="true"></button>
        <button type="button" data-note-color="mint" aria-label="淡紫色划线" aria-pressed="false"></button>
        <button type="button" data-note-color="blue" aria-label="天空蓝划线" aria-pressed="false"></button>
        <button type="button" data-note-color="pink" aria-label="樱粉色划线" aria-pressed="false"></button>
      </fieldset>
      <footer>
        <small class="knowledge-note-sync-status" data-knowledge-note-sync-status>登录后可跨设备保存</small>
        <div>
          <button type="button" class="knowledge-note-delete" data-knowledge-note-delete hidden>删除</button>
          <button type="button" class="knowledge-note-secondary" data-knowledge-note-cancel-footer>取消</button>
          <button type="submit" data-knowledge-note-save>保存</button>
        </div>
      </footer>
    </form>
  `;

  const els = {
    launcherShell: root.querySelector("[data-knowledge-launcher-shell]"),
    launcher: root.querySelector("[data-knowledge-open]"),
    launcherSubtitle: root.querySelector("[data-knowledge-launcher-subtitle]"),
    proactive: root.querySelector("[data-knowledge-proactive]"),
    proactiveEyebrow: root.querySelector("[data-knowledge-proactive-eyebrow]"),
    proactiveTitle: root.querySelector("[data-knowledge-proactive-title]"),
    proactiveBody: root.querySelector("[data-knowledge-proactive-body]"),
    proactiveAccept: root.querySelector("[data-knowledge-proactive-accept]"),
    proactiveSnooze: root.querySelector("[data-knowledge-proactive-snooze]"),
    proactiveAlternative: root.querySelector("[data-knowledge-proactive-alternative]"),
    proactiveMute: root.querySelector("[data-knowledge-proactive-mute]"),
    panel: root.querySelector("[data-knowledge-assistant-panel], #knowledge-assistant-panel"),
    panelDragbar: root.querySelector("[data-knowledge-panel-dragbar]"),
    scroll: root.querySelector("[data-knowledge-scroll]"),
    close: root.querySelector("[data-knowledge-close]"),
    newConversation: root.querySelector("[data-knowledge-new-conversation]"),
    historyToggle: root.querySelector("[data-knowledge-history-toggle]"),
    provider: root.querySelector("[data-knowledge-provider]"),
    unit: root.querySelector("[data-knowledge-unit]"),
    unitDetail: root.querySelector("[data-knowledge-unit-detail]"),
    proactivePreference: root.querySelector("[data-knowledge-proactive-preference]"),
    proactivePreferenceStatus: root.querySelector("[data-knowledge-proactive-preference-status]"),
    proactiveScopeRestore: root.querySelector("[data-knowledge-proactive-scope-restore]"),
    proactiveParticipation: root.querySelector("[data-knowledge-study-participation]"),
    proactiveParticipationTitle: root.querySelector("[data-knowledge-study-participation-title]"),
    proactiveParticipationStatus: root.querySelector("[data-knowledge-study-participation-status]"),
    proactiveConsentLink: root.querySelector("[data-knowledge-study-consent-link]"),
    proactiveConsentConfirm: root.querySelector("[data-knowledge-study-consent-confirm]"),
    proactiveConsentCheckbox: root.querySelector("[data-knowledge-study-consent-checkbox]"),
    proactiveEnroll: root.querySelector("[data-knowledge-study-enroll]"),
    proactiveWithdraw: root.querySelector("[data-knowledge-study-withdraw]"),
    proactiveWithdrawConfirmPanel: root.querySelector("[data-knowledge-study-withdraw-confirm]"),
    proactiveWithdrawCancel: root.querySelector("[data-knowledge-study-withdraw-cancel]"),
    proactiveWithdrawConfirm: root.querySelector("[data-knowledge-study-withdraw-submit]"),
    proactiveOutcomesOpen: document.querySelector("[data-proactive-outcomes-open]"),
    proactiveOutcomesPanel: document.querySelector("#chapter-outcome-panel"),
    proactiveOutcomesSummary: document.querySelector("[data-proactive-outcomes-summary]"),
    proactiveOutcomePathStages: document.querySelector("[data-proactive-outcomes-path-stages]"),
    quizPolicy: root.querySelector("[data-knowledge-quiz-policy]"),
    context: root.querySelector("[data-knowledge-context]"),
    contextTitle: root.querySelector("[data-knowledge-context-title]"),
    contextCopy: root.querySelector("[data-knowledge-context-copy]"),
    contextConfidence: root.querySelector("[data-knowledge-context-confidence]"),
    restore: root.querySelector("[data-knowledge-restore]"),
    clearContext: root.querySelector("[data-knowledge-clear-context]"),
    echo: root.querySelector("[data-knowledge-echo]"),
    echoTitle: root.querySelector("[data-knowledge-echo-title]"),
    echoCopy: root.querySelector("[data-knowledge-echo-copy]"),
    useEcho: root.querySelector("[data-knowledge-use-echo]"),
    pick: root.querySelector("[data-knowledge-pick]"),
    pickLabel: root.querySelector("[data-knowledge-pick-label]"),
    quick: root.querySelector("[data-knowledge-quick]"),
    messages: root.querySelector("[data-knowledge-messages]"),
    empty: root.querySelector("[data-knowledge-empty]"),
    chatView: root.querySelector("[data-knowledge-chat-view]"),
    historyView: root.querySelector("[data-knowledge-history-view]"),
    historyNew: root.querySelector("[data-knowledge-history-new]"),
    historySearch: root.querySelector("[data-knowledge-history-search]"),
    historyFilters: Array.from(root.querySelectorAll("[data-knowledge-history-filter]")),
    conversationList: root.querySelector("[data-knowledge-conversation-list]"),
    form: root.querySelector("[data-knowledge-form]"),
    input: root.querySelector("[data-knowledge-input]"),
    send: root.querySelector("[data-knowledge-send]"),
    status: root.querySelector("[data-knowledge-status]"),
    quota: root.querySelector("[data-knowledge-quota]"),
    pickNotice: root.querySelector("[data-knowledge-pick-notice]"),
    pickInstructions: root.querySelector("[data-knowledge-pick-instructions]"),
    cancelPick: root.querySelector("[data-knowledge-cancel-pick]"),
    selectionToolbar: root.querySelector("[data-knowledge-selection-toolbar]"),
    selectionAsk: root.querySelector("[data-knowledge-selection-ask]"),
    selectionNote: root.querySelector("[data-knowledge-selection-note]"),
    noteEditor: root.querySelector("[data-knowledge-note-editor]"),
    noteExcerpt: root.querySelector("[data-knowledge-note-excerpt]"),
    noteInput: root.querySelector("[data-knowledge-note-input]"),
    noteColors: root.querySelector("[data-knowledge-note-colors]"),
    noteCancel: root.querySelector("[data-knowledge-note-cancel]"),
    noteCancelFooter: root.querySelector("[data-knowledge-note-cancel-footer]"),
    noteDelete: root.querySelector("[data-knowledge-note-delete]"),
    noteSave: root.querySelector("[data-knowledge-note-save]"),
    noteSyncStatus: root.querySelector("[data-knowledge-note-sync-status]"),
    outcomes: root.querySelector("[data-knowledge-outcomes]"),
    outcomesDialog: root.querySelector(".knowledge-outcomes-dialog"),
    outcomesClose: root.querySelector("[data-knowledge-outcomes-close]"),
    outcomesContent: root.querySelector("[data-knowledge-outcomes-content]"),
    outcomesStatus: root.querySelector("[data-knowledge-outcomes-status]")
  };

  function isSignedInNow() {
    return typeof isSignedIn === "function" && isSignedIn();
  }

  function noteOwnerKey() {
    return String(
      state?.participant?.participantId
      || state?.participant?.id
      || currentParticipantId
      || "local"
    );
  }

  function noteThreadKey(ref = null, meta = courseMeta()) {
    return Core.contextThreadKey(ref || {}, meta);
  }

  function selectedSceneMeta(unit) {
    if (!unit || unit.type !== "knowledge") return { sceneType: "", candidate: null };
    if (document.querySelector(".core-learning-workspace")?.dataset.classroomSurface === "slide") {
      return { sceneType: "", candidate: null };
    }
    const sceneType = typeof selectedKnowledgeSceneType === "function"
      ? selectedKnowledgeSceneType(unit)
      : state?.selectedKnowledgeScenes?.[unit.id] || "";
    const candidate = sceneType && typeof knowledgeResourceCandidate === "function"
      ? knowledgeResourceCandidate(unit, sceneType)
      : null;
    return { sceneType, candidate };
  }

  function courseMeta() {
    const unit = typeof getUnit === "function" ? getUnit() : null;
    const chapter = unit && typeof getChapter === "function" ? getChapter(unit.chapterId) : null;
    const knowledgePoint = unit?.scene?.content?.knowledgePoint || null;
    const scene = selectedSceneMeta(unit);
    const quizSubmitted = Boolean(
      unit?.type === "quiz"
      && (state?.submittedQuizzes || []).includes(unit.id)
    );
    const supported = Boolean(
      unit
      && ["knowledge", "quiz", "slide", "interactive"].includes(unit.type || unit.scene?.type)
    );
    return {
      chapterId: unit?.chapterId || currentChapterId || "",
      chapterLabel: chapter?.label || chapter?.title || "",
      unitId: unit?.id || currentUnitId || "",
      unitLabel: unit?.label || "",
      unitType: unit?.type || unit?.scene?.type || "",
      knowledgePointId: knowledgePoint?.id || (unit?.type === "knowledge" ? unit.id : ""),
      knowledgePointLabel: knowledgePoint?.name || (unit?.type === "knowledge" ? unit.label : ""),
      sceneType: scene.sceneType || "",
      resourceTitle: scene.candidate?.title || "",
      learningSurface: unit?.type === "knowledge"
        ? (document.querySelector(".core-learning-workspace")?.dataset.classroomSurface === "interactive" ? "interactive" : "slide")
        : "lesson",
      quizSubmitted,
      isQuiz: unit?.type === "quiz",
      supported
    };
  }

  function quizAssistantLocked(meta = courseMeta()) {
    return Boolean(meta?.isQuiz && !meta.quizSubmitted);
  }

  function quizParticipationAccessAllowed(meta = courseMeta()) {
    const participation = proactiveStudy.participation || {};
    return Boolean(
      quizAssistantLocked(meta)
      && proactiveStudyManaged(meta)
      && proactiveStudy.loaded
      && isSignedInNow()
      && participation.mode === "explicit-consent"
      && (
        participation.canEnroll === true
        || participation.canWithdraw === true
      )
    );
  }

  function renderLauncherAvailability(meta = courseMeta()) {
    const quizLocked = quizAssistantLocked(meta);
    const participationOnly = quizParticipationAccessAllowed(meta);
    const measurementBlocked = Boolean(
      proactiveStudy.agentAssistanceBlocked
      || activeProactiveOutcomeSession()
    );
    root.classList.toggle("is-quiz-locked", quizLocked);
    root.classList.toggle("is-quiz-participation-only", participationOnly);
    root.classList.toggle("is-measurement-blocked", measurementBlocked);
    els.launcher.setAttribute(
      "aria-disabled",
      (quizLocked && !participationOnly) || measurementBlocked
        ? "true"
        : "false"
    );
    els.launcher.setAttribute(
      "aria-label",
      measurementBlocked
        ? "独立测量期间知点暂时关闭"
        : participationOnly
          ? "打开研究参与设置；测验问答仍保持关闭"
          : quizLocked
          ? "知点将在提交测验后解锁"
          : "打开知点"
    );
    els.launcher.setAttribute(
      "title",
      measurementBlocked
        ? "完成或退出独立测量后恢复知点"
        : participationOnly
          ? "管理本章研究参与；提交测验前不能提问或查看学习提示"
          : quizLocked
          ? QUIZ_LOCKED_MESSAGE
          : "打开知点：围绕当前课件提问"
    );
    els.launcherSubtitle.textContent = measurementBlocked
      ? "独立测量期间暂停"
      : participationOnly
        ? "研究参与设置"
        : quizLocked
        ? "提交测验后解锁"
        : "陪你理清眼前这一处";
  }

  function track(eventType, data = {}) {
    if (typeof analyticsTrack === "function") {
      analyticsTrack(eventType, {
        source: "knowledge_assistant",
        data: {
          ...data,
          unitId: courseMeta().unitId
        }
      });
    }
  }

  function proactiveStudyManaged(meta = courseMeta()) {
    return meta.chapterId === (proactiveStudy.chapterId || PROACTIVE_STUDY_CHAPTER_ID);
  }

  function proactiveScopeKey(meta = courseMeta()) {
    return String(meta.knowledgePointId || meta.unitId || "");
  }

  function proactiveScopeState(meta = courseMeta()) {
    const scopeKey = proactiveScopeKey(meta);
    return proactiveStudy.policyStates.find(
      (item) => item.scopeKey === scopeKey
    ) || null;
  }

  function proactiveScopeMuted(meta = courseMeta()) {
    const row = proactiveScopeState(meta);
    return row?.scopePreference === "off"
      || row?.studentPreference === "off";
  }

  function proactiveVerificationCheck(meta = courseMeta()) {
    const scopeKey = proactiveScopeKey(meta);
    if (!scopeKey) return null;
    const row = proactiveStudy.policyStates.find(
      (item) => item.scopeKey === scopeKey
    );
    return row?.verificationCheck || null;
  }

  function syncProactiveCheckState(meta = courseMeta()) {
    const check = proactiveVerificationCheck(meta);
    const nextKey = check?.id
      ? `${proactiveScopeKey(meta)}:${check.id}`
      : "";
    if (nextKey === proactiveCheckKey) return check;
    proactiveCheckKey = nextKey;
    proactiveCheckSelection = "";
    proactiveCheckStartedAt = nextKey ? Date.now() : 0;
    proactiveCheckSubmitting = false;
    if (nextKey) proactiveCheckFeedback = null;
    return check;
  }

  function proactivePendingQuietState(meta = courseMeta()) {
    const row = proactiveStudy.policyStates.find((item) => item.scopeKey === meta.unitId);
    if (
      row?.pendingCandidateKind !== "quiet_dwell"
      || row.pendingBoundaryEvaluation !== true
    ) return null;
    const expiresAt = Date.parse(row.pendingCandidateExpiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return row;
  }

  function proactiveBoundaryCandidate(signal = {}, meta = courseMeta()) {
    const pending = proactivePendingQuietState(meta);
    const eventType = String(signal.eventType || "");
    if (!pending || !PROACTIVE_NATURAL_BOUNDARY_EVENTS.has(eventType)) return null;
    const eventKey = String(
      signal.eventId
      || signal.timing?.clientAt
      || `${eventType}:${Date.now()}`
    ).replace(/[^A-Za-z0-9:._-]/g, "").slice(0, 120);
    return {
      id: `${meta.unitId}:quiet_dwell_boundary:${eventKey}`,
      kind: "quiet_dwell",
      unitId: meta.unitId,
      createdAt: pending.pendingCandidateAt || new Date().toISOString(),
      boundaryRecheck: true,
      boundaryEventType: eventType,
      dwellSeconds: 0,
      dismissStreak: 0
    };
  }

  function proactiveCollectionEnabled(meta = courseMeta()) {
    if (
      proactiveOutcomesOpen
      || proactiveStudy.agentAssistanceBlocked
      || activeProactiveOutcomeSession()
    ) return false;
    if (!proactiveStudyManaged(meta)) return true;
    return Boolean(
      proactiveStudy.loaded
      && proactiveStudy.managed
      && proactiveStudy.candidateCollectionEnabled
      && proactiveStudy.studentPreference !== "off"
      && !proactiveScopeMuted(meta)
    );
  }

  function applyProactiveStudy(data = {}, meta = courseMeta()) {
    let policyStates = Array.isArray(data.policyStates)
      ? data.policyStates
      : proactiveStudy.policyStates;
    if (data.policyState?.scopeKey) {
      policyStates = [
        data.policyState,
        ...policyStates.filter((item) => item.scopeKey !== data.policyState.scopeKey)
      ];
    }
    proactiveStudy = {
      ...proactiveStudy,
      ...data,
      loaded: true,
      managed: data.managed !== false && meta.chapterId === String(
        data.chapterId || proactiveStudy.chapterId || PROACTIVE_STUDY_CHAPTER_ID
      ),
      chapterId: String(
        data.chapterId || proactiveStudy.chapterId || PROACTIVE_STUDY_CHAPTER_ID
      ),
      candidateCollectionEnabled: Boolean(data.candidateCollectionEnabled),
      assignment: data.assignment || null,
      participation: data.participation
        && typeof data.participation === "object"
        ? { ...data.participation }
        : proactiveStudy.participation,
      studentPreference: ["standard", "reduced", "off"].includes(
        String(data.studentPreference || "")
      )
        ? String(data.studentPreference)
        : proactiveStudy.studentPreference || "standard",
      policyStates
    };
    syncProactiveCheckState(meta);
  }

  async function updateProactiveParticipation(action) {
    const meta = courseMeta();
    const participation = proactiveStudy.participation || {};
    const hadAssignment = Boolean(proactiveStudy.assignment);
    if (
      proactiveParticipationSaving
      || !["enroll", "withdraw"].includes(action)
      || !proactiveStudyManaged(meta)
      || !isSignedInNow()
    ) return false;
    if (action === "enroll" && !els.proactiveConsentCheckbox.checked) {
      setStatus("请先阅读并确认当前版本的研究说明。", "warning");
      els.proactiveConsentCheckbox.focus();
      return false;
    }
    proactiveParticipationSaving = true;
    renderUnit();
    try {
      const response = await fetch("api/learning/proactive/participation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          action,
          confirmed: action === "enroll",
          consentVersion: participation.consentVersion || "",
          reason: action === "withdraw" ? "student_withdrawal" : ""
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(
          payload.message || "研究参与状态暂时无法保存。"
        );
        error.code = payload.code || "";
        throw error;
      }
      applyProactiveStudy(payload.data || {}, meta);
      els.proactiveConsentCheckbox.checked = false;
      if (action === "withdraw") {
        proactiveWithdrawalConfirming = false;
        proactiveCoach?.reset?.();
        proactiveDecisionRequest?.abort();
        proactiveDecisionRequest = null;
        proactiveDecision = null;
        proactiveCandidateId = "";
        pendingProactivePrompt = null;
        pendingGeneratedDraft = "";
        resetProactiveOutcomes({ close: true, clearData: true });
        setStatus(
          "已退出本章研究；课程和普通知点提问仍可继续使用。",
          ""
        );
        if (quizAssistantLocked(meta)) {
          setOpen(false, { focus: false });
        }
      } else {
        setStatus("已记录参加意愿；完成章前测后固定实验分组。", "");
        await loadProactiveStudy(meta, { force: true });
      }
      track(
        action === "withdraw"
          ? "knowledge_proactive_participation_withdrawn"
          : "knowledge_proactive_participation_enrolled",
        {
          chapterId: meta.chapterId,
          consentVersion: participation.consentVersion || "",
          assignmentRetained: action === "withdraw"
            ? hadAssignment
            : undefined
        }
      );
      render();
      return true;
    } catch (error) {
      setStatus(
        error.message || "研究参与状态暂时无法保存。",
        "error"
      );
      return false;
    } finally {
      proactiveParticipationSaving = false;
      renderUnit();
    }
  }

  async function updateProactiveScopePreference(
    preference,
    meta = courseMeta()
  ) {
    const scopeKey = proactiveScopeKey(meta);
    const nextPreference = String(preference || "");
    if (
      proactiveChoiceSaving
      || !["standard", "off"].includes(nextPreference)
      || !scopeKey
      || !proactiveStudyManaged(meta)
      || !isSignedInNow()
    ) return false;

    proactiveChoiceSaving = true;
    render();
    try {
      const response = await fetch("api/learning/proactive/scope-preference", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          scopeKey,
          preference: nextPreference
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || "当前知识点提醒设置暂时无法保存。");
      }
      applyProactiveStudy(payload.data || {}, meta);
      if (nextPreference === "off") {
        proactiveCoach?.resolve?.("scope-muted", Date.now());
        proactiveDecisionRequest?.abort();
        proactiveDecisionRequest = null;
        proactiveDecision = null;
        proactiveCandidateId = "";
        if (
          pendingProactivePrompt?.unitId === meta.unitId
          || pendingProactivePrompt?.scopeKey === scopeKey
        ) {
          pendingProactivePrompt = null;
          pendingGeneratedDraft = "";
        }
      } else {
        syncProactiveUnit(meta, { force: true });
      }
      setStatus(
        nextPreference === "off"
          ? "当前知识点的主动提醒已关闭；你仍可随时主动提问。"
          : "当前知识点的主动提醒已恢复。",
        ""
      );
      track("knowledge_proactive_scope_preference_changed", {
        chapterId: meta.chapterId,
        scopeKey,
        previousPreference: payload.previousPreference || "",
        preference: nextPreference,
        closedInterventions: Number(payload.closedInterventions || 0)
      });
      render();
      return true;
    } catch (error) {
      setStatus(error.message || "当前知识点提醒设置暂时无法保存。", "error");
      return false;
    } finally {
      proactiveChoiceSaving = false;
      render();
    }
  }

  function outcomeUnlockLabel(value = "") {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(timestamp));
  }

  function proactiveOutcomesOwner(meta = courseMeta()) {
    return `${String(state?.participant?.participantId || "")}|${meta.chapterId}`;
  }

  function resetProactiveOutcomes({
    close = true,
    clearData = false
  } = {}) {
    if (close) proactiveOutcomesOpen = false;
    proactiveOutcomesLoading = false;
    proactiveOutcomesSubmitting = false;
    proactiveOutcomeDraftSaving = false;
    proactiveOutcomeDraftPending = 0;
    proactiveOutcomeDraftChain = Promise.resolve();
    proactiveOutcomeDraftGeneration += 1;
    proactiveOutcomeWithdrawing = false;
    proactiveOutcomeSkipConfirming = false;
    proactiveOutcomeStageId = "";
    proactiveOutcomeReviewStageId = "";
    proactiveOutcomeResponses = {};
    proactiveOutcomeStatus = "";
    if (clearData) {
      proactiveOutcomes = null;
      proactiveOutcomeOwnerKey = "";
    }
  }

  function activeProactiveOutcomeSession() {
    const session = proactiveOutcomes?.activeSession;
    return session?.status === "active" ? session : null;
  }

  function notifyProactiveOutcomesChanged() {
    global.dispatchEvent(new CustomEvent("cq:proactive-outcomes-change", {
      detail: {
        chapterId: courseMeta().chapterId,
        answerReviewReleased: proactiveOutcomes?.answerReviewReleased === true
      }
    }));
  }

  function applyActiveProactiveOutcomeSession({ open = true } = {}) {
    const session = activeProactiveOutcomeSession();
    if (!session) return false;
    proactiveOutcomeStageId = session.stageId || "";
    proactiveOutcomeResponses = session.responses
      && typeof session.responses === "object"
      && !Array.isArray(session.responses)
      ? { ...session.responses }
      : {};
    proactiveOutcomesOpen = open;
    if (proactiveDecision) {
      ignoreProactiveSuggestion("measurement-active");
    }
    proactiveDecisionRequest?.abort();
    proactiveDecisionRequest = null;
    proactiveDecision = null;
    proactiveCandidateId = "";
    proactiveCoach?.resolve?.("measurement-active", Date.now());
    if (isOpen) setOpen(false, { focus: false });
    return true;
  }

  async function loadProactiveOutcomes(options = {}) {
    const meta = courseMeta();
    const ownerKey = proactiveOutcomesOwner(meta);
    if (
      proactiveOutcomesLoading
      || !proactiveStudyManaged(meta)
      || !isSignedInNow()
    ) return proactiveOutcomes;
    if (
      proactiveOutcomes
      && proactiveOutcomeOwnerKey === ownerKey
      && options.force !== true
    ) return proactiveOutcomes;
    proactiveOutcomesLoading = true;
    proactiveOutcomeOwnerKey = ownerKey;
    proactiveOutcomeStatus = "";
    renderProactiveOutcomes();
    try {
      const response = await fetch(
        `api/learning/proactive/outcomes?chapterId=${encodeURIComponent(meta.chapterId)}`,
        {
          headers: { Authorization: `Bearer ${state.authToken}` }
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || "学习结果测量暂时无法读取。");
      }
      if (ownerKey !== proactiveOutcomesOwner()) return null;
      proactiveOutcomes = payload.data || null;
      const activeSession = activeProactiveOutcomeSession();
      if (activeSession) {
        proactiveOutcomeResponses = activeSession.responses
          && typeof activeSession.responses === "object"
          && !Array.isArray(activeSession.responses)
          ? { ...activeSession.responses }
          : {};
        if (activeSession.pausedAt) {
          proactiveOutcomeStageId = "";
        } else {
          applyActiveProactiveOutcomeSession({
            open: options.restoreActive !== false
          });
        }
      }
      notifyProactiveOutcomesChanged();
      return proactiveOutcomes;
    } catch (error) {
      if (ownerKey !== proactiveOutcomesOwner()) return null;
      proactiveOutcomes = null;
      proactiveOutcomeStatus = error.message || "学习结果测量暂时无法读取。";
      return null;
    } finally {
      if (ownerKey === proactiveOutcomesOwner()) {
        proactiveOutcomesLoading = false;
        renderProactiveOutcomes();
      }
    }
  }

  async function openProactiveOutcomes(options = {}) {
    const meta = courseMeta();
    if (
      !proactiveStudyManaged(meta)
      || !proactiveStudy.assignment
      || !isSignedInNow()
    ) return false;
    proactiveOutcomesOpen = true;
    proactiveOutcomeReviewStageId = String(options.reviewStageId || "");
    proactiveOutcomeOwnerKey = proactiveOutcomesOwner(meta);
    proactiveOutcomeStatus = "";
    if (proactiveDecision) {
      ignoreProactiveSuggestion("measurement-open");
    }
    proactiveDecisionRequest?.abort();
    proactiveDecisionRequest = null;
    proactiveDecision = null;
    proactiveCandidateId = "";
    proactiveCoach?.resolve?.("measurement-open", Date.now());
    setOpen(false, { focus: false });
    render();
    await loadProactiveOutcomes({ force: true, restoreActive: true });
    if (
      activeProactiveOutcomeSession()?.pausedAt
      && !proactiveOutcomeReviewStageId
      && options.resumePaused !== false
    ) {
      await resumeProactiveOutcomeStage();
    }
    if (
      proactiveOutcomeReviewStageId
      && !proactiveOutcomes?.stages?.some((stage) => (
        stage.id === proactiveOutcomeReviewStageId
        && stage.status === "submitted"
        && stage.review
      ))
    ) {
      proactiveOutcomeReviewStageId = "";
    }
    track("knowledge_proactive_outcomes_opened", {
      chapterId: meta.chapterId,
      activeSession: Boolean(activeProactiveOutcomeSession())
    });
    window.requestAnimationFrame(() => {
      els.outcomesDialog?.focus({ preventScroll: true });
    });
    return true;
  }

  async function closeProactiveOutcomes() {
    if (
      proactiveOutcomesSubmitting
      || proactiveOutcomeDraftSaving
      || proactiveOutcomeWithdrawing
    ) return false;
    if (activeProactiveOutcomeSession()) {
      return pauseProactiveOutcomeStage();
    }
    resetProactiveOutcomes({ close: true, clearData: false });
    render();
    els.proactiveOutcomesOpen?.focus({ preventScroll: true });
    return true;
  }

  async function updateProactiveOutcomePauseState(action = "pause") {
    const meta = courseMeta();
    const session = activeProactiveOutcomeSession();
    const nextAction = action === "resume" ? "resume" : "pause";
    if (
      !session
      || proactiveOutcomesSubmitting
      || proactiveOutcomeDraftSaving
      || proactiveOutcomeWithdrawing
    ) return false;
    if (nextAction === "pause" && session.pausedAt) {
      proactiveOutcomesOpen = false;
      proactiveOutcomeStageId = "";
      render();
      return true;
    }
    if (nextAction === "resume" && !session.pausedAt) {
      applyActiveProactiveOutcomeSession({ open: true });
      render();
      return true;
    }

    proactiveOutcomeWithdrawing = true;
    proactiveOutcomeSkipConfirming = false;
    proactiveOutcomeStatus = nextAction === "pause"
      ? "正在保存草稿并暂时离开。"
      : "正在恢复本阶段作答。";
    renderProactiveOutcomes();
    try {
      const response = await fetch(`api/learning/proactive/outcomes/${nextAction}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          sessionId: session.id
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || "暂离状态暂时无法保存。");
        error.code = payload.code || "";
        throw error;
      }
      proactiveOutcomes = payload.data || proactiveOutcomes;
      if (nextAction === "pause") {
        proactiveOutcomeStageId = "";
        proactiveOutcomesOpen = false;
        proactiveOutcomeStatus = "";
      } else {
        applyActiveProactiveOutcomeSession({ open: true });
      }
      track(`knowledge_proactive_outcome_${nextAction}d`, {
        stageId: session.stageId,
        sessionId: session.id,
        pauseCount: Number(payload.data?.activeSession?.pauseCount || session.pauseCount || 0)
      });
      await loadProactiveStudy(meta, { force: true });
      if (nextAction === "resume") {
        proactiveOutcomeStatus = "已恢复同一测量会话；暂停期间不计入作答时长。";
      }
      render();
      if (nextAction === "pause") {
        els.proactiveOutcomesOpen?.focus({ preventScroll: true });
      } else {
        window.requestAnimationFrame(() => {
          els.outcomesContent
            ?.querySelector(".knowledge-outcome-active input:not(:disabled)")
            ?.focus({ preventScroll: true });
        });
      }
      return true;
    } catch (error) {
      proactiveOutcomeStatus = error.message || "暂离状态暂时无法保存。";
      track("knowledge_proactive_outcome_failed", {
        stageId: session.stageId,
        sessionId: session.id,
        reason: error.code || error.message || `${nextAction}_failed`
      });
      return false;
    } finally {
      proactiveOutcomeWithdrawing = false;
      render();
    }
  }

  function pauseProactiveOutcomeStage() {
    return updateProactiveOutcomePauseState("pause");
  }

  function resumeProactiveOutcomeStage() {
    return updateProactiveOutcomePauseState("resume");
  }

  async function beginProactiveOutcomeStage(stageId = "") {
    const stage = proactiveOutcomes?.stages?.find(
      (entry) => entry.id === stageId
    );
    if (
      proactiveOutcomesSubmitting
      || stage?.status !== "available"
      || !Array.isArray(stage.items)
    ) return false;
    proactiveOutcomesSubmitting = true;
    proactiveOutcomeStatus = "正在创建独立测量会话。";
    renderProactiveOutcomes();
    try {
      const response = await fetch("api/learning/proactive/outcomes/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: courseMeta().chapterId,
          stageId: stage.id
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || "本阶段暂时无法开始。");
        error.code = payload.code || "";
        throw error;
      }
      proactiveOutcomes = payload.data || proactiveOutcomes;
      proactiveOutcomeReviewStageId = "";
      applyActiveProactiveOutcomeSession({ open: true });
      proactiveOutcomeStatus = payload.idempotent
        ? "已恢复此前开始的独立测量。"
        : "独立测量已开始；作答草稿会保存到服务端。";
      track("knowledge_proactive_outcome_started", {
        stageId: stage.id,
        sessionId: payload.sessionId || "",
        itemCount: stage.items.length,
        idempotent: payload.idempotent === true
      });
      return true;
    } catch (error) {
      proactiveOutcomeStatus = error.message || "本阶段暂时无法开始。";
      track("knowledge_proactive_outcome_failed", {
        stageId: stage.id,
        reason: error.code || error.message || "start_failed"
      });
      return false;
    } finally {
      proactiveOutcomesSubmitting = false;
      render();
      if (activeProactiveOutcomeSession()) {
        window.requestAnimationFrame(() => {
          els.outcomesContent
            ?.querySelector(".knowledge-outcome-active input:not(:disabled)")
            ?.focus({ preventScroll: true });
        });
      }
    }
  }

  async function saveProactiveOutcomeDraft() {
    const meta = courseMeta();
    const session = activeProactiveOutcomeSession();
    if (!session) return false;
    const draftOwnerKey = proactiveOutcomesOwner(meta);
    const draftGeneration = proactiveOutcomeDraftGeneration;
    const draftAuthToken = state.authToken;
    const responses = { ...proactiveOutcomeResponses };
    const ownsCurrentDraftQueue = () => (
      draftGeneration === proactiveOutcomeDraftGeneration
      && draftOwnerKey === proactiveOutcomesOwner()
    );
    proactiveOutcomeDraftPending += 1;
    proactiveOutcomeDraftSaving = true;
    renderProactiveOutcomes();
    const operation = proactiveOutcomeDraftChain.then(async () => {
      const response = await fetch("api/learning/proactive/outcomes/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${draftAuthToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          stageId: session.stageId,
          sessionId: session.id,
          responses
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || "作答草稿暂时无法保存。");
        error.code = payload.code || "";
        throw error;
      }
      return payload;
    });
    proactiveOutcomeDraftChain = operation.catch(() => null);
    try {
      await operation;
      if (ownsCurrentDraftQueue()) {
        proactiveOutcomeStatus = proactiveOutcomeDraftPending <= 1
          ? "作答草稿已保存。"
          : "正在保存后续作答。";
      }
      return true;
    } catch (error) {
      if (ownsCurrentDraftQueue()) {
        proactiveOutcomeStatus = error.message || "作答草稿暂时无法保存。";
        track("knowledge_proactive_outcome_failed", {
          stageId: session.stageId,
          sessionId: session.id,
          reason: error.code || error.message || "draft_failed"
        });
      }
      return false;
    } finally {
      if (ownsCurrentDraftQueue()) {
        proactiveOutcomeDraftPending = Math.max(
          0,
          proactiveOutcomeDraftPending - 1
        );
        proactiveOutcomeDraftSaving = proactiveOutcomeDraftPending > 0;
        renderProactiveOutcomes();
      }
    }
  }

  async function skipProactiveOutcomeStage() {
    const meta = courseMeta();
    const session = activeProactiveOutcomeSession();
    if (
      !session
      || proactiveOutcomesSubmitting
      || proactiveOutcomeDraftSaving
      || proactiveOutcomeWithdrawing
    ) return false;
    proactiveOutcomeWithdrawing = true;
    proactiveOutcomeStatus = "正在永久跳过本阶段并记录缺失原因。";
    renderProactiveOutcomes();
    try {
      const response = await fetch("api/learning/proactive/outcomes/skip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          sessionId: session.id,
          reason: "student_skip"
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || "本阶段暂时无法跳过。");
        error.code = payload.code || "";
        throw error;
      }
      proactiveOutcomes = payload.data || proactiveOutcomes;
      proactiveOutcomeStageId = "";
      proactiveOutcomeReviewStageId = "";
      proactiveOutcomeResponses = {};
      proactiveOutcomeSkipConfirming = false;
      track("knowledge_proactive_outcome_skipped", {
        stageId: session.stageId,
        sessionId: session.id,
        skipReason: payload.skipReason || "student_skip"
      });
      await loadProactiveStudy(meta, { force: true });
      proactiveOutcomeStatus = "本阶段已永久跳过；后续阶段会按原路径继续开放。";
      notifyProactiveOutcomesChanged();
      render();
      return true;
    } catch (error) {
      proactiveOutcomeStatus = error.message || "本阶段暂时无法跳过。";
      track("knowledge_proactive_outcome_failed", {
        stageId: session.stageId,
        sessionId: session.id,
        reason: error.code || error.message || "skip_failed"
      });
      return false;
    } finally {
      proactiveOutcomeWithdrawing = false;
      render();
    }
  }

  async function submitProactiveOutcomeStage() {
    const meta = courseMeta();
    const session = activeProactiveOutcomeSession();
    const stage = proactiveOutcomes?.stages?.find(
      (entry) => entry.id === proactiveOutcomeStageId
    );
    if (
      proactiveOutcomesSubmitting
      || !session
      || session.stageId !== stage?.id
      || stage?.status !== "active"
      || !Array.isArray(stage.items)
      || stage.items.some((item) => !proactiveOutcomeResponses[item.id])
    ) return false;
    proactiveOutcomesSubmitting = true;
    proactiveOutcomeStatus = "正在提交本阶段记录。";
    renderProactiveOutcomes();
    try {
      const response = await fetch("api/learning/proactive/outcomes/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          stageId: stage.id,
          sessionId: session.id,
          responses: proactiveOutcomeResponses
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || "本阶段暂时无法提交。");
        error.code = payload.code || "";
        throw error;
      }
      proactiveOutcomes = payload.data || proactiveOutcomes;
      proactiveOutcomeStageId = "";
      proactiveOutcomeResponses = {};
      proactiveOutcomeReviewStageId = stage.id;
      proactiveOutcomeStatus = proactiveOutcomes?.answerReviewReleased
        ? "全部独立测量已完成，现在可以回看对错、正确答案和总分。"
        : "本阶段已记录。你可以回看自己的作答；全部测量完成后统一开放对错和答案。";
      track("knowledge_proactive_outcome_submitted", {
        stageId: payload.stageId || stage.id,
        sessionId: payload.sessionId || session.id,
        attemptId: payload.attemptId || "",
        feedbackPolicy: payload.feedbackPolicy || ""
      });
      await loadProactiveStudy(meta, { force: true });
      notifyProactiveOutcomesChanged();
      renderProactiveOutcomes();
      return true;
    } catch (error) {
      proactiveOutcomeStatus = error.message || "本阶段暂时无法提交。";
      track("knowledge_proactive_outcome_failed", {
        stageId: stage.id,
        reason: error.code || error.message || "request_failed"
      });
      return false;
    } finally {
      proactiveOutcomesSubmitting = false;
      renderProactiveOutcomes();
    }
  }

  function proactiveOutcomeStageStatusLabel(stage = {}) {
    if (stage.status === "active") return "进行中";
    if (stage.status === "available") return "可开始";
    if (stage.status === "submitted") {
      return stage.review?.answersReleased ? "可看结果" : "可回看";
    }
    if (stage.status === "skipped") return "已跳过";
    if (stage.status === "expired") return "已超窗";
    if (stage.status === "withdrawn") return "已退出";
    return stage.unlockAt ? "等待开放" : "未开放";
  }

  async function openProactiveOutcomeStage(stageId = "") {
    const requestedStageId = String(stageId || "");
    const existing = proactiveOutcomes?.stages?.find(
      (stage) => stage.id === requestedStageId
    );
    await openProactiveOutcomes({
      reviewStageId: existing?.status === "submitted" ? requestedStageId : ""
    });
    const stage = proactiveOutcomes?.stages?.find(
      (entry) => entry.id === requestedStageId
    );
    if (stage?.status === "submitted" && stage.review) {
      proactiveOutcomeReviewStageId = stage.id;
      renderProactiveOutcomes();
    } else if (stage?.status === "active" && activeProactiveOutcomeSession()?.pausedAt) {
      await resumeProactiveOutcomeStage();
    }
    return Boolean(stage || proactiveOutcomesOpen);
  }

  function proactiveOutcomeNavigationAction(unit = null) {
    const current = unit || (typeof getUnit === "function" ? getUnit() : null);
    if (
      !current
      || !proactiveOutcomes?.managed
      || !proactiveStudy.assignment
    ) return null;
    const stages = Array.isArray(proactiveOutcomes.stages)
      ? proactiveOutcomes.stages
      : [];
    const submittedQuizIds = Array.isArray(state.submittedQuizzes)
      ? state.submittedQuizzes
      : [];
    const currentIsSubmittedPost = current.assessmentPhase === "post"
      && submittedQuizIds.includes(current.id);
    // Research tasks have their own path entry; never hijack a reviewed lesson's CTA.
    if (!currentIsSubmittedPost) return null;
    const path = state.agenticPath || {};
    if (path.pendingPlan || path.reviewQueue || path.reviewResume
      || path.activeDetour || path.oneStepExtension
      || path.deferredReviewPlan || path.deferredExtensionPlan) return null;
    const active = stages.find((stage) => stage.status === "active");
    if (active) {
      return {
        label: `继续「${active.label}」`,
        stageId: active.id,
        disabled: false
      };
    }
    const available = stages.find((stage) => stage.status === "available");
    if (available) {
      return {
        label: `开始「${available.label}」`,
        stageId: available.id,
        disabled: false
      };
    }
    if (proactiveOutcomes.answerReviewReleased === true) {
      return {
        label: "回看独立测量结果",
        stageId: stages[0]?.id || "",
        disabled: false
      };
    }
    if (stages.some((stage) => stage.status === "submitted")) {
      const nextStage = stages.find((stage) => stage.status === "locked") || null;
      return {
        label: nextStage?.label
          ? `查看「${nextStage.label}」开放时间`
          : "查看独立测量进度",
        stageId: nextStage?.id || "",
        disabled: false
      };
    }
    return null;
  }

  function renderProactiveOutcomePathStages(stages = []) {
    if (!els.proactiveOutcomePathStages) return;
    els.proactiveOutcomePathStages.replaceChildren();
    stages.forEach((stage, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `lesson-card lesson-step-card outcome-path-step is-${stage.status || "locked"}${stage.status === "active" ? " active" : ""}`;
      button.disabled = !["available", "active", "submitted"].includes(stage.status)
        || (stage.status === "submitted" && !stage.review);
      const step = document.createElement("span");
      step.className = "lesson-step-index";
      const chapter = typeof getChapter === "function" ? getChapter() : null;
      step.textContent = String((chapter?.units?.length || 0) + index + 1);
      const copy = document.createElement("span");
      copy.className = "lesson-card-body";
      const title = document.createElement("strong");
      title.textContent = stage.label || stage.id;
      const purpose = document.createElement("small");
      purpose.textContent = stage.purpose || "独立完成本阶段任务";
      copy.append(title, purpose);
      const status = document.createElement("em");
      status.className = "outcome-path-step-status";
      status.textContent = proactiveOutcomeStageStatusLabel(stage);
      button.append(step, copy, status);
      button.addEventListener("click", () => {
        openProactiveOutcomeStage(stage.id);
      });
      els.proactiveOutcomePathStages.appendChild(button);
    });
  }

  function proactiveOutcomeStageNode(stage) {
    const section = document.createElement("section");
    section.className = `knowledge-outcome-stage is-${stage.status || "locked"}`;
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = stage.label || stage.id;
    const purpose = document.createElement("p");
    purpose.textContent = stage.purpose || "";
    const stateLabel = document.createElement("small");
    stateLabel.textContent = stage.status === "submitted"
      ? "已提交"
      : stage.status === "skipped"
        ? "已永久跳过"
      : stage.status === "expired"
        ? "已超过作答窗口"
      : stage.status === "withdrawn"
        ? "已退出研究"
      : stage.status === "active"
        ? `${stage.itemCount || 0} 题，进行中`
      : stage.status === "available"
        ? `${stage.itemCount || 0} 题，可开始`
        : stage.unlockAt
          ? `${outcomeUnlockLabel(stage.unlockAt)} 后开放`
          : "尚未开放";
    copy.append(heading, purpose, stateLabel);
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = ({
      available: "开始",
      active: "继续作答",
      submitted: "回看作答",
      skipped: "已跳过",
      expired: "已超窗",
      withdrawn: "已退出"
    })[stage.status] || "未开放";
    action.disabled = !["available", "active", "submitted"].includes(stage.status)
      || (stage.status === "submitted" && !stage.review)
      || proactiveOutcomesSubmitting
      || proactiveOutcomeWithdrawing;
    if (stage.status === "available") {
      action.addEventListener("click", () => {
        beginProactiveOutcomeStage(stage.id);
      });
    } else if (stage.status === "active") {
      action.addEventListener("click", () => {
        if (activeProactiveOutcomeSession()?.pausedAt) {
          resumeProactiveOutcomeStage();
        } else {
          applyActiveProactiveOutcomeSession({ open: true });
          renderProactiveOutcomes();
        }
      });
    } else if (stage.status === "submitted") {
      action.addEventListener("click", () => {
        proactiveOutcomeReviewStageId = stage.id;
        renderProactiveOutcomes();
        track("knowledge_proactive_outcome_reviewed", {
          stageId: stage.id,
          answersReleased: stage.review?.answersReleased === true
        });
      });
    }
    section.append(copy, action);
    if (stage.reason) {
      const reason = document.createElement("p");
      reason.className = "knowledge-outcome-stage-reason";
      reason.textContent = stage.reason;
      section.appendChild(reason);
    }
    return section;
  }

  function proactiveOutcomeFigureNode(figure) {
    if (!figure || !/^resources\/assessment\/v14-c3-r3\/[^/\\]+-r3\.svg$/u.test(figure.src || "")) {
      return null;
    }
    const node = document.createElement("figure");
    node.className = "knowledge-outcome-figure";
    const image = document.createElement("img");
    image.src = figure.src;
    image.alt = String(figure.alt || "");
    image.width = 640;
    image.height = 300;
    image.loading = "lazy";
    node.appendChild(image);
    return node;
  }

  function proactiveOutcomeReviewNode(stage) {
    const review = stage?.review;
    const section = document.createElement("section");
    section.className = "knowledge-outcome-review";
    const heading = document.createElement("header");
    const copy = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = `${stage?.label || "独立测量"}作答回看`;
    const policy = document.createElement("small");
    policy.textContent = review?.unavailable
      ? review.reason
      : review?.answersReleased
      ? `已统一开放结果：${Number(review.score || 0)}/${Number(review.maxScore || 0)} 题正确。`
      : "当前只显示你的作答；完成全部独立测量后统一开放对错和正确答案。";
    copy.append(label, policy);
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "返回任务列表";
    back.addEventListener("click", () => {
      proactiveOutcomeReviewStageId = "";
      renderProactiveOutcomes();
    });
    heading.append(copy, back);
    section.appendChild(heading);

    (review?.items || []).forEach((item, index) => {
      const article = document.createElement("article");
      article.className = "knowledge-outcome-review-item";
      if (review.answersReleased) {
        article.classList.add(item.isCorrect ? "is-correct" : "is-incorrect");
      }
      const itemHeading = document.createElement("div");
      const number = document.createElement("span");
      number.textContent = `第 ${index + 1} 题`;
      const result = document.createElement("strong");
      result.textContent = review.answersReleased
        ? item.isCorrect ? "回答正确" : "需要复盘"
        : "作答已记录";
      itemHeading.append(number, result);
      const prompt = document.createElement("p");
      setQuestionMathContent(prompt, item.prompt || "");
      const options = document.createElement("div");
      options.className = "knowledge-outcome-review-options";
      (item.options || []).forEach((option) => {
        const row = document.createElement("div");
        row.className = "knowledge-outcome-review-option";
        const selected = option.value === item.response;
        const correct = review.answersReleased
          && option.value === item.correctOption;
        row.classList.toggle("is-selected", selected);
        row.classList.toggle("is-correct", correct);
        row.classList.toggle("is-wrong", selected && review.answersReleased && !correct);
        const marker = document.createElement("span");
        marker.textContent = option.value === "__unknown__" ? "?" : String(option.value || "").toUpperCase();
        const text = document.createElement("span");
        setQuestionMathContent(text, option.label || "");
        const note = document.createElement("small");
        note.textContent = correct
          ? selected ? "你的选择 · 正确答案" : "正确答案"
          : selected ? "你的选择" : "";
        row.append(marker, text, note);
        options.appendChild(row);
      });
      article.append(itemHeading, prompt);
      const figure = proactiveOutcomeFigureNode(item.figure);
      if (figure) article.appendChild(figure);
      article.appendChild(options);
      section.appendChild(article);
    });
    return section;
  }

  function activeProactiveOutcomeNode(stage) {
    const section = document.createElement("section");
    section.className = "knowledge-outcome-active";
    const heading = document.createElement("header");
    const copy = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = stage.label || "独立测量";
    const purpose = document.createElement("small");
    purpose.textContent = stage.purpose || "";
    copy.append(label, purpose);
    const actions = document.createElement("div");
    actions.className = "knowledge-outcome-active-actions";
    const pause = document.createElement("button");
    pause.type = "button";
    pause.textContent = proactiveOutcomeWithdrawing
      ? "正在保存"
      : "暂时离开";
    pause.disabled = proactiveOutcomesSubmitting
      || proactiveOutcomeDraftSaving
      || proactiveOutcomeWithdrawing;
    pause.addEventListener("click", pauseProactiveOutcomeStage);
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "knowledge-outcome-skip";
    skip.textContent = "永久跳过";
    skip.disabled = proactiveOutcomesSubmitting
      || proactiveOutcomeDraftSaving
      || proactiveOutcomeWithdrawing;
    skip.addEventListener("click", () => {
      proactiveOutcomeSkipConfirming = true;
      proactiveOutcomeStatus = "永久跳过后，本阶段不能重新作答；后续阶段仍可继续。";
      renderProactiveOutcomes();
    });
    actions.append(pause, skip);
    heading.append(copy, actions);
    section.appendChild(heading);

    if (proactiveOutcomeSkipConfirming) {
      const confirmation = document.createElement("div");
      confirmation.className = "knowledge-outcome-skip-confirm";
      const message = document.createElement("p");
      message.textContent = "确认永久跳过本阶段吗？当前草稿会作为未完成记录保留，本阶段不能再次进入。";
      const controls = document.createElement("div");
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "继续作答";
      cancel.addEventListener("click", () => {
        proactiveOutcomeSkipConfirming = false;
        proactiveOutcomeStatus = "";
        renderProactiveOutcomes();
      });
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.textContent = "确认永久跳过";
      confirm.addEventListener("click", skipProactiveOutcomeStage);
      controls.append(cancel, confirm);
      confirmation.append(message, controls);
      section.appendChild(confirmation);
    }

    stage.items.forEach((item, index) => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      setQuestionMathContent(legend, `${index + 1}. ${item.prompt || ""}`);
      fieldset.appendChild(legend);
      const figure = proactiveOutcomeFigureNode(item.figure);
      if (figure) fieldset.appendChild(figure);
      item.options.forEach((option) => {
        const labelNode = document.createElement("label");
        labelNode.classList.toggle("unknown-choice-option", option.value === "__unknown__");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `outcome-${stage.id}-${item.id}`;
        input.value = option.value;
        input.checked = proactiveOutcomeResponses[item.id] === option.value;
        input.disabled = proactiveOutcomesSubmitting
          || proactiveOutcomeWithdrawing
          || proactiveOutcomeSkipConfirming;
        input.addEventListener("change", () => {
          proactiveOutcomeResponses = {
            ...proactiveOutcomeResponses,
            [item.id]: option.value
          };
          proactiveOutcomeStatus = "正在保存作答草稿。";
          renderProactiveOutcomes();
          saveProactiveOutcomeDraft();
        });
        const text = document.createElement("span");
        setQuestionMathContent(text, option.value === "__unknown__" ? "我不会" : `${option.value}. ${option.label || ""}`);
        labelNode.append(input, text);
        fieldset.appendChild(labelNode);
      });
      section.appendChild(fieldset);
    });

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "knowledge-outcome-submit";
    submit.textContent = proactiveOutcomesSubmitting
      ? "正在提交"
      : proactiveOutcomeDraftSaving
        ? "正在保存"
        : "提交本阶段";
    submit.disabled = proactiveOutcomesSubmitting
      || proactiveOutcomeDraftSaving
      || proactiveOutcomeWithdrawing
      || proactiveOutcomeSkipConfirming
      || stage.items.some((item) => !proactiveOutcomeResponses[item.id]);
    submit.addEventListener("click", submitProactiveOutcomeStage);
    section.appendChild(submit);
    return section;
  }

  function renderProactiveOutcomes() {
    if (!els.outcomes) return;
    root.classList.toggle("has-outcomes-layer", proactiveOutcomesOpen);
    document.body?.classList.toggle(
      "knowledge-outcomes-open",
      proactiveOutcomesOpen
    );
    els.outcomes.hidden = !proactiveOutcomesOpen;
    if (!proactiveOutcomesOpen) return;
    const retentionOnly = Array.isArray(proactiveOutcomes?.stages)
      && proactiveOutcomes.stages.length === 1 && proactiveOutcomes.stages[0].id === "retention";
    els.outcomes.querySelector("#knowledge-outcomes-title").textContent = retentionOnly
      ? "保持测量" : "迁移与保持任务";
    els.outcomes.querySelector("[data-outcome-policy]").textContent = retentionOnly
      ? "作答期间暂停学习助手和路径建议。提交后可以回看作答和结果。"
      : "开始后会暂停学习助手和路径建议。提交后可回看自己的作答；全部阶段完成后统一显示对错、答案和总分。";
    els.outcomesClose.disabled = proactiveOutcomesSubmitting
      || proactiveOutcomeDraftSaving
      || proactiveOutcomeWithdrawing;
    els.outcomesClose.title = activeProactiveOutcomeSession()
      ? "保存草稿并暂时离开"
      : "关闭学习结果记录";
    els.outcomesStatus.textContent = proactiveOutcomeStatus;
    els.outcomesContent.replaceChildren();
    if (proactiveOutcomesLoading) {
      const loading = document.createElement("p");
      loading.className = "knowledge-outcomes-loading";
      loading.textContent = "正在读取测量阶段。";
      els.outcomesContent.appendChild(loading);
      return;
    }
    if (!proactiveOutcomes?.managed) {
      const unavailable = document.createElement("p");
      unavailable.className = "knowledge-outcomes-loading";
      unavailable.textContent = proactiveOutcomeStatus || "当前章节没有学习结果测量。";
      els.outcomesContent.appendChild(unavailable);
      return;
    }
    const activeStage = proactiveOutcomes.stages?.find(
      (stage) => (
        stage.id === proactiveOutcomeStageId
        && stage.status === "active"
        && Array.isArray(stage.items)
      )
    );
    if (activeStage) {
      els.outcomesContent.appendChild(
        activeProactiveOutcomeNode(activeStage)
      );
      return;
    }
    const reviewStage = proactiveOutcomes.stages?.find(
      (stage) => (
        stage.id === proactiveOutcomeReviewStageId
        && stage.status === "submitted"
        && stage.review
      )
    );
    if (reviewStage) {
      els.outcomesContent.appendChild(proactiveOutcomeReviewNode(reviewStage));
      return;
    }
    proactiveOutcomeReviewStageId = "";
    (proactiveOutcomes.stages || []).forEach((stage) => {
      els.outcomesContent.appendChild(proactiveOutcomeStageNode(stage));
    });
    if (!els.outcomesContent.childElementCount) {
      const unavailable = document.createElement("p");
      unavailable.className = "knowledge-outcomes-loading";
      unavailable.textContent = "当前没有可显示的测量阶段。";
      els.outcomesContent.appendChild(unavailable);
    }
  }

  function clearProactivePresentation() {
    proactiveDecisionRequest?.abort();
    proactiveDecisionRequest = null;
    proactiveDecision = null;
    proactiveCandidateId = "";
    render();
  }

  async function loadProactiveStudy(meta = courseMeta(), options = {}) {
    const participantId = isSignedInNow()
      ? String(state?.participant?.participantId || "")
      : "";
    const key = `${participantId}|${meta.chapterId}`;
    if (!participantId || !meta.chapterId) {
      proactiveStudyRequestId += 1;
      proactiveStudyKey = "";
      proactiveStudy = {
        ...proactiveStudy,
        loaded: false,
        managed: false,
        candidateCollectionEnabled: false,
        assignment: null,
        participation: {
          mode: "implicit-pilot",
          status: "not_enrolled",
          enrolled: false,
          withdrawn: false
        },
        studentPreference: "standard",
        policyStates: []
      };
      clearProactivePresentation();
      return proactiveStudy;
    }
    if (options.force !== true && proactiveStudyKey === key && proactiveStudy.loaded) {
      return proactiveStudy;
    }

    const requestId = ++proactiveStudyRequestId;
    try {
      const response = await fetch(
        `api/learning/proactive/state?chapterId=${encodeURIComponent(meta.chapterId)}`,
        {
          headers: { Authorization: `Bearer ${state.authToken}` }
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || "主动学习状态暂时不可用。");
      }
      if (requestId !== proactiveStudyRequestId || key !== `${String(
        state?.participant?.participantId || ""
      )}|${courseMeta().chapterId}`) {
        return proactiveStudy;
      }
      proactiveStudyKey = key;
      applyProactiveStudy(payload.data || {}, meta);
      if (proactiveStudy.assignment && proactiveStudyManaged(meta)) {
        await loadProactiveOutcomes({
          force: options.force === true,
          restoreActive: true
        });
      } else {
        resetProactiveOutcomes({ close: true, clearData: true });
      }
      renderUnit();
      if (!proactiveCollectionEnabled(meta)) {
        proactiveCoach?.reset?.();
        clearProactivePresentation();
      } else {
        // A status refresh after submission must not erase its pending outcome.
        syncProactiveUnit(courseMeta());
        considerProactiveSuggestion();
      }
      return proactiveStudy;
    } catch (error) {
      if (requestId !== proactiveStudyRequestId) return proactiveStudy;
      proactiveStudyKey = key;
      proactiveStudy = {
        ...proactiveStudy,
        loaded: false,
        managed: meta.chapterId === PROACTIVE_STUDY_CHAPTER_ID,
        candidateCollectionEnabled: false,
        assignment: null,
        participation: {
          mode: "implicit-pilot",
          status: "not_enrolled",
          enrolled: false,
          withdrawn: false
        },
        studentPreference: "standard",
        policyStates: []
      };
      clearProactivePresentation();
      track("knowledge_proactive_state_unavailable", {
        chapterId: meta.chapterId,
        reason: error.message || "request_failed"
      });
      return proactiveStudy;
    }
  }

  function serverAuthorizedProactiveDecision(payload = {}, meta = courseMeta()) {
    const study = payload.study || {};
    return Boolean(
      proactiveStudyManaged(meta)
      && payload.decisionId
      && payload.interventionId
      && study.mode === "active"
      && study.deliveryDecision === "intervene"
    );
  }

  function queueProactiveResolution(suggestion, resolution) {
    const decisionId = String(suggestion?.decisionId || "");
    if (
      !decisionId
      || !["shown", "accepted", "dismissed", "ignored", "snoozed"].includes(resolution)
    ) {
      return Promise.resolve(null);
    }
    const participantId = String(state?.participant?.participantId || "");
    const token = String(state?.authToken || "");
    proactiveResolutionChain = proactiveResolutionChain
      .then(async () => {
        if (
          !token
          || participantId !== String(state?.participant?.participantId || "")
        ) return null;
        const response = await fetch(
          `api/learning/proactive/${encodeURIComponent(decisionId)}/resolution`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ resolution }),
            keepalive: resolution === "ignored"
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          const error = new Error(payload.message || "主动建议状态同步失败。");
          error.code = payload.code || "";
          throw error;
        }
        if (payload.data?.policyState) {
          const next = payload.data.policyState;
          proactiveStudy.policyStates = [
            next,
            ...proactiveStudy.policyStates.filter((item) => item.scopeKey !== next.scopeKey)
          ];
        }
        return payload.data || null;
      })
      .catch((error) => {
        track("knowledge_proactive_resolution_failed", {
          decisionId,
          interventionId: suggestion?.interventionId || "",
          resolution,
          reason: error.code || error.message || "request_failed"
        });
        return null;
      });
    return proactiveResolutionChain;
  }

  function persistLauncherPlacement() {
    try {
      localStorage.setItem(LAUNCHER_STORAGE_KEY, JSON.stringify(launcherPlacement));
    } catch {}
  }

  function persistPanelPosition() {
    try {
      if (panelPosition) {
        localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelPosition));
      } else {
        localStorage.removeItem(PANEL_STORAGE_KEY);
      }
    } catch {}
  }

  function applyLauncherPlacement() {
    launcherPlacement = Core.normalizeLauncherPlacement(launcherPlacement);
    const viewportHeight = Math.max(window.innerHeight || 0, 320);
    const minTop = 70;
    const maxTop = Math.max(minTop, viewportHeight - 70);
    const top = Math.min(maxTop, Math.max(minTop, launcherPlacement.topRatio * viewportHeight));
    root.style.setProperty("--knowledge-launcher-top", `${Math.round(top)}px`);
    root.classList.toggle("is-launcher-left", launcherPlacement.side === "left");
    renderLauncherAvailability();
  }

  function panelIsDesktop() {
    return global.innerWidth > 760;
  }

  function defaultPanelPosition() {
    const width = els.panel.offsetWidth || 408;
    return {
      left: Math.max(12, (global.innerWidth || width + 24) - width - 14),
      top: 76
    };
  }

  function clampPanelPosition(value = {}) {
    const fallback = defaultPanelPosition();
    const width = els.panel.offsetWidth || 408;
    const height = els.panel.offsetHeight || Math.min(720, Math.max(480, global.innerHeight - 104));
    const margin = 12;
    const minTop = 70;
    const maxLeft = Math.max(margin, global.innerWidth - width - margin);
    const maxTop = Math.max(minTop, global.innerHeight - height - margin);
    const left = Number(value.left);
    const top = Number(value.top);
    return {
      left: Math.round(Math.min(maxLeft, Math.max(margin, Number.isFinite(left) ? left : fallback.left))),
      top: Math.round(Math.min(maxTop, Math.max(minTop, Number.isFinite(top) ? top : fallback.top)))
    };
  }

  function applyPanelPosition() {
    if (!panelIsDesktop() || root.closest(".workspace-chat-pane")) {
      els.panel.style.removeProperty("left");
      els.panel.style.removeProperty("top");
      els.panel.style.removeProperty("right");
      els.panel.style.removeProperty("bottom");
      return;
    }
    const appliedPosition = clampPanelPosition(panelPosition || defaultPanelPosition());
    if (panelPosition) panelPosition = appliedPosition;
    els.panel.style.left = `${appliedPosition.left}px`;
    els.panel.style.top = `${appliedPosition.top}px`;
    els.panel.style.right = "auto";
    els.panel.style.bottom = "auto";
  }

  function setupPanelDrag() {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let moved = false;

    els.panelDragbar.addEventListener("pointerdown", (event) => {
      if (!panelIsDesktop() || (event.pointerType === "mouse" && event.button !== 0)) return;
      const rect = els.panel.getBoundingClientRect();
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      moved = false;
      root.classList.add("is-panel-dragging");
      els.panelDragbar.setPointerCapture?.(pointerId);
      event.preventDefault();
    });
    els.panelDragbar.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (!moved && Math.hypot(deltaX, deltaY) < 3) return;
      moved = true;
      panelPosition = clampPanelPosition({
        left: originLeft + deltaX,
        top: originTop + deltaY
      });
      applyPanelPosition();
      event.preventDefault();
    });
    const finish = (event) => {
      if (pointerId !== event.pointerId) return;
      if (moved) {
        persistPanelPosition();
        track("knowledge_panel_moved", panelPosition || {});
      }
      root.classList.remove("is-panel-dragging");
      try {
        els.panelDragbar.releasePointerCapture?.(pointerId);
      } catch {}
      pointerId = null;
      moved = false;
    };
    els.panelDragbar.addEventListener("pointerup", finish);
    els.panelDragbar.addEventListener("pointercancel", finish);
    els.panelDragbar.addEventListener("dblclick", () => {
      panelPosition = null;
      applyPanelPosition();
      persistPanelPosition();
      track("knowledge_panel_position_reset");
    });
    els.panelDragbar.addEventListener("keydown", (event) => {
      if (!panelIsDesktop() || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const step = event.shiftKey ? 64 : 24;
      const delta = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step]
      }[event.key];
      const origin = panelPosition || defaultPanelPosition();
      panelPosition = clampPanelPosition({
        left: origin.left + delta[0],
        top: origin.top + delta[1]
      });
      applyPanelPosition();
      persistPanelPosition();
      event.preventDefault();
    });
  }

  function setupLauncherDrag() {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragged = false;

    els.launcher.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dragged = false;
      els.launcher.setPointerCapture?.(pointerId);
    });
    els.launcher.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (!dragged && distance < 6) return;
      dragged = true;
      event.preventDefault();
      root.classList.add("is-launcher-dragging");
      launcherPlacement = Core.normalizeLauncherPlacement({
        ...launcherPlacement,
        side: event.clientX < window.innerWidth / 2 ? "left" : "right",
        topRatio: event.clientY / Math.max(window.innerHeight, 1)
      });
      applyLauncherPlacement();
    });
    const finish = (event) => {
      if (pointerId !== event.pointerId) return;
      if (dragged) {
        suppressLauncherClickUntil = performance.now() + 360;
        persistLauncherPlacement();
        track("knowledge_launcher_moved", {
          side: launcherPlacement.side,
          topRatio: launcherPlacement.topRatio
        });
      }
      root.classList.remove("is-launcher-dragging");
      try {
        els.launcher.releasePointerCapture?.(pointerId);
      } catch {}
      pointerId = null;
      dragged = false;
    };
    els.launcher.addEventListener("pointerup", finish);
    els.launcher.addEventListener("pointercancel", finish);
  }

  function currentSceneLabel(meta = courseMeta()) {
    return Core.friendlySceneLabel({
      resourceTitle: meta.resourceTitle,
      unitLabel: meta.unitLabel,
      sceneType: meta.sceneType
    });
  }

  function interactionSceneCopy(meta = courseMeta()) {
    const unit = meta.knowledgePointLabel || meta.unitLabel || "当前知识点";
    const scene = currentSceneLabel(meta);
    if (!scene || scene === "当前课件" || scene === unit) return `在「${unit}」中`;
    return `在「${unit}」的${scene}场景中`;
  }

  function setStatus(message = "", tone = "") {
    els.status.textContent = message || "回答会参考当前知识点与已聚焦的课件内容。";
    els.status.dataset.tone = tone;
  }

  function composerFocusTarget() {
    const hasPrecisePointer = global.innerWidth > 760
      && global.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;
    return hasPrecisePointer ? els.input : els.panel;
  }

  function notePendingOperations(ownerKey = noteOwnerKey()) {
    try {
      const parsed = JSON.parse(localStorage.getItem(`${NOTE_PENDING_STORAGE_PREFIX}${ownerKey}`) || "{}");
      return {
        upsertIds: Array.from(new Set(Array.isArray(parsed.upsertIds) ? parsed.upsertIds : []))
          .map((id) => String(id || "").slice(0, 180))
          .filter(Boolean),
        deletedIds: Array.from(new Set(Array.isArray(parsed.deletedIds) ? parsed.deletedIds : []))
          .map((id) => String(id || "").slice(0, 180))
          .filter(Boolean)
      };
    } catch {
      return { upsertIds: [], deletedIds: [] };
    }
  }

  function saveNotePendingOperations(operations, ownerKey = noteOwnerKey()) {
    const key = `${NOTE_PENDING_STORAGE_PREFIX}${ownerKey}`;
    if (!operations.upsertIds.length && !operations.deletedIds.length) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(operations));
  }

  function markNotePending(noteId, action, ownerKey = noteOwnerKey()) {
    const operations = notePendingOperations(ownerKey);
    const id = String(noteId || "");
    operations.upsertIds = operations.upsertIds.filter((item) => item !== id);
    operations.deletedIds = operations.deletedIds.filter((item) => item !== id);
    if (action === "delete") operations.deletedIds.push(id);
    else operations.upsertIds.push(id);
    saveNotePendingOperations(operations, ownerKey);
  }

  function clearNotePending(noteId, ownerKey = noteOwnerKey()) {
    const operations = notePendingOperations(ownerKey);
    operations.upsertIds = operations.upsertIds.filter((item) => item !== noteId);
    operations.deletedIds = operations.deletedIds.filter((item) => item !== noteId);
    saveNotePendingOperations(operations, ownerKey);
  }

  function syncProactiveUnit(meta = courseMeta(), options = {}) {
    if (!proactiveCoach || !meta.unitId || !proactiveCollectionEnabled(meta)) return;
    const current = proactiveCoach.getCurrentUnit();
    if (current?.unitId === meta.unitId && options.force !== true) return;
    proactiveCoach.consume({
      eventType: "unit_enter",
      unitId: meta.unitId,
      unitLabel: meta.knowledgePointLabel || meta.unitLabel,
      unitType: meta.unitType,
      sceneType: meta.sceneType,
      data: {}
    }, Date.now());
  }

  function learningViewActive() {
    const activeView = document.querySelector(".view.active");
    return !activeView || activeView.id === "learn-view";
  }

  function syncFullscreenHost() {
    const fullscreenHost = document.fullscreenElement;
    if (fullscreenHost) {
      if (!fullscreenHost.contains(root) && !root.contains(fullscreenHost)) {
        fullscreenHost.appendChild(root);
      }
      root.classList.add("is-fullscreen-hosted");
      applyPanelPosition();
      return;
    }

    root.classList.remove("is-fullscreen-hosted");
    if (!fullscreenHomeParent?.isConnected) return;
    const restoreBefore = fullscreenHomeNextSibling?.parentNode === fullscreenHomeParent
      ? fullscreenHomeNextSibling
      : null;
    if (root.parentNode !== fullscreenHomeParent) {
      fullscreenHomeParent.insertBefore(root, restoreBefore);
    }
    applyPanelPosition();
  }

  function proactiveSuggestionVisible(suggestion, meta = courseMeta()) {
    return Boolean(
      suggestion
      && suggestion.unitId === meta.unitId
      && meta.supported
      && isSignedInNow()
      && !quizAssistantLocked(meta)
      && !isOpen
      && !root.closest("[hidden]")
      && !root.closest(".workspace-chat-pane.is-tool-inactive")
      && !root.closest(".core-learning-workspace.tools-collapsed")
      && (!root.closest(".core-learning-workspace") || global.innerWidth > 900
        || root.closest(".core-learning-workspace").dataset.workspacePane === "assistant")
      && !document.hidden
      && learningViewActive()
      && (
        !proactiveStudyManaged(meta)
        || suggestion.serverIssued === true
      )
    );
  }

  function markProactiveSuggestionShown(suggestion) {
    if (!suggestion) return;
    const presentationId = suggestion.decisionId || suggestion.id;
    if (!presentationId || lastPresentedSuggestionId === presentationId) return;
    lastPresentedSuggestionId = presentationId;
    if (suggestion.serverIssued) {
      queueProactiveResolution(suggestion, "shown");
    }
    track("knowledge_proactive_suggestion_shown", {
      suggestionId: suggestion.id,
      decisionId: suggestion.decisionId || "",
      interventionId: suggestion.interventionId || "",
      suggestionKind: suggestion.kind,
      action: suggestion.action || "",
      why: suggestion.why || "",
      confidence: suggestion.confidence,
      unitId: suggestion.unitId,
      createdAt: suggestion.createdAt || "",
      shownAt: new Date().toISOString()
    });
  }

  function renderProactiveSuggestion() {
    const suggestion = proactiveDecision;
    const visible = proactiveSuggestionVisible(suggestion);
    els.proactive.hidden = !visible;
    root.classList.toggle("has-proactive-nudge", visible);
    global.dispatchEvent(new CustomEvent("cq:workspace-support-change"));
    if (!visible) return;
    els.proactiveEyebrow.textContent = suggestion.eyebrow || "知点留意到";
    els.proactiveTitle.textContent = suggestion.title || "这里可能值得停一下";
    els.proactiveBody.textContent = suggestion.body || "先找一个观察点，再决定是否展开解释。";
    els.proactiveAccept.textContent = suggestion.actionLabel || "带我看看";
    const options = suggestion.learnerOptions || {};
    els.proactiveAlternative.hidden = options.canRequestAlternative !== true;
    els.proactiveMute.hidden = options.canMuteScope !== true;
    [
      els.proactiveAccept,
      els.proactiveSnooze,
      els.proactiveAlternative,
      els.proactiveMute
    ].forEach((button) => {
      button.disabled = proactiveChoiceSaving;
    });
    markProactiveSuggestionShown(suggestion);
  }

  function proactiveSceneForScope(scopeKey = "", fallback = "") {
    const unit = typeof getUnit === "function" ? getUnit(scopeKey) : null;
    if (!unit || unit.type !== "knowledge") return String(fallback || "");
    return typeof selectedKnowledgeSceneType === "function"
      ? selectedKnowledgeSceneType(unit) || String(fallback || "")
      : state?.selectedKnowledgeScenes?.[scopeKey] || String(fallback || "");
  }

  async function requestProactiveAlternative() {
    const source = proactiveDecision;
    const meta = courseMeta();
    const targetUnitId = proactiveScopeKey(meta);
    if (
      proactiveChoiceSaving
      || !source?.serverIssued
      || !source.decisionId
      || source.learnerOptions?.canRequestAlternative !== true
      || !targetUnitId
    ) return false;

    proactiveChoiceSaving = true;
    render();
    try {
      await queueProactiveResolution(source, "shown");
      const currentSceneType = proactiveSceneForScope(
        targetUnitId,
        meta.sceneType
      );
      const response = await fetch("api/learning/assistant/intervention", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          unitId: targetUnitId,
          sceneType: currentSceneType,
          signal: {
            kind: "student_requested_alternative",
            sourceDecisionId: source.decisionId
          },
          contextRef: {
            kind: "unit",
            scope: "lesson",
            chapterId: meta.chapterId,
            unitId: targetUnitId,
            knowledgePointId: targetUnitId
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || "暂时没有可用的替代帮助。");
        error.code = payload.code || "";
        throw error;
      }
      if (payload.study) {
        applyProactiveStudy({
          ...payload.study,
          managed: true,
          candidateCollectionEnabled: payload.study.mode !== "off"
        }, meta);
      }
      const decision = payload.decision || {};
      proactiveCoach?.resolve?.("alternative-requested", Date.now());
      if (
        !decision.intervene
        || decision.action !== "switch_representation"
        || !serverAuthorizedProactiveDecision(payload, meta)
      ) {
        proactiveDecision = null;
        proactiveCandidateId = "";
        setStatus("这次没有可用的替代表征，你仍可继续当前学习或主动提问。", "");
        render();
        return true;
      }
      proactiveDecision = {
        ...decision,
        id: `alternative:${payload.decisionId}`,
        decisionId: payload.decisionId || "",
        kind: "student_requested_alternative",
        unitId: meta.unitId,
        targetUnitId: decision.targetUnitId || targetUnitId,
        createdAt: new Date().toISOString(),
        interventionId: payload.interventionId || "",
        serverIssued: true
      };
      proactiveCandidateId = proactiveDecision.id;
      track("knowledge_proactive_alternative_offered", {
        sourceDecisionId: source.decisionId,
        decisionId: payload.decisionId || "",
        interventionId: payload.interventionId || "",
        targetUnitId: proactiveDecision.targetUnitId,
        targetSceneType: proactiveDecision.targetSceneType || ""
      });
      render();
      return true;
    } catch (error) {
      proactiveDecision = null;
      proactiveCandidateId = "";
      await loadProactiveStudy(meta, { force: true });
      setStatus(error.message || "暂时没有可用的替代帮助。", "warning");
      track("knowledge_proactive_alternative_failed", {
        sourceDecisionId: source.decisionId,
        reason: error.code || error.message || "request_failed"
      });
      render();
      return false;
    } finally {
      proactiveChoiceSaving = false;
      render();
    }
  }

  function snoozeProactiveSuggestion() {
    const presented = proactiveDecision;
    const resolution = proactiveCoach?.resolve?.("snooze", Date.now()) || {};
    if (!presented && !resolution.id) return false;
    if (presented?.serverIssued) {
      queueProactiveResolution(presented, "snoozed");
    }
    proactiveDecisionRequest?.abort();
    proactiveDecisionRequest = null;
    proactiveDecision = null;
    proactiveCandidateId = "";
    render();
    setStatus("知点会先保持安静，稍后再根据新的学习证据判断。", "");
    track("knowledge_proactive_suggestion_snoozed", {
      suggestionId: presented?.id || resolution.id || "",
      decisionId: presented?.decisionId || "",
      interventionId: presented?.interventionId || "",
      suggestionKind: presented?.kind || resolution.kind || "",
      unitId: presented?.unitId || resolution.unitId || "",
      cooldownUntil: resolution.cooldownUntil || 0
    });
    return true;
  }

  function executeProactiveAction(suggestion) {
    const meta = courseMeta();
    const allowedActions = [
      "observe_change",
      "review_mistake",
      "self_explain",
      "ask_clarification",
      "elicit_self_explanation",
      "concept_hint",
      "decompose_subgoal",
      "next_step_hint",
      "partial_worked_example",
      "switch_representation"
    ];
    const studentReplyActions = new Set([
      "ask_clarification",
      "review_mistake",
      "elicit_self_explanation",
      "concept_hint",
      "decompose_subgoal",
      "next_step_hint",
      "partial_worked_example"
    ]);
    if (suggestion?.action === "switch_representation") {
      if (!meta.supported || quizAssistantLocked(meta)) return false;
      const targetUnitId = String(suggestion.targetUnitId || proactiveScopeKey(meta));
      const targetSceneType = String(suggestion.targetSceneType || "");
      const targetUnit = typeof getUnit === "function"
        ? getUnit(targetUnitId)
        : null;
      const legalScene = targetUnit?.type === "knowledge"
        && targetUnit.chapterId === meta.chapterId
        && typeof knowledgeInteractionTypes === "function"
        && knowledgeInteractionTypes(targetUnit).some(
          (type) => type.id === targetSceneType
        );
      if (!legalScene || typeof setKnowledgeSceneType !== "function") return false;
      if (typeof agenticUnitCompletionAllowed === "function"
        && !agenticUnitCompletionAllowed(targetUnitId)) return false;
      if (typeof agenticGuardNavigation === "function"
        && !agenticGuardNavigation(targetUnitId, { allowPrevious: true, silent: true })) return false;
      if (targetUnitId !== currentUnitId
        && (typeof selectUnit !== "function" || !selectUnit(targetUnitId))) return false;
      const changed = setKnowledgeSceneType(targetUnitId, targetSceneType);
      if (!changed && typeof selectedKnowledgeSceneType === "function"
        && selectedKnowledgeSceneType(targetUnit) !== targetSceneType) return false;
      if (typeof renderAll === "function") renderAll();
      global.LearningWorkspace?.showInteractive?.();
      setStatus(
        `已切换到${suggestion.targetSceneLabel || "另一种表征"}；路径仍由你决定。`,
        ""
      );
      return true;
    }
    const expectsStudentReply = studentReplyActions.has(suggestion?.action);
    const preparedCopy = expectsStudentReply
      ? String(suggestion?.assistantPrompt || "").trim()
      : String(suggestion?.draftQuestion || "").trim();
    if (
      !preparedCopy
      || !allowedActions.includes(suggestion.action)
      || !meta.supported
      || quizAssistantLocked(meta)
    ) return false;
    if (suggestion.action === "observe_change" && suggestion.contextMode === "recent_interaction") {
      const ref = CoursewareContext.captureRecentInteraction?.();
      if (ref?.unitId === meta.unitId) {
        activeContext = Core.normalizeContextRef(ref, meta);
        CoursewareContext.restoreContext(activeContext);
      }
    }
    activeWorkspace = "chat";
    if (expectsStudentReply) {
      pendingAssistantIntent = "";
      pendingGeneratedDraft = "";
      pendingProactivePrompt = {
        id: suggestion.id || `proactive-${Date.now()}`,
        content: preparedCopy,
        action: suggestion.action,
        unitId: meta.unitId,
        sceneType: meta.sceneType,
        interventionId: suggestion.interventionId || "",
        contextSummary: suggestion.contextSummary || "",
        replyOptions: Array.isArray(suggestion.replyOptions)
          ? suggestion.replyOptions.slice(0, 4)
          : []
      };
      els.input.value = "";
      setStatus(
        suggestion.action === "review_mistake"
          ? "先回答上面的诊断问题；可点选一个起点，也可以自己写。"
          : "先回答上面的问题即可；是否发送仍由你决定。",
        ""
      );
    } else {
      pendingProactivePrompt = null;
      pendingAssistantIntent = suggestion.action === "self_explain" ? "self_check" : "";
      els.input.value = String(suggestion.draftQuestion);
      pendingGeneratedDraft = els.input.value;
      setStatus(`${suggestion.why || "知点根据刚才的学习状态准备了一个起点"} 草稿可以修改，是否发送由你决定。`, "");
    }
    resizeComposer();
    setOpen(true, { focus: false, preserveProactiveSuggestion: true });
    render();
    window.setTimeout(() => els.input.focus({ preventScroll: true }), 0);
    return true;
  }

  function acceptProactiveSuggestion() {
    const suggestion = proactiveDecision;
    if (!suggestion) return false;
    const sceneSwitch = suggestion.action === "switch_representation";
    if (sceneSwitch) {
      proactiveDecision = null;
      proactiveCandidateId = "";
    }
    if (!executeProactiveAction(suggestion)) {
      if (sceneSwitch) {
        proactiveDecision = suggestion;
        proactiveCandidateId = suggestion.id || "";
      }
      return false;
    }
    const resolution = proactiveCoach.resolve("accept", Date.now()) || {};
    if (suggestion.serverIssued) {
      queueProactiveResolution(suggestion, "accepted");
    }
    proactiveDecision = null;
    proactiveCandidateId = "";
    render();
    track("knowledge_proactive_suggestion_accepted", {
      suggestionId: suggestion.id,
      decisionId: suggestion.decisionId || "",
      interventionId: suggestion.interventionId || "",
      suggestionKind: suggestion.kind,
      action: suggestion.action,
      why: suggestion.why || "",
      confidence: suggestion.confidence,
      unitId: suggestion.unitId,
      resolution: resolution.resolution || "accept",
      dismissStreak: resolution.dismissStreak || 0,
      cooldownUntil: resolution.cooldownUntil || 0,
      createdAt: resolution.createdAt || suggestion.createdAt || "",
      resolvedAt: resolution.resolvedAt || new Date().toISOString(),
      latencyMs: resolution.latencyMs || 0
    });
    return true;
  }

  function dismissProactiveSuggestion(reason = "dismiss") {
    const presented = proactiveDecision;
    const resolution = proactiveCoach?.resolve?.(reason, Date.now()) || {};
    const suggestion = presented || resolution;
    if (!suggestion) return false;
    if (presented?.serverIssued) {
      queueProactiveResolution(presented, "dismissed");
    }
    proactiveDecisionRequest?.abort();
    proactiveDecisionRequest = null;
    proactiveDecision = null;
    proactiveCandidateId = "";
    renderProactiveSuggestion();
    track("knowledge_proactive_suggestion_dismissed", {
      suggestionId: suggestion.id,
      decisionId: presented?.decisionId || "",
      interventionId: suggestion.interventionId || "",
      suggestionKind: suggestion.kind,
      unitId: suggestion.unitId,
      reason,
      resolution: resolution.resolution || reason,
      dismissStreak: resolution.dismissStreak || 0,
      cooldownUntil: resolution.cooldownUntil || 0,
      createdAt: suggestion.createdAt || "",
      resolvedAt: resolution.resolvedAt || new Date().toISOString(),
      latencyMs: resolution.latencyMs || 0
    });
    return true;
  }

  function ignoreProactiveSuggestion(reason = "context-change") {
    const presented = proactiveDecision;
    const resolution = proactiveCoach?.resolve?.("ignore", Date.now()) || {};
    if (!presented && !resolution.id) return false;
    if (presented?.serverIssued) {
      queueProactiveResolution(presented, "ignored");
    }
    clearProactivePresentation();
    track("knowledge_proactive_suggestion_ignored", {
      suggestionId: presented?.id || resolution.id || "",
      decisionId: presented?.decisionId || "",
      interventionId: presented?.interventionId || "",
      suggestionKind: presented?.kind || resolution.kind || "",
      unitId: presented?.unitId || resolution.unitId || "",
      resolution: "ignore",
      dismissStreak: resolution.dismissStreak || 0,
      cooldownUntil: resolution.cooldownUntil || 0,
      createdAt: presented?.createdAt || resolution.createdAt || "",
      resolvedAt: resolution.resolvedAt || new Date().toISOString(),
      latencyMs: resolution.latencyMs || 0,
      ignoredByEventType: reason
    });
    return true;
  }

  function proactiveContextRef(candidate, meta) {
    if (candidate?.kind === "repeated_parameter") {
      const recent = CoursewareContext.captureRecentInteraction?.();
      if (recent?.unitId === meta.unitId) return recent;
    }
    return {
      kind: meta.isQuiz ? "quiz" : "unit",
      scope: meta.isQuiz ? "quiz" : "lesson",
      chapterId: meta.chapterId,
      unitId: meta.unitId,
      unitLabel: meta.unitLabel,
      knowledgePointId: meta.knowledgePointId,
      knowledgePointLabel: meta.knowledgePointLabel,
      confidence: "high"
    };
  }

  function proactiveCandidateStillCurrent(candidate, meta, options = {}) {
    if (options.persistedBoundary === true) {
      const current = courseMeta();
      return proactiveCandidateId === candidate.id
        && current.unitId === candidate.unitId
        && current.chapterId === meta.chapterId;
    }
    return proactiveCoach.getSuggestion()?.id === candidate.id;
  }

  async function requestProactiveDecision(candidate, options = {}) {
    const meta = courseMeta();
    const awaitingFollowup = candidate?.kind === "independent_attempt_outcome"
      && proactiveScopeState(meta)?.lifecycle?.phase === "awaiting_independent_attempt";
    if (
      !candidate
      || !proactiveCollectionEnabled(meta)
      || candidate.unitId !== meta.unitId
      || !meta.supported
      || !isSignedInNow()
      || quizAssistantLocked(meta)
      || (isOpen && !awaitingFollowup)
      || document.hidden
      || !learningViewActive()
    ) return false;
    if (proactiveCandidateId === candidate.id && (proactiveDecision || proactiveDecisionRequest)) return true;
    proactiveDecisionRequest?.abort();
    const controller = new AbortController();
    proactiveDecisionRequest = controller;
    proactiveCandidateId = candidate.id;
    proactiveDecision = null;
    renderProactiveSuggestion();
    try {
      if (proactiveStudyManaged(meta)) {
        await Promise.resolve();
        if (typeof analyticsFlushUntilSettled === "function") {
          await analyticsFlushUntilSettled(20000);
        } else if (typeof analyticsFlush === "function") {
          await analyticsFlush();
        }
        if (
          controller.signal.aborted
          || !proactiveCandidateStillCurrent(candidate, meta, options)
        ) return false;
      }
      const response = await fetch("api/learning/assistant/intervention", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          unitId: meta.unitId,
          sceneType: meta.sceneType,
          signal: {
            kind: candidate.kind,
            parameter: candidate.parameter,
            oldValue: candidate.oldValue,
            newValue: candidate.newValue,
            incorrect: candidate.incorrect,
            correct: candidate.correct,
            pendingReview: candidate.pendingReview,
            questionCount: candidate.questionCount,
            phase: candidate.phase,
            success: candidate.success,
            sourceEventType: candidate.sourceEventType,
            attemptId: candidate.attemptId,
            dwellSeconds: candidate.dwellSeconds,
            dismissStreak: candidate.dismissStreak,
            boundaryRecheck: candidate.boundaryRecheck === true,
            boundaryEventType: candidate.boundaryEventType || ""
          },
          contextRef: proactiveContextRef(candidate, meta)
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        if (payload.code === "assistant_intervention_budget_exhausted") {
          const resolution = proactiveCoach.resolve("agent-silent", Date.now()) || {};
          proactiveCandidateId = "";
          track("knowledge_proactive_budget_exhausted", {
            suggestionId: candidate.id,
            suggestionKind: candidate.kind,
            unitId: candidate.unitId,
            resolution: resolution.resolution || "agent-silent",
            cooldownUntil: resolution.cooldownUntil || 0
          });
          return false;
        }
        throw new Error(payload.message || "主动判断暂时不可用。");
      }
      if (payload.study && proactiveStudyManaged(meta)) {
        applyProactiveStudy({
          ...payload.study,
          managed: true,
          candidateCollectionEnabled: payload.study.mode !== "off"
        }, meta);
      }
      if (!proactiveCandidateStillCurrent(candidate, meta, options)) return false;
      const decision = payload.decision || {};
      if (!decision.intervene || decision.action === "stay_silent") {
        const resolution = proactiveCoach.resolve(
          candidate.kind === "formative_outcome"
            ? "outcome-recorded"
            : "agent-silent",
          Date.now()
        ) || {};
        proactiveCandidateId = "";
        proactiveDecision = null;
        renderProactiveSuggestion();
        track("knowledge_proactive_agent_silent", {
          suggestionId: candidate.id,
          suggestionKind: candidate.kind,
          unitId: candidate.unitId,
          resolution: resolution.resolution || "agent-silent",
          cooldownUntil: resolution.cooldownUntil || 0
        });
        return true;
      }
      if (
        proactiveStudyManaged(meta)
        && !serverAuthorizedProactiveDecision(payload, meta)
      ) {
        const resolution = proactiveCoach.resolve("agent-silent", Date.now()) || {};
        proactiveCandidateId = "";
        proactiveDecision = null;
        renderProactiveSuggestion();
        track("knowledge_proactive_unsigned_decision_rejected", {
          suggestionId: candidate.id,
          decisionId: payload.decisionId || "",
          interventionId: payload.interventionId || "",
          suggestionKind: candidate.kind,
          unitId: candidate.unitId,
          resolution: resolution.resolution || "agent-silent"
        });
        return false;
      }
      proactiveDecision = {
        ...decision,
        id: candidate.id,
        decisionId: payload.decisionId || "",
        kind: candidate.kind,
        unitId: candidate.unitId,
        createdAt: candidate.createdAt || "",
        dismissStreak: candidate.dismissStreak || 0,
        interventionId: payload.interventionId || "",
        serverIssued: proactiveStudyManaged(meta)
      };
      renderProactiveSuggestion();
      track("knowledge_proactive_agent_decided", {
        suggestionId: candidate.id,
        decisionId: payload.decisionId || "",
        interventionId: payload.interventionId || "",
        suggestionKind: candidate.kind,
        action: decision.action,
        why: decision.why || "",
        confidence: decision.confidence,
        fallback: Boolean(payload.fallback),
        createdAt: candidate.createdAt || ""
      });
      return true;
    } catch (error) {
      if (error.name === "AbortError") return false;
      if (!proactiveCandidateStillCurrent(candidate, meta, options)) return false;
      if (proactiveStudyManaged(meta) || candidate.kind !== "repeated_parameter") {
        const resolution = proactiveCoach.resolve("agent-silent", Date.now()) || {};
        proactiveCandidateId = "";
        proactiveDecision = null;
        renderProactiveSuggestion();
        track("knowledge_proactive_fallback_silent", {
          suggestionId: candidate.id,
          suggestionKind: candidate.kind,
          unitId: candidate.unitId,
          reason: proactiveStudyManaged(meta)
            ? "managed_policy_unavailable"
            : "server_context_unavailable",
          resolution: resolution.resolution || "agent-silent",
          cooldownUntil: resolution.cooldownUntil || 0
        });
        return false;
      }
      proactiveDecision = {
        ...candidate,
        action: "observe_change",
        intervene: true,
        draftQuestion: candidate.question,
        assistantPrompt: "",
        replyOptions: [],
        contextSummary: "",
        interactionMode: "student_draft",
        why: "网络暂时不可用，已采用本地学习策略。",
        confidence: 0.5
      };
      renderProactiveSuggestion();
      return false;
    } finally {
      if (proactiveDecisionRequest === controller) proactiveDecisionRequest = null;
    }
  }

  function considerProactiveSuggestion() {
    const meta = courseMeta();
    if (!proactiveCollectionEnabled(meta)) {
      clearProactivePresentation();
      return;
    }
    const candidate = proactiveCoach?.getSuggestion?.() || null;
    if (!candidate) {
      if (proactiveDecision?.serverIssued) {
        renderProactiveSuggestion();
        return;
      }
      proactiveDecisionRequest?.abort();
      proactiveDecisionRequest = null;
      proactiveDecision = null;
      proactiveCandidateId = "";
      renderProactiveSuggestion();
      return;
    }
    requestProactiveDecision(candidate);
  }

  async function consumeProactiveSignal(event) {
    const signal = event?.detail?.event;
    if (!proactiveCoach || !signal) return;
    const meta = courseMeta();
    if (
      proactiveStudyManaged(meta)
      && (!proactiveStudy.loaded || proactiveStudyKey !== `${String(
        state?.participant?.participantId || ""
      )}|${meta.chapterId}`)
    ) {
      await loadProactiveStudy(meta);
    }
    if (!proactiveCollectionEnabled(meta)) return;
    const presented = proactiveDecision;
    const pendingBoundaryCandidate = proactiveBoundaryCandidate(signal, meta);
    proactiveCoach.consume(signal);
    const resolution = proactiveCoach.takeResolution?.();
    if (resolution?.resolution === "ignore") {
      if (presented?.serverIssued) {
        queueProactiveResolution(presented, "ignored");
      }
      proactiveDecisionRequest?.abort();
      proactiveDecisionRequest = null;
      proactiveDecision = null;
      proactiveCandidateId = "";
      renderProactiveSuggestion();
      track("knowledge_proactive_suggestion_ignored", {
        suggestionId: resolution.id,
        decisionId: presented?.decisionId || "",
        interventionId: presented?.interventionId || "",
        suggestionKind: resolution.kind,
        unitId: resolution.unitId,
        resolution: resolution.resolution,
        dismissStreak: resolution.dismissStreak || 0,
        cooldownUntil: resolution.cooldownUntil || 0,
        createdAt: resolution.createdAt || "",
        resolvedAt: resolution.resolvedAt || "",
        latencyMs: resolution.latencyMs || 0,
        ignoredByEventType: signal.eventType || ""
      });
    }
    const directCandidate = proactiveCoach.getSuggestion?.() || null;
    if (
      pendingBoundaryCandidate
      && (!directCandidate || directCandidate.kind === "quiet_dwell")
    ) {
      await requestProactiveDecision(
        pendingBoundaryCandidate,
        { persistedBoundary: true }
      );
      return;
    }
    if (signal.eventType === "quiz_submit_success") {
      window.setTimeout(() => {
        scheduleSync();
        considerProactiveSuggestion();
      }, 0);
      return;
    }
    considerProactiveSuggestion();
  }

  function runProactiveTick() {
    const meta = courseMeta();
    if (
      !proactiveCoach
      || !proactiveCollectionEnabled(meta)
      || isOpen
      || document.hidden
      || !learningViewActive()
      || !isSignedInNow()
      || !meta.supported
      || quizAssistantLocked(meta)
    ) return;
    syncProactiveUnit(meta);
    proactiveCoach.tick(Date.now());
    considerProactiveSuggestion();
  }

  function setOpen(next, options = {}) {
    const nextOpen = Boolean(next);
    const wasOpen = isOpen;
    if (
      nextOpen
      && (
        proactiveStudy.agentAssistanceBlocked
        || activeProactiveOutcomeSession()
      )
    ) {
      proactiveOutcomesOpen = true;
      proactiveOutcomeStatus = "独立测量进行中，知点与路径建议暂时关闭。";
      render();
      window.requestAnimationFrame(() => {
        els.outcomesDialog?.focus({ preventScroll: true });
      });
      return false;
    }
    if (
      nextOpen
      && quizAssistantLocked()
      && !quizParticipationAccessAllowed()
    ) {
      setStatus(QUIZ_LOCKED_MESSAGE, "warning");
      renderLauncherAvailability();
      return false;
    }
    if (nextOpen && !wasOpen && options.preserveProactiveSuggestion !== true) {
      if (!dismissProactiveSuggestion("assistant-open")) {
        const meta = courseMeta();
        proactiveCoach?.consume?.({
          eventType: "assistant_open",
          unitId: meta.unitId,
          unitType: meta.unitType,
          sceneType: meta.sceneType
        }, Date.now());
      }
    }
    if (!nextOpen && wasOpen) {
      const meta = courseMeta();
      proactiveCoach?.consume?.({
        eventType: "assistant_close",
        unitId: meta.unitId,
        unitType: meta.unitType,
        sceneType: meta.sceneType
      }, Date.now());
    }
    isOpen = nextOpen;
    root.classList.toggle("is-open", isOpen);
    els.panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
    els.launcher.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (!isOpen && CoursewareContext.getPickState().phase === "picking") {
      CoursewareContext.cancelObjectPick("sidebar-close");
    }
    if (!isOpen) hideSelectionAction();
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, isOpen ? "1" : "0");
    } catch {}
    global.dispatchEvent(new CustomEvent("cq:knowledge-assistant-visibility", {
      detail: { open: isOpen }
    }));
    if (isOpen) window.requestAnimationFrame(applyPanelPosition);
    if (
      isOpen
      && proactiveStudyManaged()
      && (!proactiveStudy.loaded || !proactiveStudy.assignment)
    ) {
      loadProactiveStudy(courseMeta(), { force: true }).catch(() => {});
    }
    if (isOpen && options.focus !== false) {
      window.setTimeout(() => {
        const participation = proactiveStudy.participation || {};
        const focusTarget = quizParticipationAccessAllowed()
          ? participation.canEnroll === true
            ? els.proactiveConsentCheckbox
            : els.proactiveWithdraw
          : composerFocusTarget();
        focusTarget?.focus({ preventScroll: true });
      }, 180);
    }
    track(isOpen ? "knowledge_assistant_open" : "knowledge_assistant_close");
    return true;
  }

  function contextCopy(ref) {
    if (!ref) return "";
    if (ref.kind === "interaction" && ref.state) {
      return `${Core.friendlyInteractionLabel(ref.state.parameter || ref.label)}：${Core.formatInteractionChange(ref.state)}`;
    }
    if (ref.latex) return ref.latex;
    const copy = ref.excerpt || ref.label || "";
    return (ref.confidence === "low" || ref.coarse) && copy.length > 320
      ? `${copy.slice(0, 320).trim()}…`
      : copy;
  }

  function contextTitle(ref) {
    return ref?.knowledgePointLabel || ref?.unitLabel || courseMeta().unitLabel || "当前课件";
  }

  function confidenceLabel(ref) {
    if (!ref) return "";
    if (ref.confidence === "low" || ref.coarse) return "定位较粗：回答针对当前画面或操作，不假装识别具体数学对象。";
    if (ref.kind === "formula") return "已保留原始 LaTeX 公式上下文";
    return "知点针已定位到这个课件位置";
  }

  function renderContext() {
    const ref = activeContext;
    els.context.hidden = !ref;
    if (!ref) return;
    els.contextTitle.textContent = contextTitle(ref);
    els.contextCopy.textContent = contextCopy(ref);
    els.contextConfidence.textContent = confidenceLabel(ref);
    els.context.classList.toggle("is-coarse", ref.confidence === "low" || ref.coarse);
  }

  function echoSummary(ref) {
    return Core.formatInteractionChange(ref?.state || {});
  }

  function renderEcho() {
    const meta = courseMeta();
    const captured = typeof CoursewareContext?.captureRecentInteraction === "function"
      ? CoursewareContext.captureRecentInteraction()
      : recentInteraction;
    const ref = captured && captured.unitId === meta.unitId ? captured : null;
    if (!ref && recentInteraction) recentInteraction = null;
    els.echo.hidden = !ref || activeContext?.createdAt === ref.createdAt;
    if (!ref) return;
    const component = Core.friendlyInteractionLabel(ref.state?.parameter || ref.label);
    els.echoTitle.textContent = interactionSceneCopy(meta);
    els.echoCopy.textContent = `${component}：${echoSummary(ref)}`;
  }

  function syncNoteHighlights() {
    const meta = courseMeta();
    const notes = meta.unitId
      ? Notes.notesFor(localStorage, {
          ownerKey: noteOwnerKey(),
          unitId: meta.unitId
        })
      : [];
    CoursewareContext?.renderNotes?.(notes);
    global.dispatchEvent(new CustomEvent("cq:workspace-data-change"));
    return notes;
  }

  function renderNoteSyncStatus() {
    const isUnsavedDraft = !els.noteEditor.hidden && !editingNoteId;
    const copy = isUnsavedDraft
      ? isSignedInNow() ? "保存后同步到账号" : "保存后保存在本机"
      : {
          local: isSignedInNow() ? "已保存在本机" : "登录后可跨设备保存",
          syncing: "正在同步…",
          synced: "已同步到账号",
          pending: "已保存在本机，等待重试"
        }[noteSyncState] || "已保存在本机";
    els.noteSyncStatus.textContent = copy;
    els.noteSyncStatus.dataset.state = isUnsavedDraft ? "draft" : noteSyncState;
  }

  function setNoteSyncState(next) {
    noteSyncState = next;
    renderNoteSyncStatus();
  }

  async function syncLearningNotes(meta = courseMeta()) {
    const ownerKey = noteOwnerKey();
    const requestId = ++noteSyncRequestId;
    if (!isSignedInNow() || !meta.unitId || !meta.supported) {
      setNoteSyncState("local");
      syncNoteHighlights();
      return false;
    }
    setNoteSyncState("syncing");
    const migrationKey = `${NOTE_MIGRATION_STORAGE_PREFIX}${ownerKey}`;
    const needsMigration = localStorage.getItem(migrationKey) !== "1";
    const pendingOperations = notePendingOperations(ownerKey);
    const needsPush = needsMigration
      || pendingOperations.upsertIds.length > 0
      || pendingOperations.deletedIds.length > 0;
    try {
      const response = await fetch(needsPush
        ? "api/learning/notes/sync"
        : `api/learning/notes?unitId=${encodeURIComponent(meta.unitId)}`, {
        method: needsPush ? "POST" : "GET",
        headers: {
          ...(needsPush ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${state.authToken}`
        },
        ...(needsPush ? {
          body: JSON.stringify({
            unitId: meta.unitId,
            notes: Notes.notesFor(localStorage, { ownerKey }),
            deletedIds: pendingOperations.deletedIds
          })
        } : {})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "笔记同步失败。");
      if (requestId !== noteSyncRequestId) return false;
      Notes.replaceOwnerUnitNotes(localStorage, ownerKey, meta.unitId, payload.notes || []);
      if (needsPush) {
        localStorage.setItem(migrationKey, "1");
        saveNotePendingOperations({ upsertIds: [], deletedIds: [] }, ownerKey);
      }
      setNoteSyncState("synced");
      syncNoteHighlights();
      return true;
    } catch (error) {
      if (requestId !== noteSyncRequestId) return false;
      setNoteSyncState("pending");
      console.warn("Learning note sync deferred:", error.message);
      syncNoteHighlights();
      return false;
    }
  }

  async function persistLearningNote(note) {
    if (!note || !isSignedInNow()) {
      setNoteSyncState("local");
      return false;
    }
    const requestId = ++noteSyncRequestId;
    markNotePending(note.id, "upsert");
    setNoteSyncState("syncing");
    try {
      const response = await fetch(`api/learning/notes/${encodeURIComponent(note.id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify(note)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "笔记同步失败。");
      if (requestId !== noteSyncRequestId) return false;
      Notes.upsertNote(localStorage, { ...payload.note, ownerKey: noteOwnerKey() });
      clearNotePending(note.id);
      setNoteSyncState("synced");
      syncNoteHighlights();
      return true;
    } catch (error) {
      if (requestId !== noteSyncRequestId) return false;
      setNoteSyncState("pending");
      console.warn("Learning note save deferred:", error.message);
      return false;
    }
  }

  async function deleteLearningNote(note) {
    if (!note || !isSignedInNow()) {
      setNoteSyncState("local");
      return false;
    }
    const requestId = ++noteSyncRequestId;
    markNotePending(note.id, "delete");
    setNoteSyncState("syncing");
    try {
      const response = await fetch(`api/learning/notes/${encodeURIComponent(note.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "笔记删除失败。");
      if (requestId !== noteSyncRequestId) return false;
      clearNotePending(note.id);
      setNoteSyncState("synced");
      return true;
    } catch (error) {
      if (requestId !== noteSyncRequestId) return false;
      setNoteSyncState("pending");
      syncNoteHighlights();
      console.warn("Learning note deletion deferred:", error.message);
      return false;
    }
  }

  function renderProvider() {
    const verification = provider.verification
      || (provider.live ? "pending" : "local");
    els.provider.textContent = provider.label
      || (verification === "verified"
        ? "AI 助教"
        : provider.live
          ? "待首次提问"
          : "本地引导");
    els.provider.dataset.live = provider.live ? "true" : "false";
    els.provider.dataset.verification = verification;
    els.provider.title = verification === "verified"
      ? "本次回答已由真实模型服务生成"
      : provider.live
        ? "已读取模型配置；首次提问会验证真实连接"
        : "当前使用本地确定性引导，不冒充真实大模型";
  }

  function applyQuota(nextQuota) {
    if (!nextQuota || typeof nextQuota !== "object") return;
    quota = {
      limit: Math.max(0, Number(nextQuota.limit ?? quota.limit) || 0),
      used: Math.max(0, Number(nextQuota.used ?? quota.used) || 0),
      remaining: Math.max(0, Number(nextQuota.remaining ?? quota.remaining) || 0),
      usageDate: String(nextQuota.usageDate || quota.usageDate || "")
    };
  }

  function renderQuota() {
    els.quota.textContent = `今日还可提问 ${quota.remaining} 次`;
    els.quota.title = `每日额度 ${quota.limit} 次，已使用 ${quota.used} 次`;
    els.quota.dataset.exhausted = quota.remaining <= 0 ? "true" : "false";
  }

  function formatConversationTime(value = "") {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "刚刚";
    const today = new Date();
    const sameDay = date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
    return new Intl.DateTimeFormat("zh-CN", sameDay
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }
    ).format(date);
  }

  function conversationNode(conversation) {
    const card = document.createElement("article");
    card.className = "knowledge-conversation-card";
    card.dataset.conversationId = conversation.id;
    card.classList.toggle("is-active", conversation.id === activeConversationId);
    card.classList.toggle("has-open-menu", openConversationMenuId === conversation.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "knowledge-conversation-open";
    const title = document.createElement("strong");
    title.textContent = conversation.title || "新对话";
    const meta = document.createElement("span");
    meta.textContent = `${formatConversationTime(conversation.updatedAt)} · ${conversation.messageCount || 0} 条消息`;
    const arrow = document.createElement("i");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";
    button.append(title, meta, arrow);
    button.addEventListener("click", () => {
      activeConversationId = conversation.id;
      activeWorkspace = "chat";
      loadHistory(courseMeta(), conversation.id);
    });

    const menuShell = document.createElement("div");
    menuShell.className = "knowledge-conversation-menu-shell";
    menuShell.setAttribute("data-conversation-menu-shell", "true");
    const menuToggle = document.createElement("button");
    menuToggle.type = "button";
    menuToggle.className = "knowledge-conversation-menu-toggle";
    menuToggle.setAttribute("aria-label", `管理对话：${conversation.title || "新对话"}`);
    menuToggle.setAttribute("aria-expanded", openConversationMenuId === conversation.id ? "true" : "false");
    menuToggle.textContent = "⋯";
    menuToggle.addEventListener("click", () => {
      openConversationMenuId = openConversationMenuId === conversation.id ? "" : conversation.id;
      deletingConversationId = "";
      renderConversations();
    });
    menuShell.appendChild(menuToggle);
    if (openConversationMenuId === conversation.id) {
      const menu = document.createElement("div");
      menu.className = "knowledge-conversation-menu";
      menu.setAttribute("role", "menu");
      const archiveAction = historyFilter === "archived"
        ? '<button type="button" role="menuitem" data-conversation-action="restore">恢复</button>'
        : '<button type="button" role="menuitem" data-conversation-action="archive">归档</button>';
      menu.innerHTML = `
        <button type="button" role="menuitem" data-conversation-action="rename">重命名</button>
        ${archiveAction}
        <button type="button" role="menuitem" data-conversation-action="delete">删除</button>
      `;
      menu.addEventListener("click", (event) => {
        const action = event.target.closest?.("[data-conversation-action]")?.dataset.conversationAction;
        if (!action) return;
        if (action === "rename") {
          renamingConversationId = conversation.id;
          openConversationMenuId = "";
          renderConversations();
          window.setTimeout(() => {
            els.conversationList.querySelector("[data-conversation-rename-input]")?.focus();
          }, 0);
          return;
        }
        if (action === "delete") {
          deletingConversationId = conversation.id;
          openConversationMenuId = "";
          renderConversations();
          return;
        }
        updateConversation(conversation.id, { action });
      });
      menuShell.appendChild(menu);
    }
    card.append(button, menuShell);

    if (renamingConversationId === conversation.id) {
      const form = document.createElement("form");
      form.className = "knowledge-conversation-rename";
      form.innerHTML = `
        <label>对话名称<input data-conversation-rename-input maxlength="80"></label>
        <button type="button" data-conversation-rename-cancel>取消</button>
        <button type="submit">保存</button>
      `;
      form.querySelector("input").value = conversation.title || "新对话";
      form.querySelector("[data-conversation-rename-cancel]").addEventListener("click", () => {
        renamingConversationId = "";
        renderConversations();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const nextTitle = form.querySelector("input").value.trim();
        if (nextTitle) updateConversation(conversation.id, { action: "rename", title: nextTitle });
      });
      card.appendChild(form);
    }

    if (deletingConversationId === conversation.id) {
      const confirmation = document.createElement("div");
      confirmation.className = "knowledge-conversation-confirm";
      confirmation.innerHTML = `
        <p><strong>删除这段对话？</strong><span>删除后无法恢复。</span></p>
        <button type="button" data-conversation-delete-cancel>保留</button>
        <button type="button" data-conversation-delete-confirm>删除</button>
      `;
      confirmation.querySelector("[data-conversation-delete-cancel]").addEventListener("click", () => {
        deletingConversationId = "";
        renderConversations();
      });
      confirmation.querySelector("[data-conversation-delete-confirm]").addEventListener("click", () => {
        deleteConversation(conversation.id);
      });
      card.appendChild(confirmation);
    }
    return card;
  }

  function renderConversations() {
    els.conversationList.replaceChildren();
    if (loadingConversations) {
      const loading = document.createElement("p");
      loading.className = "knowledge-conversation-empty";
      loading.textContent = "正在整理历史对话…";
      els.conversationList.appendChild(loading);
      return;
    }
    if (!conversations.length) {
      const empty = document.createElement("div");
      empty.className = "knowledge-conversation-empty";
      const emptyTitle = historySearch
        ? "没有找到相关对话"
        : historyFilter === "archived" ? "还没有归档对话" : "这里还没有历史对话";
      const emptyCopy = historySearch
        ? "换一个关键词，或清空搜索后再看。"
        : historyFilter === "archived" ? "暂时不用的对话可以从“当前”中归档到这里。" : "提出第一个问题后，会按对话整理在这里。";
      empty.innerHTML = `<strong>${emptyTitle}</strong><span>${emptyCopy}</span>`;
      els.conversationList.appendChild(empty);
      return;
    }
    conversations.forEach((conversation) => {
      els.conversationList.appendChild(conversationNode(conversation));
    });
  }

  function renderWorkspace() {
    const historyActive = activeWorkspace === "history";
    els.chatView.hidden = historyActive;
    els.historyView.hidden = !historyActive;
    els.form.hidden = historyActive;
    els.historyToggle.setAttribute("aria-pressed", historyActive ? "true" : "false");
    els.historyToggle.setAttribute("aria-label", historyActive ? "返回当前对话" : "查看历史对话");
    els.historyToggle.title = historyActive ? "返回当前对话" : "查看历史对话";
    els.historyFilters.forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.knowledgeHistoryFilter === historyFilter ? "true" : "false");
    });
    renderConversations();
  }

  function assistantIntentCopy(intent) {
    return {
      rephrase: "请换一种方式解释刚才这部分，尽量更直观一些。",
      practice: "请围绕刚才的内容出一道小题，先不要给答案。"
    }[intent] || "";
  }

  function questionMatchesAssistantIntent(intent, question = "") {
    const source = String(question || "").trim();
    if (!source) return false;
    if (intent === "self_check") return /我理解|我的理解|我认为|是不是|对不对|这样理解/.test(source);
    if (intent === "rephrase") return /换|另一种|解释|讲|例子|类比|直观|角度/.test(source);
    if (intent === "practice") return /题|练习|考考|测试|作答/.test(source);
    return false;
  }

  function usableProactivePrompt(prompt, meta = courseMeta()) {
    return Boolean(
      prompt
      && String(prompt.content || "").trim()
      && String(prompt.interventionId || "").trim()
      && (!prompt.unitId || prompt.unitId === meta.unitId)
    );
  }

  function beginAssistantIntent(intent) {
    const copy = intent === "self_check" ? "我理解为：" : assistantIntentCopy(intent);
    if (!copy) return;
    pendingProactivePrompt = null;
    pendingAssistantIntent = intent;
    els.input.value = copy;
    pendingGeneratedDraft = copy;
    resizeComposer();
    setStatus(intent === "self_check"
      ? "用一句话写出你的理解，知点会帮你检查关键关系。"
      : "已放入输入框，你可以修改后再决定是否发送。", "");
    els.input.focus({ preventScroll: true });
    track("knowledge_followup_draft_selected", { assistantIntent: intent });
  }

  function conversationTurnCount() {
    return messages.reduce((count, message) => count + (message.role === "user" ? 1 : 0), 0);
  }

  function conversationAtLimit() {
    return conversationTurnCount() >= CONVERSATION_TURN_LIMIT;
  }

  function renderQuickQuestions() {
    const meta = courseMeta();
    els.quick.replaceChildren();
    if (
      quizAssistantLocked(meta)
      || conversationAtLimit()
      || messages.length > 0
      || pendingProactivePrompt
      || loadingHistory
    ) {
      els.quick.hidden = true;
      return;
    }
    els.quick.hidden = false;
    const suggestions = Core.suggestionsForContext({
      ...(activeContext || {}),
      scope: meta.isQuiz ? "quiz" : activeContext?.scope,
      quizSubmitted: meta.quizSubmitted
    });
    suggestions.forEach((question) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = question;
      button.addEventListener("click", () => {
        pendingProactivePrompt = null;
        pendingAssistantIntent = "";
        els.input.value = question;
        pendingGeneratedDraft = question;
        resizeComposer();
        setStatus("问题已放入输入框，你可以修改后再决定是否发送。", "");
        els.input.focus({ preventScroll: true });
        track("knowledge_opening_draft_selected", { questionLength: question.length });
      });
      els.quick.appendChild(button);
    });
  }

  function proactivePromptNode(prompt, options = {}) {
    const article = document.createElement("article");
    article.className = "knowledge-message assistant knowledge-proactive-question";
    article.dataset.proactivePromptId = prompt?.id || "";
    const heading = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = "知点想先了解";
    const badge = document.createElement("small");
    badge.textContent = "等你回答";
    heading.append(label, badge);
    const body = document.createElement("p");
    setQuestionMathContent(body, prompt?.content || "");
    article.append(heading, body);
    if (prompt?.contextSummary) {
      const evidence = document.createElement("div");
      evidence.className = "knowledge-proactive-evidence";
      evidence.setAttribute("aria-label", "本次复盘依据");
      setQuestionMathContent(evidence, prompt.contextSummary);
      article.appendChild(evidence);
    }
    if (Array.isArray(prompt?.replyOptions) && prompt.replyOptions.length) {
      const replyOptions = document.createElement("div");
      replyOptions.className = "knowledge-proactive-reply-options";
      replyOptions.setAttribute("aria-label", "选择一个回答起点");
      const optionsHint = document.createElement("span");
      optionsHint.textContent = "选一个最接近的情况，仅放入输入框";
      replyOptions.appendChild(optionsHint);
      prompt.replyOptions.slice(0, 4).forEach((item) => {
        const option = String(item || "").trim();
        if (!option) return;
        const button = document.createElement("button");
        button.type = "button";
        setQuestionMathContent(button, option);
        button.addEventListener("click", () => {
          els.input.value = option;
          pendingGeneratedDraft = option;
          resizeComposer();
          setStatus("已放入输入框，你可以补充后再决定是否发送。", "");
          els.input.focus({ preventScroll: true });
          track("knowledge_proactive_reply_option_selected", {
            action: prompt?.action || "",
            option
          });
        });
        replyOptions.appendChild(button);
      });
      article.appendChild(replyOptions);
    }
    if (options.dismissible) {
      const footer = document.createElement("footer");
      const hint = document.createElement("span");
      hint.textContent = "直接在下方写下你的想法";
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "改为自由提问";
      dismiss.addEventListener("click", () => {
        if (prompt?.sourceMessageId) {
          const sourceMessage = messages.find((message) => message.id === prompt.sourceMessageId);
          if (sourceMessage) {
            requestQuizReviewAction(sourceMessage, "stop");
            return;
          }
        }
        if (pendingGeneratedDraft && els.input.value === pendingGeneratedDraft) {
          els.input.value = "";
          resizeComposer();
        }
        pendingProactivePrompt = null;
        pendingGeneratedDraft = "";
        setStatus("可以直接提出你想问的问题。", "");
        render();
        window.setTimeout(() => els.input.focus({ preventScroll: true }), 0);
        track("knowledge_proactive_reply_skipped", {
          action: prompt?.action || "ask_clarification",
          unitId: prompt?.unitId || courseMeta().unitId
        });
      });
      footer.append(hint, dismiss);
      article.appendChild(footer);
    }
    return article;
  }

  function proactiveCheckFeedbackNode(feedback) {
    const article = document.createElement("article");
    article.className = `knowledge-message assistant knowledge-proactive-check-feedback is-${feedback.tone || "neutral"}`;
    const heading = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = feedback.title || "本轮支架状态";
    heading.appendChild(label);
    const body = document.createElement("p");
    setQuestionMathContent(body, feedback.text || "");
    article.append(heading, body);
    return article;
  }

  function proactiveInlineOfferNode(suggestion) {
    const article = document.createElement("article");
    article.className = "knowledge-message assistant knowledge-proactive-inline-offer";
    article.dataset.proactiveDecisionId = suggestion.decisionId || "";
    const heading = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = {
      L1: "知点建议先做最小澄清",
      L2: "知点建议只加一层线索",
      L3: "知点建议拆成两个子目标",
      L4: "知点建议只推进下一步",
      L5: "知点建议接着完成半成品"
    }[suggestion.supportLevel] || "知点建议";
    const badge = document.createElement("small");
    badge.textContent = suggestion.supportLevel || "可选";
    heading.append(label, badge);
    const title = document.createElement("p");
    setQuestionMathContent(title, suggestion.title || "这里可能需要一个更小的切入点");
    const detail = document.createElement("div");
    detail.className = "knowledge-proactive-inline-offer-detail";
    setQuestionMathContent(detail, suggestion.body || "");
    const actions = document.createElement("footer");
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "is-primary";
    accept.textContent = suggestion.actionLabel || "接受线索";
    accept.addEventListener("click", () => {
      acceptProactiveSuggestion();
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "稍后";
    dismiss.addEventListener("click", () => {
      snoozeProactiveSuggestion();
    });
    actions.append(accept, dismiss);
    article.append(heading, title, detail, actions);
    const learnerOptions = suggestion.learnerOptions || {};
    if (
      learnerOptions.canRequestAlternative === true
      || learnerOptions.canMuteScope === true
    ) {
      const secondary = document.createElement("div");
      secondary.className = "knowledge-proactive-inline-options";
      if (learnerOptions.canRequestAlternative === true) {
        const alternative = document.createElement("button");
        alternative.type = "button";
        alternative.textContent = "换一种帮助";
        alternative.disabled = proactiveChoiceSaving;
        alternative.addEventListener("click", requestProactiveAlternative);
        secondary.appendChild(alternative);
      }
      if (learnerOptions.canMuteScope === true) {
        const mute = document.createElement("button");
        mute.type = "button";
        mute.textContent = "关闭此知识点提醒";
        mute.disabled = proactiveChoiceSaving;
        mute.addEventListener("click", () => {
          updateProactiveScopePreference("off");
        });
        secondary.appendChild(mute);
      }
      article.appendChild(secondary);
    }
    markProactiveSuggestionShown(suggestion);
    return article;
  }

  async function submitProactiveVerification(check, options = {}) {
    const meta = courseMeta();
    const scopeKey = proactiveScopeKey(meta);
    const declined = options.declined === true;
    if (
      proactiveCheckSubmitting
      || !check?.id
      || !scopeKey
      || (!declined && !proactiveCheckSelection)
    ) return false;
    proactiveCheckSubmitting = true;
    renderMessages();
    try {
      const response = await fetch("api/learning/proactive/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          unitId: meta.unitId,
          scopeKey,
          sceneType: meta.sceneType,
          checkId: check.id,
          response: declined ? "" : proactiveCheckSelection,
          resolution: declined ? "declined" : "",
          durationMs: proactiveCheckStartedAt
            ? Math.max(0, Date.now() - proactiveCheckStartedAt)
            : 0,
          contextRef: {
            kind: "proactive_verification",
            scope: meta.isQuiz ? "quiz" : "lesson",
            chapterId: meta.chapterId,
            unitId: meta.unitId,
            knowledgePointId: meta.knowledgePointId
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message || "这道支架后检查暂时无法提交。");
        error.code = payload.code || "";
        throw error;
      }
      if (payload.study) {
        applyProactiveStudy({
          ...payload.study,
          managed: true,
          candidateCollectionEnabled: payload.study.mode !== "off"
        }, meta);
      }
      const result = payload.checkResult || {};
      const decision = payload.decision || {};
      const nextSupportAuthorized = decision.intervene
        && decision.action !== "stay_silent"
        && serverAuthorizedProactiveDecision(payload, meta);
      const maximumSupportReached = payload.study?.policyState?.lifecycle?.phase
        === "maximum_support_reached";
      const nextSupportCopy = {
        L2: "一条概念关系线索",
        L3: "一次子目标拆分",
        L4: "一个可执行的下一步",
        L5: "一个保留最后步骤的部分例题"
      }[decision.supportLevel] || "下一层最小必要支架";
      proactiveCheckFeedback = {
        scopeKey,
        tone: result.status === "correct"
          ? "success"
          : result.status === "incorrect" ? "warning" : "neutral",
        title: result.status === "correct"
          ? "本轮检查通过"
          : result.status === "incorrect"
            ? "还差一个关键关系"
            : "已结束本轮检查",
        text: result.status === "correct"
          ? "这次支架后检查通过，知点停止加码；它只结束当前帮助回合，不代表已经掌握。"
          : result.status === "incorrect"
            ? nextSupportAuthorized
              ? `这次支架后作答仍有卡点。只有你确认后，知点才会提供${nextSupportCopy}。`
              : maximumSupportReached
                ? "这次作答仍有卡点，本轮帮助已到上限，知点不再追加提示。你可以回看课件，或主动提问梳理困难。"
                : "这次作答仍有卡点，本轮不再追加提示。你可以继续学习，或主动提问。"
            : "知点不会继续升级支架，你仍可以按自己的节奏学习。"
      };
      if (nextSupportAuthorized) {
        proactiveDecision = {
          ...decision,
          id: `verification:${result.attemptId || check.id}`,
          decisionId: payload.decisionId || "",
          kind: "independent_attempt_outcome",
          unitId: meta.unitId,
          createdAt: new Date().toISOString(),
          interventionId: payload.interventionId || "",
          serverIssued: true
        };
        proactiveCandidateId = proactiveDecision.id;
      } else {
        proactiveDecision = null;
        proactiveCandidateId = "";
      }
      track("knowledge_proactive_verification_resolved", {
        checkId: check.id,
        supportLevel: check.supportLevel || "",
        result: result.status || "",
        decisionId: payload.decisionId || "",
        interventionId: payload.interventionId || "",
        deliveryDecision: payload.study?.deliveryDecision || "stay_silent",
        unitId: meta.unitId
      });
      render();
      return true;
    } catch (error) {
      proactiveCheckFeedback = {
        scopeKey,
        tone: "error",
        title: "支架后检查未提交",
        text: error.message || "请稍后再试。"
      };
      track("knowledge_proactive_verification_failed", {
        checkId: check.id,
        unitId: meta.unitId,
        reason: error.code || error.message || "request_failed"
      });
      render();
      return false;
    } finally {
      proactiveCheckSubmitting = false;
      renderMessages();
    }
  }

  function proactiveVerificationNode(check) {
    const article = document.createElement("article");
    article.className = "knowledge-message assistant knowledge-proactive-verification";
    article.dataset.proactiveCheckId = check.id || "";
    const heading = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = "支架后检查";
    const badge = document.createElement("small");
    badge.textContent = {
      L1: "第 1 次检查",
      L2: "第 2 次检查",
      L3: "第 3 次检查",
      L4: "第 4 次检查",
      L5: "第 5 次检查"
    }[check.supportLevel] || "本轮检查";
    heading.append(label, badge);
    const prompt = document.createElement("p");
    setQuestionMathContent(prompt, check.prompt || "");
    const options = document.createElement("div");
    options.className = "knowledge-proactive-verification-options";
    options.setAttribute("role", "radiogroup");
    (Array.isArray(check.options) ? check.options : []).forEach((item) => {
      const button = document.createElement("button");
      button.classList.toggle("unknown-choice-option", item.value === "__unknown__");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute(
        "aria-checked",
        proactiveCheckSelection === item.value ? "true" : "false"
      );
      button.classList.toggle(
        "is-selected",
        proactiveCheckSelection === item.value
      );
      button.disabled = proactiveCheckSubmitting;
      setQuestionMathContent(button, item.value === "__unknown__" ? "我不会" : `${item.value}. ${item.label || ""}`);
      button.addEventListener("click", () => {
        proactiveCheckSelection = item.value;
        proactiveCheckFeedback = null;
        renderMessages();
      });
      options.appendChild(button);
    });
    const actions = document.createElement("footer");
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "is-primary";
    submit.disabled = proactiveCheckSubmitting || !proactiveCheckSelection;
    submit.textContent = proactiveCheckSubmitting ? "正在提交" : "提交检查";
    submit.addEventListener("click", () => {
      submitProactiveVerification(check);
    });
    const decline = document.createElement("button");
    decline.type = "button";
    decline.disabled = proactiveCheckSubmitting;
    decline.textContent = "暂不检查";
    decline.addEventListener("click", () => {
      submitProactiveVerification(check, { declined: true });
    });
    actions.append(submit, decline);
    article.append(heading, prompt, options, actions);
    return article;
  }

  function setMessageQuizReviewProgress(message, progress) {
    if (!message || !progress) return;
    message.guidance = {
      ...(message.guidance || {}),
      quizReviewProgress: { ...progress }
    };
    message.quizReviewFollowUp = { ...progress };
  }

  async function requestQuizReviewAction(message, action, panel = null) {
    const meta = courseMeta();
    if (!activeConversationId || !message?.id || !meta.unitId) {
      setStatus("这段复盘状态暂时不可用，请重新打开当前对话。", "warning");
      return false;
    }
    if (action === "next") {
      const existingDraft = els.input.value.trim();
      if (existingDraft && existingDraft !== pendingGeneratedDraft) {
        setStatus("输入框里还有未发送的内容；先发送或清空后再进入下一题。", "warning");
        els.input.focus({ preventScroll: true });
        return false;
      }
    }
    panel?.classList.add("is-loading");
    panel?.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    try {
      const response = await fetch("api/learning/assistant/quiz-review/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          unitId: meta.unitId,
          sceneType: meta.sceneType,
          conversationId: activeConversationId,
          assistantMessageId: message.id,
          action
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || "这一步复盘暂时无法继续。");
      }
      if (payload.progress) setMessageQuizReviewProgress(message, payload.progress);
      if (action === "stop") {
        if (pendingProactivePrompt?.sourceMessageId === message.id) {
          pendingProactivePrompt = null;
        }
        setStatus("本轮复盘已结束；你仍可围绕当前测验自由提问。", "");
        render();
        els.input.focus({ preventScroll: true });
        track("knowledge_quiz_review_stopped", {
          reviewIndex: payload.progress?.reviewIndex,
          reviewTotal: payload.progress?.reviewTotal
        });
        return true;
      }
      if (payload.done) {
        pendingProactivePrompt = null;
        setStatus(payload.completionMessage || "本轮错题已复盘完成。", "");
        render();
        els.input.focus({ preventScroll: true });
        track("knowledge_quiz_review_completed", {
          reviewTotal: payload.progress?.reviewTotal
        });
        return true;
      }
      if (!payload.prompt?.interventionId) {
        throw new Error("复盘上下文没有完整恢复，请稍后再试。");
      }
      pendingAssistantIntent = "";
      pendingGeneratedDraft = "";
      pendingProactivePrompt = {
        ...payload.prompt,
        visible: payload.prompt.visible !== false
      };
      if (action === "next") {
        els.input.value = "";
        resizeComposer();
        setStatus("下一道错题已就位。先回答上面的诊断问题，再决定是否发送。", "");
      } else {
        setStatus("可以继续追问这一题；写好后由你决定是否发送。", "");
      }
      render();
      window.setTimeout(() => els.input.focus({ preventScroll: true }), 0);
      track(`knowledge_quiz_review_${action}`, {
        reviewIndex: payload.progress?.targetReviewIndex,
        reviewTotal: payload.progress?.reviewTotal
      });
      return true;
    } catch (error) {
      setStatus(error.message || "这一步复盘暂时无法继续。", "error");
      return false;
    } finally {
      panel?.classList.remove("is-loading");
      panel?.querySelectorAll("button").forEach((button) => {
        button.disabled = false;
      });
    }
  }

  function quizReviewFollowUpNode(message, { actionable = true } = {}) {
    const followUp = message?.quizReviewFollowUp;
    const progress = followUp || message?.guidance?.quizReviewProgress || null;
    if (!progress || !actionable) return null;
    const panel = document.createElement("div");
    panel.className = "knowledge-quiz-review-follow-up";
    if (progress.done || progress.status === "completed") {
      panel.classList.add("is-complete");
      const complete = document.createElement("strong");
      complete.textContent = progress.completionMessage
        || `本轮 ${progress.reviewTotal || 0} 道错题已复盘完成。`;
      panel.appendChild(complete);
      return panel;
    }
    if ((progress.status || "awaiting_choice") !== "awaiting_choice") return null;
    const reviewIndex = Math.max(0, Number(progress.reviewIndex || 0));
    const reviewTotal = Math.max(1, Number(progress.reviewTotal || 1));
    const copy = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = `正在复盘第 ${reviewIndex + 1} / ${reviewTotal} 道错题`;
    const hint = document.createElement("small");
    hint.textContent = "这题可以继续追问；理解后再进入下一题。";
    copy.append(label, hint);
    const actions = document.createElement("div");

    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "continue";
    continueButton.textContent = "继续问";
    continueButton.addEventListener("click", () => {
      requestQuizReviewAction(message, "continue", panel);
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "primary";
    nextButton.textContent = "下一题";
    nextButton.addEventListener("click", () => {
      requestQuizReviewAction(message, "next", panel);
    });

    const stopButton = document.createElement("button");
    stopButton.type = "button";
    stopButton.className = "quiet";
    stopButton.textContent = "就到这";
    stopButton.addEventListener("click", () => {
      requestQuizReviewAction(message, "stop", panel);
    });

    actions.append(continueButton, nextButton, stopButton);
    panel.append(copy, actions);
    return panel;
  }

  function messageNode(message, options = {}) {
    const article = document.createElement("article");
    article.className = `knowledge-message ${message.role === "user" ? "user" : "assistant"}`;
    if (message.error) article.classList.add("error");
    article.dataset.messageId = message.id || "";
    const heading = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = message.role === "user" ? "你" : "知点";
    heading.appendChild(label);
    if (message.role === "assistant" && message.provider) {
      const badge = document.createElement("small");
      badge.textContent = ["mock", "fallback"].includes(message.provider) ? "本地引导" : "AI 助教";
      heading.appendChild(badge);
    }
    const body = document.createElement("p");
    setQuestionMathContent(body, message.content || (message.streaming ? "正在组织解释…" : ""));
    article.append(heading, body);
    if (message.role === "assistant" && !message.streaming && !message.error) {
      const guidance = message.guidance || {};
      const provenance = guidance.provenance || {};
      if (provenance.show && message.contextRef) {
        const source = document.createElement("div");
        source.className = "knowledge-message-source";
        source.setAttribute("data-knowledge-message-source", "true");
        source.classList.toggle("is-open", openMessageSourceId === message.id);
        const sourceButton = document.createElement("button");
        sourceButton.type = "button";
        sourceButton.textContent = provenance.label || "依据当前课件";
        sourceButton.title = "查看回答依据，并回到对应课件位置";
        sourceButton.setAttribute("aria-expanded", openMessageSourceId === message.id ? "true" : "false");
        sourceButton.addEventListener("click", () => {
          const nextOpen = openMessageSourceId !== message.id;
          openMessageSourceId = nextOpen ? message.id : "";
          if (nextOpen) useContext(message.contextRef, "message-source");
          else renderMessages();
        });
        const sourceDetail = document.createElement("span");
        sourceDetail.textContent = provenance.detail || provenance.sourceLabel || "当前学习位置";
        source.append(sourceButton, sourceDetail);
        article.appendChild(source);
      }
      if (guidance.showUnderstandingCheck && Array.isArray(guidance.actions) && guidance.actions.length) {
        const actions = document.createElement("div");
        actions.className = "knowledge-message-actions";
        actions.setAttribute("data-knowledge-message-actions", "true");
        const label = document.createElement("span");
        label.textContent = "继续巩固";
        actions.appendChild(label);
        guidance.actions.forEach((intent) => {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-knowledge-self-check", intent === "self_check" ? "true" : "false");
          button.setAttribute("data-assistant-intent", intent);
          button.textContent = {
            self_check: "用一句话复述",
            rephrase: "换一种解释",
            practice: "出一道小题"
          }[intent] || intent;
          button.addEventListener("click", () => beginAssistantIntent(intent));
          actions.appendChild(button);
        });
        article.appendChild(actions);
      }
      const quizReviewFollowUp = quizReviewFollowUpNode(message, {
        actionable: options.quizReviewActionable !== false
      });
      if (quizReviewFollowUp) article.appendChild(quizReviewFollowUp);
    }
    return article;
  }

  function renderMessages() {
    const scrollViewport = els.scroll || els.messages;
    const previousScrollTop = scrollViewport.scrollTop;
    const nearBottom = scrollViewport.scrollHeight - scrollViewport.scrollTop - scrollViewport.clientHeight < 120;
    const meta = courseMeta();
    const verificationCheck = syncProactiveCheckState(meta);
    const scopedFeedback = proactiveCheckFeedback?.scopeKey === proactiveScopeKey(meta)
      ? proactiveCheckFeedback
      : null;
    const inlineOffer = isOpen
      && proactiveDecision?.serverIssued
      && proactiveDecision.unitId === meta.unitId
      ? proactiveDecision
      : null;
    const hasProactiveContent = Boolean(
      verificationCheck
      || scopedFeedback
      || inlineOffer
    );
    els.messages.replaceChildren();
    if (
      !messages.length
      && !pendingProactivePrompt
      && !loadingHistory
      && !hasProactiveContent
    ) {
      els.messages.appendChild(els.empty);
      els.empty.hidden = false;
    } else if (loadingHistory && !messages.length) {
      const loading = document.createElement("div");
      loading.className = "knowledge-history-loading";
      loading.innerHTML = "<span></span><span></span><span></span><p>正在恢复这个知识点的提问记录</p>";
      els.messages.appendChild(loading);
    } else {
      const latestAssistantMessage = [...messages].reverse().find((message) => (
        message.role === "assistant" && !message.streaming && !message.error
      ));
      messages.forEach((message) => {
        if (
          message.role === "user"
          && message.proactivePrompt
          && message.proactivePromptVisible !== false
        ) {
          els.messages.appendChild(proactivePromptNode({
            id: `history-${message.id || ""}`,
            content: message.proactivePrompt
          }));
        }
        els.messages.appendChild(messageNode(message, {
          quizReviewActionable: message.id === latestAssistantMessage?.id
        }));
      });
      if (
        usableProactivePrompt(pendingProactivePrompt)
        && pendingProactivePrompt.visible !== false
      ) {
        els.messages.appendChild(proactivePromptNode(pendingProactivePrompt, { dismissible: true }));
      }
    }
    if (verificationCheck) {
      els.messages.appendChild(proactiveVerificationNode(verificationCheck));
    }
    if (scopedFeedback) {
      els.messages.appendChild(proactiveCheckFeedbackNode(scopedFeedback));
    }
    if (inlineOffer) {
      els.messages.appendChild(proactiveInlineOfferNode(inlineOffer));
    }
    // Replacing the message DOM can clamp scrollTop; never override a learner reading above.
    scrollViewport.scrollTop = nearBottom && messages.length
      ? scrollViewport.scrollHeight
      : previousScrollTop;
  }

  function renderProactiveOutcomeEntry() {
    const panel = els.proactiveOutcomesPanel;
    const button = els.proactiveOutcomesOpen;
    if (!panel || !button) return;
    const visible = Boolean(
      proactiveStudyManaged()
      && proactiveStudy.loaded
      && proactiveStudy.assignment
      && proactiveStudy.participation?.status === "enrolled"
      && proactiveOutcomes?.managed
      && isSignedInNow()
    );
    panel.hidden = !visible;
    if (!visible) {
      els.proactiveOutcomePathStages?.replaceChildren();
      return;
    }

    const stages = Array.isArray(proactiveOutcomes.stages)
      ? proactiveOutcomes.stages
      : [];
    renderProactiveOutcomePathStages(stages);
    const active = activeProactiveOutcomeSession();
    const available = stages.filter((stage) => stage.status === "available");
    const submitted = stages.filter((stage) => stage.status === "submitted");
    const withdrawn = stages.filter((stage) => stage.status === "withdrawn");
    const skipped = stages.filter((stage) => stage.status === "skipped");
    const expired = stages.filter((stage) => stage.status === "expired");
    const terminalCount = submitted.length + withdrawn.length + skipped.length + expired.length;
    panel.classList.toggle("is-active", Boolean(active));
    if (active) {
      const stage = stages.find((entry) => entry.id === active.stageId);
      const answered = Object.keys(active.responses || {}).length;
      els.proactiveOutcomesSummary.textContent = active.pausedAt
        ? `${stage?.label || "独立测量"}已暂时离开，草稿保留 ${answered}/${stage?.itemCount || 0} 题；继续时恢复同一会话。`
        : `${stage?.label || "独立测量"}进行中，已作答 ${answered}/${stage?.itemCount || 0} 题；学习助手暂时关闭。`;
      button.textContent = "继续作答";
      button.disabled = proactiveOutcomesLoading
        || proactiveOutcomesSubmitting
        || proactiveOutcomeWithdrawing;
      return;
    }
    if (available.length) {
      els.proactiveOutcomesSummary.textContent = `${available[0].label}已开放；每次只完成路径中的当前任务。`;
      button.textContent = "查看独立任务";
      button.disabled = proactiveOutcomesLoading
        || proactiveOutcomesSubmitting;
      return;
    }
    if (terminalCount === stages.length && stages.length) {
      els.proactiveOutcomesSummary.textContent = proactiveOutcomes.answerReviewReleased
        ? skipped.length || expired.length || withdrawn.length
          ? `独立测量路径已结束：提交 ${submitted.length} 项、跳过 ${skipped.length} 项、超窗 ${expired.length} 项；可回看已提交结果。`
          : "独立测量已全部完成，现在可以回看对错、答案和总分。"
        : "独立测量路径已结束，可以回看已提交阶段的作答。";
      button.textContent = "查看测量记录";
      button.disabled = false;
      return;
    }
    if (withdrawn.length) {
      els.proactiveOutcomesSummary.textContent = "本章存在已退出的测量阶段；失访状态已记录。";
      button.textContent = "查看任务状态";
      button.disabled = false;
      return;
    }
    const nextStage = stages.find((stage) => stage.unlockAt)
      || stages.find((stage) => stage.status === "locked");
    els.proactiveOutcomesSummary.textContent = nextStage?.reason
      || "完成章后测后开放；作答期间学习助手暂时关闭。";
    button.textContent = "尚未开放";
    button.disabled = true;
  }

  function renderProactiveParticipation() {
    const section = els.proactiveParticipation;
    if (!section) return;
    const visible = Boolean(
      proactiveStudyManaged()
      && proactiveStudy.loaded
      && isSignedInNow()
      && proactiveStudy.participation?.mode === "explicit-consent"
    );
    section.hidden = !visible;
    if (!visible) return;
    const participation = proactiveStudy.participation || {};
    const status = participation.status || "not_enrolled";
    if (status !== "enrolled") proactiveWithdrawalConfirming = false;
    els.proactiveParticipationTitle.textContent = "本章主动伴学研究";
    els.proactiveParticipationStatus.textContent = status === "withdrawn"
      ? "已退出。课程、普通知点提问和已有学习记录不受影响。"
      : status === "enrolled"
        ? participation.mode === "explicit-consent"
          ? "已按当前研究说明记录自愿参加；可随时退出。"
          : "当前为工程试点记录；可随时退出，不影响正常学习。"
        : participation.ready === false
          ? "研究说明与同意版本尚未配置完成，当前不会分组或展示实验性主动提示。"
          : "尚未参加；不参加不会影响课程和普通知点提问。";

    const hasNotice = Boolean(participation.consentNoticeUrl);
    els.proactiveConsentLink.hidden = !hasNotice;
    if (hasNotice) {
      els.proactiveConsentLink.href = participation.consentNoticeUrl;
      els.proactiveConsentLink.textContent = `查看研究说明${
        participation.consentVersion
          ? `（${participation.consentVersion}）`
          : ""
      }`;
    } else {
      els.proactiveConsentLink.removeAttribute("href");
    }
    const canEnroll = participation.canEnroll === true;
    els.proactiveConsentConfirm.hidden = !canEnroll;
    els.proactiveConsentCheckbox.disabled = proactiveParticipationSaving;
    els.proactiveEnroll.hidden = !canEnroll;
    els.proactiveEnroll.disabled = proactiveParticipationSaving
      || !els.proactiveConsentCheckbox.checked;
    els.proactiveWithdraw.hidden = participation.canWithdraw !== true
      || proactiveWithdrawalConfirming;
    els.proactiveWithdraw.disabled = proactiveParticipationSaving;
    els.proactiveEnroll.textContent = proactiveParticipationSaving
      ? "正在记录"
      : "同意参加";
    els.proactiveWithdraw.textContent = proactiveParticipationSaving
      ? "正在保存"
      : "退出研究";
    els.proactiveWithdrawConfirmPanel.hidden = !(
      participation.canWithdraw === true
      && proactiveWithdrawalConfirming
    );
    els.proactiveWithdrawCancel.disabled = proactiveParticipationSaving;
    els.proactiveWithdrawConfirm.disabled = proactiveParticipationSaving;
    els.proactiveWithdrawConfirm.textContent = proactiveParticipationSaving
      ? "正在保存"
      : "确认退出";
  }

  function renderUnit() {
    const meta = courseMeta();
    const quizLocked = quizAssistantLocked(meta);
    const measurementBlocked = Boolean(
      proactiveStudy.agentAssistanceBlocked
      || activeProactiveOutcomeSession()
    );
    const conversationLimited = conversationAtLimit();
    renderLauncherAvailability(meta);
    els.unit.textContent = meta.knowledgePointLabel || meta.unitLabel || "等待课件加载";
    els.unitDetail.textContent = conversationLimited
      ? `这段对话已完成 ${CONVERSATION_TURN_LIMIT} 轮，请新建对话继续。`
      : meta.sceneType
      ? `${currentSceneLabel(meta)}，对话会保存在这个知识点下`
      : meta.isQuiz
        ? meta.quizSubmitted
          ? "已提交，可以围绕题目、错因和解法继续复盘"
          : QUIZ_LOCKED_MESSAGE
        : "可直接提问，也可以先选择课件中的文字、公式或对象";
    els.quizPolicy.hidden = !quizLocked;
    root.classList.toggle("is-unavailable", !meta.supported || !isSignedInNow());
    els.input.disabled = !meta.supported
      || !isSignedInNow()
      || quizLocked
      || measurementBlocked
      || conversationLimited;
    els.input.placeholder = measurementBlocked
      ? "独立测量期间暂停知点"
      : quizLocked
      ? "提交测验后可继续提问"
      : conversationLimited
        ? "本段对话已满，请新建对话"
        : pendingProactivePrompt?.reviewAction === "continue"
          ? "继续问这一题……"
          : pendingProactivePrompt
            ? "写下你的回答……"
          : "例如：为什么 h 变小时，割线更接近切线？";
    els.send.disabled = els.input.disabled || isAsking || (provider.live && quota.remaining <= 0);
    els.pick.disabled = !meta.supported
      || !isSignedInNow()
      || quizLocked
      || measurementBlocked;
    els.selectionAsk.disabled = quizLocked
      || measurementBlocked
      || conversationLimited;
    els.selectionAsk.title = measurementBlocked
      ? "独立测量期间暂停知点"
      : quizLocked
      ? QUIZ_LOCKED_MESSAGE
      : conversationLimited
        ? "本段对话已满，请新建对话继续"
        : "围绕选中内容询问知点";
    const scopePreferenceAvailable = Boolean(
      proactiveStudyManaged(meta)
      && proactiveStudy.loaded
      && proactiveStudy.assignment
      && proactiveStudy.participation?.status === "enrolled"
      && isSignedInNow()
    );
    const preference = ["standard", "reduced", "off"].includes(
      proactiveStudy.studentPreference
    )
      ? proactiveStudy.studentPreference
      : "standard";
    const scopeMuted = preference !== "off" && proactiveScopeMuted(meta);
    els.proactivePreference.hidden = !scopePreferenceAvailable || !scopeMuted;
    els.proactivePreferenceStatus.textContent = "恢复后，系统会继续按本组既定方案判断是否提供帮助。";
    els.proactiveScopeRestore.hidden = !scopePreferenceAvailable || !scopeMuted;
    els.proactiveScopeRestore.disabled = proactiveChoiceSaving;
    renderProactiveParticipation();
    renderProactiveOutcomeEntry();
  }

  function render() {
    root.classList.toggle("is-open", isOpen);
    els.panel.setAttribute("aria-hidden", isOpen ? "false" : "true");
    els.launcher.setAttribute("aria-expanded", isOpen ? "true" : "false");
    renderProvider();
    renderUnit();
    renderContext();
    renderEcho();
    renderQuickQuestions();
    renderMessages();
    renderWorkspace();
    renderQuota();
    renderProactiveSuggestion();
    renderNoteSyncStatus();
    renderProactiveOutcomes();
    global.dispatchEvent(new CustomEvent("cq:workspace-data-change"));
  }

  function hideNoteEditor(options = {}) {
    noteEditorSelection = null;
    editingNoteId = "";
    selectedNoteColor = "amber";
    els.noteEditor.hidden = true;
    els.noteInput.value = "";
    els.noteDelete.hidden = true;
    if (options.keepPending !== true) pendingSelection = null;
  }

  function hideSelectionAction(options = {}) {
    els.selectionToolbar.hidden = true;
    if (options.keepEditor !== true) hideNoteEditor({ keepPending: options.keepPending });
    if (options.keepPending !== true) pendingSelection = null;
  }

  function floatingPosition(rect, width, height, gap = 10) {
    const viewportWidth = Math.max(global.innerWidth || 0, width + 16);
    const viewportHeight = Math.max(global.innerHeight || 0, height + 16);
    const center = Number(rect.left || 0) + Number(rect.width || 0) / 2;
    const left = Math.max(8, Math.min(viewportWidth - width - 8, center - width / 2));
    const topEdge = Number(rect.top || 0);
    const bottomEdge = Number(rect.bottom || rect.top || 0);
    const desiredTop = topEdge >= height + gap + 8
      ? topEdge - height - gap
      : bottomEdge + gap;
    const top = Math.max(8, Math.min(viewportHeight - height - 8, desiredTop));
    return { left: Math.round(left), top: Math.round(top) };
  }

  function placeFloatingElement(element, rect, width, estimatedHeight, gap = 10) {
    const apply = (height) => {
      const position = floatingPosition(rect, width, height, gap);
      element.style.left = `${position.left}px`;
      element.style.top = `${position.top}px`;
    };
    apply(estimatedHeight);
    window.requestAnimationFrame(() => {
      if (element.hidden) return;
      apply(element.offsetHeight || estimatedHeight);
    });
  }

  function showSelectionAction(payload) {
    if (!payload?.contextRef || !payload.rect) return;
    pendingSelection = payload;
    noteEditorSelection = null;
    els.noteEditor.hidden = true;
    els.selectionToolbar.hidden = false;
    placeFloatingElement(els.selectionToolbar, payload.rect, 214, 44, 9);
  }

  function renderNoteColorChoice() {
    els.noteColors.querySelectorAll("[data-note-color]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        button.dataset.noteColor === selectedNoteColor ? "true" : "false"
      );
    });
    els.noteEditor.dataset.noteColor = selectedNoteColor;
  }

  function matchingNoteForSelection(selection) {
    if (!selection?.locator) return null;
    return Notes.findMatchingNote(localStorage, {
      ownerKey: noteOwnerKey(),
      unitId: courseMeta().unitId
    }, selection.locator);
  }

  function showNoteEditor(selection = pendingSelection, existingNote = null) {
    if (!selection?.contextRef || !selection.rect) return;
    const note = existingNote || matchingNoteForSelection(selection);
    noteEditorSelection = selection;
    editingNoteId = note?.id || "";
    selectedNoteColor = note?.color || "amber";
    els.selectionToolbar.hidden = true;
    els.noteExcerpt.textContent = note?.excerpt
      || selection.contextRef.excerpt
      || selection.contextRef.latex
      || selection.contextRef.label
      || "当前选中的课件内容";
    els.noteInput.value = note?.note || "";
    els.noteDelete.hidden = !editingNoteId;
    renderNoteColorChoice();
    els.noteEditor.hidden = false;
    els.noteEditor.dataset.workspace = selection.workspace ? "true" : "false";
    renderNoteSyncStatus();
    placeFloatingElement(els.noteEditor, selection.rect, 420, 390, 11);
    window.setTimeout(() => els.noteInput.focus({ preventScroll: true }), 0);
  }

  function saveSelectionNote() {
    const selection = noteEditorSelection || pendingSelection;
    if (!selection?.contextRef) return null;
    const meta = courseMeta();
    const contextRef = Core.normalizeContextRef(selection.contextRef, meta);
    const note = Notes.upsertNote(localStorage, Notes.createNote({
      id: editingNoteId,
      ownerKey: noteOwnerKey(),
      threadKey: noteThreadKey(contextRef, meta),
      chapterId: meta.chapterId,
      unitId: meta.unitId,
      excerpt: contextRef.excerpt || contextRef.latex || contextRef.label,
      note: els.noteInput.value,
      color: selectedNoteColor,
      contextRef,
      locator: selection.locator || {
        source: selection.source === "iframe" ? "iframe" : "document",
        semanticId: contextRef.semanticId,
        exact: contextRef.excerpt || "",
        startOffset: -1,
        endOffset: -1
      }
    }));
    hideSelectionAction();
    window.getSelection?.()?.removeAllRanges?.();
    syncNoteHighlights();
    persistLearningNote(note);
    track("knowledge_note_saved", {
      noteId: note.id,
      hasComment: Boolean(note.note),
      contextKind: contextRef.kind,
      contextScope: contextRef.scope
    });
    return note;
  }

  function removeEditingNote() {
    if (!editingNoteId) return;
    const removedId = editingNoteId;
    const removedNote = Notes.notesFor(localStorage, {
      ownerKey: noteOwnerKey(),
      unitId: courseMeta().unitId
    }).find((note) => note.id === removedId);
    if (!Notes.removeNote(localStorage, removedId, noteOwnerKey())) return;
    hideSelectionAction();
    syncNoteHighlights();
    track("knowledge_note_removed", { noteId: removedId });
    deleteLearningNote(removedNote);
  }

  function useContext(ref, source = "selection") {
    if (quizAssistantLocked() || proactiveStudy.agentAssistanceBlocked || activeProactiveOutcomeSession()) return false;
    activeContext = Core.normalizeContextRef(ref, courseMeta());
    CoursewareContext.restoreContext(activeContext);
    hideSelectionAction();
    setOpen(true);
    render();
    track("knowledge_context_selected", {
      contextKind: activeContext.kind,
      contextScope: activeContext.scope,
      contextConfidence: activeContext.confidence,
      source
    });
    return true;
  }

  function handlePickingChange(payload) {
    const active = Boolean(payload?.active);
    root.classList.toggle("is-picking", active);
    els.pickNotice.hidden = !active;
    els.pick.classList.toggle("active", active);
    els.pickLabel.textContent = active ? "退出焦点选择" : "选取课件焦点";
    if (active && els.pickInstructions) {
      const hasPrecisePointer = global.innerWidth > 760
        && global.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;
      els.pickInstructions.textContent = hasPrecisePointer
        ? "移动鼠标可预览可选范围；本次点击只作标记，不会触发课件操作。按 Esc 退出。"
        : "轻点已标示的内容完成选择；本次点击只作标记，不会触发课件操作。";
    }
    track(active ? "knowledge_object_pick_begin" : "knowledge_object_pick_end", {
      reason: payload?.state?.reason || ""
    });
  }

  const CoursewareContext = Core.createBrowserController({
    root: () => document.querySelector("#lesson-player"),
    sidebarRoot: root,
    getCourseMeta: courseMeta,
    onContext: (ref) => useContext(ref, "object-pick"),
    onRecentInteraction: (ref) => {
      recentInteraction = ref;
      renderEcho();
    },
    onPickingChange: handlePickingChange,
    onTextSelection: showSelectionAction,
    onNoteSelect: ({ note, rect, source }) => {
      if (!note || !rect) return;
      pendingSelection = {
        contextRef: Core.normalizeContextRef(note.contextRef || {}, courseMeta()),
        locator: note.locator,
        rect,
        source: source || note.locator?.source || "document"
      };
      showNoteEditor(pendingSelection, note);
    }
  });

  global.CoursewareContext = CoursewareContext;

  function assistantParams(meta = courseMeta()) {
    return new URLSearchParams({
      chapterId: meta.chapterId,
      unitId: meta.unitId,
      sceneType: meta.sceneType || ""
    });
  }

  function historyParams(meta = courseMeta()) {
    const params = assistantParams(meta);
    if (historySearch) params.set("q", historySearch);
    if (historyFilter === "archived") params.set("archived", "1");
    return params;
  }

  async function loadConversations(meta = courseMeta(), options = {}) {
    if (!meta.unitId || !meta.supported || !isSignedInNow() || quizAssistantLocked(meta)) {
      conversations = [];
      activeConversationId = "";
      messages = [];
      render();
      return;
    }
    loadingConversations = true;
    renderConversations();
    try {
      const response = await fetch(`api/learning/assistant/conversations?${historyParams(meta)}`, {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "历史对话加载失败。");
      provider = payload.provider || provider;
      applyQuota(payload.quota);
      conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
      if (options.loadActive !== false) {
        if (!conversations.some((item) => item.id === activeConversationId)) {
          activeConversationId = conversations[0]?.id || "";
        }
        if (activeConversationId) {
          await loadHistory(meta, activeConversationId);
        } else {
          messages = [];
        }
      }
    } catch (error) {
      conversations = [];
      if (options.loadActive !== false) {
        activeConversationId = "";
        messages = [];
      }
      setStatus(error.message || "历史对话暂时不可用。", "error");
    } finally {
      loadingConversations = false;
      render();
    }
  }

  async function updateConversation(conversationId, change) {
    try {
      const response = await fetch(`api/learning/assistant/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify(change)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "对话操作失败。");
      renamingConversationId = "";
      deletingConversationId = "";
      openConversationMenuId = "";
      await loadConversations(courseMeta(), { loadActive: false });
      setStatus(change.action === "rename" ? "对话名称已更新。" : change.action === "archive" ? "对话已归档。" : "对话已恢复。", "");
    } catch (error) {
      setStatus(error.message || "对话操作失败。", "error");
    }
  }

  async function deleteConversation(conversationId) {
    try {
      const response = await fetch(`api/learning/assistant/conversations/${encodeURIComponent(conversationId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "对话删除失败。");
      deletingConversationId = "";
      openConversationMenuId = "";
      if (activeConversationId === conversationId) {
        activeConversationId = "";
        messages = [];
      }
      await loadConversations(courseMeta(), { loadActive: false });
      setStatus("对话已删除。", "");
    } catch (error) {
      setStatus(error.message || "对话删除失败。", "error");
    }
  }

  function createNewConversation(options = {}) {
    const meta = courseMeta();
    if (!meta.unitId || !meta.supported || !isSignedInNow() || quizAssistantLocked(meta)) return false;
    activeRequest?.abort();
    historyRequestId += 1;
    activeConversationId = "";
    activeWorkspace = "chat";
    messages = [];
    pendingAssistantIntent = "";
    pendingProactivePrompt = null;
    openMessageSourceId = "";
    els.input.value = "";
    resizeComposer();
    setStatus("新对话已准备好，收到助教回复后才会保存。", "");
    render();
    if (options.focus !== false) {
      window.setTimeout(() => els.input.focus({ preventScroll: true }), 0);
    }
    track("knowledge_conversation_draft_started");
    return true;
  }

  async function loadHistory(meta = courseMeta(), conversationId = activeConversationId) {
    const requestId = ++historyRequestId;
    pendingAssistantIntent = "";
    pendingProactivePrompt = null;
    openMessageSourceId = "";
    if (!meta.unitId || !meta.supported || !isSignedInNow() || quizAssistantLocked(meta)) {
      messages = [];
      loadingHistory = false;
      render();
      return;
    }
    loadingHistory = true;
    messages = [];
    renderMessages();
    const params = assistantParams(meta);
    if (conversationId) params.set("conversationId", conversationId);
    try {
      const response = await fetch(`api/learning/assistant/history?${params}`, {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== historyRequestId) return;
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "提问记录加载失败。");
      provider = payload.provider || provider;
      applyQuota(payload.quota);
      activeConversationId = payload.conversation?.id || conversationId || "";
      currentQuizSubmitted = Boolean(payload.quizSubmitted);
      pendingProactivePrompt = usableProactivePrompt(payload.pendingQuizReviewPrompt, meta)
        ? payload.pendingQuizReviewPrompt
        : null;
      messages = (payload.messages || []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        contextRef: message.contextRef || null,
        guidance: message.guidance || null,
        assistantIntent: message.assistantIntent || "",
        proactivePrompt: message.proactivePrompt || "",
        proactivePromptVisible: message.proactivePromptVisible !== false,
        provider: message.provider || "",
        createdAt: message.createdAt || ""
      }));
      activeWorkspace = "chat";
      setStatus(
        pendingProactivePrompt
          ? pendingProactivePrompt.visible === false
            ? "已恢复本题的继续追问状态。"
            : "已恢复尚未回答的错题复盘问题。"
          : messages.length
            ? "已打开这段对话，可以继续追问。"
            : ""
      );
    } catch (error) {
      if (requestId !== historyRequestId) return;
      messages = [];
      setStatus(error.message || "提问记录暂时不可用。", "error");
    } finally {
      if (requestId === historyRequestId) {
        loadingHistory = false;
        render();
      }
    }
  }

  function parseStreamLine(line, assistantMessage) {
    if (!line.trim()) return "";
    const event = JSON.parse(line);
    if (event.type === "meta") {
      provider = event.provider || provider;
      activeConversationId = event.conversationId || activeConversationId;
      applyQuota(event.quota);
      currentQuizSubmitted = Boolean(event.quizSubmitted);
      assistantMessage.contextRef = event.contextRef || assistantMessage.contextRef || null;
      renderProvider();
      renderQuota();
      return "meta";
    }
    if (event.type === "delta") {
      assistantMessage.content += event.delta || "";
      renderMessages();
      return "delta";
    }
    if (event.type === "done") {
      assistantMessage.id = event.message?.id || assistantMessage.id;
      assistantMessage.provider = event.message?.provider || "";
      assistantMessage.contextRef = event.message?.contextRef || assistantMessage.contextRef || null;
      assistantMessage.guidance = event.guidance || event.message?.guidance || null;
      assistantMessage.quizReviewFollowUp = event.quizReviewFollowUp || null;
      assistantMessage.assistantIntent = event.message?.assistantIntent || "";
      assistantMessage.fallback = event.fallback === true;
      assistantMessage.streaming = false;
      if (!assistantMessage.content) assistantMessage.content = event.message?.content || "";
      if (event.fallback) {
        provider = {
          id: "fallback",
          live: false,
          verification: "failed",
          label: "本地引导"
        };
        renderProvider();
        setStatus("模型服务暂时不可用，已切换到本地引导。", "warning");
      } else if (
        assistantMessage.provider
        && !["mock", "fallback"].includes(assistantMessage.provider)
      ) {
        provider = {
          ...provider,
          id: assistantMessage.provider,
          live: true,
          verification: "verified",
          label: "AI 助教"
        };
        renderProvider();
      }
      applyQuota(event.quota);
      if (event.conversation?.id) {
        conversations = [
          event.conversation,
          ...conversations.filter((item) => item.id !== event.conversation.id)
        ];
      }
      renderMessages();
      renderConversations();
      renderQuota();
      return "done";
    }
    return "";
  }

  async function readNdjson(response, assistantMessage) {
    const state = { sawDone: false, sawDelta: false };
    const consumeLine = (line) => {
      const type = parseStreamLine(line, assistantMessage);
      if (type === "done") state.sawDone = true;
      if (type === "delta") state.sawDelta = true;
    };
    if (!response.body?.getReader) {
      const text = await response.text();
      text.split(/\r?\n/).forEach(consumeLine);
      return state;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(consumeLine);
      if (done) break;
    }
    if (buffer.trim()) consumeLine(buffer);
    return state;
  }

  async function submitQuestion() {
    const meta = courseMeta();
    const question = els.input.value.trim();
    const assistantIntent = pendingAssistantIntent;
    const proactivePrompt = usableProactivePrompt(pendingProactivePrompt, meta)
      ? pendingProactivePrompt
      : null;
    if (!question || isAsking) return;
    if (!isSignedInNow()) {
      setStatus("请先登录后使用知点。", "error");
      return;
    }
    if (!meta.supported) {
      setStatus("当前单元暂不支持上下文提问。", "error");
      return;
    }
    if (quizAssistantLocked(meta)) {
      setStatus(QUIZ_LOCKED_MESSAGE, "warning");
      return;
    }
    if (conversationAtLimit()) {
      setStatus(`这段对话已完成 ${CONVERSATION_TURN_LIMIT} 轮，请新建对话继续。`, "warning");
      renderUnit();
      return;
    }
    if (provider.live && quota.remaining <= 0) {
      setStatus("今天的知点额度已用完，明天可以继续提问。", "warning");
      return;
    }
    activeRequest?.abort();
    pendingAssistantIntent = "";
    pendingGeneratedDraft = "";
    activeRequest = new AbortController();
    isAsking = true;
    const requestPayload = {
      chapterId: meta.chapterId,
      unitId: meta.unitId,
      sceneType: meta.sceneType,
      conversationId: activeConversationId,
      question,
      assistantIntent,
      proactiveInterventionId: proactivePrompt?.interventionId || "",
      contextRef: activeContext || {
        kind: "unit",
        scope: meta.isQuiz ? "quiz" : meta.learningSurface || "lesson",
        chapterId: meta.chapterId,
        unitId: meta.unitId,
        unitLabel: meta.unitLabel,
        knowledgePointId: meta.knowledgePointId,
        knowledgePointLabel: meta.knowledgePointLabel
      }
    };
    pendingProactivePrompt = null;
    const userMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: question,
      proactivePrompt: proactivePrompt?.content || "",
      proactivePromptVisible: proactivePrompt?.visible !== false,
      provider: ""
    };
    const assistantMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      provider: "",
      streaming: true
    };
    messages.push(userMessage, assistantMessage);
    els.input.value = "";
    resizeComposer();
    setStatus("知点正在结合当前课件组织解释…");
    render();
    track("knowledge_question_asked", {
      contextKind: activeContext?.kind || "unit",
      contextScope: activeContext?.scope || (meta.isQuiz ? "quiz" : "lesson"),
      questionLength: question.length
    });

    try {
      const response = await fetch("api/learning/assistant/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify(requestPayload),
        signal: activeRequest.signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        applyQuota(payload.quota);
        const requestError = new Error(payload.message || "知点暂时没有接通，请稍后再试。");
        requestError.code = payload.code || "";
        throw requestError;
      }
      const streamState = await readNdjson(response, assistantMessage);
      if (!streamState.sawDone || !assistantMessage.content.trim()) {
        const error = new Error("回答传输没有完整结束，正在恢复这段对话。");
        error.code = "assistant_stream_incomplete";
        throw error;
      }
      assistantMessage.streaming = false;
      renderMessages();
      setStatus(
        assistantMessage.fallback
          ? "模型服务未接通，本次回答来自本地引导；仍可继续追问。"
          : "可以继续追问；对话会保存在这个知识点下。",
        assistantMessage.fallback ? "warning" : ""
      );
      track("knowledge_answer_received", {
        provider: assistantMessage.provider || provider.id,
        answerLength: assistantMessage.content.length
      });
    } catch (error) {
      if (error.name === "AbortError") return;
      if (error.code === "assistant_stream_incomplete" && activeConversationId) {
        assistantMessage.streaming = false;
        assistantMessage.error = true;
        assistantMessage.content = "回答传输中断，正在从已保存的对话恢复完整内容。";
        setStatus(assistantMessage.content, "warning");
        renderMessages();
        await loadHistory(meta, activeConversationId);
        return;
      }
      const localUserIndex = messages.indexOf(userMessage);
      if (localUserIndex >= 0) {
        messages.splice(localUserIndex, messages[localUserIndex + 1] === assistantMessage ? 2 : 1);
      } else {
        const localAssistantIndex = messages.indexOf(assistantMessage);
        if (localAssistantIndex >= 0) messages.splice(localAssistantIndex, 1);
      }
      const promptStillValid = proactivePrompt
        && error.code !== "assistant_intervention_expired"
        && courseMeta().unitId === meta.unitId;
      pendingProactivePrompt = promptStillValid ? proactivePrompt : null;
      if (!els.input.value.trim() && courseMeta().unitId === meta.unitId) {
        els.input.value = question;
        pendingGeneratedDraft = question;
        resizeComposer();
      }
      setStatus(error.message || "知点暂时没有接通，请稍后再试。", "error");
      render();
    } finally {
      isAsking = false;
      activeRequest = null;
      if (
        proactivePrompt
        && courseMeta().chapterId === meta.chapterId
        && proactiveScopeKey(courseMeta()) === proactiveScopeKey(meta)
      ) {
        await loadProactiveStudy(courseMeta(), { force: true });
      }
      renderUnit();
      renderMessages();
      els.input.focus({ preventScroll: true });
    }
  }

  function resizeComposer() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(132, Math.max(42, els.input.scrollHeight))}px`;
  }

  function sync() {
    clearTimeout(syncTimer);
    syncTimer = null;
    const meta = courseMeta();
    const nextParticipantId = isSignedInNow()
      ? String(state?.participant?.participantId || "")
      : "";
    const nextUnitKey = `${meta.chapterId}|${meta.unitId}`;
    const unitChanged = nextUnitKey !== currentUnitKey;
    const participantChanged = nextParticipantId !== currentParticipantId;
    const sceneChanged = meta.sceneType !== currentSceneType;
    const quizStateChanged = meta.quizSubmitted !== currentQuizSubmitted;
    const supportChanged = meta.supported !== currentSupported;
    const outcomeOwnerChanged = proactiveOutcomeOwnerKey
      && proactiveOutcomeOwnerKey !== proactiveOutcomesOwner(meta);
    const activeOutcome = activeProactiveOutcomeSession();
    if (
      proactiveOutcomesOpen
      && (
        participantChanged
        || outcomeOwnerChanged
        || (!activeOutcome && (unitChanged || supportChanged))
      )
    ) {
      resetProactiveOutcomes({
        close: true,
        clearData: participantChanged || outcomeOwnerChanged
      });
      renderProactiveOutcomes();
    } else if (participantChanged || outcomeOwnerChanged) {
      resetProactiveOutcomes({
        close: true,
        clearData: true
      });
    }
    if ((unitChanged || participantChanged || supportChanged) && proactiveDecision) {
      ignoreProactiveSuggestion(participantChanged ? "participant-change" : "unit-change");
    }
    if (participantChanged) proactiveCoach?.reset?.({ clearCooldowns: true });
    loadProactiveStudy(meta, {
      force: participantChanged
        || quizStateChanged
        || (unitChanged && !proactiveStudy.assignment)
        || proactiveStudyKey !== `${nextParticipantId}|${meta.chapterId}`
    }).catch(() => {});
    syncProactiveUnit(meta, { force: unitChanged || participantChanged || supportChanged });

    if (
      quizAssistantLocked(meta)
      && !quizParticipationAccessAllowed(meta)
    ) {
      if (isOpen) setOpen(false, { focus: false });
      if (CoursewareContext.getPickState().phase === "picking") {
        CoursewareContext.cancelObjectPick("quiz-lock");
      }
    }

    if (unitChanged || participantChanged || supportChanged) {
      activeRequest?.abort();
      activeRequest = null;
      proactiveDecisionRequest?.abort();
      proactiveDecisionRequest = null;
      proactiveDecision = null;
      proactiveCandidateId = "";
      currentParticipantId = nextParticipantId;
      currentUnitKey = nextUnitKey;
      currentSceneType = meta.sceneType;
      currentQuizSubmitted = meta.quizSubmitted;
      currentSupported = meta.supported;
      activeConversationId = "";
      conversations = [];
      activeWorkspace = "chat";
      activeContext = null;
      recentInteraction = null;
      pendingAssistantIntent = "";
      pendingProactivePrompt = null;
      pendingGeneratedDraft = "";
      openMessageSourceId = "";
      els.input.value = "";
      resizeComposer();
      hideSelectionAction();
      if (participantChanged) {
        CoursewareContext.clearContext();
        CoursewareContext.cancelObjectPick("participant-change");
      } else {
        CoursewareContext.syncUnit();
      }
      window.requestAnimationFrame(() => syncLearningNotes(meta));
      loadConversations(meta);
      return;
    }

    if (sceneChanged) {
      if (proactiveDecision) ignoreProactiveSuggestion("scene-change");
      proactiveDecisionRequest?.abort();
      proactiveDecisionRequest = null;
      proactiveDecision = null;
      proactiveCandidateId = "";
      pendingProactivePrompt = null;
      if (pendingGeneratedDraft && els.input.value === pendingGeneratedDraft) {
        els.input.value = "";
        pendingAssistantIntent = "";
        pendingGeneratedDraft = "";
        resizeComposer();
      }
      currentSceneType = meta.sceneType;
      if (activeContext?.scope === "interactive") {
        activeContext = null;
        CoursewareContext.clearContext();
      }
      recentInteraction = null;
      CoursewareContext.syncUnit();
      window.requestAnimationFrame(syncNoteHighlights);
    }

    if (quizStateChanged) {
      currentQuizSubmitted = meta.quizSubmitted;
      loadConversations(meta);
      return;
    }
    render();
    syncNoteHighlights();
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, 80);
  }

  els.launcher.addEventListener("click", (event) => {
    if (performance.now() < suppressLauncherClickUntil) {
      event.preventDefault();
      return;
    }
    setOpen(true);
  });
  els.close.addEventListener("click", () => {
    setOpen(false);
    els.launcher.focus({ preventScroll: true });
  });
  els.newConversation.addEventListener("click", () => createNewConversation());
  els.historyNew.addEventListener("click", () => createNewConversation());
  els.historyToggle.addEventListener("click", () => {
    activeWorkspace = activeWorkspace === "history" ? "chat" : "history";
    renderWorkspace();
    if (activeWorkspace === "chat") {
      window.setTimeout(() => els.input.focus({ preventScroll: true }), 0);
    }
  });
  els.pick.addEventListener("click", () => {
    if (quizAssistantLocked()) return;
    if (CoursewareContext.getPickState().phase === "picking") {
      CoursewareContext.cancelObjectPick("button");
    } else {
      hideSelectionAction();
      CoursewareContext.beginObjectPick({ singleShot: true });
    }
  });
  els.cancelPick.addEventListener("click", () => CoursewareContext.cancelObjectPick("notice"));
  els.clearContext.addEventListener("click", () => {
    activeContext = null;
    CoursewareContext.clearContext();
    render();
  });
  els.restore.addEventListener("click", () => {
    if (!activeContext) return;
    CoursewareContext.restoreContext(activeContext);
    const selected = document.querySelector("#lesson-player .cq-context-selected");
    selected?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  });
  els.useEcho.addEventListener("click", () => {
    if (recentInteraction) useContext(recentInteraction, "operation-echo");
  });
  els.historySearch.addEventListener("input", () => {
    clearTimeout(historySearchTimer);
    historySearchTimer = window.setTimeout(() => {
      historySearch = els.historySearch.value.replace(/\s+/g, " ").trim();
      loadConversations(courseMeta(), { loadActive: false });
    }, 250);
  });
  els.historyFilters.forEach((button) => {
    button.addEventListener("click", () => {
      const nextFilter = button.dataset.knowledgeHistoryFilter;
      if (!['current', 'archived'].includes(nextFilter) || nextFilter === historyFilter) return;
      historyFilter = nextFilter;
      openConversationMenuId = "";
      renamingConversationId = "";
      deletingConversationId = "";
      renderWorkspace();
      loadConversations(courseMeta(), { loadActive: false });
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!openConversationMenuId || event.target.closest?.("[data-conversation-menu-shell]")) return;
    openConversationMenuId = "";
    renderConversations();
  });
  els.proactiveAccept.addEventListener("click", acceptProactiveSuggestion);
  els.proactiveSnooze.addEventListener("click", snoozeProactiveSuggestion);
  els.proactiveAlternative.addEventListener("click", requestProactiveAlternative);
  els.proactiveMute.addEventListener("click", () => {
    updateProactiveScopePreference("off");
  });
  els.proactiveScopeRestore.addEventListener("click", () => {
    updateProactiveScopePreference("standard");
  });
  els.proactiveConsentCheckbox.addEventListener("change", renderUnit);
  els.proactiveConsentLink.addEventListener("click", () => {
    const participation = proactiveStudy.participation || {};
    track("knowledge_proactive_consent_notice_opened", {
      chapterId: courseMeta().chapterId,
      consentVersion: participation.consentVersion || ""
    });
  });
  els.proactiveEnroll.addEventListener("click", () => {
    updateProactiveParticipation("enroll");
  });
  els.proactiveWithdraw.addEventListener("click", () => {
    proactiveWithdrawalConfirming = true;
    track("knowledge_proactive_withdrawal_confirm_opened", {
      chapterId: courseMeta().chapterId
    });
    renderUnit();
    window.setTimeout(() => {
      els.proactiveWithdrawConfirm?.focus({ preventScroll: true });
    }, 0);
  });
  els.proactiveWithdrawCancel.addEventListener("click", () => {
    if (proactiveParticipationSaving) return;
    proactiveWithdrawalConfirming = false;
    track("knowledge_proactive_withdrawal_confirm_cancelled", {
      chapterId: courseMeta().chapterId
    });
    renderUnit();
    els.proactiveWithdraw?.focus({ preventScroll: true });
  });
  els.proactiveWithdrawConfirm.addEventListener("click", () => {
    updateProactiveParticipation("withdraw");
  });
  els.proactiveOutcomesOpen.addEventListener("click", openProactiveOutcomes);
  els.outcomesClose.addEventListener("click", closeProactiveOutcomes);
  els.selectionToolbar.addEventListener("pointerdown", (event) => event.preventDefault());
  els.selectionAsk.addEventListener("click", () => {
    if (pendingSelection?.contextRef) useContext(pendingSelection.contextRef, "text-selection");
    window.getSelection?.()?.removeAllRanges?.();
  });
  els.selectionNote.addEventListener("click", () => showNoteEditor());
  els.noteCancel.addEventListener("click", () => hideSelectionAction());
  els.noteCancelFooter.addEventListener("click", () => hideSelectionAction());
  els.noteDelete.addEventListener("click", removeEditingNote);
  els.noteColors.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-note-color]");
    if (!button) return;
    selectedNoteColor = button.dataset.noteColor || "amber";
    renderNoteColorChoice();
  });
  els.noteEditor.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSelectionNote();
  });
  els.noteInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.ctrlKey || event.isComposing) return;
    event.preventDefault();
    saveSelectionNote();
  });
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuestion();
  });
  els.input.addEventListener("input", () => {
    if (pendingGeneratedDraft && els.input.value !== pendingGeneratedDraft) {
      pendingGeneratedDraft = "";
    }
    if (pendingAssistantIntent && !questionMatchesAssistantIntent(pendingAssistantIntent, els.input.value)) {
      pendingAssistantIntent = "";
    }
    resizeComposer();
  });
  els.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submitQuestion();
  });

  document.addEventListener("pointerdown", (event) => {
    const selectionUiOpen = !els.selectionToolbar.hidden || !els.noteEditor.hidden;
    if (
      selectionUiOpen
      && !els.selectionToolbar.contains(event.target)
      && !els.noteEditor.contains(event.target)
    ) {
      hideSelectionAction();
    }
  }, true);
  window.addEventListener("scroll", (event) => {
    if (els.noteEditor.contains(event.target) || els.selectionToolbar.contains(event.target)) return;
    if (!els.noteEditor.hidden && noteEditorSelection?.workspace) return;
    hideSelectionAction();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (proactiveOutcomesOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeProactiveOutcomes();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          els.outcomes.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((node) => !node.hidden && node.getClientRects().length);
        if (!focusable.length) {
          event.preventDefault();
          els.outcomesDialog?.focus({ preventScroll: true });
          return;
        }
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
      return;
    }
    if (
      event.key === "Escape"
      && (!els.selectionToolbar.hidden || !els.noteEditor.hidden)
    ) {
      hideSelectionAction();
    }
  });
  window.addEventListener("resize", () => {
    hideSelectionAction();
    applyLauncherPlacement();
    applyPanelPosition();
  });
  document.addEventListener("fullscreenchange", syncFullscreenHost);
  window.addEventListener("cq:lesson-rendered", scheduleSync);
  window.addEventListener("cq:classroom-surface-change", sync);
  window.addEventListener("cq:learning-signal", consumeProactiveSignal);
  proactiveTickTimer = window.setInterval(runProactiveTick, 10 * 1000);
  window.addEventListener("beforeunload", () => window.clearInterval(proactiveTickTimer), { once: true });

  const lessonPlayer = document.querySelector("#lesson-player");
  const observer = lessonPlayer && typeof MutationObserver !== "undefined"
    ? new MutationObserver(scheduleSync)
    : null;
  observer?.observe(lessonPlayer, { childList: true, subtree: true });

  global.KnowledgeAssistant = Object.freeze({
    sync,
    workspaceSnapshot() {
      const meta = courseMeta();
      const locked = quizAssistantLocked(meta)
        || Boolean(proactiveStudy.agentAssistanceBlocked || activeProactiveOutcomeSession());
      return {
        unitId: meta.unitId,
        unitLabel: meta.unitLabel,
        chapterLabel: meta.chapterLabel,
        nickname: state?.participant?.nickname || "",
        signedIn: isSignedInNow(),
        locked,
        pendingSupport: Boolean(proactiveDecision && !locked && isSignedInNow()
          && proactiveDecision.unitId === meta.unitId
          && (!proactiveStudyManaged(meta) || proactiveDecision.serverIssued === true)),
        noteSyncLabel: noteSyncState === "synced" ? "已同步" : noteSyncState === "syncing"
          ? "同步中" : ["error", "pending"].includes(noteSyncState) ? "同步未完成，本机保留" : "本机记录",
        notes: locked || !isSignedInNow() ? [] : Notes.notesFor(localStorage, {
          ownerKey: noteOwnerKey(), unitId: meta.unitId
        })
      };
    },
    editWorkspaceNote(noteId = "") {
      const meta = courseMeta();
      if (!isSignedInNow() || !meta.unitId || quizAssistantLocked(meta)
        || proactiveStudy.agentAssistanceBlocked || activeProactiveOutcomeSession()) return false;
      const note = noteId ? Notes.notesFor(localStorage, {
        ownerKey: noteOwnerKey(), unitId: meta.unitId
      }).find((entry) => entry.id === noteId) : null;
      if (noteId && !note) return false;
      const anchor = document.querySelector("#workspace-note-new") || els.launcher;
      const contextRef = Core.normalizeContextRef(note?.contextRef || {
        kind: "text",
        scope: "slide",
        label: meta.unitLabel,
        excerpt: meta.unitLabel,
        confidence: "low",
        coarse: true
      }, meta);
      showNoteEditor({
        contextRef,
        workspace: true,
        locator: note?.locator,
        rect: anchor.getBoundingClientRect(),
        source: note?.locator?.source || "document"
      }, note);
      return true;
    },
    resetLearningGeneration() {
      const ownerKey = noteOwnerKey();
      Notes.clearOwnerNotes?.(localStorage, ownerKey);
      localStorage.removeItem(`${NOTE_MIGRATION_STORAGE_PREFIX}${ownerKey}`);
      localStorage.removeItem(`${NOTE_PENDING_STORAGE_PREFIX}${ownerKey}`);
      noteSyncRequestId += 1;
      activeConversationId = "";
      conversations = [];
      messages = [];
      noteSyncState = "local";
      syncNoteHighlights();
      render();
    },
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    ask(question = "") {
      els.input.value = String(question || "");
      resizeComposer();
      setOpen(true);
      return submitQuestion();
    },
    outcomeNavigationAction: proactiveOutcomeNavigationAction,
    openOutcomeStage: openProactiveOutcomeStage,
    useContext,
    saveSelectionNote,
    syncFullscreenHost
  });

  syncFullscreenHost();
  applyLauncherPlacement();
  setupLauncherDrag();
  setupPanelDrag();
  applyPanelPosition();
  render();
  scheduleSync();
  global.dispatchEvent(new CustomEvent("cq:knowledge-assistant-ready"));
})(window);
