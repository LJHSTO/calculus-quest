(function attachKnowledgeSceneSelection(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.KnowledgeSceneSelection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createKnowledgeSceneSelectionApi() {
  function clean(value = "") {
    return String(value || "").trim();
  }

  function validTypeIds(types = []) {
    return new Set(
      (Array.isArray(types) ? types : [])
        .map((type) => clean(type?.id))
        .filter(Boolean)
    );
  }

  function selectedType(unitId = "", selections = {}, types = []) {
    const id = clean(unitId);
    if (!id || !selections || typeof selections !== "object") return "";
    const selected = clean(selections[id]);
    return selected && validTypeIds(types).has(selected) ? selected : "";
  }

  function shouldRecordSelection(unitId = "", selections = {}, nextType = "", types = []) {
    const next = clean(nextType);
    return Boolean(next)
      && validTypeIds(types).has(next)
      && selectedType(unitId, selections, types) !== next;
  }

  return {
    selectedType,
    shouldRecordSelection
  };
});
