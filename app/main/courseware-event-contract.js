(function initCoursewareEventContract(global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global?.document) global.CoursewareEventContract = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function coursewareEventContractFactory() {
  "use strict";
  const V2 = "openmaic-learning-event-v2";
  const LEGACY_ALIASES = Object.freeze({
    scene_entered: "page_loaded",
    parameter_changed: "interaction_change",
    attempt_submitted: "observable_evidence_captured",
    hint_requested: "hint_used",
    representation_switched: "interaction_change",
    reset_used: "interaction_change",
    independent_check_completed: "observable_evidence_captured",
    scene_completed: "interaction_complete"
  });
  const FIELDS = Object.freeze({
    schemaVersion: "schema_version",
    eventType: "event_type",
    eventId: "event_id",
    chapterId: "chapter_id",
    knowledgePointId: "knowledge_point_id",
    sceneId: "scene_id",
    taskId: "task_id",
    attemptId: "attempt_id",
    attemptNumber: "attempt_number",
    isCorrect: "is_correct",
    maxScore: "max_score",
    errorCategory: "error_type",
    strategyTag: "strategy_tag",
    independenceLevel: "independence_level",
    evidenceConfidence: "evidence_confidence",
    hintCount: "hint_count",
    resetCount: "reset_count",
    timeOnTaskMs: "time_on_task_ms"
  });

  function normalize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const nested = raw.interaction_state;
    // OpenMAIC posts a canonical event followed by a legacy envelope containing
    // the same canonical event. Only discard that explicitly identifiable echo.
    if (raw.schemaVersion === undefined && raw.schema_version === undefined
      && nested?.schemaVersion === V2
      && LEGACY_ALIASES[nested.eventType] === raw.event_type
      && nested.timestamp === raw.timestamp) return null;
    const result = { ...raw };
    for (const [from, to] of Object.entries(FIELDS)) {
      if (result[to] === undefined && raw[from] !== undefined) result[to] = raw[from];
    }
    if (result.previous_value === undefined && raw.previousValue !== undefined) {
      result.previous_value = raw.previousValue;
    }
    if (result.is_correct !== undefined && typeof result.is_correct !== "boolean") {
      delete result.is_correct;
    }
    // A declared "independent" phase is not proof of an unaided student attempt.
    if (result.independent !== undefined && typeof result.independent !== "boolean") {
      delete result.independent;
    }
    if (Number(result.hint_count) > 0 && result.independent === true) result.independent = false;
    return result;
  }
  return { normalize, V2 };
});
