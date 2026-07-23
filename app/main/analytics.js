// Unified analytics collection for navigation, learning paths, quizzes, and iframe interactions.
const ANALYTICS_SESSION_KEY = "calculus-quest-analytics-session-v1";
const analyticsQueue = [];
const analyticsOnlinePeriodFlushMs = 5 * 60 * 1000;
const analyticsMinOnlinePeriodSeconds = 60;
const analyticsMinUnitSeconds = 5;
let analyticsFlushTimer = null;
let analyticsFlushChain = Promise.resolve();
let analyticsSequence = Number(sessionStorage.getItem("cq_analytics_sequence") || 0);
let analyticsTrackingReady = false;
let analyticsViewTimer = null;
let analyticsHeartbeat = null;
let analyticsOnlinePeriodStart = null;
let analyticsActiveUnit = null;
let analyticsUnitStart = null;
let analyticsLastEventAt = Date.now();
let analyticsLastActiveAt = Date.now();
let analyticsLastTrackedView = "";
let analyticsCoachRefreshTimer = null;
let analyticsCoachLastRefreshAt = 0;
const analyticsPageStartedAt = Date.now();
let analyticsResearchContext = {
  appVersion: "",
  courseVersion: "",
  experimentId: "",
  condition: "",
  cohort: ""
};

fetch("api/research/config")
  .then((response) => response.ok ? response.json() : null)
  .then((payload) => {
    if (payload?.ok && payload.data) {
      analyticsResearchContext = {
        ...analyticsResearchContext,
        ...payload.data
      };
    }
  })
  .catch(() => {});

const analyticsCoachEvidenceEvents = new Set([
  "quiz_answer_revealed",
  "short_answer_input",
  "answer_select",
  "question_visible",
  "time_on_unit",
  "resource_fullscreen",
  "ui_wheel",
  "ui_input",
  "parameter_commit",
  "parameter_change",
  "interactive_click",
  "interactive_input",
  "interactive_change",
  "interactive_drag_end",
  "interactive_scroll",
  "interactive_wheel",
  "narration_play_click",
  "narration_pause_click",
  "narration_seek"
]);

function analyticsSessionId() {
  let id = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (!id) {
    id = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(ANALYTICS_SESSION_KEY, id);
  }
  return id;
}

function ensureAnalyticsState() {
  state.analytics = state.analytics || {};
  state.analytics.visitedUnits = state.analytics.visitedUnits || {};
  state.analytics.path = state.analytics.path || [];
  state.analytics.repeats = state.analytics.repeats || {};
  state.analytics.skips = state.analytics.skips || [];
  state.analytics.interactionEvidence = state.analytics.interactionEvidence || {};
  return state.analytics;
}

function analyticsEvidenceBucket(unitId, event = {}) {
  if (!unitId) return null;
  const analytics = ensureAnalyticsState();
  const bucket = analytics.interactionEvidence[unitId] || {
    unitId,
    chapterId: event.chapterId || "",
    unitType: event.unitType || "",
    moduleRole: event.moduleRole || "",
    events: 0,
    dwellMs: 0,
    repeatCount: 0,
    answerRevealCount: 0,
    questionVisibleCount: 0,
    choiceChangeCount: 0,
    shortAnswerLength: 0,
    resourceFullscreenCount: 0,
    narrationPlayCount: 0,
    narrationPauseCount: 0,
    narrationSeekCount: 0,
    uiWheelCount: 0,
    uiInputCount: 0,
    parameterChangeCount: 0,
    experiencedSceneTypes: [],
    firstAt: event.timing?.clientAt || new Date().toISOString(),
    lastAt: ""
  };
  bucket.chapterId = bucket.chapterId || event.chapterId || "";
  bucket.unitType = bucket.unitType || event.unitType || "";
  bucket.moduleRole = bucket.moduleRole || event.moduleRole || "";
  analytics.interactionEvidence[unitId] = bucket;
  return bucket;
}

