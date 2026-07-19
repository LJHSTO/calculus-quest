(function attachReturnContext(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ReturnContext = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createReturnContextApi() {
  const panelViews = new Set(["progress", "feedback"]);

  function clean(value = "") {
    return String(value || "").trim();
  }

  function captureLearningContext(input = {}) {
    return {
      chapterId: clean(input.chapterId),
      unitId: clean(input.unitId),
      sceneType: clean(input.sceneType)
    };
  }

  function resolveLearningContext(context, fallback = {}) {
    const source = context && typeof context === "object" ? context : {};
    return {
      chapterId: clean(source.chapterId) || clean(fallback.chapterId),
      unitId: clean(source.unitId) || clean(fallback.unitId),
      sceneType: clean(source.sceneType) || clean(fallback.sceneType)
    };
  }

  function shouldReturnToLearning(view = "") {
    return panelViews.has(clean(view));
  }

  return {
    captureLearningContext,
    resolveLearningContext,
    shouldReturnToLearning
  };
});
