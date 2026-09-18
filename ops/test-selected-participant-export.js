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
  const data = buildSelectedParticipantPackage(raw, ["selected-a", "selected-b", "selected-a"]);
  assert.deepEqual(data.selected_user_ids, ["selected-a", "selected-b"]);
  assert.equal(data.tables.users.length, 2);
  assert.equal(data.tables.events.length, 2);
  assert.equal(data.tables.sessions.length, 2);
  const text = JSON.stringify(data);
  assert.ok(!text.includes("excluded"));
  assert.ok(!text.includes("secret-"));
  assert.ok(!text.includes("password-"));
  assert.equal(data.tables.events[0].created_at, "2020-01-01");
  assert.ok(data.tables.snapshots && data.tables.learning_notes && data.tables.proactive_outcome_attempts);
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
  console.log("选中人员导出通过：跨历史、精确筛选、去重、完整表、排除登录凭据、非法选择及超限拒绝。");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