function analyticsRememberInteractionEvidence(event) {
  const unitId = event?.unitId || event?.data?.unitId || "";
  const bucket = analyticsEvidenceBucket(unitId, event);
  if (!bucket) return;
  const type = event.eventType || "";
  bucket.events += 1;
  bucket.repeatCount = Math.max(bucket.repeatCount || 0, state.analytics?.visitedUnits?.[unitId] || 0);
  bucket.lastAt = event.timing?.clientAt || new Date().toISOString();
  if (type === "time_on_unit") {
    bucket.dwellMs += Math.max(
      Number(event.timing?.durationMs || 0),
      Math.max(0, Number(event.data?.seconds || 0)) * 1000
    );
  }
  if (type === "quiz_answer_revealed") bucket.answerRevealCount += 1;
  if (type === "question_visible") bucket.questionVisibleCount += 1;
  if (type === "answer_select") bucket.choiceChangeCount += 1;
  if (type === "short_answer_input") bucket.shortAnswerLength = Math.max(bucket.shortAnswerLength || 0, Number(event.data?.length || 0));
  if (type === "resource_fullscreen") bucket.resourceFullscreenCount += 1;
  if (["narration_play_click", "narration_resume", "narration_segment_play"].includes(type)) bucket.narrationPlayCount += 1;
  if (["narration_pause_click", "narration_pause", "narration_stop_click", "narration_stop"].includes(type)) bucket.narrationPauseCount += 1;
  if (["narration_seek", "narration_seek_input"].includes(type)) bucket.narrationSeekCount += 1;
  if (["ui_wheel", "interactive_wheel", "interactive_scroll"].includes(type)) bucket.uiWheelCount += 1;
  if (["ui_input", "interactive_input", "interactive_change"].includes(type)) bucket.uiInputCount += 1;
  if (["parameter_commit", "parameter_change"].includes(type)) bucket.parameterChangeCount += 1;
  const sceneType = event.sceneType || event.data?.sceneType || event.data?.selectedSceneType || "";
  if (
    sceneType
    && [
      "time_on_unit",
      "resource_fullscreen",
      "ui_wheel",
      "interactive_wheel",
      "interactive_scroll",
      "ui_input",
      "interactive_input",
      "interactive_change",
      "parameter_commit",
      "parameter_change"
    ].includes(type)
  ) {
    bucket.experiencedSceneTypes = Array.from(new Set([
      ...(bucket.experiencedSceneTypes || []),
      sceneType
    ]));
  }
}

function analyticsScheduleCoachEvidenceRefresh(event) {
  if (!event || !analyticsCoachEvidenceEvents.has(event.eventType || "")) return;
  if (typeof renderAgenticCoachPanel !== "function") return;
  if (event.unitId && event.unitId !== currentUnitId) return;
  if (currentAnalyticsView() !== "learn") return;
  if (typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(currentUnitId)) return;

  const now = Date.now();
  const elapsed = now - analyticsCoachLastRefreshAt;
  const delay = elapsed > 2500 ? 350 : 2500 - elapsed;
  clearTimeout(analyticsCoachRefreshTimer);
  analyticsCoachRefreshTimer = setTimeout(() => {
    analyticsCoachRefreshTimer = null;
    if (currentAnalyticsView() !== "learn") return;
    if (typeof agenticIsCurrentPending === "function" && agenticIsCurrentPending(currentUnitId)) return;
    analyticsCoachLastRefreshAt = Date.now();
    renderAgenticCoachPanel();
  }, delay);
}

function currentAnalyticsView() {
  return document.querySelector(".view.active")?.id?.replace(/-view$/, "") || currentView || "";
}

function currentAnalyticsUnit() {
  return getUnit?.(currentUnitId) || null;
}

function moduleRoleForUnit(unit) {
  if (!unit) return "";
  if (unit.type === "quiz") {
    if (unit.assessmentPhase === "pre") return "pretest";
    if (unit.assessmentPhase === "post") return "posttest";
    return "formative_quiz";
  }
  const title = String(unit.label || "");
  if (/知识地图|学习路线|概念地图/.test(title)) return "concept_map";
  if (/公式|桥梁|代数/.test(title)) return "formula_bridge";
  if (/复盘|总结|回顾/.test(title)) return "review";
  if (unit.type === "knowledge") return "knowledge_point";
  if (unit.type === "interactive") return "experiment";
  if (unit.type === "slide") return "instruction";
  return unit.type || "";
}

