(function attachFeedbackTargets(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FeedbackTargets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFeedbackTargetsApi() {
  function buildCoursewareFeedbackTargets(options = {}) {
    const unit = options.unit;
    if (!unit || unit.type !== "knowledge") return [];

    const lectureTarget = {
      id: `courseware:slide:${unit.id}`,
      targetScope: "courseware",
      label: options.lectureTitle || `${unit.label || "当前知识点"} · 讲解页`,
      description: options.lectureDescription || "概念讲解、板书与教师旁白",
      isCurrent: options.currentSceneType === "slide",
      isLecture: true,
      chapterId: unit.chapterId || "",
      moduleId: unit.moduleId || "",
      unitId: unit.id || "",
      knowledgePoint: unit.label || "",
      sceneType: "slide",
      resourceFile: "",
      resourceTitle: options.lectureTitle || `${unit.label || "当前知识点"} · 讲解页`
    };

    const types = Array.isArray(options.types) ? options.types : [];
    const selectedTypeId = String(options.selectedTypeId || "");
    const orderedTypes = [
      ...types.filter((type) => type.id === selectedTypeId),
      ...types.filter((type) => type.id !== selectedTypeId)
    ];
    const seenFiles = new Set();
    const concrete = [];

    for (const type of orderedTypes) {
      const candidate = options.candidateForType?.(type.id);
      const resourceFile = String(candidate?.file || "");
      if (!resourceFile || seenFiles.has(resourceFile)) continue;
      seenFiles.add(resourceFile);
      const resourceTitle = String(
        options.cleanTitle?.(candidate, unit) || candidate.title || resourceFile
      );
      concrete.push({
        id: `courseware:${type.id}:${resourceFile}`,
        targetScope: "courseware",
        label: resourceTitle,
        description: type.label || type.title || type.id,
        isCurrent: type.id === selectedTypeId,
        chapterId: unit.chapterId || "",
        moduleId: unit.moduleId || "",
        unitId: unit.id || "",
        knowledgePoint: unit.label || "",
        sceneType: type.id || "",
        resourceFile,
        resourceTitle
      });
    }

    return [lectureTarget, ...concrete];
  }

  function feedbackTargetIdFromPointer(eventTarget, dragState = null) {
    const directTarget = eventTarget?.closest?.("[data-feedback-target]")?.dataset?.feedbackTarget || "";
    return directTarget || String(dragState?.startTargetId || "");
  }

  return { buildCoursewareFeedbackTargets, feedbackTargetIdFromPointer };
});
