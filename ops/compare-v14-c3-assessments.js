const assert = require("node:assert/strict");
const { isDeepStrictEqual } = require("node:util");
const baseline = require("../research/V14-C3正式测量逐题审校-2026-09-09.json");
const route = require("../data/multi-scene-learning-route.json");
const { buildAssessmentIndex } = require("../lib/course-assessment");

const previous = new Map(baseline.rows.map((row) => [row.question.id, row.question]));
const fields = ["question", "options", "answer", "analysis", "referenceAnswer", "rubric", "type", "points"];
const rows = [...buildAssessmentIndex(route).values()]
  .filter((entry) => entry.chapterId === "V14-C3"
    && entry.question.instrumentVersion === "v14-c3-assessments-r3")
  .map(({ phase, question }) => {
    const old = previous.get(question.legacyQuestionId);
    assert.ok(old, `缺少旧题：${question.id}`);
    return {
      phase, oldId: old.id, newId: question.id,
      changedFields: fields.filter((field) => !isDeepStrictEqual(old[field], question[field]))
    };
  });
assert.equal(rows.length, 34);
console.log(JSON.stringify({
  baseline: "2026-09-09逐题审校快照，不是任意历史部署版本",
  currentVersion: "v14-c3-assessments-r3",
  total: rows.length,
  changedContent: rows.filter((row) => row.changedFields.length > 0).length,
  fieldCounts: Object.fromEntries(fields.map((field) => [
    field, rows.filter((row) => row.changedFields.includes(field)).length
  ])),
  rows
}, null, 2));