function analyticsKnowledgeSceneMeta(unit) {
  if (!unit || unit.type !== "knowledge") {
    return { sceneType: "", sceneLabel: "", resourceTitle: "" };
  }
  const types = typeof knowledgeInteractionTypes === "function" ? knowledgeInteractionTypes(unit) : [];
  const selectedType = state.selectedKnowledgeScenes?.[unit.id] || "";
  const selected = types.find((type) => type.id === selectedType);
  if (!selected) {
    return {
      sceneType: "",
      sceneLabel: "互动场景未选择",
      resourceTitle: ""
    };
  }
  const candidate = typeof knowledgeResourceCandidate === "function"
    ? knowledgeResourceCandidate(unit, selectedType)
    : null;
  return {
    sceneType: selectedType,
    sceneLabel: typeof knowledgeSceneDisplayLabel === "function"
      ? knowledgeSceneDisplayLabel(selected)
      : selected.title || selected.label || selectedType,
    resourceTitle: candidate?.title || ""
  };
}

function analyticsUnitMeta(unit = currentAnalyticsUnit()) {
  if (!unit) {
    return {
      view: currentAnalyticsView(),
      chapterId: currentChapterId || "",
      chapterLabel: getChapter?.(currentChapterId)?.label || "",
      unitId: currentUnitId || "",
      unitLabel: "",
      unitType: "",
      moduleRole: "",
      sceneType: "",
      sceneLabel: "",
      resourceTitle: ""
    };
  }
  const chapter = getChapter?.(unit.chapterId);
  return {
    view: currentAnalyticsView(),
    chapterId: unit.chapterId || "",
    chapterLabel: chapter?.label || unit.chapterLabel || "",
    unitId: unit.id || "",
    unitLabel: unit.label || "",
    unitType: unit.type || unit.kind || "",
    moduleRole: moduleRoleForUnit(unit),
    ...analyticsKnowledgeSceneMeta(unit)
  };
}

