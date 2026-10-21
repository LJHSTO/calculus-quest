"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-selected-export-"));
process.env.DB_PATH = path.join(dir, "test.db");
async function main() {
  const db = require("../db");
  await db.getDb();
  const raw = db.getDbSync();
  for (const id of ["selected-a", "selected-b", "excluded"]) {
    db.upsertUser(id, id === "selected-b" ? "" : id, "2020-01-01", "2026-09-18");
    db.insertEvent({ id: `event-${id}`, user_id: id, type: "test", payload: { action: id }, created_at: "2020-01-01" });
    raw.run("INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)", [`secret-${id}`, id, "2020-01-01"]);
    raw.run("UPDATE users SET password_hash=? WHERE id=?", [`password-${id}`, id]);
  }
  const { buildSelectedParticipantPackage } = require("../lib/selected-participant-export");
  // One row carries real instants in the +08:00 form the app writes, plus a plain
  // date key that must survive untouched.
  db.insertEvent({
    id: "event-beijing", user_id: "selected-a", type: "test",
    payload: { action: "beijing" }, created_at: "2026-09-18T20:30:00.000+08:00"
  });
  db.insertEvent({
    id: "event-utc", user_id: "selected-a", type: "test",
    payload: { action: "utc" }, created_at: "2026-09-18T11:00:00.000Z"
  });
  raw.run("INSERT INTO learning_assistant_daily_usage (user_id,usage_date,request_count,intervention_count,updated_at) VALUES (?,?,?,?,?)",
    ["selected-a", "2026-09-18", 1, 0, "2026-09-18T20:30:00.000+08:00"]);
  // A legacy database has no lazy common-task tables. Make absence observable.
  const legacy = buildSelectedParticipantPackage(raw, ["selected-a"]);
  assert.ok(legacy.collection_coverage.unavailable_tables.includes("study_workbench_process"));
  assert.ok(legacy.collection_coverage.unavailable_tables.includes("agent_tasks"));
  const agent=require("../lib/proactive-agent-runtime").createRuntime({db});
  for(const id of ["selected-a","selected-b","excluded"]){
    agent.grant(id,"GH-01-K01","open_hint",24);
    agent.grant(id,"GH-01-K01","prepare_review",168);
    agent.openHint(id,"GH-01-K01","decision-"+id);
    agent.remember({user:id,scope:"GH-01-K01",generation:1,sourceId:"check-"+id,outcome:{success:false}});
  }
  const { createWorkbench, points } = require("../lib/study-workbench");
  const resources = points.map(knowledgePointId => ({ knowledgePointId, url: "/synthetic-courseware", revision: "fixture-only" }));
  const workbench = createWorkbench({ db, env: { NODE_ENV: "test" }, resources, mainEntry: true });
  for (const id of ["selected-a", "selected-b", "excluded"]) {
    let view = workbench.start(id, { acknowledged: true, knowledgePointId: points[0] });
    assert.equal(JSON.stringify(view).includes("answerKey"), false);
    view = workbench.act(id, { action: "answer", fingerprint: view.protocol.fingerprint,
      revision: view.session.revision, probeId: view.session.probe.id,
      response: "1", explanation: "同一个输入不能对应两个输出。", confidence: 2 });
    const input = { fingerprint: view.protocol.fingerprint, knowledgePointId: points[0],
      opportunityId: view.session.opportunityId, observedStage: "explore",
      event: { type: "parameter_commit", eventId: "browser-session:7", sessionId: "browser-session",
        sequenceIndex: 7, clientAt: "2026-10-20T10:00:00+08:00",
        data: { parameter: "input", value: 4, resource_revision: "fixture-only", secret: "must-be-omitted" } } };
    const first = workbench.recordProcess(id, input);
    assert.equal(first.duplicate, false);
    assert.deepEqual(workbench.recordProcess(id, input), { ...first, duplicate: true });
    assert.equal(workbench.recordProcess(id, { ...input, opportunityId: "wrong-opportunity" }).recorded, false);
  }
  db.insertQuizResult({
    id: "quiz-beijing", user_id: "selected-a", chapter_id: "V14-C1", chapter_label: "函数与极限",
    unit_id: "V14-C1-pre", unit_label: "前测", question_id: "q1", question_type: "single",
    phase: "pre", points: 8, response: "A", is_correct: 0, status: "graded", score: 0, max_score: 8,
    created_at: "2026-09-18T20:31:00.000+08:00"
  });
  const data = buildSelectedParticipantPackage(raw, ["selected-a", "selected-b", "selected-a"]);
  assert.deepEqual(data.selected_user_ids, ["selected-a", "selected-b"]);
  assert.equal(data.tables.users.length, 2);
  assert.equal(data.tables.events.length, 4);
  assert.equal(data.tables.sessions.length, 2);
  const text = JSON.stringify(data);
  assert.ok(!text.includes("excluded"));
  assert.ok(!text.includes("secret-"));
  assert.ok(!text.includes("password-"));
  // Plain date keys are not instants and must not be rewritten.
  assert.equal(data.tables.events.find(row => row.id === "event-selected-a").created_at, "2020-01-01");
  assert.equal(data.tables.learning_assistant_daily_usage[0].usage_date, "2026-09-18");
  assert.equal(data.tables.learning_assistant_daily_usage[0].updated_at, "2026-09-18T12:30:00.000Z");
  assert.ok(data.tables.snapshots && data.tables.learning_notes && data.tables.proactive_outcome_attempts);
  assert.equal(data.tables.study_workbench_sessions.length, 2);
  assert.equal(data.tables.agent_tasks.length,2);
  assert.equal(data.tables.agent_memory.length,2);
  assert.equal(data.tables.agent_action_receipts.length,2);
  assert.equal(data.tables.agent_permissions.length,4);
  assert.equal(data.tables.study_workbench_events.length, 4);
  assert.equal(data.tables.study_workbench_process.length, 2, "重试去重且不同用户不相互去重");
  const processEvent = JSON.parse(data.tables.study_workbench_process[0].event_json);
  assert.equal(processEvent.clientEventId, "browser-session:7");
  assert.equal(processEvent.clientAt, "2026-10-20T02:00:00.000Z");
  assert.equal(processEvent.sequenceIndex, 7);
  assert.equal(processEvent.data.resource_revision, "fixture-only");
  assert.equal(processEvent.data.secret, undefined);
  assert.equal(processEvent.clockSource, "server_receipt_and_untrusted_client");
  const learningState = JSON.parse(data.tables.study_workbench_sessions[0].state_json);
  assert.equal(learningState.units[0].probes.t0.explanation, "同一个输入不能对应两个输出。");
  assert.equal(learningState.units[0].probes.t0.confidence, 2);
  assert.equal(processEvent.opportunityId, learningState.units[0].opportunityId);
  assert.equal(data.tables.study_workbench_protocols.length, 1);
  const archive = JSON.parse(data.tables.study_workbench_protocols[0].protocol_json);
  assert.equal(archive.instruments.flatMap(x => x.probes).length, 18);
  assert.equal(archive.instruments[0].probes[0].answerKey, "1");
  assert.equal(archive.instruments[0].resource.revision, "fixture-only");
  assert.deepEqual(data.collection_coverage.unavailable_tables, []);
  // Reopen serialized SQLite bytes: this checks durable representation, not
  // merely a second read through the same JavaScript service.
  const SQL = await require("sql.js")();
  const reopened = new SQL.Database(raw.export());
  const restored = createWorkbench({ db: { getDbSync: () => reopened, saveNow() {},
    currentLearningGeneration: id => db.currentLearningGeneration(id) },
    env: { NODE_ENV: "test" }, resources, mainEntry: true });
  assert.deepEqual(restored.state("selected-a"), workbench.state("selected-a"));
  assert.equal(restored.exportData().processEvents.length, 3);
  reopened.close();

  // --- B5: UTC normalisation, chronological order, dictionary, fingerprint ---
  assert.equal(data.schema_version, "selected-participant-package-v2");
  assert.equal(data.scope.timestamps_normalized_to, "UTC");
  const beijing = data.tables.events.find(row => row.id === "event-beijing");
  const utc = data.tables.events.find(row => row.id === "event-utc");
  assert.equal(beijing.created_at, "2026-09-18T12:30:00.000Z", "+08:00 instants must be rewritten as UTC");
  assert.equal(utc.created_at, "2026-09-18T11:00:00.000Z", "UTC instants must be preserved");
  assert.ok(!/\+08:00/.test(JSON.stringify(data.tables)), "no +08:00 form may survive in the tables");
  // Lexical order now equals chronological order.
  const instants = data.tables.events.map(row => row.created_at).filter(value => /Z$/.test(value));
  assert.deepEqual(instants, [...instants].sort(), "rows must be chronologically ordered");
  assert.match(data.data_fingerprint, /^[a-f0-9]{64}$/);
  assert.match(data.export_transform_digest, /^[a-f0-9]{64}$/);
  const dictionaryFields = data.dictionary.events.map(entry => entry.field);
  assert.ok(dictionaryFields.includes("created_at"), "dictionary must describe observed fields");
  assert.equal(
    data.dictionary.events.find(entry => entry.field === "created_at").time_zone,
    "UTC",
    "dictionary must declare the time zone of timestamp fields"
  );
  assert.match(
    data.dictionary.quiz_results.find(entry => entry.field === "phase")?.meaning || "",
    /前测/,
    "enum meanings must be carried for values a reader cannot interpret"
  );
  // Same rows in, same fingerprint out.
  const again = buildSelectedParticipantPackage(raw, ["selected-a", "selected-b"]);
  assert.equal(again.data_fingerprint, data.data_fingerprint, "fingerprint must be reproducible");
  const schema = raw.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.flat();
  for (const table of schema) {
    const columns = raw.exec(`PRAGMA table_info("${table}")`)[0]?.values || [];
    if (columns.some(column => column[1] === "user_id")) {
      assert.ok(Object.hasOwn(data.tables, table), `遗漏用户数据表: ${table}`);
    }
  }
  for (const ids of [[], ["missing"], ["selected-a", "missing"], "selected-a", ["' OR 1=1 --"]]) {
    assert.throws(() => buildSelectedParticipantPackage(raw, ids), error => error.status === 400);
  }
  assert.throws(() => buildSelectedParticipantPackage(raw, ["selected-a"], { maxRows: 1 }), error => error.status === 413);
  console.log("选中人员导出通过：历史库兼容、共同任务三表与材料快照、理由/信心、事件关联和重试去重、序列化恢复、用户隔离、排除登录凭据、UTC归一化、字典与指纹。");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
