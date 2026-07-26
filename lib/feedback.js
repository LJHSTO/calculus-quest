const FEEDBACK_TYPES = new Set(["learning_content", "courseware", "platform", "other"]);
const FEEDBACK_CONTENT_MAX_LENGTH = 5000;

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
  if (rawContent.length > FEEDBACK_CONTENT_MAX_LENGTH) {
    return invalid(
      "feedback_content_too_long",
      `反馈内容不能超过 ${FEEDBACK_CONTENT_MAX_LENGTH} 个字符。`
    );
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

function buildCoursewareFeedbackTargetLookup(route = {}, fallbackNodeById = () => null) {
  const unitsById = new Map();

  for (const chapter of route?.chapters || []) {
    for (const module of chapter?.modules || []) {
      for (const knowledgePoint of module?.knowledgePoints || []) {
        const unitId = cleanText(knowledgePoint?.id, 200);
        if (!unitId) continue;
        unitsById.set(unitId, {
          id: unitId,
          kind: "unit",
          role: "knowledge",
          type: "knowledge",
          chapterId: cleanText(chapter?.id, 120),
          moduleId: cleanText(module?.id, 160),
          title: cleanText(
            knowledgePoint?.name || knowledgePoint?.title || knowledgePoint?.label,
            300
          ),
          resourceCandidates: Array.isArray(knowledgePoint?.resourceCandidates)
            ? knowledgePoint.resourceCandidates
            : []
        });
      }
    }
  }

  return (unitId) => {
    const normalizedUnitId = cleanText(unitId, 200);
    if (!normalizedUnitId) return null;
    return unitsById.get(normalizedUnitId)
      || (typeof fallbackNodeById === "function" ? fallbackNodeById(normalizedUnitId) : null);
  };
}

function validateCoursewareFeedbackTarget(value = {}, nodeById = () => null) {
  if (value.target_scope !== "courseware") return { ok: true, value };

  const unitId = cleanText(value.unit_id, 200);
  const resourceFile = cleanText(value.resource_file, 500);
  const sceneType = cleanText(value.scene_type, 80);
  const unit = unitId ? nodeById(unitId) : null;
  const candidates = Array.isArray(unit?.resourceCandidates) ? unit.resourceCandidates : [];
  const candidate = candidates.find((item) => String(item?.file || "") === resourceFile);
  const isKnowledgeUnit = unit?.kind === "unit" && (unit.role === "knowledge" || unit.type === "knowledge");
  const isLecturePage = sceneType === "slide" && !resourceFile;

  if (!isKnowledgeUnit || (!candidate && !isLecturePage)) {
    return invalid("feedback_target_invalid", "请选择课程中有效的课件反馈对象。");
  }

  return {
    ok: true,
    value: {
      ...value,
      chapter_id: cleanText(unit.chapterId, 120),
      module_id: cleanText(unit.moduleId, 160),
      unit_id: cleanText(unit.id, 200),
      knowledge_point: cleanText(unit.title || unit.label, 300),
      scene_type: isLecturePage ? "slide" : cleanText(candidate.type || candidate.widgetType, 80),
      resource_file: isLecturePage ? "" : cleanText(candidate.file, 500),
      resource_title: isLecturePage
        ? `${cleanText(unit.title || unit.label, 300)} · 讲解页`
        : cleanText(candidate.title || candidate.file, 500)
    }
  };
}

module.exports = {
  FEEDBACK_TYPES,
  FEEDBACK_CONTENT_MAX_LENGTH,
  normalizeFeedbackInput,
  buildCoursewareFeedbackTargetLookup,
  validateCoursewareFeedbackTarget
};
