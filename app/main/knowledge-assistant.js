(function initKnowledgeAssistant(global) {
  const Core = global.CoursewareContextCore;
  const root = document.querySelector("#knowledge-assistant-root");
  if (!Core || !root) return;

  const OPEN_STORAGE_KEY = "calculus-quest-knowledge-assistant-open-v1";
  let isOpen = false;
  let isAsking = false;
  let loadingHistory = false;
  let activeContext = null;
  let recentInteraction = null;
  let pendingSelection = null;
  let currentUnitKey = "";
  let currentSceneType = "";
  let currentQuizSubmitted = false;
  let currentParticipantId = "";
  let historyRequestId = 0;
  let activeRequest = null;
  let syncTimer = null;
  let messages = [];
  let provider = { id: "mock", live: false, label: "本地引导" };

  try {
    isOpen = localStorage.getItem(OPEN_STORAGE_KEY) === "1";
  } catch {}

  root.innerHTML = `
    <button class="knowledge-assistant-launcher" type="button" data-knowledge-open aria-controls="knowledge-assistant-panel" aria-expanded="false">
      <span class="knowledge-pin" aria-hidden="true"><i></i></span>
      <span><strong>知点</strong><small>指着课件问明白</small></span>
    </button>

    <section class="knowledge-assistant-panel" id="knowledge-assistant-panel" aria-label="知点上下文学习侧栏" aria-hidden="true">
      <header class="knowledge-assistant-header">
        <div class="knowledge-assistant-brand">
          <span class="knowledge-pin large" aria-hidden="true"><i></i></span>
          <div>
            <strong>知点</strong>
            <small>指着课件问明白</small>
          </div>
        </div>
        <div class="knowledge-assistant-header-actions">
          <span class="knowledge-provider-badge" data-knowledge-provider>本地引导</span>
          <button type="button" class="knowledge-icon-button" data-knowledge-close aria-label="关闭知点侧栏">×</button>
        </div>
      </header>

      <div class="knowledge-assistant-unit">
        <span>当前知识点</span>
        <strong data-knowledge-unit>等待课件加载</strong>
        <small data-knowledge-unit-detail>打开 Quiz、Slide 或互动课件后即可提问。</small>
      </div>

      <div class="knowledge-quiz-policy" data-knowledge-quiz-policy hidden>
        <span aria-hidden="true">!</span>
        <p><strong>测验进行中</strong>我可以解释题意、检查思路或给提示，但不会直接给答案。</p>
      </div>

      <section class="knowledge-context-card" data-knowledge-context hidden>
        <div class="knowledge-context-heading">
          <span><i class="knowledge-pin mini" aria-hidden="true"></i> 正在问</span>
          <div>
            <button type="button" data-knowledge-restore>定位</button>
            <button type="button" data-knowledge-clear-context aria-label="清除当前选区">×</button>
          </div>
        </div>
        <strong data-knowledge-context-title></strong>
        <blockquote data-knowledge-context-copy></blockquote>
        <small data-knowledge-context-confidence></small>
      </section>

      <section class="knowledge-operation-echo" data-knowledge-echo hidden>
        <div>
          <span>操作回声</span>
          <strong data-knowledge-echo-title></strong>
          <small data-knowledge-echo-copy></small>
        </div>
        <button type="button" data-knowledge-use-echo>就这个变化问</button>
      </section>

      <div class="knowledge-assistant-tools">
        <button type="button" class="knowledge-pick-button" data-knowledge-pick>
          <span class="knowledge-crosshair" aria-hidden="true"></span>
          <span data-knowledge-pick-label>指着问</span>
        </button>
        <p>文字和公式可直接选择；图形、选项和互动对象用一次性“指着问”。</p>
      </div>

      <div class="knowledge-quick-questions" data-knowledge-quick aria-label="快捷问题"></div>

      <div class="knowledge-message-list" data-knowledge-messages role="log" aria-live="polite" aria-relevant="additions text">
        <div class="knowledge-empty-state" data-knowledge-empty>
          <span class="knowledge-pin empty" aria-hidden="true"><i></i></span>
          <strong>卡在哪里，就从哪里问</strong>
          <p>你可以不选任何内容，直接围绕当前知识点提问。</p>
        </div>
      </div>

      <form class="knowledge-composer" data-knowledge-form>
        <label for="knowledge-question-input">输入你的问题</label>
        <div>
          <textarea id="knowledge-question-input" data-knowledge-input rows="1" maxlength="1200" placeholder="例如：为什么 h 变小会更接近切线？"></textarea>
          <button type="submit" data-knowledge-send aria-label="发送问题">↑</button>
        </div>
        <small data-knowledge-status>回答会结合当前知识点和你选中的课件位置。</small>
      </form>
    </section>

    <div class="knowledge-pick-notice" data-knowledge-pick-notice hidden role="status">
      <span class="knowledge-crosshair" aria-hidden="true"></span>
      <p><strong>选择你想问的地方</strong><small>这次点击只选择，不会操作课件 · Esc 退出</small></p>
      <button type="button" data-knowledge-cancel-pick>取消</button>
    </div>

    <button class="knowledge-selection-action" type="button" data-knowledge-selection-action hidden>
      <span class="knowledge-pin mini" aria-hidden="true"></span>
      问这里
    </button>
  `;

  const els = {
    launcher: root.querySelector("[data-knowledge-open]"),
    panel: root.querySelector("[data-knowledge-assistant-panel], #knowledge-assistant-panel"),
    close: root.querySelector("[data-knowledge-close]"),
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
    form: root.querySelector("[data-knowledge-form]"),
    input: root.querySelector("[data-knowledge-input]"),
    send: root.querySelector("[data-knowledge-send]"),
    status: root.querySelector("[data-knowledge-status]"),
    pickNotice: root.querySelector("[data-knowledge-pick-notice]"),
    cancelPick: root.querySelector("[data-knowledge-cancel-pick]"),
    selectionAction: root.querySelector("[data-knowledge-selection-action]")
  };

  function isSignedInNow() {
    return typeof isSignedIn === "function" && isSignedIn();
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

  function setStatus(message = "", tone = "") {
    els.status.textContent = message || "回答会结合当前知识点和你选中的课件位置。";
    els.status.dataset.tone = tone;
  }

  function setOpen(next, options = {}) {
    isOpen = Boolean(next);
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
    if (isOpen && options.focus !== false) {
      window.setTimeout(() => els.input.focus({ preventScroll: true }), 180);
    }
    track(isOpen ? "knowledge_assistant_open" : "knowledge_assistant_close");
  }

  function contextCopy(ref) {
    if (!ref) return "";
    if (ref.kind === "interaction" && ref.state) {
      const values = [ref.state.oldValue, ref.state.newValue].filter((value) => value !== "");
      return values.length
        ? `${ref.state.parameter || "参数"}：${values.join(" → ")}`
        : ref.state.action || ref.label;
    }
    if (ref.latex) return ref.latex;
    return ref.excerpt || ref.label || "";
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
    const stateValue = ref?.state || {};
    const values = [stateValue.oldValue, stateValue.newValue].filter((value) => value !== "");
    return values.length ? values.join(" → ") : stateValue.action || "已记录最近一次参数变化";
  }

  function renderEcho() {
    const ref = recentInteraction && recentInteraction.unitId === courseMeta().unitId
      ? recentInteraction
      : null;
    els.echo.hidden = !ref || activeContext?.createdAt === ref.createdAt;
    if (!ref) return;
    els.echoTitle.textContent = `刚才调整了：${ref.state?.parameter || ref.label || "参数"}`;
    els.echoCopy.textContent = echoSummary(ref);
  }

  function renderProvider() {
    els.provider.textContent = provider.label || (provider.live ? "AI 助教" : "本地引导");
    els.provider.dataset.live = provider.live ? "true" : "false";
    els.provider.title = provider.live
      ? "当前已连接真实模型服务"
      : "当前使用本地确定性引导，不冒充真实大模型";
  }

  function renderQuickQuestions() {
    const meta = courseMeta();
    const suggestions = Core.suggestionsForContext({
      ...(activeContext || {}),
      scope: meta.isQuiz ? "quiz" : activeContext?.scope,
      quizSubmitted: meta.quizSubmitted
    });
    els.quick.replaceChildren();
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
    const nearBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 120;
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
        els.messages.scrollTop = els.messages.scrollHeight;
      });
    }
  }

  function renderUnit() {
    const meta = courseMeta();
    els.unit.textContent = meta.knowledgePointLabel || meta.unitLabel || "等待课件加载";
    els.unitDetail.textContent = meta.sceneType
      ? `${meta.resourceTitle || "当前互动场景"} · 对话按知识点保留`
      : meta.isQuiz
        ? `${meta.quizSubmitted ? "已提交，可进行完整复盘" : "未提交，只提供思路与提示"} · 对话按本测验保留`
        : "可直接提问，也可以先选择课件中的文字、公式或对象";
    els.quizPolicy.hidden = !(meta.isQuiz && !meta.quizSubmitted);
    root.classList.toggle("is-unavailable", !meta.supported || !isSignedInNow());
    els.input.disabled = !meta.supported || !isSignedInNow();
    els.send.disabled = els.input.disabled || isAsking;
    els.pick.disabled = !meta.supported || !isSignedInNow();
  }

  function render() {
    root.classList.toggle("is-open", isOpen);
    renderProvider();
    renderUnit();
    renderContext();
    renderEcho();
    renderQuickQuestions();
    renderMessages();
  }

  function hideSelectionAction() {
    pendingSelection = null;
    els.selectionAction.hidden = true;
  }

  function showSelectionAction(payload) {
    if (!payload?.contextRef || !payload.rect) return;
    pendingSelection = payload.contextRef;
    const rect = payload.rect;
    const width = 104;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, Number(rect.left || 0) + Number(rect.width || 0) / 2 - width / 2));
    const top = Math.max(8, Math.min(window.innerHeight - 52, Number(rect.bottom || rect.top || 0) + 9));
    els.selectionAction.style.left = `${Math.round(left)}px`;
    els.selectionAction.style.top = `${Math.round(top)}px`;
    els.selectionAction.hidden = false;
  }

  function useContext(ref, source = "selection") {
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
  }

  function handlePickingChange(payload) {
    const active = Boolean(payload?.active);
    root.classList.toggle("is-picking", active);
    els.pickNotice.hidden = !active;
    els.pick.classList.toggle("active", active);
    els.pickLabel.textContent = active ? "取消指着问" : "指着问";
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
    onTextSelection: showSelectionAction
  });

  global.CoursewareContext = CoursewareContext;

  async function loadHistory(meta = courseMeta()) {
    const requestId = ++historyRequestId;
    if (!meta.unitId || !meta.supported || !isSignedInNow()) {
      messages = [];
      loadingHistory = false;
      render();
      return;
    }
    loadingHistory = true;
    messages = [];
    renderMessages();
    const params = new URLSearchParams({
      chapterId: meta.chapterId,
      unitId: meta.unitId,
      sceneType: meta.sceneType || ""
    });
    try {
      const response = await fetch(`/api/learning/assistant/history?${params}`, {
        headers: { Authorization: `Bearer ${state.authToken}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== historyRequestId) return;
      if (!response.ok || payload.ok === false) throw new Error(payload.message || "提问记录加载失败。");
      provider = payload.provider || provider;
      currentQuizSubmitted = Boolean(payload.quizSubmitted);
      messages = (payload.messages || []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        provider: message.provider || "",
        createdAt: message.createdAt || ""
      }));
      setStatus(messages.length ? "已恢复这个知识点的提问记录。" : "");
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
      currentQuizSubmitted = Boolean(event.quizSubmitted);
      renderProvider();
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
      if (event.fallback) setStatus("模型服务暂时不可用，已切换到本地引导。", "warning");
      renderMessages();
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
      const response = await fetch("/api/learning/assistant/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.authToken}`
        },
        body: JSON.stringify({
          chapterId: meta.chapterId,
          unitId: meta.unitId,
          sceneType: meta.sceneType,
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

    if (unitChanged || participantChanged) {
      activeRequest?.abort();
      activeRequest = null;
      currentParticipantId = nextParticipantId;
      currentUnitKey = nextUnitKey;
      currentSceneType = meta.sceneType;
      currentQuizSubmitted = meta.quizSubmitted;
      activeContext = null;
      recentInteraction = null;
      hideSelectionAction();
      if (participantChanged) {
        CoursewareContext.clearContext();
        CoursewareContext.cancelObjectPick("participant-change");
      } else {
        CoursewareContext.syncUnit();
      }
      loadHistory(meta);
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
    }

    if (quizStateChanged) {
      currentQuizSubmitted = meta.quizSubmitted;
      loadHistory(meta);
      return;
    }
    render();
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, 80);
  }

  els.launcher.addEventListener("click", () => setOpen(true));
  els.close.addEventListener("click", () => setOpen(false));
  els.pick.addEventListener("click", () => {
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
  els.selectionAction.addEventListener("pointerdown", (event) => event.preventDefault());
  els.selectionAction.addEventListener("click", () => {
    if (pendingSelection) useContext(pendingSelection, "text-selection");
    window.getSelection?.()?.removeAllRanges?.();
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
    if (!els.selectionAction.hidden && !els.selectionAction.contains(event.target)) hideSelectionAction();
  }, true);
  window.addEventListener("scroll", hideSelectionAction, true);
  window.addEventListener("resize", hideSelectionAction);
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
    useContext
  });

  render();
  scheduleSync();
  global.dispatchEvent(new CustomEvent("cq:knowledge-assistant-ready"));
})(window);
