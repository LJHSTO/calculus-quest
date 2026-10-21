"use strict";
const assert = require("node:assert/strict");
const { participantAllocation } = require("../lib/study-allocation");
const { createWorkbench } = require("../lib/study-workbench");

async function main() {
  const seed = "synthetic-allocation-test-seed";
  for (const stratum of ["pre-low", "pre-high", "unstratified"]) {
    let ordinal = 0;
    for (let block = 0; block < 30; block++) {
      const first = participantAllocation({ seed, stratum, ordinal });
      assert.ok([4, 6].includes(first.blockSize));
      const members = Array.from({ length: first.blockSize }, (_, position) =>
        participantAllocation({ seed, stratum, ordinal: ordinal + position }));
      assert.equal(members.reduce((n, x) => n + x.conditionIndex, 0), first.blockSize / 2);
      for (const [position, member] of members.entries()) {
        assert.equal(member.block, block);
        assert.equal(member.position, position);
        assert.ok(member.values.every(x => x === member.conditionIndex));
        assert.deepEqual(member, participantAllocation({ seed, stratum, ordinal: ordinal + position }));
      }
      ordinal += first.blockSize;
    }
  }
  assert.throws(() => participantAllocation({ seed, stratum: "pre-low", ordinal: -1 }));
  const SQL = await require("sql.js")();
  let sql = new SQL.Database();
  const db = { getDbSync: () => sql, saveNow() {}, currentLearningGeneration: () => 1 };
  const env = { NODE_ENV: "test", PROACTIVE_STUDY_SEED: seed, PROACTIVE_STUDY_WORKBENCH: "recheck",
    PROACTIVE_STUDY_PROTOCOL_ID: "synthetic-parallel-fixture", PROACTIVE_STUDY_ASSIGNMENT_MODE: "participant-blocks" };
  let wb = createWorkbench({ db, env });
  for (let i = 0; i < 12; i++) {
    const view = wb.start(`synthetic-${i}`, { acknowledged: true, stratum: i < 6 ? "pre-low" : "pre-high" });
    assert.ok(!JSON.stringify(view).includes('"condition"'));
    assert.ok(!JSON.stringify(view).includes("blockSize"));
    assert.ok(!JSON.stringify(view).includes(seed));
  }
  const exported = wb.exportData();
  assert.equal(exported.protocol.assignmentVersion, "participant-blocks-v1");
  assert.ok(exported.sessions.every(s => new Set(s.units.map(u => u.condition)).size === 1));
  const before = wb.state("synthetic-0");
  const bytes = sql.export(); sql.close(); sql = new SQL.Database(bytes);
  wb = createWorkbench({ db, env });
  assert.deepEqual(wb.start("synthetic-0", { acknowledged: true, stratum: "other" }), before);
  assert.deepEqual(wb.exportData().sessions, exported.sessions);
  const changed = createWorkbench({ db, env: { ...env, PROACTIVE_STUDY_ASSIGNMENT_MODE: "complementary-pairs" } });
  assert.throws(() => changed.state("synthetic-0"), e => e.code === "study_protocol_changed");
  assert.throws(() => changed.start("new", { acknowledged: true }), e => e.code === "study_protocol_changed");
  assert.throws(() => createWorkbench({ db, env: { ...env, PROACTIVE_STUDY_ASSIGNMENT_MODE: "invalid" } }), /分组方式/);
  const practice = createWorkbench({ db, env, mainEntry: true });
  practice.start("ordinary", { acknowledged: true });
  assert.ok(practice.exportData().sessions[0].units.every(u => u.condition === "guided_learning"));
  const reviewed = { ...practice.specification(), id: "synthetic-reviewed-parallel", kind: "recheck",
    assignmentMode: "participant-blocks", reviewedBy: "自动化夹具", reviewedAt: "2026-10-20",
    approvalReference: "SYNTHETIC-NOT-APPROVAL", consentVersion: "test-v1", consentText: "合成测试",
    contact: "合成联系人", retentionPolicy: "合成测试", withdrawalPolicy: "合成测试" };
  const formal = createWorkbench({ db, env: { ...env, PROACTIVE_STUDY_ASSIGNMENT_MODE: "invalid" },
    mainEntry: true, humanProtocol: reviewed });
  assert.equal(formal.requiresPretest, true);
  assert.equal(practice.requiresPretest, false);
  formal.start("synthetic-formal", { acknowledged: true, consentVersion: "test-v1" });
  assert.equal(formal.exportData().protocol.assignmentVersion, "participant-blocks-v1");

  const statuses = [
    { explanation: "同一输入只能有一个输出", expected: "provided" },
    { explanation: "", explanationMissingReason: "cannot_explain", expected: "cannot_explain" },
    { explanation: "", explanationMissingReason: "prefer_not_to_answer", expected: "prefer_not_to_answer" },
    { explanation: "  ", expected: "not_recorded" }
  ];
  for (const [i, fixture] of statuses.entries()) {
    const id = `reason-${i}`, view = practice.start(id, { acknowledged: true });
    const input = { action: "answer", fingerprint: view.protocol.fingerprint, revision: view.session.revision,
      probeId: view.session.probe.id, response: "1", confidence: 0 };
    for (const bad of [
      { explanation: 0 }, { explanation: {}, explanationMissingReason: null },
      { explanation: "有理由", explanationMissingReason: "cannot_explain" },
      { explanation: "", explanationMissingReason: "guessed" }
    ]) assert.throws(() => practice.act(id, { ...input, ...bad }), e => e.code === "study_response_invalid");
    assert.equal(practice.state(id).session.revision, view.session.revision);
    practice.act(id, { ...input, ...fixture });
    const result = practice.exportData().sessions.find(s => s.userId === id).units[0].probes.t0;
    assert.equal(result.explanationStatus, fixture.expected);
    assert.equal(result.explanation, fixture.explanation);
    assert.equal(result.correct, true, "理由状态不改变客观题评分");
    assert.equal(result.confidence, 0);
  }
  sql.close();
  console.log("通过：三层各30个随机区组、学生内条件固定、分层独立、隐藏分配、持久恢复、协议防漂移、普通学习兼容、理由四状态及冲突输入拒绝。");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
