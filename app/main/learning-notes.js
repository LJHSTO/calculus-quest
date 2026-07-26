(function initLearningNotesCore(global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global && global.document) global.LearningNotesCore = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function learningNotesFactory() {
  const STORAGE_KEY = "calculus-quest-learning-notes-v1";
  const SCHEMA_VERSION = 1;
  const MAX_NOTES = 500;
  const NOTE_COLORS = Object.freeze(["amber", "mint", "blue", "pink"]);
  const CONTEXT_FIELDS = [
    "schemaVersion",
    "kind",
    "scope",
    "chapterId",
    "unitId",
    "unitLabel",
    "knowledgePointId",
    "knowledgePointLabel",
    "sceneType",
    "resourceFingerprint",
    "semanticId",
    "questionId",
    "optionValue",
    "label",
    "excerpt",
    "latex",
    "confidence",
    "coarse",
    "createdAt"
  ];

  function compactText(value = "", limit = 240) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function compactMultiline(value = "", limit = 1200) {
    return String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/\r\n?/g, "\n")
      .trim()
      .slice(0, limit);
  }

  function safeDate(value, fallback = new Date()) {
    return Number.isFinite(Date.parse(value || ""))
      ? new Date(value).toISOString()
      : fallback.toISOString();
  }

  function contextSnapshot(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const result = {};
    CONTEXT_FIELDS.forEach((field) => {
      if (source[field] === undefined || source[field] === null) return;
      if (field === "coarse") {
        result[field] = Boolean(source[field]);
        return;
      }
      if (field === "schemaVersion") {
        result[field] = Number(source[field]) || 1;
        return;
      }
      result[field] = field === "excerpt" || field === "latex"
        ? compactMultiline(source[field], field === "latex" ? 600 : 900)
        : compactText(source[field], 260);
    });
    return result;
  }

  function normalizeLocator(value = {}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const startOffset = Number(source.startOffset);
    const endOffset = Number(source.endOffset);
    return {
      source: source.source === "iframe" ? "iframe" : "document",
      semanticId: compactText(source.semanticId, 180),
      exact: compactMultiline(source.exact, 900),
      prefix: compactMultiline(source.prefix, 80),
      suffix: compactMultiline(source.suffix, 80),
      startOffset: Number.isInteger(startOffset) && startOffset >= 0 ? startOffset : -1,
      endOffset: Number.isInteger(endOffset) && endOffset >= 0 ? endOffset : -1
    };
  }

  function createId() {
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `note-${random}`;
  }

  function createNote(input = {}) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const createdAt = safeDate(source.createdAt);
    const contextRef = contextSnapshot(source.contextRef);
    const excerpt = compactMultiline(source.excerpt || contextRef.excerpt, 900);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: compactText(source.id, 180) || createId(),
      ownerKey: compactText(source.ownerKey, 180) || "local",
      threadKey: compactText(source.threadKey, 240) || "course:general",
      chapterId: compactText(source.chapterId || contextRef.chapterId, 180),
      unitId: compactText(source.unitId || contextRef.unitId, 180),
      excerpt,
      note: compactMultiline(source.note, 1200),
      color: NOTE_COLORS.includes(source.color) ? source.color : "amber",
      contextRef,
      locator: normalizeLocator(source.locator),
      createdAt,
      updatedAt: safeDate(source.updatedAt, new Date(createdAt))
    };
  }

  function storageTarget(storage) {
    if (storage && typeof storage.getItem === "function") return storage;
    if (typeof localStorage !== "undefined") return localStorage;
    return null;
  }

  function loadNotes(storage) {
    const target = storageTarget(storage);
    if (!target) return [];
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
      const records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.notes) ? parsed.notes : [];
      return records
        .map(createNote)
        .filter((item) => item.id && item.ownerKey && item.threadKey)
        .slice(-MAX_NOTES);
    } catch {
      return [];
    }
  }

  function saveNotes(storage, notes = []) {
    const target = storageTarget(storage);
    if (!target) return false;
    try {
      const normalized = notes
        .map(createNote)
        .filter((item) => item.id && item.ownerKey && item.threadKey)
        .slice(-MAX_NOTES);
      target.setItem(STORAGE_KEY, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        notes: normalized
      }));
      return true;
    } catch {
      return false;
    }
  }

  function upsertNote(storage, input = {}) {
    const note = createNote(input);
    const notes = loadNotes(storage);
    const index = notes.findIndex((item) => item.id === note.id && item.ownerKey === note.ownerKey);
    if (index >= 0) {
      note.createdAt = notes[index].createdAt;
      note.updatedAt = new Date().toISOString();
      notes.splice(index, 1, note);
    } else {
      notes.push(note);
    }
    saveNotes(storage, notes);
    return note;
  }

  function removeNote(storage, id, ownerKey) {
    const noteId = compactText(id, 180);
    const owner = compactText(ownerKey, 180);
    const notes = loadNotes(storage);
    const next = notes.filter((item) => !(item.id === noteId && item.ownerKey === owner));
    if (next.length === notes.length) return false;
    saveNotes(storage, next);
    return true;
  }

  function notesFor(storage, filter = {}) {
    const ownerKey = compactText(filter.ownerKey, 180);
    const threadKey = compactText(filter.threadKey, 240);
    const unitId = compactText(filter.unitId, 180);
    return loadNotes(storage)
      .filter((item) => (!ownerKey || item.ownerKey === ownerKey))
      .filter((item) => (!threadKey || item.threadKey === threadKey))
      .filter((item) => (!unitId || item.unitId === unitId))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }

  function replaceOwnerUnitNotes(storage, ownerKey, unitId, incoming = []) {
    const owner = compactText(ownerKey, 180);
    const unit = compactText(unitId, 180);
    if (!owner || !unit) return loadNotes(storage);
    const preserved = loadNotes(storage).filter((item) => (
      item.ownerKey !== owner || item.unitId !== unit
    ));
    const replacements = (Array.isArray(incoming) ? incoming : [])
      .map((item) => createNote({ ...item, ownerKey: owner, unitId: unit }))
      .filter((item) => item.id);
    saveNotes(storage, [...preserved, ...replacements]);
    return notesFor(storage, { ownerKey: owner, unitId: unit });
  }

  function sameLocator(left = {}, right = {}) {
    const a = normalizeLocator(left);
    const b = normalizeLocator(right);
    if (a.source !== b.source) return false;
    if (a.semanticId && b.semanticId && a.semanticId !== b.semanticId) return false;
    if (a.exact && b.exact && a.exact !== b.exact) return false;
    if (
      a.startOffset >= 0
      && b.startOffset >= 0
      && (a.startOffset !== b.startOffset || a.endOffset !== b.endOffset)
    ) return false;
    return Boolean(a.exact || b.exact || a.semanticId || b.semanticId);
  }

  function findMatchingNote(storage, filter = {}, locator = {}) {
    return notesFor(storage, filter).find((note) => sameLocator(note.locator, locator)) || null;
  }

  return {
    NOTE_COLORS,
    STORAGE_KEY,
    SCHEMA_VERSION,
    createNote,
    findMatchingNote,
    loadNotes,
    notesFor,
    normalizeLocator,
    removeNote,
    replaceOwnerUnitNotes,
    sameLocator,
    saveNotes,
    upsertNote
  };
});
