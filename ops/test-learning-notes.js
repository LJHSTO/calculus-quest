const assert = require("node:assert/strict");

const {
  STORAGE_KEY,
  createNote,
  findMatchingNote,
  loadNotes,
  notesFor,
  removeNote,
  replaceOwnerUnitNotes,
  upsertNote
} = require("../app/main/learning-notes");

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

assert.equal(
  STORAGE_KEY,
  "calculus-quest-learning-notes-v1",
  "learning-note storage must remain explicitly versioned"
);

const storage = memoryStorage();
const first = upsertNote(storage, createNote({
  id: "note-a",
  ownerKey: "student-1",
  threadKey: "knowledge:GH-03-K01",
  chapterId: "V14-C1",
  unitId: "GH-03-K01",
  excerpt: "Δx 趋近于 0",
  note: "这里是在逼近，不是真的把 Δx 当成 0。",
  contextRef: {
    kind: "formula",
    scope: "slide",
    semanticId: "slide:canvas-1:latex-1",
    excerpt: "Δx 趋近于 0",
    latex: "\\Delta x \\to 0",
    selector: ".slide-latex:nth-child(2)",
    outerHTML: "<div>不应保存</div>"
  },
  locator: {
    source: "document",
    semanticId: "slide:canvas-1:latex-1",
    exact: "Δx 趋近于 0",
    startOffset: 0,
    endOffset: 9,
    prefix: "",
    suffix: "时，割线斜率趋近于切线斜率。"
  }
}));

upsertNote(storage, createNote({
  id: "note-b",
  ownerKey: "student-1",
  threadKey: "knowledge:GH-03-K02",
  chapterId: "V14-C1",
  unitId: "GH-03-K02",
  excerpt: "瞬时变化率",
  note: "",
  contextRef: {
    kind: "text",
    scope: "slide",
    semanticId: "slide:canvas-2:text-1",
    excerpt: "瞬时变化率"
  },
  locator: {
    source: "document",
    semanticId: "slide:canvas-2:text-1",
    exact: "瞬时变化率",
    startOffset: 3,
    endOffset: 9
  }
}));

upsertNote(storage, createNote({
  id: "note-c",
  ownerKey: "student-2",
  threadKey: "knowledge:GH-03-K01",
  chapterId: "V14-C1",
  unitId: "GH-03-K01",
  excerpt: "割线斜率",
  note: "另一个学生的笔记",
  contextRef: {
    kind: "text",
    scope: "slide",
    semanticId: "slide:canvas-1:text-2",
    excerpt: "割线斜率"
  },
  locator: {
    source: "document",
    semanticId: "slide:canvas-1:text-2",
    exact: "割线斜率",
    startOffset: 0,
    endOffset: 4
  }
}));

assert.equal(first.contextRef.selector, undefined);
assert.equal(first.contextRef.outerHTML, undefined);
assert.equal(first.locator.semanticId, "slide:canvas-1:latex-1");
assert.equal(loadNotes(storage).length, 3);
assert.deepEqual(
  notesFor(storage, {
    ownerKey: "student-1",
    threadKey: "knowledge:GH-03-K01"
  }).map((item) => item.id),
  ["note-a"],
  "notes must be isolated by both participant and knowledge-point thread"
);

const updated = upsertNote(storage, {
  ...first,
  note: "更新后的理解",
  color: "pink"
});
assert.equal(updated.note, "更新后的理解");
assert.equal(updated.color, "pink");
assert.equal(loadNotes(storage).length, 3, "updating a note must not duplicate it");
assert.equal(
  findMatchingNote(storage, { ownerKey: "student-1", unitId: "GH-03-K01" }, first.locator)?.id,
  "note-a",
  "reselecting the same text should reopen the existing note"
);

assert.equal(removeNote(storage, "note-a", "student-2"), false);
assert.equal(removeNote(storage, "note-a", "student-1"), true);
assert.equal(loadNotes(storage).length, 2);

const serverNote = createNote({
  id: "note-b",
  ownerKey: "student-1",
  threadKey: "knowledge:GH-03-K02",
  chapterId: "V14-C1",
  unitId: "GH-03-K02",
  excerpt: "瞬时变化率",
  note: "从另一台设备同步回来的内容",
  color: "blue",
  updatedAt: "2026-07-25T09:00:00.000Z"
});
replaceOwnerUnitNotes(storage, "student-1", "GH-03-K02", [serverNote]);
assert.equal(
  notesFor(storage, { ownerKey: "student-1", unitId: "GH-03-K02" })[0].note,
  "从另一台设备同步回来的内容"
);
assert.equal(
  notesFor(storage, { ownerKey: "student-2", unitId: "GH-03-K01" }).length,
  1,
  "replacing a synced unit must preserve notes belonging to another participant"
);

console.log("learning notes tests passed");