function compactAnalyticsText(value = "", limit = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function analyticsElementTarget(element, event) {
  if (!element) return null;
  const rect = element.getBoundingClientRect?.();
  const point =
    rect && event && typeof event.clientX === "number"
      ? {
          x: Math.round(event.clientX - rect.left),
          y: Math.round(event.clientY - rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      : null;
  return {
    tag: element.tagName?.toLowerCase() || "",
    id: element.id || "",
    className: compactAnalyticsText(element.className || "", 80),
    role: element.getAttribute?.("role") || "",
    label: compactAnalyticsText(
      element.getAttribute?.("aria-label") ||
        element.getAttribute?.("title") ||
        element.textContent ||
        element.value ||
        element.getAttribute?.("name") ||
        element.id ||
        ""
    ),
    dataset: {
      view: element.dataset?.view || "",
      chapter: element.dataset?.chapter || "",
      unit: element.dataset?.unit || "",
      jumpUnit: element.dataset?.jumpUnit || ""
    },
    point
  };
}

function analyticsControlValue(element) {
  if (!element) return null;
  const tag = element.tagName?.toLowerCase() || "";
  const type = String(element.getAttribute?.("type") || "").toLowerCase();
  const isEditable = element.isContentEditable || element.matches?.("[contenteditable='true']");
  if (type === "password") {
    return { inputType: type, valueSummary: element.value ? "已输入" : "空", textLength: element.value?.length || 0 };
  }
  if (type === "checkbox" || type === "radio") {
    return { inputType: type, valueSummary: element.checked ? "选中" : "未选中", checked: Boolean(element.checked) };
  }
  if (tag === "select") {
    return {
      inputType: "select",
      valueSummary: compactAnalyticsText(element.selectedOptions?.[0]?.textContent || element.value || "", 80)
    };
  }
  if (["range", "number", "color", "date", "time", "month", "week"].includes(type)) {
    return { inputType: type, valueSummary: compactAnalyticsText(element.value || "", 80), value: element.value || "" };
  }
  if (tag === "textarea" || isEditable || ["text", "search", "email", "url", "tel"].includes(type)) {
    const text = isEditable ? element.textContent || "" : element.value || "";
    return { inputType: type || tag || "text", valueSummary: `已输入 ${text.length} 个字符`, textLength: text.length };
  }
  if ("value" in element) {
    return { inputType: type || tag, valueSummary: compactAnalyticsText(element.value || "", 80), value: element.value || "" };
  }
  return null;
}

function analyticsControlData(element, event) {
  const valueInfo = analyticsControlValue(element);
  return {
    text: compactAnalyticsText(element?.textContent || element?.getAttribute?.("aria-label") || element?.getAttribute?.("title") || "", 80),
    label: compactAnalyticsText(
      element?.getAttribute?.("aria-label") ||
        element?.getAttribute?.("title") ||
        element?.textContent ||
        element?.getAttribute?.("name") ||
        element?.id ||
        "",
      80
    ),
    name: element?.getAttribute?.("name") || "",
    id: element?.id || "",
    tag: element?.tagName?.toLowerCase() || "",
    role: element?.getAttribute?.("role") || "",
    inputType: valueInfo?.inputType || element?.getAttribute?.("type") || "",
    valueSummary: valueInfo?.valueSummary || "",
    textLength: valueInfo?.textLength || 0,
    checked: valueInfo?.checked,
    view: element?.dataset?.view || "",
    chapter: element?.dataset?.chapter || "",
    unit: element?.dataset?.unit || element?.dataset?.jumpUnit || "",
    key: event?.key || "",
    code: event?.code || "",
    deltaX: typeof event?.deltaX === "number" ? Math.round(event.deltaX) : undefined,
    deltaY: typeof event?.deltaY === "number" ? Math.round(event.deltaY) : undefined
  };
}

function analyticsTrack(eventType, payload = {}) {
  if (!isSignedIn() || (typeof authTransitionInProgress !== "undefined" && authTransitionInProgress)) return;
  const persist = payload.persist !== false;
  const now = Date.now();
  const unit = payload.unitId ? getUnit?.(payload.unitId) : currentAnalyticsUnit();
  const meta = analyticsUnitMeta(unit);
  const sequenceIndex = ++analyticsSequence;
  sessionStorage.setItem("cq_analytics_sequence", String(analyticsSequence));
  const sinceLastEventMs = now - analyticsLastEventAt;
  analyticsLastEventAt = now;

  const event = {
    schemaVersion: 1,
    sessionId: analyticsSessionId(),
    sequenceIndex,
    eventType,
    source: payload.source || "main",
    research: { ...analyticsResearchContext },
    ...meta,
    target: payload.target || null,
    value: payload.value || null,
    timing: {
      clientAt: new Date(now).toISOString(),
      sinceLastEventMs,
      sinceUnitEnterMs: analyticsUnitStart ? now - analyticsUnitStart : 0,
      durationMs: payload.durationMs || 0,
      activeMs: payload.activeMs || 0,
      visibleMs: payload.visibleMs || 0,
      ...(payload.timing || {})
    },
    context: {
      completedBefore: unit?.id ? state.completed.includes(unit.id) : false,
      isRepeatVisit: unit?.id ? Boolean((state.analytics?.visitedUnits || {})[unit.id]) : false,
      pathIndex: state.analytics?.path?.length || 0,
      ...(payload.context || {})
    },
    data: payload.data || {}
  };
  if (eventType === "switch_view" && event.data?.to) {
    analyticsLastTrackedView = String(event.data.to);
  }

  analyticsRememberInteractionEvidence(event);
  analyticsScheduleCoachEvidenceRefresh(event);
  if (!persist) return;
  analyticsQueue.push({
    token: state.authToken,
    participantId: state.participant?.participantId || "",
    event
  });
  if (analyticsQueue.length >= 50) analyticsFlush();
  else if (!analyticsFlushTimer) analyticsFlushTimer = setTimeout(analyticsFlush, 5000);
}

function analyticsEnvironment() {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height = window.innerHeight || document.documentElement.clientHeight || 0;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
  return {
    deviceType: width < 700 ? "手机" : width < 1100 ? "平板/小屏电脑" : "桌面电脑",
    viewport: { width, height },
    screen: {
      width: window.screen?.width || 0,
      height: window.screen?.height || 0
    },
    pixelRatio: Number(window.devicePixelRatio || 1),
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    touch: Number(navigator.maxTouchPoints || 0) > 0 || coarsePointer,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false,
    connection: navigator.connection?.effectiveType || "",
    referrerHost: (() => {
      try { return document.referrer ? new URL(document.referrer).host : ""; } catch { return ""; }
    })()
  };
}

function trackInteraction(eventType, data = {}) {
  analyticsTrack(eventType, {
    persist: data.persist,
    source: data.source || "main",
    target: data.target || null,
    value: data.value || null,
    timing: data.timing || {},
    context: data.context || {},
    data
  });
}

function analyticsBatchGroups(batch = []) {
  const groups = new Map();
  batch.forEach((entry) => {
    const token = String(entry?.token || "");
    if (!token || !entry?.event) return;
    const participantId = String(entry.participantId || "");
    const key = `${participantId}\n${token}`;
    if (!groups.has(key)) groups.set(key, { token, participantId, events: [] });
    groups.get(key).events.push(entry.event);
  });
  return Array.from(groups.values());
}

function analyticsFlush() {
  clearTimeout(analyticsFlushTimer);
  analyticsFlushTimer = null;
  if (!analyticsQueue.length) return analyticsFlushChain;
  const batch = analyticsQueue.splice(0);
  const groups = analyticsBatchGroups(batch);
  const flushGroups = async () => {
    for (const group of groups) {
      try {
        await apiRequest("api/learning/events", {
          token: group.token,
          events: group.events.map((event) => ({ type: "interaction", payload: event }))
        });
      } catch {
        // Keep the UI responsive; failed analytics should not block learning.
      }
    }
  };
  analyticsFlushChain = analyticsFlushChain.then(flushGroups, flushGroups);
  return analyticsFlushChain;
}

function analyticsFlushBeforeUnload() {
  clearTimeout(analyticsFlushTimer);
  analyticsFlushTimer = null;
  if (!analyticsQueue.length) return;
  const batch = analyticsQueue.splice(0);
  analyticsBatchGroups(batch).forEach((group) => {
    const body = JSON.stringify({
      token: group.token,
      events: group.events.map((event) => ({ type: "interaction", payload: event }))
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("api/learning/events", blob)) return;
    }

    fetch("api/learning/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  });
}

function analyticsRecordPath(unit, reason = "open") {
  if (!unit) return;
  const analytics = ensureAnalyticsState();
  const visitCount = (analytics.visitedUnits[unit.id] || 0) + 1;
  analytics.visitedUnits[unit.id] = visitCount;
  if (visitCount > 1) analytics.repeats[unit.id] = visitCount;
  analytics.path.push({
    unitId: unit.id,
    chapterId: unit.chapterId,
    unitType: unit.type,
    moduleRole: moduleRoleForUnit(unit),
    reason,
    at: beijingNow()
  });
  analytics.path = analytics.path.slice(-500);
}

function analyticsDetectSkips(prevUnit, nextUnit) {
  if (!prevUnit || !nextUnit || prevUnit.id === nextUnit.id) return;
  const analytics = ensureAnalyticsState();
  if (prevUnit.chapterId === nextUnit.chapterId) {
    const chapter = getChapter(prevUnit.chapterId);
    const units = chapter?.units || [];
    const from = units.findIndex((item) => item.id === prevUnit.id);
    const to = units.findIndex((item) => item.id === nextUnit.id);
    if (from >= 0 && to > from + 1) {
      const skippedUnitIds = units.slice(from + 1, to).filter((item) => !state.completed.includes(item.id)).map((item) => item.id);
      if (skippedUnitIds.length) {
        const record = { fromUnitId: prevUnit.id, toUnitId: nextUnit.id, skippedUnitIds, at: beijingNow() };
        analytics.skips.push(record);
        analyticsTrack("skip_units", { context: record, data: record });
      }
    }
    return;
  }

  const fromChapter = curriculum.findIndex((item) => item.id === prevUnit.chapterId);
  const toChapter = curriculum.findIndex((item) => item.id === nextUnit.chapterId);
  if (fromChapter >= 0 && toChapter > fromChapter + 1) {
    const skippedChapterIds = curriculum.slice(fromChapter + 1, toChapter).map((item) => item.id);
    const record = { fromChapterId: prevUnit.chapterId, toChapterId: nextUnit.chapterId, skippedChapterIds, at: beijingNow() };
    analytics.skips.push(record);
    analyticsTrack("skip_chapters", { context: record, data: record });
  }
}

function analyticsEnterUnit(unit, reason = "open") {
  if (!unit) return;
  const prevUnit = analyticsActiveUnit ? getUnit?.(analyticsActiveUnit) : null;
  if (analyticsActiveUnit && analyticsActiveUnit !== unit.id) analyticsLeaveUnit("switch_unit");
  analyticsDetectSkips(prevUnit, unit);
  analyticsRecordPath(unit, reason);
  const repeatCount = state.analytics?.visitedUnits?.[unit.id] || 1;
  analyticsActiveUnit = unit.id;
  analyticsUnitStart = Date.now();
  analyticsTrack(repeatCount > 1 || state.completed.includes(unit.id) ? "repeat_unit_enter" : "unit_enter", {
    data: {
      reason,
      repeatCount,
      completedBefore: state.completed.includes(unit.id)
    }
  });
}

function analyticsLeaveUnit(reason = "leave") {
  if (!analyticsActiveUnit || !analyticsUnitStart) return;
  const seconds = Math.round((Date.now() - analyticsUnitStart) / 1000);
  const unitId = analyticsActiveUnit;
  if (seconds >= analyticsMinUnitSeconds) {
    analyticsTrack("time_on_unit", {
      unitId,
      durationMs: seconds * 1000,
      data: { unitId, seconds, reason }
    });
  }
  analyticsActiveUnit = null;
  analyticsUnitStart = null;
}

function analyticsResumeUnitTimer(unit) {
  if (
    !unit
    || !isSignedIn()
    || document.hidden
    || currentAnalyticsView() !== "learn"
    || currentUnitId !== unit.id
  ) {
    return;
  }
  analyticsActiveUnit = unit.id;
  analyticsUnitStart = Date.now();
}

function analyticsTrackTarget(eventType, element, event, extra = {}) {
  analyticsTrack(eventType, {
    ...extra,
    target: analyticsElementTarget(element, event)
  });
}

function analyticsTrackOnlinePeriod(reason = "interval") {
  if (!isSignedIn() || !analyticsOnlinePeriodStart) return;
  const now = Date.now();
  const seconds = Math.round((now - analyticsOnlinePeriodStart) / 1000);
  if (seconds >= analyticsMinOnlinePeriodSeconds) {
    analyticsTrack("online_period", {
      data: {
        startedAt: new Date(analyticsOnlinePeriodStart).toISOString(),
        endedAt: new Date(now).toISOString(),
        seconds,
        view: currentAnalyticsView(),
        unitId: currentAnalyticsUnit()?.id || currentUnitId || "",
        reason
      },
      durationMs: seconds * 1000
    });
  }
  analyticsOnlinePeriodStart = document.hidden ? null : now;
}

function setupInteractionTracking() {
  if (!isSignedIn()) return;
  analyticsOnlinePeriodStart = Date.now();
  if (analyticsTrackingReady) return;
  analyticsTrackingReady = true;
  analyticsLastTrackedView = currentAnalyticsView();
  analyticsTrack("session_start", {
    source: "system",
    data: {
      environment: analyticsEnvironment()
    }
  });

  const uiActionSelector = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "summary",
    "[role='button']",
    "[role='tab']",
    "[role='switch']",
    "[role='menuitem']",
    "[contenteditable='true']",
    "[data-view]",
    "[data-unit]",
    "[data-chapter]",
    "[data-jump-unit]",
    "[data-agentic-action]",
    "[data-filter]",
    "[data-submit-quiz]",
    "[data-resource-fullscreen]",
    "[data-play-narration]",
    "[data-pause-narration]",
    "[data-stop-narration]",
    "[data-toggle-narration]"
  ].join(",");
  const semanticClickSelector = [
    "[data-view]",
    "[data-unit]",
    "[data-chapter]",
    "[data-jump-unit]",
    ".chapter-card",
    ".lesson-card",
    ".nav-button"
  ].join(",");
  const uiInputSelector = "input, select, textarea, [contenteditable='true']";

  document.addEventListener("click", (event) => {
    const el = event.target.closest(semanticClickSelector);
    if (!el) return;
    analyticsTrackTarget("click", el, event, {
      data: {
        text: compactAnalyticsText(el.textContent || "", 60),
        view: el.dataset.view || "",
        chapter: el.dataset.chapter || "",
        unit: el.dataset.unit || el.dataset.jumpUnit || ""
      }
    });
  });

  document.addEventListener(
    "click",
    (event) => {
      if (event.target.closest(semanticClickSelector)) return;
      const el = event.target.closest(uiActionSelector);
      if (!el) return;
      analyticsTrackTarget("ui_click", el, event, {
        data: analyticsControlData(el, event)
      });
    },
    true
  );

  document.addEventListener(
    "change",
    (event) => {
      const el = event.target.closest(uiInputSelector);
      if (!el) return;
      const valueInfo = analyticsControlValue(el);
      analyticsTrackTarget("ui_change", el, event, {
        value: valueInfo,
        data: analyticsControlData(el, event)
      });
    },
    true
  );

  clearInterval(analyticsViewTimer);
  analyticsViewTimer = setInterval(() => {
    const active = currentAnalyticsView();
    if (active && active !== analyticsLastTrackedView) {
      analyticsTrack("view_change", { data: { view: active, prev: analyticsLastTrackedView } });
      analyticsLastTrackedView = active;
    }
  }, 500);

  window.addEventListener("message", (event) => {
    const messageType = String(event.data?.type || "");
    const trustedFrame = Array.from(document.querySelectorAll("iframe.embed-frame"))
      .find((frame) => frame.contentWindow === event.source);
    if (!trustedFrame) return;
    if (messageType === "cq:interaction" && event.data.eventType === "parameter_commit") {
      const contextRef = event.data.contextRef || event.data.payload || {};
      analyticsTrack("parameter_commit", {
        source: "courseware-bridge",
        unitId: contextRef.unitId || currentUnitId,
        value: contextRef.state || null,
        data: {
          sceneType: trustedFrame.dataset.contextSceneType || contextRef.sceneType || "",
          contextKind: contextRef.kind || "interaction",
          contextConfidence: contextRef.confidence || "low"
        }
      });
      return;
    }
    if (messageType === "interaction_track") {
      analyticsTrack(event.data.eventType || "iframe_event", {
        source: "iframe",
        data: event.data.payload || {}
      });
    }
  });

  ["pointerdown", "keydown", "input", "change", "scroll", "wheel"].forEach((type) => {
    document.addEventListener(type, () => {
      analyticsLastActiveAt = Date.now();
    }, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      analyticsLeaveUnit("hidden");
      analyticsTrackOnlinePeriod("hidden");
      analyticsTrack("visibility", { data: { hidden: true } });
    } else {
      analyticsOnlinePeriodStart = Date.now();
      analyticsTrack("visibility", { data: { hidden: false } });
    }
  });

  clearInterval(analyticsHeartbeat);
  analyticsHeartbeat = setInterval(() => {
    if (!document.hidden) analyticsTrackOnlinePeriod("interval");
  }, analyticsOnlinePeriodFlushMs);

  window.addEventListener("beforeunload", () => {
    analyticsTrack("session_end", {
      source: "system",
      data: {
        reason: "unload",
        pageOpenSeconds: Math.max(0, Math.round((Date.now() - analyticsPageStartedAt) / 1000))
      }
    });
    analyticsLeaveUnit("unload");
    analyticsTrackOnlinePeriod("unload");
    analyticsFlushBeforeUnload();
  });
}
