"use strict";
// B7: the transfer instrument. This is the outcome variable for the novelty —
// "the agent chose this scene; could the learner then use the concept somewhere
// new?" — and it did not exist before: the chapter only shipped pre, post and
// retention instruments, all of which re-ask the concept in its original form.
const assert = require("node:assert/strict");
const transfer = require("../lib/assessments/functions-limits-transfer-r3");
const retention = require("../lib/assessments/functions-limits-retention-r3");
const bank = require("../lib/assessments/functions-limits-r1");

// --- shape ------------------------------------------------------------------
// Two items per knowledge point, twelve in total. r2 shipped three per point (18),
// but 18 transfer items push a one-hour session's testing block past 25 minutes and
// squeeze the learning block below 30 — and learning time is the only source of
// decision points. Two per point keeps every knowledge point observable while
// fitting the session. Administered in the same sitting as the post-test, scored
// separately.
assert.equal(transfer.items.length, bank.ids.length * 2, "two transfer items per knowledge point");
assert.equal(transfer.itemsPerKnowledgePoint, 2);
assert.equal(transfer.administeredWith, "post", "迁移题与后测同场次施测");
assert.equal(transfer.stageId, "transfer");
for (const id of bank.ids) {
  assert.equal(
    transfer.items.filter((item) => item.knowledgePointId === id).length,
    2,
    `${id} must have exactly two transfer items`
  );
}
assert.deepEqual(
  [...new Set(transfer.items.map((item) => item.knowledgePointId))],
  bank.ids,
  "transfer items must cover every knowledge point, in bank order"
);
assert.equal(transfer.construct, "near_transfer");
assert.equal(transfer.stageId, "transfer");
assert.ok(transfer.constructNote.length > 20, "the construct must be stated on the instrument itself");

for (const item of transfer.items) {
  const [stem, options, answer, analysis] = item.row;
  assert.ok(typeof stem === "string" && stem.length > 20, `${item.id} needs a real stem`);
  assert.equal(options.length, 4, `${item.id} must offer four options`);
  assert.equal(new Set(options).size, 4, `${item.id} must not repeat an option`);
  assert.ok(Number.isInteger(answer) && answer >= 0 && answer < 4, `${item.id} needs an in-range answer index`);
  assert.ok(typeof analysis === "string" && analysis.length > 20, `${item.id} needs an analysis`);
  for (const option of options) {
    assert.ok(typeof option === "string" && option.trim().length > 1, `${item.id} has an empty option`);
  }
}

// --- answer positions must be balanced --------------------------------------
// All-correct-at-A would let a student score by always picking the first option,
// so the instrument would measure position preference instead of transfer.
const positions = transfer.items.map((item) => item.row[2]);
assert.ok(new Set(positions).size === 4, `all four answer positions must be used, got ${positions.join(",")}`);
assert.ok(
  Math.max(...[0, 1, 2, 3].map((i) => positions.filter((p) => p === i).length)) <= Math.ceil(positions.length / 3),
  `no answer position may dominate, got ${positions.join(",")}`
);

// --- transfer must be a different construct from retention ------------------
// Retention re-asks the concept in its original representation; transfer asks it
// in a new one. If the two shared stems the instruments would measure the same
// thing and the novelty's outcome variable would be redundant.
const retentionStems = new Set(retention.items.map((item) => item.row[0]));
const collisions = transfer.items.filter((item) => retentionStems.has(item.row[0]));
assert.equal(collisions.length, 0, "transfer stems must not duplicate retention stems");

const bankStems = new Set();
for (const key of Object.keys(bank)) {
  const value = bank[key];
  if (!Array.isArray(value)) continue;
  for (const entry of value) {
    if (Array.isArray(entry) && typeof entry[0] === "string") bankStems.add(entry[0]);
  }
}
const bankCollisions = transfer.items.filter((item) => bankStems.has(item.row[0]));
assert.equal(bankCollisions.length, 0, "transfer stems must not duplicate the practice bank");

// --- every item is about its own knowledge point ----------------------------
// A transfer item that drifts onto another concept would not be attributable.
const CONCEPT_MARKERS = {
  "GH-01-K01": /输入|输出|规则/,
  "GH-01-K02": /横轴|纵轴|坐标|图像/,
  "GH-01-K03": /上升|下降|趋势|气温/,
  "GH-02-K01": /表|两列|采样|靠近/,
  "GH-02-K02": /左|右|两侧|极限/,
  "GH-02-K03": /连续|空心|跳断|取值/
};
for (const item of transfer.items) {
  const marker = CONCEPT_MARKERS[item.knowledgePointId];
  assert.ok(marker, `no concept marker defined for ${item.knowledgePointId}`);
  const haystack = `${item.row[0]} ${item.row[1].join(" ")} ${item.row[3]}`;
  assert.match(haystack, marker, `${item.id} does not read as being about ${item.knowledgePointId}`);
}

// --- the analysis must explain, not just assert -----------------------------
for (const item of transfer.items) {
  const analysis = item.row[3];
  assert.ok(
    analysis.length >= 30,
    `${item.id} analysis is too thin to teach from (${analysis.length} chars)`
  );
}

console.log(`迁移测量工具通过：6 个知识点各 2 题共 ${transfer.items.length} 题新情境（与后测同场次、分开计分）、选项位置分散（${positions.join(",")}）、与保持测/题库题干零重复、每题解析可教学。`);
