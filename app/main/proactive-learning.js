(function initProactiveLearningCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ProactiveLearningCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProactiveLearningCore() {
  "use strict";

  const DEFAULTS = Object.freeze({
    repeatCount: 3,
    repeatWindowMs: 45 * 1000,
    dwellThresholdMs: 90 * 1000,
    readingDwellThresholdMs: 150 * 1000,
    cooldownMs: 10 * 60 * 1000,
    duplicateCommitMs: 800
  });

  const MEANINGFUL_EVENTS = new Set([
    "answer_select",
    "interactive_change",
    "interactive_click",
    "interactive_drag_end",
    "interactive_input",
    "interactive_scroll",
    "interactive_wheel",
    "ui_wheel",
    "parameter_change",
    "parameter_commit",
    "resource_fullscreen",
    "short_answer_input",
    "knowledge_context_selected",
    "knowledge_question_asked",
    "knowledge_answer_received",
    "assistant_open",
    "assistant_close"
  ]);

  function compactText(value = "", limit = 160) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function timestamp(value, fallback = Date.now()) {
    if (Number.isFinite(value)) return Number(value);
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function unitFromEvent(event = {}) {
    const data = event.data || {};
    return {
      unitId: compactText(event.unitId || data.unitId, 160),
      unitLabel: compactText(event.unitLabel || data.unitLabel || "当前学习内容", 160),
      unitType: compactText(event.unitType || data.unitType, 80),
      sceneType: compactText(event.sceneType || data.sceneType, 80),
      supported: ["knowledge", "quiz", "slide", "interactive"].includes(
        compactText(event.unitType || data.unitType, 80)
      )
    };
  }

  function parameterChange(event = {}) {
    const data = event.data || {};
    const state = event.value || data.state || data.contextRef?.state || {};
    const parameter = compactText(
      state.parameter || state.param || data.parameter || data.label || "当前参数",
      120
    );
    const oldValue = state.oldValue ?? state.old ?? data.oldValue ?? "";
    const newValue = state.newValue ?? state.new ?? data.newValue ?? data.currentValue ?? "";
    const hasNewValue = newValue !== "" && newValue !== null && newValue !== undefined;
    const hasOldValue = oldValue !== "" && oldValue !== null && oldValue !== undefined;
    if (!parameter || !hasNewValue) return null;
    if (hasOldValue && String(oldValue) === String(newValue)) return null;
    return {
      parameter,
      oldValue: compactText(oldValue, 80),
      newValue: compactText(newValue, 80)
    };
  }

  function createProactiveCoach(options = {}) {
    const config = { ...DEFAULTS, ...options };
    const cooldowns = new Map();
    const dismissStreaks = new Map();
    const commits = new Map();
    let currentUnit = null;
    let enteredAt = 0;
    let lastMeaningfulAt = 0;
    let activeSuggestion = null;
    let suggestionSequence = 0;

    function enterUnit(event, at) {
      currentUnit = unitFromEvent(event);
      enteredAt = at;
      lastMeaningfulAt = at;
      activeSuggestion = null;
      commits.clear();
      return null;
    }

    function enterScene(event, at) {
      currentUnit = {
        ...currentUnit,
        sceneType: compactText(event.sceneType || event.data?.sceneType, 80)
      };
      enteredAt = at;
      lastMeaningfulAt = at;
      activeSuggestion = null;
      commits.clear();
      return null;
    }

    function resetActivityBoundary(at) {
      enteredAt = at;
      lastMeaningfulAt = at;
      activeSuggestion = null;
      commits.clear();
      return null;
    }

    function canSuggest(at) {
      if (!currentUnit?.unitId || !currentUnit.supported || activeSuggestion) return false;
      return at >= Number(cooldowns.get(currentUnit.unitId) || 0);
    }

    function createSuggestion(kind, at, content = {}) {
      if (!canSuggest(at)) return null;
      activeSuggestion = Object.freeze({
        id: `${currentUnit.unitId}:${kind}:${++suggestionSequence}`,
        kind,
        unitId: currentUnit.unitId,
        dismissStreak: Number(dismissStreaks.get(currentUnit.unitId) || 0),
        createdAt: new Date(at).toISOString(),
        ...content
      });
      return activeSuggestion;
    }

    function repeatedParameterSuggestion(change, at) {
      return createSuggestion("repeated_parameter", at, {
        parameter: change.parameter,
        oldValue: change.oldValue,
        newValue: change.newValue,
        eyebrow: "知点留意到",
        title: `你连续调整了「${change.parameter}」`,
        body: "先别急着继续拖动，找出一个随它改变的量，会更容易看清这段课件的关系。",
        actionLabel: "带我观察",
        question: `我连续调整了${change.parameter}，但还不确定该重点观察哪些量。请结合当前课件告诉我应该先看哪里。`,
        contextMode: "recent_interaction"
      });
    }

    function quizSuggestion(event, at) {
      const incorrect = Math.max(0, Number(event.data?.incorrect || 0));
      if (!incorrect) return null;
      const pendingReview = Math.max(0, Number(event.data?.pendingReview || 0));
      if (pendingReview > 0) return null;
      return createSuggestion("quiz_review", at, {
        incorrect,
        pendingReview,
        questionCount: Math.max(0, Number(event.data?.questionCount || 0)),
        eyebrow: "适合现在复盘",
        title: `${incorrect} 道错题可以逐题复盘`,
        body: "从第一道错题开始判断卡点，解释后可以继续下一题。",
        actionLabel: "开始复盘",
        question: "",
        contextMode: "unit"
      });
    }

    function quietDwellSuggestion(at) {
      const label = currentUnit?.unitLabel || "这一处";
      return createSuggestion("quiet_dwell", at, {
        dwellSeconds: Math.round((at - lastMeaningfulAt) / 1000),
        eyebrow: "需要一个切入点吗",
        title: `从「${label}」找一个观察点`,
        body: "可以先看清一个量怎样变化，再决定要不要展开解释。",
        actionLabel: "给我一个切入点",
        question: `我在「${label}」停了一会儿，应该先观察哪里？请给我一个简短的观察任务，不要直接替我下结论。`,
        contextMode: "unit"
      });
    }

    function recordParameterCommit(event, at) {
      const change = parameterChange(event);
      if (!change) return null;
      const key = `${currentUnit?.sceneType || event.sceneType || "scene"}:${change.parameter}`;
      const fingerprint = `${change.oldValue}\n${change.newValue}`;
      const recent = (commits.get(key) || [])
        .filter((item) => at - item.at <= config.repeatWindowMs);
      const duplicate = recent.some((item) => (
        item.fingerprint === fingerprint && at - item.at <= config.duplicateCommitMs
      ));
      if (duplicate) {
        commits.set(key, recent);
        return null;
      }
      recent.push({ at, fingerprint });
      commits.set(key, recent);
      if (recent.length < config.repeatCount) return null;
      return repeatedParameterSuggestion(change, at);
    }

    function consume(event = {}, atValue) {
      const at = timestamp(atValue, timestamp(event.timing?.clientAt));
      const eventType = compactText(event.eventType, 80);
      if (["unit_enter", "repeat_unit_enter"].includes(eventType)) {
        return enterUnit(event, at);
      }
      if (!currentUnit?.unitId || compactText(event.unitId, 160) !== currentUnit.unitId) return null;
      if (eventType === "knowledge_scene_select") return enterScene(event, at);
      if (["visibility", "view_change", "switch_view"].includes(eventType)) {
        return resetActivityBoundary(at);
      }

      if (MEANINGFUL_EVENTS.has(eventType)) {
        lastMeaningfulAt = at;
        if (activeSuggestion && activeSuggestion.kind !== "quiz_review") {
          activeSuggestion = null;
          commits.clear();
        }
      }
      if (["quiz_submit_success", "quiz_review_ready"].includes(eventType)) {
        return quizSuggestion(event, at);
      }
      if (eventType === "parameter_commit" && currentUnit.unitType !== "quiz") {
        return recordParameterCommit(event, at);
      }
      return null;
    }

    function tick(atValue = Date.now()) {
      const at = timestamp(atValue);
      if (activeSuggestion) return activeSuggestion;
      if (!currentUnit?.supported || currentUnit.unitType === "quiz") return null;
      const readingScene = currentUnit.unitType === "slide" || currentUnit.sceneType === "slide";
      const baseDwellThresholdMs = Math.max(0, Number(config.dwellThresholdMs) || 0);
      const readingDwellThresholdMs = Math.max(
        baseDwellThresholdMs,
        Number(config.readingDwellThresholdMs) || baseDwellThresholdMs
      );
      const dwellThresholdMs = readingScene
        ? readingDwellThresholdMs
        : baseDwellThresholdMs;
      if (at - lastMeaningfulAt < dwellThresholdMs) return null;
      return quietDwellSuggestion(at);
    }

    function resolve(reason = "dismiss", atValue = Date.now()) {
      if (!activeSuggestion) return null;
      const resolved = activeSuggestion;
      const at = timestamp(atValue);
      const previousStreak = Number(dismissStreaks.get(resolved.unitId) || 0);
      const nextStreak = reason === "dismiss"
        ? Math.min(previousStreak + 1, 3)
        : reason === "accept" ? 0 : previousStreak;
      dismissStreaks.set(resolved.unitId, nextStreak);
      const cooldownMultiplier = reason === "dismiss" ? Math.max(1, nextStreak) : 1;
      const cooldownUntil = at + config.cooldownMs * cooldownMultiplier;
      cooldowns.set(resolved.unitId, cooldownUntil);
      activeSuggestion = null;
      commits.clear();
      lastMeaningfulAt = at;
      return {
        ...resolved,
        resolution: compactText(reason, 40) || "dismiss",
        dismissStreak: nextStreak,
        cooldownUntil
      };
    }

    function reset(options = {}) {
      currentUnit = null;
      enteredAt = 0;
      lastMeaningfulAt = 0;
      activeSuggestion = null;
      commits.clear();
      if (options.clearCooldowns === true) {
        cooldowns.clear();
        dismissStreaks.clear();
      }
      return true;
    }

    return Object.freeze({
      consume,
      tick,
      resolve,
      reset,
      getSuggestion() {
        return activeSuggestion;
      },
      getCurrentUnit() {
        return currentUnit ? { ...currentUnit, enteredAt, lastMeaningfulAt } : null;
      },
      getPreference() {
        return {
          dismissStreak: currentUnit?.unitId
            ? Number(dismissStreaks.get(currentUnit.unitId) || 0)
            : 0,
          cooldownUntil: currentUnit?.unitId
            ? Number(cooldowns.get(currentUnit.unitId) || 0)
            : 0
        };
      }
    });
  }

  return Object.freeze({ createProactiveCoach });
});
