(function initKnowledgeAssistant(global) {
  const Core = global.CoursewareContextCore;
  const Notes = global.LearningNotesCore;
  const root = document.querySelector("#knowledge-assistant-root");
  if (!Core || !Notes || !root) return;

  const OPEN_STORAGE_KEY = "calculus-quest-knowledge-assistant-open-v1";
  const LAUNCHER_STORAGE_KEY = "calculus-quest-knowledge-launcher-v1";
  const PANEL_STORAGE_KEY = "calculus-quest-knowledge-panel-position-v1";
  const QUIZ_LOCKED_MESSAGE = "提交本次测验后即可使用知点复盘。";
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
  let editingNoteId = "";
  let selectedNoteColor = "amber";
  let provider = { id: "mock", live: false, label: "本地引导" };
  let quota = { limit: 30, used: 0, remaining: 30, usageDate: "" };
  let launcherPlacement = Core.normalizeLauncherPlacement();
  let panelPosition = null;
  let suppressLauncherClickUntil = 0;

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
          <button type="button" data-knowledge-history-new>创建新对话</button>
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
        <button type="button" data-note-color="mint" aria-label="薄荷色划线" aria-pressed="false"></button>
        <button type="button" data-note-color="blue" aria-label="天空蓝划线" aria-pressed="false"></button>
        <button type="button" data-note-color="pink" aria-label="樱粉色划线" aria-pressed="false"></button>
      </fieldset>
      <footer>
        <small>Ctrl + Enter 保存 · 仅当前浏览器可见</small>
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
    panel: root.querySelector("[data-knowledge-assistant-panel], #knowledge-assistant-panel"),
    panelDragbar: root.querySelector("[data-knowledge-panel-dragbar]"),
    scroll: root.querySelector("[data-knowledge-scroll]"),
    close: root.querySelector("[data-knowledge-close]"),
    newConversation: root.querySelector("[data-knowledge-new-conversation]"),
    historyToggle: root.querySelector("[data-knowledge-history-toggle]"),
    provider: root.querySelector("[data-knowledge-provider]"),
    unit: root.querySelector("[data-knowledge-unit]"),
    unitDetail: root.querySelector("[data-knowledge-unit-detail]"),
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
    noteSave: root.querySelector("[data-knowledge-note-save]")
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
      quizSubmitted,
      isQuiz: unit?.type === "quiz",
      supported
    };
  }

  function quizAssistantLocked(meta = courseMeta()) {
    return Boolean(meta?.isQuiz && !meta.quizSubmitted);
  }

  function renderLauncherAvailability(meta = courseMeta()) {
    const quizLocked = quizAssistantLocked(meta);
    root.classList.toggle("is-quiz-locked", quizLocked);
    els.launcher.setAttribute("aria-disabled", quizLocked ? "true" : "false");
    els.launcher.setAttribute("aria-label", quizLocked ? "知点将在提交测验后解锁" : "打开知点");
    els.launcher.setAttribute("title", quizLocked ? QUIZ_LOCKED_MESSAGE : "打开知点：围绕当前课件提问");
    els.launcherSubtitle.textContent = quizLocked ? "提交测验后解锁" : "陪你理清眼前这一处";
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
    if (!panelIsDesktop()) {
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

  function setOpen(next, options = {}) {
    const nextOpen = Boolean(next);
    if (nextOpen && quizAssistantLocked()) {
      setStatus(QUIZ_LOCKED_MESSAGE, "warning");
      renderLauncherAvailability();
      return false;
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
    if (isOpen && options.focus !== false) {
      window.setTimeout(() => composerFocusTarget()?.focus({ preventScroll: true }), 180);
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
    return notes;
  }

  function renderProvider() {
    els.provider.textContent = provider.label || (provider.live ? "AI 助教" : "本地引导");
    els.provider.dataset.live = provider.live ? "true" : "false";
    els.provider.title = provider.live
      ? "已配置真实模型服务；首次提问会验证连接"
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "knowledge-conversation-card";
    button.dataset.conversationId = conversation.id;
    button.classList.toggle("is-active", conversation.id === activeConversationId);
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
    return button;
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
      empty.innerHTML = "<strong>这里还没有历史对话</strong><span>提出第一个问题后，会按对话整理在这里。</span>";
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
    els.historyToggle.setAttribute("aria-pressed", historyActive ? "true" : "false");
    els.historyToggle.setAttribute("aria-label", historyActive ? "返回当前对话" : "查看历史对话");
    els.historyToggle.title = historyActive ? "返回当前对话" : "查看历史对话";
    renderConversations();
  }

  function renderQuickQuestions() {
    const meta = courseMeta();
    els.quick.replaceChildren();
    if (quizAssistantLocked(meta)) {
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
        els.input.value = question;
        resizeComposer();
        submitQuestion();
      });
      els.quick.appendChild(button);
    });
  }

  function messageNode(message) {
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
    body.textContent = message.content || (message.streaming ? "正在组织解释…" : "");
    article.append(heading, body);
    return article;
  }

  function renderMessages() {
    const scrollViewport = els.scroll || els.messages;
    const nearBottom = scrollViewport.scrollHeight - scrollViewport.scrollTop - scrollViewport.clientHeight < 120;
    els.messages.replaceChildren();
    if (!messages.length && !loadingHistory) {
      els.messages.appendChild(els.empty);
      els.empty.hidden = false;
    } else if (loadingHistory && !messages.length) {
      const loading = document.createElement("div");
      loading.className = "knowledge-history-loading";
      loading.innerHTML = "<span></span><span></span><span></span><p>正在恢复这个知识点的提问记录</p>";
      els.messages.appendChild(loading);
    } else {
      messages.forEach((message) => els.messages.appendChild(messageNode(message)));
    }
    if (nearBottom || isAsking) {
      window.requestAnimationFrame(() => {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      });
    }
  }

  function renderUnit() {
    const meta = courseMeta();
    const quizLocked = quizAssistantLocked(meta);
    renderLauncherAvailability(meta);
    els.unit.textContent = meta.knowledgePointLabel || meta.unitLabel || "等待课件加载";
    els.unitDetail.textContent = meta.sceneType
      ? `${currentSceneLabel(meta)}，对话会保存在这个知识点下`
      : meta.isQuiz
        ? meta.quizSubmitted
          ? "已提交，可以围绕题目、错因和解法继续复盘"
          : QUIZ_LOCKED_MESSAGE
        : "可直接提问，也可以先选择课件中的文字、公式或对象";
    els.quizPolicy.hidden = !quizLocked;
    root.classList.toggle("is-unavailable", !meta.supported || !isSignedInNow());
    els.input.disabled = !meta.supported || !isSignedInNow() || quizLocked;
    els.input.placeholder = quizLocked
      ? "提交测验后可继续提问"
      : "例如：为什么 h 变小时，割线更接近切线？";
    els.send.disabled = els.input.disabled || isAsking || (provider.live && quota.remaining <= 0);
    els.pick.disabled = !meta.supported || !isSignedInNow() || quizLocked;
    els.selectionAsk.disabled = quizLocked;
    els.selectionAsk.title = quizLocked ? QUIZ_LOCKED_MESSAGE : "围绕选中内容询问知点";
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
    if (!Notes.removeNote(localStorage, removedId, noteOwnerKey())) return;
    hideSelectionAction();
    syncNoteHighlights();
    track("knowledge_note_removed", { noteId: removedId });
  }

  function useContext(ref, source = "selection") {
    if (quizAssistantLocked()) return false;
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
      const response = await fetch(`api/learning/assistant/conversations?${assistantParams(meta)}`, {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "历史对话加载失败。");
      provider = payload.provider || provider;
      applyQuota(payload.quota);
      conversations = Array.isArray(payload.conversations) ? payload.conversations : [];
      if (!conversations.some((item) => item.id === activeConversationId)) {
        activeConversationId = conversations[0]?.id || "";
      }
      if (options.loadActive !== false && activeConversationId) {
        await loadHistory(meta, activeConversationId);
      } else if (!activeConversationId) {
        messages = [];
      }
    } catch (error) {
      conversations = [];
      activeConversationId = "";
      messages = [];
      setStatus(error.message || "历史对话暂时不可用。", "error");
    } finally {
      loadingConversations = false;
      render();
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
      messages = (payload.messages || []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        provider: message.provider || "",
        createdAt: message.createdAt || ""
      }));
      activeWorkspace = "chat";
      setStatus(messages.length ? "已打开这段对话，可以继续追问。" : "");
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
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "meta") {
      provider = event.provider || provider;
      activeConversationId = event.conversationId || activeConversationId;
      applyQuota(event.quota);
      currentQuizSubmitted = Boolean(event.quizSubmitted);
      renderProvider();
      renderQuota();
      return;
    }
    if (event.type === "delta") {
      assistantMessage.content += event.delta || "";
      renderMessages();
      return;
    }
    if (event.type === "done") {
      assistantMessage.id = event.message?.id || assistantMessage.id;
      assistantMessage.provider = event.message?.provider || "";
      assistantMessage.streaming = false;
      if (!assistantMessage.content) assistantMessage.content = event.message?.content || "";
      if (event.fallback) {
        provider = { id: "fallback", live: false, label: "本地引导" };
        renderProvider();
        setStatus("模型服务暂时不可用，已切换到本地引导。", "warning");
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
    }
  }

  async function readNdjson(response, assistantMessage) {
    if (!response.body?.getReader) {
      const text = await response.text();
      text.split(/\r?\n/).forEach((line) => parseStreamLine(line, assistantMessage));
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach((line) => parseStreamLine(line, assistantMessage));
      if (done) break;
    }
    if (buffer.trim()) parseStreamLine(buffer, assistantMessage);
  }

  async function submitQuestion() {
    const meta = courseMeta();
    const question = els.input.value.trim();
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
    if (provider.live && quota.remaining <= 0) {
      setStatus("今天的知点额度已用完，明天可以继续提问。", "warning");
      return;
    }
    activeRequest?.abort();
    activeRequest = new AbortController();
    isAsking = true;
    const userMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: question,
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
        body: JSON.stringify({
          chapterId: meta.chapterId,
          unitId: meta.unitId,
          sceneType: meta.sceneType,
          conversationId: activeConversationId,
          question,
          contextRef: activeContext || {
            kind: "unit",
            scope: meta.isQuiz ? "quiz" : "lesson",
            chapterId: meta.chapterId,
            unitId: meta.unitId,
            unitLabel: meta.unitLabel,
            knowledgePointId: meta.knowledgePointId,
            knowledgePointLabel: meta.knowledgePointLabel
          }
        }),
        signal: activeRequest.signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        applyQuota(payload.quota);
        throw new Error(payload.message || "知点暂时没有接通，请稍后再试。");
      }
      await readNdjson(response, assistantMessage);
      assistantMessage.streaming = false;
      setStatus("可以继续追问；对话会保存在这个知识点下。");
      track("knowledge_answer_received", {
        provider: assistantMessage.provider || provider.id,
        answerLength: assistantMessage.content.length
      });
    } catch (error) {
      if (error.name === "AbortError") return;
      assistantMessage.streaming = false;
      assistantMessage.error = true;
      assistantMessage.content = error.message || "知点暂时没有接通，请稍后再试。";
      setStatus(assistantMessage.content, "error");
      renderMessages();
    } finally {
      isAsking = false;
      activeRequest = null;
      renderUnit();
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

    if (quizAssistantLocked(meta)) {
      if (isOpen) setOpen(false, { focus: false });
      if (CoursewareContext.getPickState().phase === "picking") {
        CoursewareContext.cancelObjectPick("quiz-lock");
      }
    }

    if (unitChanged || participantChanged || supportChanged) {
      activeRequest?.abort();
      activeRequest = null;
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
      hideSelectionAction();
      if (participantChanged) {
        CoursewareContext.clearContext();
        CoursewareContext.cancelObjectPick("participant-change");
      } else {
        CoursewareContext.syncUnit();
      }
      window.requestAnimationFrame(syncNoteHighlights);
      loadConversations(meta);
      return;
    }

    if (sceneChanged) {
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
  els.input.addEventListener("input", resizeComposer);
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
    hideSelectionAction();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || (els.selectionToolbar.hidden && els.noteEditor.hidden)) return;
    hideSelectionAction();
  });
  window.addEventListener("resize", () => {
    hideSelectionAction();
    applyLauncherPlacement();
    applyPanelPosition();
  });
  window.addEventListener("cq:lesson-rendered", scheduleSync);

  const lessonPlayer = document.querySelector("#lesson-player");
  const observer = lessonPlayer && typeof MutationObserver !== "undefined"
    ? new MutationObserver(scheduleSync)
    : null;
  observer?.observe(lessonPlayer, { childList: true, subtree: true });

  global.KnowledgeAssistant = Object.freeze({
    sync,
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
    useContext,
    saveSelectionNote
  });

  applyLauncherPlacement();
  setupLauncherDrag();
  setupPanelDrag();
  applyPanelPosition();
  render();
  scheduleSync();
  global.dispatchEvent(new CustomEvent("cq:knowledge-assistant-ready"));
})(window);
