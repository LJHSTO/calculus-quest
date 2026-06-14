// Unified analytics collection for navigation, learning paths, quizzes, and iframe interactions.
const ANALYTICS_SESSION_KEY = "calculus-quest-analytics-session-v1";
const analyticsQueue = [];
const analyticsOnlinePeriodFlushMs = 5 * 60 * 1000;
const analyticsMinOnlinePeriodSeconds = 60;
const analyticsMinUnitSeconds = 5;
let analyticsFlushTimer = null;
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
  return state.analytics;
}

function currentAnalyticsView() {
  return document.querySelector(".view.active")?.id?.replace(/-view$/, "") || currentView || "";
}

function currentAnalyticsUnit() {
  return getUnit?.(currentUnitId) || null;
}

function moduleRoleForUnit(unit) {
  if (!unit) return "";
  if (unit.kind === "supplement") return "supplement";
  if (unit.type === "quiz") {
    if (unit.assessmentPhase === "pre") return "pretest";
    if (unit.assessmentPhase === "post") return "posttest";
    return "formative_quiz";
  }
  const title = String(unit.label || "");
  if (/知识地图|学习路线|概念地图/.test(title)) return "concept_map";
  if (/公式|桥梁|代数/.test(title)) return "formula_bridge";
  if (/复盘|总结|回顾/.test(title)) return "review";
  if (unit.type === "interactive") return "experiment";
  if (unit.type === "slide") return "instruction";
  return unit.type || "";
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
      moduleRole: ""
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
    moduleRole: moduleRoleForUnit(unit)
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

function analyticsTrack(eventType, payload = {}) {
  if (!isSignedIn()) return;
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

  analyticsQueue.push(event);
  if (analyticsQueue.length >= 50) analyticsFlush();
  else if (!analyticsFlushTimer) analyticsFlushTimer = setTimeout(analyticsFlush, 5000);
}

function trackInteraction(eventType, data = {}) {
  analyticsTrack(eventType, {
    source: data.source || "main",
    target: data.target || null,
    value: data.value || null,
    timing: data.timing || {},
    context: data.context || {},
    data
  });
}

async function analyticsFlush() {
  clearTimeout(analyticsFlushTimer);
  analyticsFlushTimer = null;
  if (!analyticsQueue.length) return;
  const batch = analyticsQueue.splice(0);
  for (const event of batch) {
    try {
      await trackLearningEvent("interaction", event, false);
    } catch {
      // Keep the UI responsive; failed analytics should not block learning.
    }
  }
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
  analyticsTrack("unit_leave", {
    unitId,
    durationMs: seconds * 1000,
    data: { unitId, seconds, reason }
  });
  analyticsActiveUnit = null;
  analyticsUnitStart = null;
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

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-view], [data-unit], [data-chapter], [data-jump-unit], .chapter-card, .lesson-card, .nav-button");
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

  clearInterval(analyticsViewTimer);
  analyticsViewTimer = setInterval(() => {
    const active = currentAnalyticsView();
    if (active && active !== analyticsLastTrackedView) {
      analyticsTrack("view_change", { data: { view: active, prev: analyticsLastTrackedView } });
      analyticsLastTrackedView = active;
    }
  }, 500);

  window.addEventListener("message", (event) => {
    if (event.data?.type !== "interaction_track") return;
    analyticsTrack(event.data.eventType || "iframe_event", {
      source: "iframe",
      data: event.data.payload || {}
    });
  });

  ["pointerdown", "keydown", "input", "scroll"].forEach((type) => {
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
    analyticsLeaveUnit("unload");
    analyticsTrackOnlinePeriod("unload");
    analyticsFlush();
  });
}
