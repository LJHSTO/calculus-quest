const FEEDBACK_TYPES = new Set(["learning_content", "courseware", "platform", "other"]);

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function invalid(code, message) {
  return { ok: false, code, message };
}

function normalizeFeedbackInput(input = {}) {
  const feedbackType = cleanText(input.feedbackType, 40);
  const rawContent = String(input.content || "").trim();
  if (!FEEDBACK_TYPES.has(feedbackType)) {
    return invalid("feedback_type_invalid", "请选择有效的反馈类型。");
  }
  if (!rawContent) {
    return invalid("feedback_content_required", "请填写反馈内容。");
  }
  if (rawContent.length > 2000) {
    return invalid("feedback_content_too_long", "反馈内容不能超过 2000 个字符。");
  }

  const requestedScope = cleanText(input.targetScope, 20);
  const targetScope = feedbackType === "courseware" && requestedScope === "courseware"
    ? "courseware"
    : "global";

  return {
    ok: true,
    value: {
      feedback_type: feedbackType,
      content: rawContent,
      target_scope: targetScope,
      chapter_id: cleanText(input.chapterId, 120),
      module_id: cleanText(input.moduleId, 160),
      unit_id: cleanText(input.unitId, 200),
      knowledge_point: cleanText(input.knowledgePoint, 300),
      scene_type: targetScope === "courseware" ? cleanText(input.sceneType, 80) : "",
      resource_file: targetScope === "courseware" ? cleanText(input.resourceFile, 500) : "",
      resource_title: targetScope === "courseware" ? cleanText(input.resourceTitle, 500) : "",
      current_view: cleanText(input.currentView, 40)
    }
  };
}

module.exports = { FEEDBACK_TYPES, normalizeFeedbackInput };
