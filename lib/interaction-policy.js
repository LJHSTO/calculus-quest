(function attachInteractionPolicy(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.InteractionPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createInteractionPolicy() {
  const lowValueEventTypes = Object.freeze([
    "heartbeat",
    "online_period",
    "visibility",
    "view_change",
    "switch_view",
    "click",
    "ui_click",
    "ui_input",
    "ui_change",
    "ui_keydown",
    "ui_wheel",
    "unit_leave",
    "leave_unit",
    "quiz_render",
    "knowledge_render",
    "slide_render",
    "interactive_render",
    "question_visible",
    "parameter_change",
    "courseware_page_loaded",
    "courseware_page_summary_shown",
    "interactive_keydown",
    "interactive_wheel",
    "interactive_scroll",
    "interactive_pointer_down",
    "interactive_pointer_up",
    "interactive_pointer_cancel",
    "canvas_pointer_down",
    "canvas_pointer_up",
    "interactive_drag_move",
    "fullscreen_change",
    "knowledge_launcher_moved",
    "knowledge_panel_moved",
    "knowledge_panel_position_reset",
    "quiz_result",
    "filter_library",
    "play_narration",
    "pause_narration",
    "stop_narration"
  ]);
  const lowValueSet = new Set(lowValueEventTypes);

  function eventType(payload = {}, fallback = "interaction") {
    const value = payload && typeof payload === "object" ? payload : {};
    return String(value.eventType || value.data?.eventType || fallback || "interaction");
  }

  function isMeaningfulEventType(type = "") {
    return !lowValueSet.has(String(type || ""));
  }

  function isMeaningfulInteraction(payload = {}, fallback = "interaction") {
    return isMeaningfulEventType(eventType(payload, fallback));
  }

  function sqlMeaningfulFilter(alias = "e") {
    const safeAlias = /^[A-Za-z_][A-Za-z0-9_]*$/.test(alias) ? alias : "e";
    return {
      clause: lowValueEventTypes.map(() => ` AND ${safeAlias}.payload NOT LIKE ?`).join(""),
      params: lowValueEventTypes.map((type) => `%"eventType":"${type}"%`)
    };
  }

  return {
    lowValueEventTypes,
    eventType,
    isMeaningfulEventType,
    isMeaningfulInteraction,
    sqlMeaningfulFilter
  };
});
