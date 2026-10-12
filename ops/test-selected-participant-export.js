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
  console.log("选中人员导出通过：跨历史、精确筛选、去重、完整表、排除登录凭据、非法选择及超限拒绝、UTC归一化、时序排序、字典与指纹。");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
