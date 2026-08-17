// Learning shell, player, lesson, and resource rendering.
let slideCanvasResizeObserver = null;
let learningCanvasResizeObserver = null;
let learningCanvasLayoutFrame = null;
let learningCanvasLayoutSettleTimer = null;
let learningCanvasLayoutSyncReady = false;
let learningCanvasLastSize = "";
const COURSEWARE_BRIDGE_INTERACTION_EVENTS = new Set([
  "interactive_click",
  "interactive_change",
  "interactive_submit",
  "interactive_drag_end",
  "parameter_change",
  "parameter_commit"
]);
const COURSEWARE_LEARNING_EVENT_TYPES = Object.freeze({
  page_loaded: "courseware_page_loaded",
  pre_check_submitted: "courseware_pre_check_submitted",
  prediction_made: "courseware_prediction_made",
  interaction_change: "courseware_interaction_change",
  hint_used: "courseware_hint_used",
  observable_evidence_captured: "courseware_observable_evidence_captured",
  short_explanation_submitted: "courseware_short_explanation_submitted",
  formative_check_submitted: "courseware_formative_check_submitted",
  interaction_complete: "courseware_interaction_complete",
  challenge_result: "courseware_challenge_result",
  exit_ticket_submitted: "courseware_exit_ticket_submitted",
  confidence_rating: "courseware_confidence_submitted",
  confidence_submitted: "courseware_confidence_submitted",
  reflection_submitted: "courseware_reflection_submitted",
  page_summary_shown: "courseware_page_summary_shown"
});
const COURSEWARE_LEARNING_EVENT_KEYS = new Set([
  "lesson_id",
  "module_id",
  "course_version",
  "concept_tag",
  "event_type",
  "phase",
  "timestamp",
  "time_on_task_ms",
  "interaction_state",
  "pre_check_score",
  "formative_score",
  "exit_ticket_score",
  "next_recommendation",
  "check_id",
  "question_id",
  "attempt_id",
  "attempt_number",
  "is_correct",
  "score",
  "max_score",
  "hint_type",
  "confidence",
  "reflection",
  "prediction",
  "response",
  "answer",
  "choice",
  "completed",
  "challenge_id",
  "result"
]);

function sanitizeCoursewareLearningValue(value, depth = 0) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.replace(/\u0000/g, "").trim().slice(0, 1200);
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((item) => sanitizeCoursewareLearningValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  const result = {};
  Object.entries(value).slice(0, 40).forEach(([key, item]) => {
    const safeKey = String(key || "").trim().slice(0, 80);
    if (!safeKey) return;
    const safeValue = sanitizeCoursewareLearningValue(item, depth + 1);
    if (safeValue !== undefined) result[safeKey] = safeValue;
  });
  return result;
}

function sanitizeCoursewareLearningEvent(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const result = {};
  COURSEWARE_LEARNING_EVENT_KEYS.forEach((key) => {
    if (source[key] === undefined) return;
    const value = sanitizeCoursewareLearningValue(source[key]);
    if (value !== undefined) result[key] = value;
  });
  return result;
}

