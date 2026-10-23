"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { prepare } = require("./prepare-pilot-evaluation"), { evaluate } = require("./evaluate-pilot-predictions");
const hash = x => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const t = s => `2026-10-22T10:00:${String(s).padStart(2, "0")}Z`;
const runtime = { threshold: .7 }, facts = { events: [{ at: t(1), type: "scene_attempt", correct: false, response: "PRIVATE_TEXT" },
  { at: t(40), type: "FUTURE_PRIVATE", correct: true }] };
const d = { schemaVersion: "pilot-measurement-v1", versions: [{ id: "v", hash: "h" }],
  enrollments: Array.from({ length: 8 }, (_, i) => ({ id: "e" + i, participantCode: "PRIVATE_STUDENT_" + i, versionId: "v", versionHash: "h", consentAt: t(0), status: "finished", endedAt: t(59) })),
  opportunities: [], answers: [], annotations: [] };
for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
  const id = `${i}-${j}`;
  d.opportunities.push({ id, enrollmentId: "e" + i, versionId: "v", protocolHash: "h", scope: "GH-01-K01", at: t(10 + j), expiresAt: t(55),
    eligible: true, probability: 1, draw: .1, sampled: true, stratum: j ? "triggered" : "silent", teacherFacts: facts,
    runtime, runtimeHash: hash(runtime), decision: j ? { helpNeedScore: .72, interruptibilityScore: .8, deliveryDecision: "offer" } : { helpNeed: .9, historicalNotCurrent: true } });
  d.answers.push({ opportunityId: id, at: t(20), need: j ? "yes" : "no", timing: j ? 4 : 3, skipped: false });
}
const opts = { versionId: "v", splitSalt: "synthetic-pilot-evaluation-only", dataClass: "engineering_synthetic_only" };
const r = prepare(d, opts); assert.equal(r.bundle.caseCount, 16); assert.deepEqual(r.bundle.splitCounts, { development: 4, validation: 2, test: 2 });
const inputs = JSON.stringify(r.bundle.cases.map(c => c.input));
for (const s of ["PRIVATE", "FUTURE", "helpNeed", "needLabel", "runtimeHash"]) assert.equal(inputs.includes(s), false);
assert.equal(r.audit.futureEventsRemoved, 16); assert.equal(r.audit.freshRuleScoreCases, 8);
assert.equal(r.thresholdRows.filter(r => r.stratum === "silent").every(r => r.helpNeedScore === null), true);
assert.equal(r.labels.filter(r => r.frame === "silent").every(r => r.interruptibilityLabel === null), true);
assert.equal(prepare(d, opts).bundle.cases[0].inputHash, r.bundle.cases[0].inputHash);
assert.throws(() => prepare(d, { ...opts, dataClass: undefined }), /数据类别/);
assert.throws(() => prepare(d, { ...opts, versionId: "bad" }), /版本/);
const bad = structuredClone(d); bad.opportunities[0].runtimeHash = "wrong"; assert.throws(() => prepare(bad, opts), /摘要/);
bad.opportunities[0].runtimeHash = hash(runtime); bad.opportunities[0].at = "2026-10-21T00:00:00Z"; assert.throws(() => prepare(bad, opts), /同意/);
const withdrawn = structuredClone(d); withdrawn.enrollments[0].status = "withdrawn"; assert.equal(prepare(withdrawn, opts).bundle.caseCount, 14);
const late = structuredClone(d); late.answers[0].at = t(58); assert.equal(prepare(late, opts).labels[0].needLabel, null);
const unknown = structuredClone(d); unknown.answers[0].need = "uncertain"; assert.equal(prepare(unknown, opts).labels[0].needLabel, null);
const predicted = r.bundle.cases.map(c => ({ caseId: c.caseId, inputHash: c.inputHash, model: "synthetic-model-v1", status: "ok", needProbability: c.frame === "silent" ? .1 : .9 }));
const report = evaluate(r.bundle, r.labels, predicted); assert.equal(report.groups.length, 2); assert.equal(report.groups[0].successRateAllLabels, 1);
assert.equal(report.probabilityCalibrated, false);
const testCase = r.bundle.cases.find(c => c.split === "test"); predicted.find(p => p.caseId === testCase.caseId).status = "failed";
assert.equal(evaluate(r.bundle, r.labels, predicted).groups.reduce((n, g) => n + g.missingOrFailed, 0), 1);
assert.throws(() => evaluate(r.bundle, r.labels, [...predicted, predicted[0]]), /重复/);
predicted[0].inputHash = "bad"; assert.throws(() => evaluate(r.bundle, r.labels, predicted), /摘要/);
console.log("通过：预试导出接入回放、按人划分、时间与摘要校验、撤回排除、历史分数隔离、未知标签保留、模型输入盲化及失败分母。合成数据，不代表真人验证。");
if (process.argv[2]) {
  require('./prepare-pilot-evaluation').writePackage(r, process.argv[2]);
  require('node:fs').writeFileSync(require('node:path').join(process.argv[2], '测试说明.json'), JSON.stringify({ passed: true, source: 'engineering_synthetic_only', liveModelsCalled: false, groups: report.groups.length }, null, 2));
}
