(function attachFeedbackTargets(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FeedbackTargets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFeedbackTargetsApi() {
  function buildCoursewareFeedbackTargets(options = {}) {
    const unit = options.unit;
    const globalTarget = {
      id: "global",
      targetScope: "global",
      label: "全局课件反馈",
      description: "不针对某一个课件",
      isCurrent: !unit,
      chapterId: unit?.chapterId || "",
      moduleId: unit?.moduleId || "",
      unitId: unit?.id || "",
      knowledgePoint: unit?.label || "",
      sceneType: "",
      resourceFile: "",
      resourceTitle: ""
    };
    if (!unit || unit.type !== "knowledge") return [globalTarget];

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

    return [globalTarget, ...concrete];
  }

  return { buildCoursewareFeedbackTargets };
});