function coursewareFrameUrl(path) {
  const url = resourceUrl(path);
  const version = typeof CoursewareContextCore !== "undefined"
    ? CoursewareContextCore.BRIDGE_VERSION
    : "";
  if (!version) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}cqContextBridge=${encodeURIComponent(version)}`;
}

function learningCanvasLayoutDetail(reason = "layout-change") {
  const player = els?.lessonPlayer || document.querySelector("#lesson-player");
  const shell = player?.closest?.(".learning-shell");
  const rect = player?.getBoundingClientRect?.();
  return {
    reason,
    width: Math.max(0, Math.round(rect?.width || player?.clientWidth || 0)),
    height: Math.max(0, Math.round(rect?.height || player?.clientHeight || 0)),
    lessonCollapsed: Boolean(shell?.classList?.contains("lesson-collapsed")),
    chapterCollapsed: Boolean(shell?.classList?.contains("chapter-collapsed")),
    timestamp: Date.now()
  };
}

function syncLearningCanvasLayout(reason = "layout-change") {
  const player = els?.lessonPlayer || document.querySelector("#lesson-player");
  if (!player?.isConnected) return null;

  player.querySelectorAll("[data-slide-canvas]").forEach(syncSlideCanvasScale);
  const detail = learningCanvasLayoutDetail(reason);

  player.querySelectorAll("iframe.embed-frame, iframe[data-courseware-frame]").forEach((frame) => {
    const rect = frame.getBoundingClientRect();
    const viewport = {
      width: Math.max(0, Math.round(rect.width || frame.clientWidth || 0)),
      height: Math.max(0, Math.round(rect.height || frame.clientHeight || 0))
    };
    frame.dataset.hostLayoutWidth = String(viewport.width);
    frame.dataset.hostLayoutHeight = String(viewport.height);
    frame.dataset.hostLayoutReason = reason;
    try {
      frame.contentWindow?.postMessage({
        type: "cq:host-layout",
        ...detail,
        viewport
      }, "*");
    } catch {}
  });

  window.dispatchEvent(new CustomEvent("cq:learning-canvas-layout", { detail }));
  return detail;
}

function scheduleLearningCanvasLayoutSync(reason = "layout-change") {
  if (typeof window === "undefined") return;
  if (learningCanvasLayoutFrame !== null) {
    window.cancelAnimationFrame(learningCanvasLayoutFrame);
  }
  learningCanvasLayoutFrame = window.requestAnimationFrame(() => {
    learningCanvasLayoutFrame = null;
    syncLearningCanvasLayout(reason);
  });

  window.clearTimeout(learningCanvasLayoutSettleTimer);
  learningCanvasLayoutSettleTimer = window.setTimeout(() => {
    syncLearningCanvasLayout(`${reason}:settled`);
  }, 220);
}

function trackCoursewareBridgeInteraction(frame, message = {}) {
  const eventType = String(message.eventType || "");
  if (!COURSEWARE_BRIDGE_INTERACTION_EVENTS.has(eventType)) return false;
  const unitId = frame.closest?.("[data-resource-unit]")?.dataset?.resourceUnit || currentUnitId || "";
  const unit = getUnit(unitId);
  const contextRef = message.contextRef && typeof message.contextRef === "object"
    ? message.contextRef
    : {};
  const payload = message.payload && typeof message.payload === "object"
    ? message.payload
    : {};
  const stateValue = contextRef.state && typeof contextRef.state === "object"
    ? contextRef.state
    : null;
  trackInteraction(eventType, {
    ...payload,
    persist: message.persist !== false,
    source: "iframe",
    unitId: unit?.id || unitId,
    unitLabel: unit?.label || "",
    chapterId: unit?.chapterId || currentChapterId || "",
    semanticId: contextRef.semanticId || "",
    label: contextRef.label || payload.label || "",
    value: stateValue,
    durationMs: Number(payload.durationMs || 0)
  });
  return true;
}

function trackCoursewareLearningEvent(frame, message = {}) {
  const raw = message.payload && typeof message.payload === "object"
    ? message.payload
    : {};
  const sourceType = String(raw.event_type || raw.eventType || "").trim().toLowerCase();
  const eventType = COURSEWARE_LEARNING_EVENT_TYPES[sourceType];
  if (!eventType) return false;
  const unitId = frame.closest?.("[data-resource-unit]")?.dataset?.resourceUnit || currentUnitId || "";
  const unit = getUnit(unitId);
  const payload = sanitizeCoursewareLearningEvent(raw);
  trackInteraction(eventType, {
    source: "courseware_semantic",
    unitId: unit?.id || unitId,
    unitLabel: unit?.label || "",
    chapterId: unit?.chapterId || currentChapterId || "",
    sceneType: frame.dataset.contextSceneType || "",
    resourceTitle: frame.title || "",
    coursewareEventType: sourceType,
    ...payload
  });
  return true;
}

function setupLearningCanvasLayoutSync() {
  const player = els?.lessonPlayer || document.querySelector("#lesson-player");
  if (!player) return false;
  if (learningCanvasLayoutSyncReady) {
    scheduleLearningCanvasLayoutSync("layout-sync-refresh");
    return true;
  }

  learningCanvasLayoutSyncReady = true;
  if (typeof ResizeObserver !== "undefined") {
    learningCanvasResizeObserver = new ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === player);
      if (!entry) return;
      const nextSize = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      if (nextSize === learningCanvasLastSize) return;
      learningCanvasLastSize = nextSize;
      scheduleLearningCanvasLayoutSync("learning-player-resize");
    });
    learningCanvasResizeObserver.observe(player);
  }

  window.addEventListener("resize", () => {
    scheduleLearningCanvasLayoutSync("window-resize");
  });
  window.addEventListener("cq:learning-layout-change", (event) => {
    scheduleLearningCanvasLayoutSync(event.detail?.reason || "learning-layout-change");
  });
  window.addEventListener("cq:lesson-rendered", () => {
    scheduleLearningCanvasLayoutSync("lesson-rendered");
  });
  window.addEventListener("message", (event) => {
    const frame = Array.from(
      player.querySelectorAll("iframe.embed-frame, iframe[data-courseware-frame]")
    ).find((candidate) => candidate.contentWindow === event.source);
    if (!frame) return;
    if (event.data?.type === "cq:bridge-ready") {
      scheduleLearningCanvasLayoutSync("courseware-bridge-ready");
      return;
    }
    if (event.data?.type === "cq:interaction") {
      trackCoursewareBridgeInteraction(frame, event.data);
      return;
    }
    if (event.data?.type === "maic_learning_event") {
      trackCoursewareLearningEvent(frame, event.data);
      return;
    }
    if (event.data?.type === "interaction_track") {
      trackCoursewareBridgeInteraction(frame, {
        eventType: event.data.eventType,
        payload: event.data.payload,
        persist: true
      });
    }
  });
  scheduleLearningCanvasLayoutSync("layout-sync-ready");
  return true;
}

function renderMetrics() {
  if (isMultiSceneLearningRoute()) {
    const totals = courseIndex?.totals || {};
    const unitCount = allUnits().length || curriculum.reduce((sum, chapter) => sum + (chapter.units || []).length, 0);
    els.metricChapters.textContent = totals.chapters || curriculum.length || chapters.length;
    els.metricScenes.textContent = unitCount || ((totals.knowledgePoints || 0) + (totals.modules || 0) * 4);
    els.metricGlm.textContent = totals.modules || 0;
    els.metricHtml.textContent = totals.interactionChoices || (totals.knowledgePoints || 0) * routeInteractionTypes().length;
    els.metricAudio.textContent = totals.knowledgePoints || curriculum.flatMap((chapter) => chapter.units || []).filter((unit) => unit.type === "knowledge").length;
    return;
  }
  const totals = courseIndex?.totals;
  const loadedChapters = curriculum.filter((chapter) => chapter.loaded);
  const chapterCount = courseIndex?.chapters?.length || curriculum.length || loadedChapters.length;
  const coreSceneCount = chapterCount * AGENTIC_CORE_SCENE_ORDERS.length;
  const sceneCount = coreSceneCount || loadedChapters.reduce((sum, chapter) => sum + (chapter.units || []).length, 0);
  const adaptiveCount = chapterCount * (AGENTIC_RELEARN_SCENE_ORDERS.length + AGENTIC_EXTENSION_SCENE_ORDERS.length);
  const coreInteractiveCount = chapterCount * AGENTIC_CORE_INTERACTIVE_SCENE_ORDERS.length;
  const htmlCount =
    coreInteractiveCount ||
    loadedChapters.reduce((sum, chapter) => sum + (chapter.allUnits || chapter.units || []).filter((unit) => unit.type === "interactive").length, 0);
  const audioCount = totals?.audio || loadedChapters.reduce((sum, chapter) => sum + countAudio(chapter.manifest), 0);
  els.metricChapters.textContent = curriculum.length;
  els.metricScenes.textContent = sceneCount;
  els.metricGlm.textContent = adaptiveCount;
  els.metricHtml.textContent = htmlCount;
  els.metricAudio.textContent = audioCount;
}

function countAudio(manifest) {
  return manifest.scenes.reduce(
    (sum, scene) => sum + (scene.actions || []).filter((action) => action.audioRef).length,
    0
  );
}

function renderChapters() {
  const chapterEntries = typeof agenticVisibleChaptersForNav === "function"
    ? agenticVisibleChaptersForNav()
    : curriculum.map((chapter, index) => ({ chapter, index }));
  els.chapterList.innerHTML = chapterEntries
    .map(({ chapter, index }) => {
      const done = chapter.units.filter((unit) => state.completed.includes(unit.id)).length;
      const total = chapter.loaded ? chapter.units.length : AGENTIC_CORE_SCENE_ORDERS.length;
      const guide = chapterGuides[chapter.id];
      return `
        <button class="chapter-card ${chapter.id === currentChapterId ? "active" : ""}" type="button" data-chapter="${chapter.id}">
          <span class="chapter-card-top">
            <strong>第 ${index + 1} 章 ${escapeHtml(chapter.label)}</strong>
            ${guide ? `<span>${guide.difficulty}</span>` : ""}
          </span>
          <small>${chapter.loaded ? `${done}/${total} 模块` : `${total} 模块 · 目录待载入`} · ${escapeHtml(chapter.summary)}</small>
          ${guide ? `<small class="chapter-bridge">${escapeHtml(guide.bridge)} · ${guide.pace}</small>` : ""}
        </button>
      `;
    })
    .join("");
}

function renderLessons() {
  const chapter = getChapter();
  els.chapterTitle.textContent = chapter.label;
  if (!chapter.loaded) {
    els.lessonList.innerHTML = '<div class="empty-state">点击左侧章节卡片来加载本章的学习模块，包括讲解页、互动实验和测验。</div>';
    return;
  }
  els.lessonList.innerHTML = chapter.units.map(function(unit, index) {
    const isLocked = typeof agenticIsUnitUnlocked === "function"
      && !agenticIsUnitUnlocked(unit.id)
      && !agenticIsSkipped(unit.id);
    const isSkipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(unit.id);
    const statusText = isLocked ? "待解锁" : isSkipped ? "可回看" : state.completed.includes(unit.id) ? "已完成" : "未完成";
    const lockIcon = isLocked ? " [锁定]" : isSkipped ? " [可回看]" : "";
    const cls = ["lesson-card", unit.id === currentUnitId ? "active" : "", isLocked ? "locked" : ""].filter(Boolean).join(" ");
    const icon = unitIcon(unit);
    return "<button class=\"" + cls + "\" type=\"button\" data-unit=\"" + unit.id + "\"" + (isLocked ? " aria-disabled=\"true\"" : "") + ">"
      + "<span class=\"lesson-card-icon\">" + icon + "</span>"
      + "<span class=\"lesson-card-body\">"
      + "<strong>" + (index + 1) + ". " + escapeHtml(unit.label) + "</strong>"
      + "<small>" + typeText(unit) + " · " + statusText + lockIcon + "</small>"
      + "</span>"
      + "</button>";
  }).join("");
}

function unitIcon(unit) {
  if (unit.type === "quiz") {
    if (unit.assessmentPhase === "pre") return "测";
    if (unit.assessmentPhase === "post") return "后";
    return "练";
  }
  if (unit.type === "knowledge") return "知";
  if (unit.type === "slide") return "读";
  if (unit.type === "interactive") return "互";
  return "学";
}

function typeText(unit) {
  if (unit.type === "quiz") return phaseText(unit.assessmentPhase) || "测验";
  return {
    knowledge: "知识点",
    slide: "讲解",
    interactive: "互动实验"
  }[unit.type] || "学习模块";
}

function unitLearningFocus(unit) {
  if (unit.type === "quiz") {
    return {
      action:
        unit.assessmentPhase === "pre"
          ? "先按直觉作答，不需要提前查公式。"
          : unit.assessmentPhase === "post"
            ? "像一次小通关一样整页完成，再提交。"
            : "把刚学过的想法迁移到题目里，整页完成后再提交。",
      check: "提交前不显示答案；提交后会跳回第一题，逐题复盘答案解析。",
      help: "短答题写出推理过程即可，提交后会进入复核。"
    };
  }

  if (unit.type === "slide") {
    return {
      action: "先抓住这一页想建立的一个核心图像或公式关系。",
      check: "看完后试着用自己的话解释标题里的关键词。",
      help: "可以点「播放全部」听完整旁白，再进入互动实验。"
    };
  }

  if (unit.type === "knowledge") {
    return {
      action: "先看讲解页，再选一种互动场景试一试。",
      check: "四种场景可自由切换，选最顺手的一种即可。",
      help: "有配套资源时会直接加载到下方。"
    };
  }

  return {
    action: "先动手拖拽或点击，观察变量、图像和数值怎样一起变化。",
    check: "不要只看结论，至少做一次反方向操作，比较变化差异。",
    help: "实验页可全屏；做完后用「完成本节」留下学习记录。"
  };
}

function renderPlayer() {
  const unit = getUnit();
  if (!unit) {
    els.lessonType.textContent = "Loading";
    els.lessonTitle.textContent = "正在加载章节";
    els.lessonSummary.textContent = "按章节加载资源，稍等片刻即可开始学习。";
    els.completeLesson.disabled = true;
    els.completeLesson.textContent = "完成本节并跳到下一节";
    renderRecommendationPanel();
    renderLoadingStatus(getChapter()?.label || "课程");
    return;
  }
  if (activeNarration && activeNarration.unitId !== unit.id) stopNarrationQueue();
  currentUnitId = unit.id;
  currentChapterId = unit.chapterId;
  saveState();

  els.lessonType.textContent = typeText(unit);
  els.lessonTitle.innerHTML = renderInlineMath(unit.label);
  els.lessonSummary.innerHTML = renderInlineMath(unit.summary);
  els.completeLesson.disabled = false;
  const chapter = getChapter();
  const unitIdx = chapter.units.findIndex(u => u.id === unit.id);
  const isLastInChapter = unitIdx >= chapter.units.length - 1;
  const chapterIdx = curriculum.findIndex(c => c.id === chapter.id);
  const isLastUnit = isLastInChapter && chapterIdx >= curriculum.length - 1;
  if (isLastUnit) {
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "已完成，记录复习" : "完成本节";
  } else {
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "复习并跳到下一节" : "完成本节并跳到下一节";
  }
  updateFullscreenButton();
  renderRecommendationPanel();

  if (unit.type === "knowledge") {
    renderKnowledgeUnit(unit);
  } else if (unit.scene.type === "quiz") {
    renderQuiz(unit);
  } else if (unit.scene.type === "slide") {
    renderSlide(unit);
  } else {
    renderInteractive(unit);
  }
  renderBottomNextButton();
  if (typeof syncAgenticPlayerCta === "function") syncAgenticPlayerCta(unit);
  if (typeof renderAgenticCoachPanel === "function") renderAgenticCoachPanel();
  syncNarrationUi();
}

function renderCoach(scene, chapterId, unitId) {
  const audioRoot = scene.audioRoot || `open-maic/${chapterId}`;
  const actions = (scene.actions || []).filter((action) => action.text || action.prompt || action.audioRef).slice(0, 8);
  if (!actions.length) return "";
  const audioActions = actions.filter((action) => action.audioRef);
  const collapsed = Boolean(state.narrationCollapsed);
  const sourceNodes = audioActions
    .map((action, index) => `
      <span class="coach-line" data-audio-src="${resourceUrl(`resources/${audioRoot}/${action.audioRef}`)}">
        ${escapeHtml(action.text || action.prompt || `第 ${index + 1} 段语音`)}
      </span>
    `)
    .join("");
  const title = scene.audioTitle || "语音包";

  return `
    <div class="coach-strip ${collapsed ? "collapsed" : ""}" data-coach-strip>
      <div class="coach-strip-header">
        <div>
          <span class="type-pill">语音包</span>
          <strong>${escapeHtml(`${title} · ${audioActions.length} 段可播放`)}</strong>
        </div>
        <button class="button soft" type="button" data-toggle-narration aria-expanded="${collapsed ? "false" : "true"}">
          ${collapsed ? "展开语音包" : "收起语音包"}
        </button>
      </div>
      ${
        audioActions.length
          ? `<div class="coach-toolbar" data-narration-unit="${unitId}" data-narration-total="${audioActions.length}">
              <button class="button soft" type="button" data-play-narration>播放全部</button>
              <button class="button soft" type="button" data-pause-narration>暂停</button>
              <button class="button soft" type="button" data-stop-narration>停止</button>
              <div class="narration-timeline">
                <input class="narration-progress" type="range" min="0" max="1000" value="0" data-narration-seek aria-label="拖动旁白进度" />
                <div class="narration-meta">
                  <span data-narration-time>00:00 / --:--</span>
                  <span data-narration-segment>0/${audioActions.length} 段</span>
                </div>
              </div>
            </div>`
          : ""
      }
      <div class="coach-content narration-sources" data-narration-content ${collapsed ? "hidden" : ""}>${sourceNodes}</div>
    </div>
  `;
}

function knowledgeAudioRoot(unit) {
  const root = unit?.scene?.content?.module?.source?.resourceRoot
    || (unit?.resourceCandidates || unit?.scene?.content?.knowledgePoint?.resourceCandidates || [])[0]?.root
    || "";
  return root || `open-maic/${unit?.chapterId || currentChapterId}`;
}

function knowledgeAudioActions(unit, sceneOrder = null) {
  const root = knowledgeAudioRoot(unit);
  const order = Number(sceneOrder || unit?.scene?.content?.knowledgePoint?.slide?.sceneOrder || 0);
  if (!order) {
    return (unit?.scene?.actions || []).filter((action) => action.audioRef);
  }
  const cached = root && audioMaps.get(root);
  const scene = cached?.scenes?.find((item) => Number(item.order) === order);
  return scene?.actions || [];
}

function loadKnowledgeAudioMap(unit) {
  const root = knowledgeAudioRoot(unit);
  if (!root) return Promise.resolve(null);
  if (audioMaps.has(root)) return Promise.resolve(audioMaps.get(root));
  const cached = audioMapPromises.get(root);
  if (cached) return cached;
  const promise = fetchJson(`/api/course/openmaic-audio-map?root=${root}`, "语音包加载失败")
    .then((data) => {
      audioMaps.set(root, data);
      audioMapPromises.delete(root);
      return data;
    })
    .catch((error) => {
      audioMapPromises.delete(root);
      audioMaps.set(root, { error, scenes: [] });
      throw error;
    });
  audioMapPromises.set(root, promise);
  return promise;
}

function renderKnowledgeAudioPack(unit, options = {}) {
  const slotKey = options.slotKey || "slide";
  const sceneOrder = Number(options.sceneOrder || unit?.scene?.content?.knowledgePoint?.slide?.sceneOrder || 0);
  const title = options.title || "语音包";
  const actions = knowledgeAudioActions(unit, sceneOrder);
  const root = knowledgeAudioRoot(unit);
  const loading = root && audioMapPromises.has(root) && !audioMaps.has(root);
  const failed = root && audioMaps.get(root)?.error;
  const slotAttrs = `class="knowledge-audio-slot" data-knowledge-audio-slot="${escapeHtml(slotKey)}" data-knowledge-audio-unit="${escapeHtml(unit.id)}" data-knowledge-audio-order="${escapeHtml(String(sceneOrder || ""))}" data-knowledge-audio-title="${escapeHtml(title)}"`;
  if (!actions.length) {
    return `
      <div ${slotAttrs}>
        <div class="coach-strip ${state.narrationCollapsed ? "collapsed" : ""}" data-coach-strip>
          <div class="coach-strip-header">
            <div>
              <span class="type-pill">语音包</span>
              <strong>${escapeHtml(failed ? `${title}暂不可用` : loading ? `正在读取${title}` : title)}</strong>
            </div>
            <button class="button soft" type="button" data-toggle-narration aria-expanded="${state.narrationCollapsed ? "false" : "true"}">
              ${state.narrationCollapsed ? "展开语音包" : "收起语音包"}
            </button>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div ${slotAttrs}>
      ${renderCoach(
        {
          ...(unit.scene || {}),
          audioRoot: knowledgeAudioRoot(unit),
          audioTitle: title,
          actions
        },
        unit.chapterId,
        `${unit.id}:${slotKey}`
      )}
    </div>
  `;
}

function refreshKnowledgeAudioPack(unitId = currentUnitId) {
  const unit = getUnit(unitId);
  if (!unit || unit.type !== "knowledge") return;
  const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(unit.id) : String(unit.id).replace(/"/g, '\\"');
  const slots = Array.from(document.querySelectorAll(`[data-knowledge-audio-unit="${safeId}"]`));
  if (!slots.length) return;
  slots.forEach((slot) => {
    slot.outerHTML = renderKnowledgeAudioPack(unit, {
      slotKey: slot.dataset.knowledgeAudioSlot || "slide",
      sceneOrder: Number(slot.dataset.knowledgeAudioOrder || 0),
      title: slot.dataset.knowledgeAudioTitle || "语音包"
    });
  });
  syncNarrationUi();
}

function focusKnowledgeSceneChoicePanel() {
  const panel = document.querySelector("[data-knowledge-scene-panel]");
  if (!panel) return false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  panel.classList.remove("scene-choice-focus");
  void panel.offsetWidth;
  panel.classList.add("scene-choice-focus");
  window.setTimeout(() => {
    panel.querySelector("[data-knowledge-scene]")?.focus({ preventScroll: true });
  }, 320);
  window.setTimeout(() => panel.classList.remove("scene-choice-focus"), 1800);
  return true;
}

function renderResourceShell(unit, title, body, className = "") {
  const isKnowledgeResource = className.split(/\s+/).includes("multi-scene-knowledge-resource");
  const resourceToolbar = isKnowledgeResource
    ? ""
    : `<div class="resource-toolbar">
        <div>
          <span class="type-pill">${typeText(unit)}</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <button class="button soft" type="button" data-resource-fullscreen>全屏</button>
      </div>`;
  return `
    <section class="resource-shell ${className}" data-resource-shell data-resource-unit="${unit.id}">
      ${resourceToolbar}
      <div class="resource-body">
        ${body}
      </div>
    </section>
  `;
}

function renderQuizReturnNotice(unit = {}) {
  const context = state.returnToQuiz || {};
  if (!context.unitId || !context.targetUnitId || context.targetUnitId !== unit.id) return "";
  return `
    <div class="quiz-return-notice" role="status" aria-live="polite">
      <strong>正在回看课件</strong>
      <span>可按左上角“返回”键返回测验。</span>
    </div>
  `;
}

function renderKnowledgeUnit(unit) {
  const content = unit.scene.content || {};
  const module = content.module || {};
  const kp = content.knowledgePoint || {};
  const slide = kp.slide || {};
  const canvas = slide.canvas;
  const types = knowledgeInteractionTypes(unit);
  const selectedTypeId = selectedKnowledgeSceneType(unit);
  const selectedType = types.find((type) => type.id === selectedTypeId) || {};
  const candidate = selectedTypeId ? knowledgeResourceCandidate(unit, selectedTypeId) : null;
  const slideAudioTitle = "讲解页语音包";
  const sceneAudioTitle = selectedTypeId ? `${sceneChoiceCategoryLabel(selectedType)}语音包` : "";
  analyticsTrack("knowledge_render", {
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      moduleId: unit.moduleId,
      selectedSceneType: selectedTypeId,
      hasResource: Boolean(candidate),
      moduleRole: moduleRoleForUnit(unit),
      hasRequiredSlide: Boolean(canvas)
    }
  });

  const slideBody = canvas
    ? renderSlideCanvas(
      canvas,
      unit.chapterId,
      "multi-scene-required-slide",
      module.source?.resourceRoot || ""
    )
    : `<div class="empty-state multi-scene-empty-resource">
         <h2>讲解页暂无可渲染画布</h2>
         <p>当前知识点仍保留目标、误解和核心问题；后续重新导入课件时会自动补齐讲解页画布。</p>
       </div>`;

  const resourceBody = selectedTypeId && candidate
    ? `<div class="multi-scene-resource-note">
         <span class="type-pill">${escapeHtml(knowledgeSceneDisplayLabel(selectedType))}</span>
         <strong>${escapeHtml(cleanStudentResourceTitle(candidate.title || candidate.file, unit.label))}</strong>
         <small>已按你的选择加载，可随时切换其他场景。</small>
         <button class="button soft icon-button multi-scene-scene-fullscreen" type="button" data-knowledge-scene-fullscreen aria-label="全屏查看当前课件" title="全屏查看当前课件">课件全屏</button>
        </div>
       <div class="iframe-container multi-scene-courseware-stage" data-knowledge-scene-stage>
         <div class="iframe-loader"><div class="iframe-loader-spinner"></div><p>课件加载中…</p></div>
          <iframe class="embed-frame" data-courseware-frame data-context-id="interactive-frame:${escapeHtml(unit.id)}:${escapeHtml(selectedTypeId)}" data-context-kind="viewport" data-context-scope="interactive" data-context-confidence="low" data-context-scene-type="${escapeHtml(selectedTypeId)}" data-context-label="${escapeHtml(`${unit.label} · ${knowledgeSceneDisplayLabel(selectedType)}`)}" title="${escapeHtml(`${unit.label} ${knowledgeSceneDisplayLabel(selectedType)}`)}" sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups" allow="fullscreen; autoplay"></iframe>
        </div>`
    : selectedTypeId
      ? `<div class="empty-state multi-scene-empty-resource">
         <h2>${escapeHtml(knowledgeSceneDisplayLabel(selectedType))}暂不可用</h2>
         <p>请选择另外一种互动场景继续学习。</p>
       </div>`
      : `<div class="multi-scene-scene-awaiting" role="status">
         <span class="type-pill">等待选择</span>
         <h2>先选一种互动方式，再开始体验</h2>
         <p>四个场景讲的是同一个知识点，没有默认答案。你可以先选最想尝试的一种，之后随时切换比较。</p>
       </div>`;

  els.lessonPlayer.innerHTML = `
    ${renderResourceShell(
      unit,
      unit.label,
      `<div class="multi-scene-knowledge-player">
        ${renderQuizReturnNotice(unit)}
        <section class="multi-scene-slide-panel required">
          <div class="multi-scene-slide-heading">
            <span class="type-pill multi-scene-slide-kind">讲解页</span>
            <button class="button soft" type="button" data-resource-fullscreen>讲解页全屏</button>
            <h2>${renderInlineMath(slide.title || kp.name || unit.label)}</h2>
            <p>${renderInlineMath(module.title || unit.moduleTitle || "")}</p>
          </div>
          <div class="multi-scene-slide-fullscreen-stage" data-resource-fullscreen-target>
            ${slideBody}
          </div>
          ${renderKnowledgeAudioPack(unit, {
            slotKey: "slide",
            sceneOrder: slide.sceneOrder,
            title: slideAudioTitle
          })}
        </section>
        <section class="multi-scene-scene-panel" id="knowledge-scene-panel" data-knowledge-scene-panel tabindex="-1">
          <div class="multi-scene-scene-header">
            <div>
              <span class="type-pill">互动选择</span>
              <h3>${selectedTypeId ? `当前：${escapeHtml(knowledgeSceneDisplayLabel(selectedType))}` : "选择你的互动场景"}</h3>
            </div>
          </div>
          ${renderKnowledgeSceneChoicePanel(unit)}
          <div class="multi-scene-selected-resource ${selectedTypeId && candidate ? "has-resource" : "no-resource"}">${resourceBody}</div>
          ${selectedTypeId ? renderKnowledgeAudioPack(unit, {
            slotKey: `scene-${selectedTypeId}`,
            sceneOrder: candidate?.sceneOrder,
            title: sceneAudioTitle
          }) : ""}
        </section>
      </div>`,
      "multi-scene-knowledge-resource"
    )}
  `;
  setupSlideCanvasScaling(els.lessonPlayer);

  const iframeEl = els.lessonPlayer.querySelector("iframe[data-courseware-frame]");
  if (iframeEl && candidate) {
    const loader = () => iframeEl.parentElement?.querySelector(".iframe-loader");
    iframeEl.addEventListener("load", () => {
      const node = loader();
      if (node) {
        node.classList.add("hidden");
        window.setTimeout(() => node.remove(), 300);
      }
      try {
        setupIframeInteractionTracking(iframeEl, unit);
      } catch (error) {
        console.warn("Knowledge resource tracking unavailable:", error.message);
      }
    });
    iframeEl.addEventListener("error", () => {
      const node = loader();
      if (node) node.innerHTML = "<p>课件加载失败，请稍后再试。</p>";
    });
    iframeEl.src = coursewareFrameUrl(`resources/${candidate.root}/${candidate.file}`);
  }

  loadKnowledgeAudioMap(unit)
    .then(() => refreshKnowledgeAudioPack(unit.id))
    .catch((error) => {
      console.warn("Knowledge audio map unavailable:", error.message);
      refreshKnowledgeAudioPack(unit.id);
    });
}

function cleanStudentResourceTitle(title = "", fallback = "互动资源") {
  const cleaned = String(title)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.html?$/i, "")
    .replace(/^GH-\d{1,2}-/i, "")
    .replace(/拖动实验/g, "动手调一调")
    .replace(/误解修复挑战/g, "找错并改正")
    .replace(/误解挑战/g, "找错并改正")
    .replace(/关系图/g, "知识怎么连")
    .replace(/空间视角/g, "换个角度看")
    .trim();
  return cleaned || fallback;
}

function cleanStudentSceneTitle(title = "", fallback = "互动场景") {
  const cleaned = String(title)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.html?$/i, "")
    .replace(/^GH-\d{1,2}-/i, "")
    .trim();
  return cleaned || fallback;
}

function quizUnitSequenceIndex(unit = {}) {
  if (!unit?.id || !unit?.chapterId) return -1;
  const chapter = getChapter(unit.chapterId);
  const units = chapter?.allUnits || chapter?.units || [];
  const sequenceIndex = units.findIndex((candidate) => candidate?.id === unit.id);
  if (sequenceIndex >= 0) return sequenceIndex;
  const order = Number(unit.order);
  return Number.isFinite(order) ? order : -1;
}

function quizResourceAllowedForPhase(targetUnitId = "", unit = {}) {
  if (unit?.assessmentPhase === "pre") return false;
  if (unit?.assessmentPhase !== "formative") return true;
  const targetUnit = getUnit(targetUnitId);
  if (!targetUnit || targetUnit.chapterId !== unit.chapterId) return false;
  const targetIndex = quizUnitSequenceIndex(targetUnit);
  const quizIndex = quizUnitSequenceIndex(unit);
  return targetIndex >= 0 && quizIndex >= 0 && targetIndex < quizIndex;
}

function quizResourceTargetAccessible(targetUnitId = "", unit = {}) {
  if (!quizResourceAllowedForPhase(targetUnitId, unit)) return false;
  const targetUnit = getUnit(targetUnitId);
  if (!targetUnit || targetUnit.type === "quiz") return false;
  if (typeof agenticGuardNavigation === "function") {
    return agenticGuardNavigation(targetUnitId, { allowPrevious: true, silent: true });
  }
  if (typeof agenticIsUnitUnlocked === "function") {
    return agenticIsUnitUnlocked(targetUnitId)
      || (state.completed || []).includes(targetUnitId)
      || (typeof agenticIsSkipped === "function" && agenticIsSkipped(targetUnitId));
  }
  return true;
}

function quizQuestionResourceAccess(question = {}, unit = {}) {
  const text = displayQuestionText(question);
  const targets = Array.from(text.matchAll(/\[\[cq-unit:([^|\]]+)\|[^|\]]*\|[^\]]+\]\]/g))
    .map((match) => match[1])
    .filter(Boolean);
  const allowedTargets = targets.filter((targetUnitId) => quizResourceAllowedForPhase(targetUnitId, unit));
  return {
    hasMarkers: targets.length > 0,
    hasAllowed: allowedTargets.length > 0,
    hasTimingBlocked: allowedTargets.length < targets.length,
    hasAccessible: allowedTargets.some((targetUnitId) => quizResourceTargetAccessible(targetUnitId, unit))
  };
}

function lockedQuizResourceLabel(label = "") {
  const cleaned = String(label || "")
    .replace(/^回看课件\s*[:：]?\s*/, "")
    .trim();
  return cleaned ? `对应知识点「${cleaned}」` : "对应知识点";
}

function timingBlockedQuizResourceLabel(unitId = "", label = "") {
  const targetUnit = getUnit(unitId);
  const fallback = String(label || "")
    .replace(/^回看课件\s*[:：]?\s*/, "")
    .replace(/\s*[:：]\s*(?:拖动实验|关系图|误解修复挑战|空间视角)\s*$/, "")
    .trim();
  return `对应知识点「${targetUnit?.label || fallback || "后续内容"}」`;
}

function allowedQuizResourceLabel(unitId = "", label = "") {
  const targetUnit = getUnit(unitId);
  const fallback = String(label || "")
    .replace(/^回看课件\s*[:：]?\s*/, "")
    .replace(/\s*[:：]\s*(?:拖动实验|关系图|误解修复挑战|空间视角)\s*$/, "")
    .trim();
  return `回看「${targetUnit?.label || fallback || "对应内容"}」课件`;
}

function renderQuestionTextWithLinks(question = {}, unit = {}) {
  const sourceText = displayQuestionText(question);
  const markerRe = /\[\[cq-unit:([^|\]]+)\|([^|\]]*)\|([^\]]+)\]\]/g;
  const text = sourceText
    .replace(markerRe, (marker, unitId, sceneType, label) => (
      !quizResourceAllowedForPhase(unitId, unit)
        ? timingBlockedQuizResourceLabel(unitId, label)
        : quizResourceTargetAccessible(unitId, unit)
        ? `[[cq-unit:${unitId}|${sceneType}|${allowedQuizResourceLabel(unitId, label)}]]`
        : lockedQuizResourceLabel(label)
    ))
    .replace(/请先回看(?=\[\[cq-unit:)/g, "请先")
    .replace(/请先回看(?=对应知识点)/g, "请根据");
  let last = 0;
  let html = "";
  let match;
  while ((match = markerRe.exec(text))) {
    if (match.index > last) html += renderInlineMath(text.slice(last, match.index));
    const unitId = match[1] || "";
    const sceneType = match[2] || "";
    const label = match[3] || "回看课件";
    html += `<button class="quiz-resource-link" type="button" data-quiz-resource-link="${escapeHtml(unitId)}" data-quiz-resource-scene="${escapeHtml(sceneType)}">${escapeHtml(label)}</button>`;
    last = markerRe.lastIndex;
  }
  if (last < text.length) html += renderInlineMath(text.slice(last));
  return html;
}

function quizKnowledgePointLabels(question = {}, unit = {}) {
  const names = question.knowledgePointNames || question.knowledge_point_names || [];
  const ids = question.knowledgePointIds || question.knowledge_point_ids || [];
  const values = names.length ? names : ids;
  if (!values.length || typeof KnowledgePointLabels === "undefined") return [];
  const chapters = typeof curriculum !== "undefined" ? curriculum : [];
  return KnowledgePointLabels.labelsFor(values, chapters, unit.chapterId);
}

function renderQuizCoverage(question = {}, unit = {}) {
  const labels = quizKnowledgePointLabels(question, unit);
  if (!labels.length) return "";
  return `
    <div class="quiz-coverage" data-quiz-coverage>
      <strong>覆盖知识点</strong>
      <span>${escapeHtml(labels.join("、"))}</span>
    </div>
  `;
}

function quizAdaptiveFormativeState(unit, records = quizRecordsForUnit(unit.id)) {
  const questions = unit.scene.content?.questions || [];
  const latest = quizLatestResultsByQuestion(records);
  const core = questions.find((question) => question.adaptiveRole === "core") || questions[0];
  const diagnostic = questions.find((question) => question.adaptiveRole === "diagnostic") || questions[1];
  const coreResult = core ? latest[core.id] : null;
  const diagnosticResult = diagnostic ? latest[diagnostic.id] : null;
  const needsDiagnostic = Boolean(coreResult && coreResult.isCorrect === false && !diagnosticResult);
  const complete = Boolean(coreResult && (coreResult.isCorrect === true || diagnosticResult));
  return { questions, latest, core, diagnostic, coreResult, diagnosticResult, needsDiagnostic, complete };
}

function quizQuestionsForCurrentStage(unit) {
  const questions = unit.scene.content?.questions || [];
  if (!unit.adaptiveFormative) return questions;
  const stage = quizAdaptiveFormativeState(unit);
  if (!stage.coreResult) return stage.core ? [stage.core] : [];
  if (stage.needsDiagnostic) return stage.diagnostic ? [stage.diagnostic] : [];
  return [];
}

function renderQuiz(unit) {
  analyticsTrack("quiz_render", {
    source: "quiz",
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      phase: unit.assessmentPhase || "",
      moduleRole: moduleRoleForUnit(unit)
    }
  });
  const questions = unit.scene.content?.questions || [];
  const submitted = (state.submittedQuizzes || []).includes(unit.id);
  const unitResults = quizRecordsForUnit(unit.id);
  const adaptiveState = unit.adaptiveFormative ? quizAdaptiveFormativeState(unit, unitResults) : null;
  const visibleQuestions = unit.adaptiveFormative
    ? [adaptiveState.core, adaptiveState.coreResult?.isCorrect === false ? adaptiveState.diagnostic : null].filter(Boolean)
    : questions;
  const completionAllowed = typeof agenticUnitCompletionAllowed !== "function"
    || agenticUnitCompletionAllowed(unit.id);
  const isPre = unit.assessmentPhase === "pre";
  if (unit.placeholderQuiz || !questions.length) {
    renderPlaceholderQuiz(unit);
    return;
  }
  if (!completionAllowed && !submitted) {
    els.lessonPlayer.innerHTML = `
      ${renderResourceShell(
        unit,
        unit.label,
        `
          ${renderAssessmentBanner(unit)}
          <div class="quiz-card quiz-preview-locked">
            <div class="empty-state">
              <h2>测验尚未解锁</h2>
              <p>这份测验属于后续学习路径。你可以浏览课程结构，但题目会在接受相应学习建议后显示。</p>
              <button class="button primary" type="button" data-submit-quiz="${escapeHtml(unit.id)}" disabled>未解锁：先接受学习建议</button>
            </div>
          </div>
        `,
        "quiz-resource"
      )}
      ${renderCoach(unit.scene, unit.chapterId, unit.id)}
    `;
    return;
  }

  // Persist encouragement banner for submitted quizzes
  let quizTopBanner = "";
  if (submitted) {
    const summaryQuestions = unit.adaptiveFormative ? visibleQuestions : questions;
    const summary = summarizeQuizAttempt(unitResults, summaryQuestions);
    const outcomeHtml = quizOutcomeHtml(summary);
    if (isPre) {
      quizTopBanner = `
        <div class="quiz-encouragement-banner" id="quiz-top-banner-${unit.id}">
          前测已提交：${outcomeHtml}。
        </div>
        <p class="quiz-scroll-hint">先看学习建议，答错的题再看解析。</p>`;
    } else if (unit.assessmentPhase === "post") {
      quizTopBanner = `
        <div class="quiz-encouragement-banner post" id="quiz-top-banner-${unit.id}">
          后测已提交：${outcomeHtml}。
        </div>
        <p class="quiz-scroll-hint">先看学习建议，答错的题再看解析。</p>`;
    } else {
      quizTopBanner = `
        <div class="quiz-encouragement-banner formative" id="quiz-top-banner-${unit.id}">
          形成性测验已提交：${outcomeHtml}。
        </div>
        <p class="quiz-scroll-hint">先看学习建议，答错的题再看解析。</p>`;
    }
  }

  // Build a lookup of latest result per question for persisted review
  const latestByQuestion = {};
  let submittedTotalHtml = "";
  if (submitted || unit.adaptiveFormative) {
    Object.assign(latestByQuestion, quizLatestResultsByQuestion(unitResults));
  }
  if (submitted) {
    const summaryQuestions = unit.adaptiveFormative ? visibleQuestions : questions;
    const summary = summarizeQuizAttempt(unitResults, summaryQuestions);
    const pathNavigation = typeof renderQuizPathNavigation === "function"
      ? renderQuizPathNavigation(unit)
      : "";
    submittedTotalHtml = `<div class="quiz-section-total">${quizOutcomeHtml(summary)}</div>${pathNavigation}`;
  }

  els.lessonPlayer.innerHTML = `
    ${renderResourceShell(
      unit,
      unit.label,
      `
        ${renderAssessmentBanner(unit)}
        <div class="quiz-card" data-context-id="quiz:${escapeHtml(unit.id)}:page" data-context-kind="quiz" data-context-scope="quiz" data-context-confidence="medium" data-context-label="${escapeHtml(unit.label)}">
          ${quizTopBanner}
          ${visibleQuestions
            .map((question, index) => {
              const result = latestByQuestion[question.id];
              const restoredResult = submitted && !result ? restoredQuizResultFromDraft(unit, question, index) : null;
              const reviewResult = result || restoredResult;
              const questionSubmitted = submitted || Boolean(result);
              const review = reviewResult ? renderQuestionReview({ question, result: reviewResult, index, unit }) : "";
              const scoreLabel = quizQuestionScoreLabel(question, reviewResult || null);
              return `
              <article class="question-card" data-question="${question.id}" data-context-id="quiz:${escapeHtml(question.id)}" data-context-kind="quiz" data-context-scope="quiz" data-context-question="${escapeHtml(question.id)}" data-context-confidence="high" data-context-label="${escapeHtml(displayQuestionText(question))}">
                <div class="question-title-row">
                <h3>${question.type === "multiple" ? '<span class="question-type-marker">【多选题】</span> ' : ""}${index + 1}. ${renderQuestionTextWithLinks(question, unit)}</h3>
                  ${scoreLabel ? `<span class="question-score-pill">${escapeHtml(scoreLabel)}</span>` : ""}
                </div>
                ${renderQuestionInput(unit, question, questionSubmitted, reviewResult)}
                ${review}
              </article>
            `;
            })
            .join("")}
          <div class="quiz-submit-panel${submitted ? ' submitted' : ''}">
            <button class="button primary" type="button" data-submit-quiz="${unit.id}" ${submitted || !completionAllowed ? "disabled" : ""}>${submitted ? '已提交' : adaptiveState?.needsDiagnostic ? '提交诊断题' : completionAllowed ? '提交本次测验' : '未解锁：先接受学习建议'}</button>
            <p>${submitted ? '该测验已提交，答案、解析、每题得分和小节总分见下方。' : adaptiveState?.needsDiagnostic ? '核心题答错了，再完成一道诊断多选题，系统会据此定位具体误解。' : completionAllowed ? '先完成核心题；答对即可通过，答错时会立即出现诊断题。' : '该测验当前仅供预览；接受学习建议后才能提交并记录本节。'}</p>
            <div class="answer-feedback" id="feedback-${unit.id}">${submittedTotalHtml}</div>
          </div>
        </div>
      `,
      "quiz-resource"
    )}
    ${renderCoach(unit.scene, unit.chapterId, unit.id)}
  `;
  setupQuizVisibilityTracking(unit);
}

function renderPlaceholderQuiz(unit) {
  const config = unit.scene.content?.quizConfig || {};
  els.lessonPlayer.innerHTML = `
    ${renderResourceShell(
      unit,
      unit.label,
      `<div class="multi-scene-quiz-placeholder">
        ${renderAssessmentBanner(unit)}
        <div class="multi-scene-placeholder-grid">
          <div>
            <span class="type-pill">${phaseText(unit.assessmentPhase) || "测验流程"}</span>
            <h2>${escapeHtml(unit.scene.title || unit.label)}</h2>
            <p>这一步来自多场景自适应学习路线。真实题目尚未生成，因此这里只展示测验位置与配置，不提交成绩。</p>
          </div>
          <dl>
            <div><dt>${config.questionCount || 0}</dt><dd>建议题量</dd></div>
            <div><dt>${escapeHtml(config.difficulty || "medium")}</dt><dd>难度</dd></div>
            <div><dt>${(config.questionTypes || ["single", "multiple", "text"]).length}</dt><dd>题型</dd></div>
          </dl>
        </div>
      </div>`,
      "quiz-resource multi-scene-placeholder-resource"
    )}
  `;
}

function renderAssessmentBanner(unit) {
  if (!unit.assessmentPhase) return "";
  return `
    <div class="assessment-banner ${unit.assessmentPhase}">
      <span class="type-pill">${phaseText(unit.assessmentPhase)}</span>
      <p>${phaseGoal(unit.assessmentPhase)}</p>
    </div>
  `;
}

function renderQuestionInput(unit, question, submitted, result = null) {
  if (question.type === "short_answer") {
    const inputId = `answer-${unit.id}-${question.id}`;
    const draft = submitted && result?.response != null ? result.response : readQuizDraft(unit.id, question.id, "");
    return `
      <div class="short-answer-box">
        <label for="${inputId}">写下你的推理或计算过程</label>
        <textarea
          id="${inputId}"
          name="${unit.id}-${question.id}"
          rows="5"
          data-short-answer
          data-unit-id="${unit.id}"
         data-question-id="${question.id}"
          ${submitted ? "disabled" : ""}
         placeholder="例如：先写出计算步骤，再解释几何或物理意义。"
        >${escapeHtml(draft)}</textarea>
        <div class="draft-status">本题草稿会自动保存在本地记录中</div>
      </div>
    `;
  }

  return `
    <fieldset>
      ${(question.options || [])
        .map((option) => {
          const draft = submitted && result?.response != null ? result.response : readQuizDraft(unit.id, question.id, question.type === "multiple" ? [] : "");
          const selected = Array.isArray(draft) ? draft.includes(option.value) : draft === option.value;
          return `
          <label data-context-id="quiz:${escapeHtml(question.id)}:option:${escapeHtml(option.value)}" data-context-kind="quiz-option" data-context-scope="quiz" data-context-question="${escapeHtml(question.id)}" data-context-option="${escapeHtml(option.value)}" data-context-confidence="high" data-context-label="${escapeHtml(`${option.value}. ${displayOptionLabel(option)}`)}">
            <input
              type="${question.type === "multiple" ? "checkbox" : "radio"}"
              name="${unit.id}-${question.id}"
              value="${option.value}"
              data-choice-answer
              data-unit-id="${unit.id}"
              data-question-id="${question.id}"
              ${selected ? "checked" : ""}
              ${submitted ? "disabled" : ""}
            />
            <span>${option.value}. ${renderInlineMath(displayOptionLabel(option))}</span>
          </label>
        `;
        })
        .join("")}
    </fieldset>
  `;
}

function renderSlide(unit) {
  analyticsTrack("slide_render", {
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      moduleRole: moduleRoleForUnit(unit)
    }
  });
  const canvas = unit.scene.content?.canvas;
  const resourceRoot = unit.scene.content?.module?.source?.resourceRoot
    || unit.scene.content?.source?.resourceRoot
    || unit.resourceRoot
    || "";
  if (unit.scene.content?.routeReview) {
    renderRouteReview(unit);
    return;
  }
  if (!canvas) {
    els.lessonPlayer.innerHTML = `
      ${renderResourceShell(unit, unit.label, `<div class="empty-state">这一页没有可渲染的画布内容。</div>`, "slide-resource")}
      ${renderCoach(unit.scene, unit.chapterId, unit.id)}
    `;
    return;
  }

  els.lessonPlayer.innerHTML = `
    ${renderResourceShell(
      unit,
      unit.label,
      renderSlideCanvas(canvas, unit.chapterId, "", resourceRoot),
      "slide-resource"
    )}
    ${renderCoach(unit.scene, unit.chapterId, unit.id)}
  `;
  setupSlideCanvasScaling(els.lessonPlayer);
}

function renderRouteReview(unit) {
  const module = unit.scene.content?.module || {};
  const knowledgePoints = module.knowledgePoints || [];
  els.lessonPlayer.innerHTML = `
    ${renderResourceShell(
      unit,
      unit.label,
      `<div class="multi-scene-review-panel">
        <span class="type-pill">全课整理</span>
        <h2>${escapeHtml(readableRouteText(module.flow?.review?.title, "全课整理：证据链回看"))}</h2>
        <p>${renderInlineMath(module.coreIntuition || "把本节知识点、互动证据和测验反馈连起来。")}</p>
        <div class="multi-scene-review-grid">
          ${knowledgePoints.map((kp, index) => `
            <article>
              <span>${index + 1}</span>
              <strong>${renderInlineMath(kp.name)}</strong>
              <small>${renderInlineMath(typeof compactKnowledgeGoal === "function" ? compactKnowledgeGoal(kp, module) : (kp.goal || ""))}</small>
            </article>
          `).join("")}
        </div>
        <div class="multi-scene-review-footer">
          <strong>后测前自检</strong>
          <p>能否用自己的话说出每个知识点修复了什么误解，以及你选择的互动场景给了什么证据。</p>
        </div>
      </div>`,
      "slide-resource multi-scene-review-resource"
    )}
  `;
}

function renderSlideCanvas(canvas = {}, chapterId = currentChapterId, className = "", resourceRoot = "") {
  const base = slideSvgNumber(canvas.viewportSize, 1000);
  const ratio = slideSvgNumber(canvas.viewportRatio, 0.5625);
  const hBase = slideSvgNumber(base * ratio, 562.5);
  const background = canvas.background?.color || canvas.theme?.backgroundColor || "#fff";
  const classes = ["slide-wrap", className].filter(Boolean).join(" ");
  const canvasId = slideSvgId(canvas.id || "canvas");
  return `<div class="${classes}" data-slide-canvas data-context-id="slide:${canvasId}:canvas" data-context-kind="viewport" data-context-scope="slide" data-context-confidence="low" data-context-label="当前讲解页" style="aspect-ratio:${base} / ${hBase};">
    <div class="slide-stage" data-slide-width="${base}" data-slide-height="${hBase}" style="width:${base}px;height:${hBase}px;background:${escapeHtml(background)};">
      ${(canvas.elements || []).map((element, index) => renderSlideElement(element, canvas, chapterId, resourceRoot, index)).join("")}
    </div>
  </div>`;
}

function fitSlideCanvasContents(wrap) {
  wrap?.querySelectorAll?.("[data-slide-fit]").forEach((content) => {
    const host = content.parentElement;
    if (!host?.clientWidth || !host.clientHeight) return;
    content.style.setProperty("--slide-content-scale", "1");
    content.style.setProperty("--slide-content-x", "0px");
    content.style.setProperty("--slide-content-y", "0px");
    const naturalWidth = Math.max(content.scrollWidth, content.offsetWidth, 1);
    const naturalHeight = Math.max(content.scrollHeight, content.offsetHeight, 1);
    const scale = Math.min(1, host.clientWidth / naturalWidth, host.clientHeight / naturalHeight);
    const centered = host.classList.contains("slide-latex");
    const offsetX = centered ? Math.max(0, (host.clientWidth - naturalWidth * scale) / 2) : 0;
    const offsetY = centered ? Math.max(0, (host.clientHeight - naturalHeight * scale) / 2) : 0;
    content.style.setProperty("--slide-content-scale", String(Number(scale.toFixed(6))));
    content.style.setProperty("--slide-content-x", `${slideSvgNumber(offsetX)}px`);
    content.style.setProperty("--slide-content-y", `${slideSvgNumber(offsetY)}px`);
    content.dataset.slideFitScale = String(Number(scale.toFixed(6)));
  });
}

function syncSlideCanvasScale(wrap) {
  const stage = wrap?.querySelector?.(".slide-stage");
  if (!stage) return;
  const base = Number(stage.dataset.slideWidth || 1000);
  const availableWidth = wrap.clientWidth;
  if (!Number.isFinite(base) || base <= 0 || !availableWidth) return;
  stage.style.setProperty("--slide-scale", String(Number((availableWidth / base).toFixed(6))));
  fitSlideCanvasContents(wrap);
}

function setupSlideCanvasScaling(root = typeof document !== "undefined" ? document : null) {
  if (!root?.querySelectorAll) return;
  const wraps = Array.from(root.querySelectorAll("[data-slide-canvas]"));
  wraps.forEach(syncSlideCanvasScale);
  if (typeof ResizeObserver === "undefined") return;
  if (!slideCanvasResizeObserver) {
    slideCanvasResizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => syncSlideCanvasScale(entry.target));
    });
  } else {
    slideCanvasResizeObserver.disconnect();
  }
  wraps.forEach((wrap) => slideCanvasResizeObserver.observe(wrap));
  if (typeof document !== "undefined" && document.fonts?.ready) {
    document.fonts.ready.then(() => wraps.forEach(syncSlideCanvasScale)).catch(() => {});
  }
}

function slideContextPlainText(value = "") {
  return String(value || "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function slideElementContextLabel(element = {}) {
  if (element.type === "text") {
    return compactText(slideContextPlainText(element.content), 260) || "课件文字";
  }
  if (element.type === "latex") return compactText(element.latex || "数学公式", 260);
  if (element.type === "image") return compactText(element.alt || element.title || "课件图片", 260);
  if (element.type === "table") {
    return compactText(
      (element.data || [])
        .flatMap((row) => (row || []).map((cell) => slideContextPlainText(cell?.text || "")))
        .join(" "),
      260
    ) || "课件表格";
  }
  if (element.type === "line") return "课件中的连线或箭头";
  if (element.type === "shape") return "课件中的图形对象";
  return "课件对象";
}

function slideElementContextAttributes(element = {}, canvas = {}, index = 0) {
  const canvasId = slideSvgId(canvas.id || "canvas");
  const elementId = slideSvgId(element.id || `${element.type || "element"}-${index + 1}`);
  const kind = element.type === "latex" ? "formula" : element.type === "text" ? "text" : "object";
  const label = slideElementContextLabel(element);
  const text = element.type === "text" || element.type === "table" ? label : "";
  return [
    `data-context-id="slide:${canvasId}:${elementId}"`,
    `data-context-kind="${kind}"`,
    'data-context-scope="slide"',
    `data-context-confidence="${element.id ? "high" : "medium"}"`,
    `data-context-label="${escapeHtml(label)}"`,
    text ? `data-context-text="${escapeHtml(text)}"` : "",
    element.type === "latex" ? `data-context-latex="${escapeHtml(String(element.latex || ""))}"` : ""
  ].filter(Boolean).join(" ");
}

function renderSlideElement(element, canvas, chapterId, resourceRoot = "", index = 0) {
  const base = canvas.viewportSize || 1000;
  const ratio = canvas.viewportRatio || 0.5625;
  const hBase = base * ratio;
  const left = slideSvgNumber(element.left, 0);
  const top = slideSvgNumber(element.top, 0);
  const width = slideSvgNumber(element.width, 1);
  const height = slideSvgNumber(element.height, 1);
  const rotate = slideSvgNumber(element.rotate, 0);
  const common = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;transform:rotate(${rotate}deg);`;
  const contextAttributes = slideElementContextAttributes(element, canvas, index);

  if (element.type === "text") {
    const content = element.content || "";
    const rendered = renderSlideTextContent(content);
    return `<div class="slide-element slide-text" ${contextAttributes} style="${common}color:${element.defaultColor || "inherit"}"><div class="slide-fit-content slide-text-content" data-slide-fit>${rendered}</div></div>`;
  }

  if (element.type === "shape") {
    const viewBox = Array.isArray(element.viewBox) ? element.viewBox : [1, 1];
    const viewWidth = slideSvgNumber(viewBox[0], 1);
    const viewHeight = slideSvgNumber(viewBox[1], 1);
    const outline = element.outline || {};
    const stroke = outline.color || "none";
    const strokeWidth = slideSvgNumber(outline.width, 0);
    const dash = outline.style === "dashed" ? ' stroke-dasharray="6 4"' : "";
    return `<svg class="slide-element slide-shape" ${contextAttributes} style="${common}" viewBox="0 0 ${viewWidth} ${viewHeight}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${escapeHtml(element.path || "")}" fill="${escapeHtml(element.fill || "#e9edf5")}" stroke="${escapeHtml(stroke)}" stroke-width="${strokeWidth}"${dash} vector-effect="non-scaling-stroke"></path>
    </svg>`;
  }

  if (element.type === "image") {
    return `<img class="slide-element" ${contextAttributes} alt="" src="${slideImageSrc(element.src, chapterId, resourceRoot)}" style="${common};object-fit:contain;" />`;
  }

  if (element.type === "line") {
    const start = Array.isArray(element.start) ? element.start : [0, 0];
    const end = Array.isArray(element.end) ? element.end : [element.width || 1, element.height || 1];
    const x1 = slideSvgNumber((element.left || 0) + (start[0] || 0));
    const y1 = slideSvgNumber((element.top || 0) + (start[1] || 0));
    const x2 = slideSvgNumber((element.left || 0) + (end[0] || 0));
    const y2 = slideSvgNumber((element.top || 0) + (end[1] || 0));
    const strokeWidth = Math.max(slideSvgNumber(element.width, 2), 1);
    const markerId = `slide-arrow-${slideSvgId(element.id || `${x1}-${y1}-${x2}-${y2}`)}`;
    const points = Array.isArray(element.points) ? element.points : ["", ""];
    const markerStart = points[0] === "arrow" ? ` marker-start="url(#${markerId})"` : "";
    const markerEnd = points[1] === "arrow" ? ` marker-end="url(#${markerId})"` : "";
    const dash = element.style === "dashed" ? ' stroke-dasharray="8 6"' : "";
    const rotate = slideSvgNumber(element.rotate, 0);
    const transform = rotate ? ` transform="rotate(${rotate} ${x1} ${y1})"` : "";
    const marker = markerStart || markerEnd
      ? `<defs><marker id="${markerId}" markerWidth="4" markerHeight="4" refX="8.5" refY="5" viewBox="0 0 10 10" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 Z" fill="${escapeHtml(element.color || "#94a3b8")}"></path></marker></defs>`
      : "";
    return `<svg class="slide-element slide-vector slide-line" ${contextAttributes} style="left:0;top:0;width:100%;height:100%;" viewBox="0 0 ${slideSvgNumber(base)} ${slideSvgNumber(hBase)}" preserveAspectRatio="none" aria-hidden="true">
      ${marker}
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeHtml(element.color || "#94a3b8")}" stroke-width="${strokeWidth}" stroke-linecap="round"${dash}${markerStart}${markerEnd}${transform}></line>
    </svg>`;
  }

  if (element.type === "latex") {
    const latex = String(element.latex || "");
    let html = escapeHtml(latex);
    if (latex && typeof katex !== "undefined") {
      try {
        html = katex.renderToString(latex, {
          throwOnError: false,
          displayMode: true,
          trust: false,
          maxExpand: 1000
        });
      } catch {}
    }
    return `<div class="slide-element slide-latex" ${contextAttributes} style="${common}color:${element.color || "inherit"}"><div class="slide-fit-content slide-latex-content" data-slide-fit>${html}</div></div>`;
  }

  if (element.type === "table") {
    return `<div class="slide-element slide-table-wrap" ${contextAttributes} style="${common}"><div class="slide-fit-content slide-table-content" data-slide-fit>${renderSlideTable(element)}</div></div>`;
  }

  return "";
}

function slideSvgNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(number.toFixed(4));
}

function slideSvgId(value = "") {
  return String(value || "line").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function slideImageSrc(src = "", chapterId = currentChapterId, resourceRoot = "") {
  if (!src) return "";
  const classroomMedia = String(src).match(/^\/api\/classroom-media\/[^/]+\/media\/(.+)$/i);
  if (classroomMedia && resourceRoot) {
    return resourceUrl(`resources/${resourceRoot}/media/${classroomMedia[1]}`);
  }
  if (resourceRoot && /^media\//i.test(src)) {
    return resourceUrl(`resources/${resourceRoot}/${src}`);
  }
  if (resourceRoot && src.startsWith("gen_img_")) {
    return resourceUrl(`resources/${resourceRoot}/media/${src}.png`);
  }
  if (/^(data:|https?:|\/)/i.test(src)) return src;
  if (src.startsWith("gen_img_")) return resourceUrl(`resources/open-maic/${chapterId}/media/${src}.png`);
  return resourceUrl(`resources/open-maic/${chapterId}/${src}`);
}

function renderSlideTextContent(value = "") {
  const content = String(value ?? "");
  return /<[a-zA-Z][^>]*>/.test(content) ? renderMathInHtml(content) : renderInlineMath(content);
}

function renderSlideTable(element) {
  const rows = element.data || [];
  const border = element.outline?.color || "#d9d9d9";
  const cellMinHeight = Math.max(slideSvgNumber(element.cellMinHeight, 0), 0);
  const colWidths = Array.isArray(element.colWidths) ? element.colWidths : [];
  const naturalHeight = Math.max(slideSvgNumber(element.height, 0), cellMinHeight * rows.length);
  return `
    <table class="slide-table" style="border-color:${escapeHtml(border)};min-height:${naturalHeight}px">
      ${colWidths.length
        ? `<colgroup>${colWidths.map((width) => `<col style="width:${slideSvgNumber(Number(width) * 100)}%" />`).join("")}</colgroup>`
        : ""}
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr${cellMinHeight ? ` style="height:${cellMinHeight}px"` : ""}>
                ${(row || [])
                  .map((cell) => {
                    const style = cell.style || {};
                    const attrs = [
                      `style="background:${escapeHtml(style.backcolor || "transparent")};color:${escapeHtml(style.color || "inherit")};text-align:${escapeHtml(style.align || "left")};font-weight:${style.bold ? 800 : 500};${style.fontsize ? `font-size:${slideSvgNumber(style.fontsize, 16)}px;` : ""}${cellMinHeight ? `min-height:${cellMinHeight}px;` : ""}"`
                    ];
                    if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
                    if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
                    return `<td ${attrs.join(" ")}>${renderSlideTextContent(cell.text)}</td>`;
                  })
                  .join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function compactText(value = "", limit = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeIframeElement(node, doc) {
  if (!node || node === doc) return doc.body || doc.documentElement;
  if (node.nodeType === 1) return node;
  return node.parentElement || doc.body || doc.documentElement;
}

function iframeClassName(element) {
  const cls = element?.className;
  if (typeof cls === "string") return cls;
  if (cls?.baseVal) return cls.baseVal;
  return "";
}

function cssEscapeIdent(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value || "").replace(/["\\]/g, "\\$&");
}

function iframeElementLabel(element, doc) {
  element = normalizeIframeElement(element, doc);
  if (!element) return "";
  if (element === doc.body || element === doc.documentElement) return doc.title || "课件页面";
  const id = element.getAttribute?.("id");
  const labelByFor = id ? doc.querySelector(`label[for="${cssEscapeIdent(id)}"]`) : null;
  const wrappingLabel = element.closest?.("label");
  return compactText(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      labelByFor?.textContent ||
      wrappingLabel?.textContent ||
      (element.tagName?.toLowerCase() === "canvas" ? "画布" : "") ||
      (element.tagName?.toLowerCase() === "svg" ? "图形区域" : "") ||
      element.textContent ||
      element.value ||
      element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      id ||
      iframeClassName(element) ||
      element.tagName
  );
}

function iframeElementValue(element) {
  if (!element) return "";
  const tag = element.tagName?.toLowerCase();
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (type === "checkbox" || type === "radio") return element.checked ? "选中" : "未选中";
  if (tag === "select") return compactText(element.selectedOptions?.[0]?.textContent || element.value);
  if (type === "password") return element.value ? "已输入" : "空";
  if (["range", "number", "color", "date", "time", "month", "week"].includes(type)) return compactText(element.value, 120);
  if (tag === "textarea" || element.isContentEditable || ["text", "search", "email", "url", "tel"].includes(type)) {
    const text = element.isContentEditable ? element.textContent || "" : element.value || "";
    return `已输入 ${text.length} 个字符`;
  }
  if ("value" in element) return compactText(element.value, 120);
  return "";
}

function iframeElementInfo(element, event, unit) {
  let doc = element?.ownerDocument || event?.target?.ownerDocument || null;
  element = doc ? normalizeIframeElement(element, doc) : element;
  doc = element?.ownerDocument || doc;
  const rect = element?.getBoundingClientRect?.();
  const point =
    event && typeof event.clientX === "number" && rect
      ? {
          x: Math.round(event.clientX - rect.left),
          y: Math.round(event.clientY - rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      : null;
  return {
    source: "iframe",
    unitId: unit.id,
    unitLabel: unit.label,
    chapterId: unit.chapterId,
    tag: element?.tagName?.toLowerCase() || "",
    role: element?.getAttribute?.("role") || "",
    type: element?.getAttribute?.("type") || "",
    label: doc ? iframeElementLabel(element, doc) : "",
    value: iframeElementValue(element),
    id: element?.getAttribute?.("id") || "",
    name: element?.getAttribute?.("name") || "",
    className: compactText(iframeClassName(element), 80),
    point
  };
}

function iframeActionTarget(event, doc, selector) {
  const raw = normalizeIframeElement(event.target, doc);
  const closest = raw?.closest?.(selector);
  if (closest) return closest;
  if (raw && raw !== doc && raw !== doc.documentElement) return raw;
  return doc.body || doc.documentElement;
}

function setupIframeInteractionTracking(iframeEl, unit) {
  if (!iframeEl) return;
  let doc = null;
  try {
    doc = iframeEl.contentDocument || iframeEl.contentWindow?.document;
  } catch {
    return;
  }
  if (!doc) return;
  if (doc.__calculusQuestTrackingUnit === unit.id) return;
  doc.__calculusQuestTrackingUnit = unit.id;

  const interactiveSelector = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "label",
    "canvas",
    "svg",
    "[role='button']",
    "[role='slider']",
    "[contenteditable='true']",
    "[tabindex]",
    "[data-action]",
    "[data-role]"
  ].join(",");
  const inputSelector = "input, select, textarea, [contenteditable='true']";
  const lastInputAt = new WeakMap();
  const pointerStarts = new Map();
  const rangeStarts = new WeakMap();
  let lastWheelAt = 0;

  doc.addEventListener(
    "click",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_click", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "dblclick",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_double_click", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "contextmenu",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_context_menu", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "input",
    (event) => {
      const target = event.target?.closest?.(inputSelector);
      if (!target) return;
      const now = Date.now();
      const last = lastInputAt.get(target) || 0;
      if (now - last < 700) return;
      lastInputAt.set(target, now);
      const info = iframeElementInfo(target, event, unit);
      if ((target.getAttribute("type") || "").toLowerCase() === "range") {
        const start = rangeStarts.get(target);
        if (!start) rangeStarts.set(target, { value: target.value, at: now });
        trackInteraction("parameter_change", {
          persist: false,
          source: "iframe",
          ...info,
          param: target.getAttribute("name") || target.getAttribute("id") || info.label,
          value: {
            old: start?.value || "",
            new: target.value,
            min: target.min || "",
            max: target.max || ""
          }
        });
        return;
      }
      trackInteraction("interactive_input", info);
    },
    true
  );

  doc.addEventListener(
    "change",
    (event) => {
      const target = event.target?.closest?.(inputSelector);
      if (!target) return;
      const info = iframeElementInfo(target, event, unit);
      if ((target.getAttribute("type") || "").toLowerCase() === "range") {
        const start = rangeStarts.get(target);
        trackInteraction("parameter_commit", {
          source: "iframe",
          ...info,
          param: target.getAttribute("name") || target.getAttribute("id") || info.label,
          value: {
            old: start?.value || "",
            new: target.value,
            min: target.min || "",
            max: target.max || ""
          },
          durationMs: start?.at ? Date.now() - start.at : 0
        });
        rangeStarts.delete(target);
        return;
      }
      trackInteraction("interactive_change", info);
    },
    true
  );

  doc.addEventListener(
    "submit",
    (event) => {
      const target = event.target?.closest?.("form") || event.target;
      trackInteraction("interactive_submit", iframeElementInfo(target, event, unit));
    },
    true
  );

  doc.addEventListener(
    "keydown",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      const isTextEntry = target.closest?.(inputSelector);
      const isPlainCharacter = event.key?.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
      if (isTextEntry && isPlainCharacter) return;
      const key = isPlainCharacter ? "character" : event.key || "";
      trackInteraction("interactive_keydown", {
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        key,
        code: event.code || "",
        modifiers: {
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey
        }
      });
    },
    true
  );

  doc.addEventListener(
    "wheel",
    (event) => {
      const now = Date.now();
      if (now - lastWheelAt < 800) return;
      lastWheelAt = now;
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      trackInteraction("interactive_wheel", {
        persist: false,
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        deltaX: Math.round(event.deltaX || 0),
        deltaY: Math.round(event.deltaY || 0),
        deltaMode: event.deltaMode || 0
      });
    },
    { capture: true, passive: true }
  );

  doc.addEventListener(
    "pointerdown",
    (event) => {
      const target = iframeActionTarget(event, doc, interactiveSelector);
      if (!target) return;
      pointerStarts.set(event.pointerId || 0, {
        at: Date.now(),
        x: event.clientX,
        y: event.clientY,
        target
      });
    },
    true
  );

  doc.addEventListener(
    "pointercancel",
    (event) => {
      const start = pointerStarts.get(event.pointerId || 0);
      if (!start) return;
      pointerStarts.delete(event.pointerId || 0);
    },
    true
  );

  doc.addEventListener(
    "pointerup",
    (event) => {
      const start = pointerStarts.get(event.pointerId || 0);
      if (!start) return;
      pointerStarts.delete(event.pointerId || 0);
      const target = iframeActionTarget(event, doc, interactiveSelector) || start.target;
      const distance = Math.round(Math.hypot(event.clientX - start.x, event.clientY - start.y));
      const durationMs = Date.now() - start.at;
      if (distance < 8) return;
      trackInteraction("interactive_drag_end", {
        source: "iframe",
        ...iframeElementInfo(target, event, unit),
        distance,
        durationMs
      });
    },
    true
  );

  trackInteraction("interactive_ready", {
    source: "iframe",
    unitId: unit.id,
    unitLabel: unit.label,
    chapterId: unit.chapterId,
    title: compactText(doc.title || unit.label)
  });
}

function interactiveFrameSrc(unit, htmlPath) {
  if (!htmlPath) return "";
  const resourceRoot = unit.scene.content?.resourceRoot;
  if (resourceRoot) return resourceUrl(`resources/${resourceRoot}/${htmlPath}`);
  return resourceUrl(`resources/open-maic/${unit.chapterId}/${htmlPath}`);
}

function renderInteractive(unit) {
  analyticsTrack("interactive_render", {
    source: "iframe",
    data: {
      unitId: unit.id,
      chapterId: unit.chapterId,
      htmlPath: unit.scene.content?.htmlPath || "",
      resourceRoot: unit.scene.content?.resourceRoot || "open-maic",
      moduleRole: moduleRoleForUnit(unit)
    }
  });
  const html = unit.scene.content?.html;
  const htmlPath = unit.scene.content?.htmlPath;
  if (!html && !htmlPath) {
    els.lessonPlayer.innerHTML = `
      ${renderResourceShell(unit, unit.label, `<div class="empty-state">这一项没有内置互动 HTML。</div>`, "html-resource interactive-resource")}
      ${renderCoach(unit.scene, unit.chapterId, unit.id)}
    `;
    return;
  }

  const frameSrc = interactiveFrameSrc(unit, htmlPath);
  const loadingHtml = '<div class="iframe-loader"><div class="iframe-loader-spinner"></div><p>互动实验加载中…</p></div>';
  els.lessonPlayer.innerHTML = `
    ${renderResourceShell(
      unit,
      unit.label,
      `<div class="iframe-container">${loadingHtml}<iframe class="embed-frame" data-context-id="interactive-frame:${escapeHtml(unit.id)}" data-context-kind="viewport" data-context-scope="interactive" data-context-confidence="low" data-context-scene-type="${escapeHtml(unit.scenarioType || unit.kind || "interactive")}" data-context-label="${escapeHtml(unit.label)}" title="${escapeHtml(unit.label)}" sandbox="allow-scripts allow-forms allow-pointer-lock allow-popups" allow="fullscreen; autoplay"></iframe></div>`,
      "html-resource interactive-resource"
    )}
    ${renderCoach(unit.scene, unit.chapterId, unit.id)}
  `;
  const iframeEl = els.lessonPlayer.querySelector("iframe");
  if (iframeEl) {
    let loaded = false;
    const loader = () => iframeEl.parentElement?.querySelector(".iframe-loader");
    const markLoaded = () => {
      if (!loaded) {
        loaded = true;
        const node = loader();
        if (node) {
          node.classList.add("hidden");
          window.setTimeout(() => node.remove(), 350);
        }
      }
      try {
        setupIframeInteractionTracking(iframeEl, unit);
      } catch (error) {
        console.warn("Interactive tracking unavailable:", error.message);
      }
    };
    iframeEl.addEventListener("load", () => {
      markLoaded();
    });
    iframeEl.addEventListener("error", () => {
      const node = loader();
      if (node) { node.classList.add("hidden"); node.innerHTML = "<p>互动实验加载失败，请刷新重试。</p>"; }
    });
    if (html) iframeEl.srcdoc = html;
    else if (frameSrc) iframeEl.src = frameSrc;
    setTimeout(() => {
      if (!loaded) {
        const node = loader();
        if (node) { node.classList.add("hidden"); node.innerHTML = "<p>互动实验加载超时，请检查网络连接后刷新。</p>"; }
      }
    }, 20000);
  }
}

function renderAgent() {
  const rows = [
    ["前测定位", "每章先完成前测，用来判断哪些知识点可以跳过，哪些需要认真学。"],
    ["自主选择", "系统先给建议，学生再勾选本章要学的知识点；跳过的内容保留回看入口。"],
    ["阶段检查", "形成性测验承上启下：前半不稳就回看，跳过后暴露问题就选择补学或继续跳过。"],
    ["后测收束", "后测检验本章整体掌握；通过后进入下一章，拓展课件等你补充后开放。"]
  ];

  els.agentBoard.innerHTML = rows
    .map(([title, text], index) => `
      <article class="agent-card">
        <span class="type-pill">规则 ${index + 1}</span>
        <h2>${title}</h2>
        <p>${text}</p>
      </article>
    `)
    .join("") + renderAgenticBlueprint();
}

function renderAgenticBlueprint() {
  const chapterRows = curriculum
    .map((chapter) => {
      const knowledgeUnits = (chapter.allUnits || chapter.units || []).filter((unit) => unit.type === "knowledge");
      const resourceCount = knowledgeUnits.reduce((sum, unit) => sum + (unit.resourceCandidates || []).length, 0);
      return `<tr><td>${chapter.label}</td><td>${knowledgeUnits.length} 个知识点 / ${resourceCount} 个 OpenMAIC 互动资源</td></tr>`;
    })
    .join("");
  return `
    <article class="agent-card agent-wide">
      <span class="type-pill">主动学习路径</span>
      <h2>互动课件路径编排</h2>
      <p>主线保留前测、知识点互动、形成性测验和后测；重学与拓展建议由当前路线和知识图谱生成，并由学生确认。</p>
      <div class="blueprint-table-wrap">
        <table class="blueprint-table">
          <thead><tr><th>章节</th><th>当前课件资源</th></tr></thead>
          <tbody>${chapterRows}</tbody>
        </table>
      </div>
    </article>
  `;
}

function lessonTimelineCaption(unit, statusText = "") {
  if (!unit) return statusText || "学习步骤";
  if (unit.type === "quiz") {
    return {
      pre: "诊断初始水平",
      formative: "检查中段理解",
      post: "检验学习成果"
    }[unit.assessmentPhase] || "完成阶段测验";
  }
  if (unit.type === "knowledge") {
    const goal = unit.summary || (typeof compactKnowledgeGoal === "function"
      ? compactKnowledgeGoal(unit.scene?.content?.knowledgePoint || {}, unit.scene?.content?.module || {})
      : unit.scene?.content?.knowledgePoint?.goal || "");
    return goal || "先看讲解页，再选择互动场景";
  }
  if (unit.kind === "review" || unit.scenarioType === "review") return "回看证据链";
  if (unit.type === "slide") return "整理关键证据";
  return learningSceneRole(unit);
}

function lessonTimelineStatus(unit, isLocked, isSkipped, isDone, statusKind = "") {
  if (isLocked) return "未解锁";
  if (statusKind === "review") return "待复习";
  if (isSkipped) return "已跳过";
  if (isDone) return "已完成";
  if (unit?.flowKind === "adaptive") return "可选";
  return unit?.type === "quiz" ? "待完成" : "待学习";
}

function syncPathRailsToCurrent() {
  const safeId = (value) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"'));
  window.requestAnimationFrame(() => {
    const currentLesson = currentUnitId ? document.querySelector(`#lesson-list [data-unit="${safeId(currentUnitId)}"]`) : null;
    if (currentLesson) currentLesson.scrollIntoView({ block: "nearest", inline: "nearest" });
    const currentChapter = currentChapterId ? document.querySelector(`#chapter-list [data-chapter="${safeId(currentChapterId)}"]`) : null;
    if (currentChapter) currentChapter.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function sceneChoiceMeta(type = {}) {
  const id = type.id === "diagram" ? "mindMap" : type.id;
  const fallback = {
    simulation: { icon: "~", title: "动手调一调" },
    game: { icon: "◇", title: "找错并改正" },
    mindMap: { icon: "※", title: "知识怎么连" },
    visualization3d: { icon: "⬡", title: "换个角度看" }
  }[id] || { icon: type.icon || "•", title: type.label || id };
  return {
    id,
    icon: fallback.icon,
    title: fallback.title
  };
}

function sceneChoiceCategoryLabel(type = {}) {
  const id = type.id === "diagram" ? "mindMap" : type.id;
  return {
    simulation: "交互模拟",
    game: "闯关练习",
    mindMap: "图解梳理",
    visualization3d: "三维观察"
  }[id] || type.categoryLabel || type.label || "互动场景";
}

function renderKnowledgeSceneChoicePanel(unit) {
  if (!unit || unit.type !== "knowledge") return "";
  const types = knowledgeInteractionTypes(unit);
  if (!types.length) return "";
  const selectedTypeId = selectedKnowledgeSceneType(unit);
  const recommendation = typeof knowledgeSceneRecommendation === "function"
    ? knowledgeSceneRecommendation(unit)
    : { ranked: [], recommended: null };
  const rankingByType = new Map((recommendation.ranked || []).map((item) => [item.typeId, item]));
  const orderedTypes = [...types].sort((a, b) => {
    const aRank = rankingByType.get(a.id);
    const bRank = rankingByType.get(b.id);
    return Number(bRank?.score ?? -Infinity) - Number(aRank?.score ?? -Infinity)
      || types.indexOf(a) - types.indexOf(b);
  });
  const choices = orderedTypes.map((type) => {
    const candidate = knowledgeResourceCandidate(unit, type.id);
    const hasResource = Boolean(candidate);
    const active = type.id === selectedTypeId;
    const meta = sceneChoiceMeta(type);
    const ranking = rankingByType.get(type.id) || null;
    const recommended = Boolean(ranking?.recommended);
    const resourceTitle = hasResource
      ? cleanStudentSceneTitle(candidate.title || candidate.file, unit.label)
      : "当前资源暂不可用";
    const sceneTitle = hasResource ? sceneChoiceCategoryLabel(type) : resourceTitle;
    const reason = ranking?.reasonLabels?.slice(0, 2).join(" · ") || "";
    const cls = [
      "multi-scene-scene-option",
      "coach-choice",
      recommended ? "coach-recommended" : "",
      active ? "active" : "",
      hasResource ? "available" : "pending"
    ].filter(Boolean).join(" ");
    return `
      <button class="${cls}" type="button" data-knowledge-scene="${type.id}" data-unit="${unit.id}" data-coach-score="${escapeHtml(ranking?.score ?? "")}" aria-pressed="${active ? "true" : "false"}" ${hasResource ? "" : "disabled"} title="${escapeHtml(meta.title)}：${escapeHtml(resourceTitle)}${reason ? `；${escapeHtml(reason)}` : ""}">
        <span class="scene-option-icon" aria-hidden="true">${escapeHtml(meta.icon)}</span>
        <span class="scene-option-copy">
          <strong>${escapeHtml(meta.title)}</strong>
          <small>${escapeHtml(sceneTitle)}</small>
          ${recommended && reason ? `<small class="coach-recommendation-reason">${escapeHtml(reason)}</small>` : ""}
        </span>
        ${recommended ? '<em class="coach-recommendation-badge">Coach 建议</em>' : ""}
      </button>
    `;
  }).join("");
  const selected = types.find((type) => type.id === selectedTypeId) || null;
  const selectedMeta = selected ? sceneChoiceMeta(selected) : null;
  const recommendedType = types.find((type) => type.id === recommendation.recommended?.typeId) || null;
  const recommendedMeta = recommendedType ? sceneChoiceMeta(recommendedType) : null;
  return `
    <div class="agentic-knowledge-choice ${selected ? "has-selection" : "awaiting-selection"}">
      <div>
        <strong>${selected ? "已选择一种互动方式" : recommendedMeta ? `Coach 建议先试“${escapeHtml(recommendedMeta.title)}”` : "四个互动场景由你选择"}</strong>
        <small>${selected
          ? `当前是“${escapeHtml(selectedMeta.title)}”，Coach 建议仍只是参考，点击其他场景可立即切换。`
          : "建议根据当前知识点、掌握度和已体验场景计算，仅供参考；系统不会替你选择。"}</small>
      </div>
      <div class="multi-scene-scene-selector agentic-knowledge-scene-selector" role="group" aria-label="${escapeHtml(unit.label)}的互动场景">${choices}</div>
    </div>
  `;
}
function renderLessonSceneButton(unit) {
  const isSkipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(unit.id);
  const statusKind = typeof agenticLessonStatusKind === "function" ? agenticLessonStatusKind(unit.id) : "";
  const isPendingReview = statusKind === "review";
  const isUnlocked = typeof agenticUnitCompletionAllowed === "function"
    ? agenticUnitCompletionAllowed(unit.id)
    : typeof agenticIsUnitUnlocked !== "function" || agenticIsUnitUnlocked(unit.id);
  const isLocked = !isUnlocked && !isSkipped;
  const isDone = state.completed.includes(unit.id);
  const cls = ["lesson-scene-chip", unit.id === currentUnitId ? "active" : "", isLocked ? "locked" : "", isPendingReview ? "review-pending" : "", isSkipped ? "skipped" : "", unit.flowKind === "adaptive" ? "adaptive" : ""].filter(Boolean).join(" ");
  const statusText = isLocked ? "\u672a解锁" : isPendingReview ? "\u5f85\u590d\u4e60" : isSkipped ? "\u5df2\u8df3\u8fc7" : isDone ? "\u5df2\u5b8c\u6210" : unit.flowKind === "adaptive" ? "\u53ef\u9009" : "\u5f85\u5b66\u4e60";
  return '<button class="' + cls + '" type="button" data-unit="' + unit.id + '">'
    + '<span>' + unitIcon(unit) + '</span>'
    + '<strong>' + escapeHtml(unit.label) + '</strong>'
    + '<small>' + escapeHtml(learningSceneRole(unit)) + ' · ' + statusText + '</small>'
    + '</button>';
}

function renderLessons() {
  const chapter = getChapter();
  els.chapterTitle.textContent = chapter.label;
  els.lessonList.classList.toggle("multi-scene-step-list", isMultiSceneLearningRoute());
  if (!chapter.loaded) {
    els.lessonList.innerHTML = '<div class="empty-state">\u70b9\u51fb\u5de6\u4fa7\u7ae0\u8282\u5361\u7247\u52a0\u8f7d\u672c\u7ae0\u5b66\u4e60\u6a21\u5757\u3002</div>';
    syncPathRailsToCurrent();
    return;
  }

  const displayUnits = typeof agenticDisplayUnitsForChapter === "function" ? agenticDisplayUnitsForChapter(chapter) : chapter.units;
  if (!displayUnits.length) {
    els.lessonList.innerHTML = '<div class="empty-state">完成当前小节后，学习建议会把下一步显示在这里。</div>';
    syncPathRailsToCurrent();
    return;
  }
  els.lessonList.innerHTML = displayUnits.map((unit, index) => {
    const isSkipped = typeof agenticIsSkipped === "function" && agenticIsSkipped(unit.id);
    const statusKind = typeof agenticLessonStatusKind === "function" ? agenticLessonStatusKind(unit.id) : "";
    const isPendingReview = statusKind === "review";
    const isUnlocked = typeof agenticUnitCompletionAllowed === "function"
      ? agenticUnitCompletionAllowed(unit.id)
      : typeof agenticIsUnitUnlocked !== "function" || agenticIsUnitUnlocked(unit.id);
    const isLocked = !isUnlocked && !isSkipped;
    const isDone = state.completed.includes(unit.id);
    const isRecommended = isUnlocked && !isSkipped && !isDone && !isPendingReview;
    const cls = ["lesson-card", "lesson-step-card", unit.id === currentUnitId ? "active" : "", isLocked ? "locked" : "", isPendingReview ? "review-pending" : "", isSkipped ? "skipped" : "", isRecommended ? "recommended" : "", unit.flowKind === "adaptive" ? "adaptive" : ""].filter(Boolean).join(" ");
    const statusText = lessonTimelineStatus(unit, isLocked, isSkipped, isDone, statusKind);
    const caption = lessonTimelineCaption(unit, statusText);
    return '<button class="' + cls + '" type="button" data-unit="' + unit.id + '">'
      + '<span class="lesson-step-index">' + (index + 1) + '</span>'
      + '<span class="lesson-card-body"><strong>' + escapeHtml(unit.label) + '</strong>'
      + '<small>' + escapeHtml(caption) + '</small></span>'
      + '<em>' + escapeHtml(statusText) + '</em>'
      + '</button>';
  }).join('');
  syncPathRailsToCurrent();
}

function renderChapters() {
  const chapterEntries = typeof agenticVisibleChaptersForNav === "function"
    ? agenticVisibleChaptersForNav()
    : curriculum.map((chapter, index) => ({ chapter, index }));
  els.chapterList.innerHTML = chapterEntries
    .map(({ chapter, index, mainIndex, extensionIndex }) => {
      const isUnlocked = typeof agenticIsChapterUnlocked !== "function" || agenticIsChapterUnlocked(chapter.id);
      const displayUnits = typeof agenticDisplayUnitsForChapter === "function"
        ? agenticDisplayUnitsForChapter(chapter)
        : chapter.units;
      const done = chapter.units.filter((unit) => unitCountsTowardProgress(unit)).length;
      const total = chapter.loaded ? chapter.units.length : AGENTIC_CORE_SCENE_ORDERS.length;
      const adaptiveShown = displayUnits.filter((unit) => unit.flowKind === "adaptive").length;
      const guide = chapterGuides[chapter.id];
      const isExtension = Boolean(chapter.extension || chapter.track === "extension");
      const cls = [
        "chapter-card",
        isExtension ? "extension" : "",
        chapter.id === currentChapterId ? "active" : "",
        isUnlocked ? "" : "locked"
      ].filter(Boolean).join(" ");
      const status = isUnlocked ? `${done}/${total} 模块` : "未解锁";
      const safeExtensionIndex = extensionIndex || curriculum.slice(0, index + 1).filter((item) => item.extension || item.track === "extension").length;
      const safeMainIndex = mainIndex || curriculum.slice(0, index + 1).filter((item) => !(item.extension || item.track === "extension")).length;
      const chapterCode = isExtension ? `扩展 ${safeExtensionIndex}` : `第 ${safeMainIndex} 章`;
      const parentLabel = chapter.parentChapterId ? `${chapter.parentChapterId} · ${chapter.parentChapterLabel}` : "";
      const displayCopy = chapterDisplayCopy(chapter);
      const trackLabel = chapterTrackLabel(chapter);
      const focusText = displayCopy.focus || guide?.checkpoint || "讲解页 + 自选互动场景";
      return `
        <button class="${cls}" type="button" data-chapter="${chapter.id}">
          <span class="chapter-card-top">
            <strong><span class="chapter-card-code">${escapeHtml(chapterCode)}</span>${escapeHtml(displayCopy.label)}</strong>
            <span>${escapeHtml(trackLabel)}</span>
          </span>
          ${parentLabel ? `<small class="chapter-parent">${escapeHtml(parentLabel)}</small>` : ""}
          <small>${status}${adaptiveShown ? ` · ${adaptiveShown} 个新加课件` : ""} · ${escapeHtml(displayCopy.summary)}</small>
          ${isUnlocked ? `<small class="chapter-bridge">${escapeHtml(focusText)}</small>` : ""}
        </button>
      `;
    })
    .join("");
}

function syncAgenticPlayerCta(unit) {
  if (!els.completeLesson || !unit) return;
  els.completeLesson.disabled = false;
  els.completeLesson.removeAttribute("aria-controls");
  delete els.completeLesson.dataset.scrollKnowledgeScene;
  if (typeof quizResourceReviewContext === "function" && quizResourceReviewContext(unit.id)) {
    els.completeLesson.textContent = "返回测验";
    return;
  }
  const completionAllowed = typeof agenticUnitCompletionAllowed !== "function"
    || agenticUnitCompletionAllowed(unit.id);
  if (!completionAllowed) {
    els.completeLesson.textContent = "未解锁：先接受学习建议";
    els.completeLesson.disabled = true;
  } else if (unit.type === "knowledge" && !selectedKnowledgeSceneType(unit)) {
    els.completeLesson.disabled = false;
    els.completeLesson.textContent = "先选择一个互动场景";
    els.completeLesson.dataset.scrollKnowledgeScene = "true";
    els.completeLesson.setAttribute("aria-controls", "knowledge-scene-panel");
  } else if (unit.type === "quiz" && unit.placeholderQuiz) {
    els.completeLesson.textContent = state.completed.includes(unit.id) ? "已记录，继续下一步" : "记录此流程节点";
  } else if (unit.type === "quiz" && !(state.submittedQuizzes || []).includes(unit.id)) {
    els.completeLesson.textContent = "提交测验后解锁下一步";
  } else if (typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(unit.id)) {
    const pending = state.agenticPath?.pendingPlan;
    els.completeLesson.textContent = pending?.phase === "grading_pending" ? "等待批改生成建议" : "先选择下一步";
  } else if (typeof agenticCompletionCta === "function") {
    const cta = agenticCompletionCta(unit);
    els.completeLesson.textContent = cta.label;
    els.completeLesson.disabled = Boolean(cta.disabled);
  }
}
