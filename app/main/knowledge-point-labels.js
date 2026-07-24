(function exposeKnowledgePointLabels(global) {
  const knowledgePointIdPattern = /\b(?:GH|EXT)-\d{2}-K\d{2}\b/i;

  function rawConceptValue(value) {
    if (value && typeof value === "object") {
      return String(value.concept || value.tag || value.name || "").trim();
    }
    return String(value ?? "").trim();
  }

  function addKnowledgePoint(map, point, chapterId = "") {
    const id = String(point?.id || "").trim();
    const label = String(point?.name || point?.title || point?.label || "").trim();
    if (id && label) map.set(id, { label, chapterId });
  }

  function buildLookup(chapters = []) {
    const map = new Map();
    (Array.isArray(chapters) ? chapters : []).forEach((chapter) => {
      const chapterId = String(chapter?.id || "").trim();
      const routeChapter = chapter?.routeChapter || chapter;
      (routeChapter?.modules || []).forEach((module) => {
        (module?.knowledgePoints || []).forEach((point) => addKnowledgePoint(map, point, chapterId));
      });
      (chapter?.allUnits || chapter?.units || []).forEach((unit) => {
        if (unit?.type === "knowledge") {
          addKnowledgePoint(map, {
            id: unit.id,
            name: unit.label || unit.title
          }, chapterId);
        }
      });
    });
    return map;
  }

  function labelsFor(values, chapters = [], chapterId = "") {
    const list = Array.isArray(values) ? values : values == null ? [] : [values];
    const lookup = buildLookup(chapters);
    const scopedChapterId = String(chapterId || "").trim();
    const labels = [];
    list.forEach((value) => {
      const raw = rawConceptValue(value);
      if (!raw) return;
      const ids = [raw, raw.match(knowledgePointIdPattern)?.[0] || ""].filter(Boolean);
      const match = ids
        .map((id) => lookup.get(id))
        .find((entry) => entry && (!scopedChapterId || !entry.chapterId || entry.chapterId === scopedChapterId));
      const label = match?.label || (knowledgePointIdPattern.test(raw) ? "相关知识点" : raw);
      if (label && !labels.includes(label)) labels.push(label);
    });
    return labels;
  }

  const api = Object.freeze({ labelsFor });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.KnowledgePointLabels = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
