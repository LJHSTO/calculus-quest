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
  const REPEATED_PARAMETER_CONTINUATION_EVENTS = new Set([
    "interactive_change",
    "interactive_drag_end",
    "interactive_input",
    "parameter_change",
    "parameter_commit"
  ]);
  // Moments where the learner has just finished something and can act on a
  // suggestion. Kept in step with PROACTIVE_NATURAL_BOUNDARY_EVENTS in
  // knowledge-assistant.js, which gates the quiet_dwell deferral the same way.
  const NATURAL_BOUNDARY_EVENTS = new Set([
    "parameter_commit",
    "interactive_submit",
    "courseware_interaction_complete",
    "courseware_formative_check_submitted",
    "courseware_challenge_result"
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

  function independentAttemptResult(event = {}) {
    const data = event.data || {};
    if ((event.eventType === "courseware_challenge_result" && data.independent !== true)
      || data.independent === false
      || Number(data.hint_count ?? data.hintCount) > 0
      || Number(data.reset_count ?? data.resetCount) > 0
      || data.error_type === "missed_expression"
      || data.selected_zone === "missed") return null;
    const raw = data.is_correct
      ?? data.isCorrect
      ?? data.correct
      ?? data.success
      ?? data.passed
      ?? data.completed
      ?? data.result;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw > 0;
    const normalized = compactText(raw, 40).toLowerCase();
    if (["correct", "success", "passed", "pass", "completed", "true"].includes(normalized)) {
      return true;
    }
    if (["incorrect", "failed", "fail", "wrong", "false"].includes(normalized)) {
      return false;
    }
    const score = Number(data.score);
    const maxScore = Number(data.max_score ?? data.maxScore);
    if (Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0) {
      return score >= maxScore * 0.6;
    }
    return null;
  }

  function createProactiveCoach(options = {}) {
    const config = { ...DEFAULTS, ...options };
    const cooldowns = new Map();
    const dismissStreaks = new Map();
    const commits = new Map();
    // Struggle observed while the learner is inside one activity type, per unit.
    // The switch is proposed at the NEXT natural boundary rather than the moment
    // the struggle is seen: a learner mid-drag should not be interrupted, and the
    // boundary is what makes "stop and look at it differently" a reasonable ask.
    const struggle = new Map();
    // Which activity types a knowledge point offers. Injected because the coach
    // only sees events, and the route is the only place that knows the candidate
    // set. Which types the learner has already opened is tracked here instead:
    // the coach receives every `knowledge_scene_select`, so it does not need to
    // depend on where the UI happens to keep its selection state.
    const sceneTypesFor = typeof options.sceneTypesFor === "function"
      ? options.sceneTypesFor
      : () => [];
    const visitedTypes = new Map();
    let currentUnit = null;
    let enteredAt = 0;
    let lastMeaningfulAt = 0;
    let activeSuggestion = null;
    let lastResolution = null;
    let suggestionSequence = 0;

    function enterUnit(event, at) {
      currentUnit = unitFromEvent(event);
      enteredAt = at;
      lastMeaningfulAt = at;
      activeSuggestion = null;
      commits.clear();
      struggle.clear();
      // Opening a knowledge point already counts as experiencing its default scene.
      if (currentUnit.unitId && currentUnit.sceneType) {
        const visited = visitedTypes.get(currentUnit.unitId) || new Set();
        visited.add(currentUnit.sceneType);
        visitedTypes.set(currentUnit.unitId, visited);
      }
      return null;
    }

    function enterScene(event, at) {
      const sceneType = compactText(event.sceneType || event.data?.sceneType, 80);
      currentUnit = { ...currentUnit, sceneType };
      enteredAt = at;
      lastMeaningfulAt = at;
      activeSuggestion = null;
      commits.clear();
      // The struggle belonged to the previous activity type; it does not carry over.
      struggle.clear();
      if (currentUnit.unitId && sceneType) {
        const visited = visitedTypes.get(currentUnit.unitId) || new Set();
        visited.add(sceneType);
        visitedTypes.set(currentUnit.unitId, visited);
      }
      return null;
    }

    function resetActivityBoundary(at) {
      enteredAt = at;
      lastMeaningfulAt = at;
      activeSuggestion = null;
      commits.clear();
      return null;
    }

    function canSuggest(at, options = {}) {
      if (!currentUnit?.unitId || !currentUnit.supported || activeSuggestion) return false;
      return options.bypassCooldown === true
        || at >= Number(cooldowns.get(currentUnit.unitId) || 0);
    }

    function createSuggestion(kind, at, content = {}, options = {}) {
      if (!canSuggest(at, options)) return null;
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

    function independentAttemptSuggestion(event, at) {
      const success = independentAttemptResult(event);
      if (success === null || currentUnit?.unitType === "quiz") return null;
      const data = event.data || {};
      return createSuggestion("independent_attempt_outcome", at, {
        success,
        sourceEventType: compactText(event.eventType, 80),
        attemptId: compactText(
          data.attempt_id || data.attemptId || data.challenge_id || data.challengeId,
          120
        ),
        eyebrow: "知点正在核对",
        title: "独立尝试结果已记录",
        body: "知点会结合上一轮支架判断是否退出或只升级一级。",
        actionLabel: "继续",
        question: "",
        contextMode: "unit"
      }, { bypassCooldown: true });
    }

    function quizSuggestion(event, at) {
      const incorrect = Math.max(0, Number(event.data?.incorrect || 0));
      const correct = Math.max(0, Number(event.data?.correct || 0));
      const pendingReview = Math.max(0, Number(event.data?.pendingReview || 0));
      if (pendingReview > 0) return null;
      const phase = compactText(event.data?.phase, 40).toLowerCase();
      if (phase === "formative") {
        return createSuggestion("formative_outcome", at, {
          incorrect,
          correct,
          pendingReview,
          phase,
          questionCount: Math.max(0, Number(event.data?.questionCount || 0)),
          eyebrow: "知点正在核对",
          title: "形成性结果已记录",
          body: "知点会先判断是否需要帮助；证据不足时不会出现提示。",
          actionLabel: "继续",
          question: "",
          contextMode: "unit"
        });
      }
      if (!incorrect) return null;
      return createSuggestion("quiz_review", at, {
        incorrect,
        correct,
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
      if(typeof window!=="undefined" && window.CoursewareSemantics?.parameterRelevant(currentUnit?.unitId,change.parameter)===false)return null;
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

    function continuesActiveSuggestion(eventType) {
      return activeSuggestion?.kind === "repeated_parameter"
        && REPEATED_PARAMETER_CONTINUATION_EVENTS.has(eventType);
    }

    // --- representation switch -------------------------------------------------
    // Trigger design: struggle first, boundary second.
    //
    // Need. The learner has to have actually tried and not got there: repeated
    // parameter commits in this scene without progress, or a judged attempt that
    // came back wrong. Time spent alone is not enough — sitting and thinking is not
    // struggling.
    //
    // Timing. The proposal waits for a natural boundary, the same set of events
    // that already gates `quiet_dwell`. Interrupting mid-drag would be worse than
    // saying nothing, and "look at this a different way" only makes sense at a
    // moment where the learner can act on it.
    //
    // Availability. Switching is pointless if every activity type has been opened,
    // so the proposal is dropped when there is nothing unseen to offer.
    //
    // How much struggle is enough. A single failed attempt is NOT enough: one
    // mistake is what the scaffold ladder is for, and it escalates one level. A
    // representation switch is a bigger claim — "this whole way of looking at it
    // is not working" — so it needs more evidence than that. Failures weigh double
    // because they are judged outcomes rather than mere activity, which makes the
    // bar reachable by two failures, by one failure plus one more commit, or by
    // three commits with no progress.
    const STRUGGLE_THRESHOLD = 3;
    const FAILURE_WEIGHT = 2;
    const STRUGGLE_WINDOW_MS = 5 * 60 * 1000;

    function noteStruggle(unitId, kind, at) {
      const entry = struggle.get(unitId) || { parameterCommits: 0, failedAttempts: 0, lastAt: at };
      if (at - entry.lastAt > STRUGGLE_WINDOW_MS) {
        entry.parameterCommits = 0;
        entry.failedAttempts = 0;
      }
      if (kind === "parameter") entry.parameterCommits += 1;
      if (kind === "failure") entry.failedAttempts += 1;
      entry.lastAt = at;
      struggle.set(unitId, entry);
      return entry;
    }

    function struggleLevel(unitId) {
      const entry = struggle.get(unitId);
      if (!entry) return 0;
      return entry.parameterCommits + entry.failedAttempts * FAILURE_WEIGHT;
    }

    function representationSwitchSuggestion(at) {
      const unitId = currentUnit?.unitId || "";
      const offered = sceneTypesFor(unitId) || [];
      const available = (Array.isArray(offered) ? offered : []).map((type) => ({
        typeId: compactText(type?.typeId || type?.id || type, 40),
        title: compactText(type?.title || type?.label || type?.typeId || type, 120)
      })).filter((type) => type.typeId);
      if (!available.length) return null;
      const experienced = new Set(visitedTypes.get(unitId) || []);
      const current = compactText(currentUnit?.sceneType, 80);
      if (current) experienced.add(current);
      const unseen = available.filter((type) => !experienced.has(type.typeId));
      if (!unseen.length) return null;
      const target = unseen[0];
      return createSuggestion("representation_switch", at, {
        targetTypeId: target.typeId,
        targetTitle: target.title,
        availableTypes: available.map((type) => type.typeId),
        experiencedTypes: [...experienced],
        eyebrow: "知点有个建议",
        title: "换一种方式看同一件事",
        body: `你在当前课件里已经试了几次。同一个知识点还有「${target.title}」这种看法，`
          + "换过去也许更容易看清。要试试吗？",
        actionLabel: "换个方式看看",
        question: "",
        contextMode: "unit"
      });
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
        if (
          activeSuggestion
          && !["quiz_review", "formative_outcome"].includes(activeSuggestion.kind)
          && !continuesActiveSuggestion(eventType)
        ) {
          resolve("ignore", at);
        }
      }
      if (["quiz_submit_success", "quiz_review_ready"].includes(eventType)) {
        return quizSuggestion(event, at);
      }
      if ([
        "courseware_challenge_result",
        "courseware_formative_check_submitted"
      ].includes(eventType)) {
        const attempt = independentAttemptResult(event);
        if (attempt === false && currentUnit.unitType !== "quiz") {
          noteStruggle(currentUnit.unitId, "failure", at);
        }
        return independentAttemptSuggestion(event, at);
      }
      if (eventType === "parameter_commit" && currentUnit.unitType !== "quiz") {
        const suggestion = recordParameterCommit(event, at);
        // A repeated-parameter suggestion already covers "you keep fiddling"; the
        // switch is for the case where that has not resolved anything, so the
        // struggle is counted either way and the switch is offered at a boundary.
        if (!suggestion) noteStruggle(currentUnit.unitId, "parameter", at);
        if (suggestion) return suggestion;
      }
      // Boundary: offer a different activity type if the current one is not working.
      if (
        NATURAL_BOUNDARY_EVENTS.has(eventType)
        && currentUnit.unitType !== "quiz"
        && struggleLevel(currentUnit.unitId) >= STRUGGLE_THRESHOLD
      ) {
        const switchSuggestion = representationSwitchSuggestion(at);
        if (switchSuggestion) {
          // The struggle has been acted on; do not raise the same proposal again
          // until new evidence accumulates.
          struggle.delete(currentUnit.unitId);
          return switchSuggestion;
        }
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
      const negativeResolution = reason === "dismiss" || reason === "ignore";
      const nextStreak = negativeResolution
        ? Math.min(previousStreak + 1, 3)
        : reason === "accept" ? 0 : previousStreak;
      dismissStreaks.set(resolved.unitId, nextStreak);
      const cooldownMultiplier = negativeResolution ? Math.max(1, nextStreak) : 1;
      // 「没有展示给学生」的结算一律不留冷却。
      //
      // 冷却的语义是"学生刚拒绝过，先别再来"，它的依据是**学生做过选择**。
      // 而 `not-shown` 表示这个候选根本没走到学生面前（例如服务端判定此刻不该
      // 干预、或客户端自己发现这个信号现在没有意义）。把它也算成一次拒绝，后果是
      // 一个知识点里的一次无关事件就吃掉该知识点整轮的候选额度——客户端冷却是 10
      // 分钟，而一个知识点只学约 5 分钟。干跑实测：这条不改，人均决策点是 **0**。
      const noClientCooldown = reason === "outcome-recorded" || reason === "not-shown";
      const cooldownUntil = noClientCooldown
        ? 0
        : at + config.cooldownMs * cooldownMultiplier;
      if (cooldownUntil) cooldowns.set(resolved.unitId, cooldownUntil);
      else cooldowns.delete(resolved.unitId);
      activeSuggestion = null;
      commits.clear();
      lastMeaningfulAt = at;
      lastResolution = {
        ...resolved,
        resolution: compactText(reason, 40) || "dismiss",
        dismissStreak: nextStreak,
        cooldownUntil,
        resolvedAt: new Date(at).toISOString(),
        latencyMs: Math.max(0, at - timestamp(resolved.createdAt, at))
      };
      return lastResolution;
    }

    function reset(options = {}) {
      currentUnit = null;
      enteredAt = 0;
      lastMeaningfulAt = 0;
      activeSuggestion = null;
      lastResolution = null;
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
      takeResolution() {
        const resolution = lastResolution;
        lastResolution = null;
        return resolution;
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
