const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const initSqlJs = require("sql.js");

async function createLegacyDatabase(dbPath) {
  const SQL = await initSqlJs();
  const legacyDb = new SQL.Database();
  legacyDb.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    )
  `);
  legacyDb.run(`
    CREATE TABLE learning_assistant_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      thread_key TEXT NOT NULL,
      chapter_id TEXT DEFAULT '',
      unit_id TEXT NOT NULL,
      knowledge_point_id TEXT DEFAULT '',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      context_json TEXT DEFAULT '{}',
      provider TEXT DEFAULT '',
      quiz_submitted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  legacyDb.run(
    "INSERT INTO users (id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ["legacy-assistant-user", "旧版知点学习者", "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"]
  );
  legacyDb.run(
    `INSERT INTO learning_assistant_messages
      (id, user_id, thread_key, chapter_id, unit_id, knowledge_point_id,
       role, content, context_json, provider, quiz_submitted, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "legacy-message-1",
      "legacy-assistant-user",
      "knowledge:legacy-unit",
      "legacy-chapter",
      "legacy-unit",
      "legacy-knowledge-point",
      "user",
      "为什么这里要取极限？",
      "{}",
      "",
      0,
      "2026-07-01T00:01:00.000Z"
    ]
  );
  legacyDb.run(
    `INSERT INTO learning_assistant_messages
      (id, user_id, thread_key, chapter_id, unit_id, knowledge_point_id,
       role, content, context_json, provider, quiz_submitted, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "legacy-message-2",
      "legacy-assistant-user",
      "knowledge:legacy-unit",
      "legacy-chapter",
      "legacy-unit",
      "legacy-knowledge-point",
      "assistant",
      "极限描述的是不断逼近时的稳定趋势。",
      "{}",
      "mock",
      0,
      "2026-07-01T00:02:00.000Z"
    ]
  );
  fs.writeFileSync(dbPath, Buffer.from(legacyDb.export()));
  legacyDb.close();
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-assistant-migration-"));
  const dbPath = path.join(tmpDir, "legacy-assistant.db");
  process.env.DB_PATH = dbPath;

  try {
    await createLegacyDatabase(dbPath);
    const db = require("../db");
    await db.getDb();

    const conversations = db.listLearningAssistantConversations(
      "legacy-assistant-user",
      "knowledge:legacy-unit"
    );
    assert.equal(conversations.length, 1, "legacy messages must be grouped into a visible conversation");
    assert.equal(conversations[0].message_count, 2);
    assert.equal(conversations[0].title, "为什么这里要取极限？");

    const messages = db.getLearningAssistantMessages(
      "legacy-assistant-user",
      "knowledge:legacy-unit",
      10,
      conversations[0].id
    );
    assert.deepEqual(messages.map((message) => message.id), ["legacy-message-1", "legacy-message-2"]);
    assert.equal(messages.every((message) => message.conversation_id === conversations[0].id), true);
    db.saveNow();
    console.log("learning assistant migration tests passed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
