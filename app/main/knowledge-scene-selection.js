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

  function selectedTypeForAccess(
    unitId = "",
    committedSelections = {},
    previewSelections = {},
    types = [],
    canPersist = false
  ) {
    return selectedType(
      unitId,
      canPersist ? committedSelections : previewSelections,
      types
    );
  }

  function recordSelectionForAccess(
    unitId = "",
    committedSelections = {},
    previewSelections = {},
    nextType = "",
    types = [],
    canPersist = false
  ) {
    const id = clean(unitId);
    const target = canPersist ? committedSelections : previewSelections;
    if (!id || !target || typeof target !== "object") {
      return { changed: false, persisted: Boolean(canPersist) };
    }
    if (!shouldRecordSelection(id, target, nextType, types)) {
      return { changed: false, persisted: Boolean(canPersist) };
    }
    target[id] = clean(nextType);
    if (canPersist) {
      if (previewSelections && typeof previewSelections === "object") delete previewSelections[id];
    } else if (committedSelections && typeof committedSelections === "object") {
      // A locked lesson selection is only a preview and must not survive its later unlock.
      delete committedSelections[id];
    }
    return { changed: true, persisted: Boolean(canPersist) };
  }

  return {
    selectedType,
    shouldRecordSelection,
    selectedTypeForAccess,
    recordSelectionForAccess
  };
});
