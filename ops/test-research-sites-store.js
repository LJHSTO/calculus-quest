"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { createResearchSites } = require("../lib/research-sites/store");
const m = require("../lib/research-sites/materials");
const { listStudies } = require("../lib/research-sites/catalog");
(async () => {
  const SQL = await require("sql.js")(); let database = new SQL.Database(), now = 1000000;
  database.run("CREATE TABLE existing_accounts(id TEXT PRIMARY KEY,name TEXT); INSERT INTO existing_accounts VALUES ('existing-user','原有账号')");
  const db = { getDbSync: () => database, saveNow() {} }, clock = () => now;
  let site = createResearchSites({ db, clock });
  const request = () => crypto.randomUUID();
  const consent = { acknowledged: true, externalModel: true, futureBenchmark: true };
  for (const study of listStudies()) {
    const u = "existing-user", id = study.id;
    assert.equal(site.state(u, id).session, null);
    let s = site.start(u, id, "demo", { requestId: request(), consent });
    assert.equal(s.session.phase, "baseline");
    const call = (action, extra = {}) => ({ requestId: request(), action, revision: s.session.revision, fingerprint: s.protocol.fingerprint, ...extra });
    s = site.act(u, id, "demo", call("baseline_submit", { responses: {} }));
    if (id === "design-space") { assert.equal(s.session.phase,"case_coding"); assert.equal(site.reviewQueue(id,"demo").items.length,0); continue; }
    const before = s;
    const input = call("quiz_submit", { responses: Object.fromEntries(m.publicQuiz("pre").items.map(q => [q.id, q.type === "short_answer" ? "合成回答用于教师评分测试" : "__unknown__"])) });
    s = site.act(u, id, "demo", input);
    assert.equal(s.session.phase, "t0");
    assert.equal(site.act(u, id, "demo", input).duplicate, true);
    assert.throws(() => site.act(u, id, "demo", { ...input, requestId: request() }), /页面已更新/);
    assert.equal(s.session.allocation, undefined);
    assert.throws(() => site.dialogueContext(u, id, "demo"), /未允许/);
    const queue = site.reviewQueue(id, "demo"); assert.equal(queue.items.length, 2);
    assert.equal(queue.items[0].phase, undefined); assert.equal(queue.items[0].allocation, undefined);
    site.submitReview(id, "demo", "teacher-fixture", { blindId: queue.items[0].blindId, score: 4, reason: "合成评分，不代表教师真实审校" });
    const rater=site.issueRater(id,"demo","teacher-second-fixture");
    assert.throws(()=>site.issueRater(id,"demo","teacher-second-fixture"),/已有该评分者编号/);
    assert.equal(site.raterQueue(id,"demo",rater.token).items.find(i=>i.blindId===queue.items[0].blindId).reviews.length,0,"independent raters cannot see others' scores");
    assert.throws(()=>site.raterQueue(id,"formal",rater.token),/评分凭据无效/);
    assert.throws(()=>site.raterQueue(id,"demo","invalid"),/评分凭据无效/);
    assert.equal(site.reviewQueue(id, "demo").items.find(i => i.blindId === queue.items[0].blindId).reviews.length, 1);
    const event = { eventId: request(), type: "page_visibility", scope: m.points[0], payload: { visible: true } };
    assert.equal(site.recordProcess(u, id, "demo", event).duplicate, false);
    assert.equal(site.recordProcess(u, id, "demo", event).duplicate, true);
    assert.throws(() => site.recordProcess(u, id, "demo", { ...event, payload: { nested: { token: "synthetic" } } }), /不允许记录/);
    const exported = site.exportStudy(id, "demo");
    assert.equal(exported.sessions.length, 1); assert.equal(exported.reviews.length, 1);
    assert.equal(exported.sessions[0].userId, undefined);
    assert.ok(!JSON.stringify(exported).includes("allocation_seed"));
    database = new SQL.Database(database.export()); site = createResearchSites({ db, clock });
    assert.equal(site.state(u, id).session.id, s.session.id, "reload preserves session");
    const restarted = site.restartDemo(u, id, { requestId: request(), consent });
    assert.notEqual(restarted.session.id, s.session.id);
    const restartedExport = site.exportStudy(id, "demo");
    assert.ok(restartedExport.events.every(e=>e.record.sessionId===restarted.session.id));
    assert.equal(restartedExport.process.length,0,"previous demo process events must not contaminate a restarted session");
    assert.equal(database.exec("SELECT COUNT(*) FROM research_site_demo_archive")[0].values[0][0] >= 1, true);
    assert.throws(() => site.start(u, id, "formal", { requestId: request(), consent }), /未开放/);
    assert.equal(before.session.phase, "pre");
  }
  const configuration = { protocols: { timing: { id: "synthetic-formal-1", institution: "合成测试机构", responsiblePerson: "合成负责人",
    contact: "fixture@example.invalid", retentionPolicy: "仅内存测试", withdrawalPolicy: "排除已退出记录", approvalReference: "SYNTHETIC-NOT-REAL-APPROVAL",
    reviewedBy: "synthetic-reviewer", reviewedAt: "2026-10-23", consentVersion: "synthetic-v1", analysisPlanVersion: "synthetic-v1",
    expectedDuration:"合成时间",compensationPolicy:"合成测试无补偿",aiProcessingInfo:"合成测试模型，不是实际同意说明",
    approvalStatus: "unapproved", materialFingerprint: m.fingerprint, status: "recruiting" } } };
  site = createResearchSites({ db, clock, configuration });
  assert.equal(site.specification("timing", "formal").readiness.ready, false);
  configuration.protocols.timing.approvalStatus = "approved";
  for (let i = 0; i < 12; i++) {
    const u = "synthetic-formal-" + i;
    let s = site.start(u, "timing", "formal", { requestId: request(), consent: { ...consent, version: "synthetic-v1", adult: true, eligible: true } });
    assert.ok(site.protects(u));
    s = site.act(u, "timing", "formal", { action: "baseline_submit", requestId: request(), revision: s.session.revision, fingerprint: s.protocol.fingerprint, responses: {} });
    s = site.act(u, "timing", "formal", { action: "quiz_submit", requestId: request(), revision: s.session.revision, fingerprint: s.protocol.fingerprint,
      responses: Object.fromEntries(m.publicQuiz("pre").items.map(q => [q.id, "__unknown__"])) });
    assert.ok(site.protects(u));
    assert.equal(s.session.phase, "t0");
  }
  const report = site.exportStudy("timing", "formal");
  configuration.protocols.value={...configuration.protocols.timing,id:"synthetic-value-1"};
  assert.throws(()=>site.start("synthetic-formal-1","value","formal",{requestId:request(),consent:{...consent,version:"synthetic-v1",adult:true,eligible:true}}),/已经参加过/);
  configuration.protocols.placement={...configuration.protocols.timing,id:"synthetic-placement-1"};
  assert.throws(()=>site.start("synthetic-display","placement","formal",{requestId:request(),display:{width:1024,height:768},consent:{...consent,version:"synthetic-v1",adult:true,eligible:true}}),/1280/);
  assert.equal(site.start("synthetic-display","placement","formal",{requestId:request(),display:{width:1366,height:768},consent:{...consent,version:"synthetic-v1",adult:true,eligible:true}}).session.phase,"baseline");
  assert.equal(new Set(report.sessions.map(s => s.allocation.ordinal)).size, 12);
  assert.deepEqual(report.sessions.map(s => s.allocation.ordinal).sort((a,b)=>a-b), Array.from({length:12},(_,i)=>i));
  configuration.protocols.timing.analysisPlanVersion = "different";
  assert.throws(() => site.state("synthetic-formal-1", "timing", "formal"), /协议已变化/);
  assert.equal(database.exec("SELECT name FROM existing_accounts")[0].values[0][0], "原有账号");
  console.log(JSON.stringify({ passed: true, studies: 9, formalAllocations: 12, originalAccountPreserved: true, persistence: true, blinding: true, driftProtection: true }));
})().catch(e => { console.error(e); process.exitCode = 1; });
