const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const initSqlJs = require("sql.js");

const root = path.resolve(__dirname, "..");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cq-migrate-safety-"));
const dbPath = path.join(tmpDir, "existing.db");
const sourcePath = path.join(tmpDir, "learning-records.json");

function hash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development" }
  });
}

function queryCount(database, table) {
  const statement = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`);
  try {
    assert.equal(statement.step(), true);
    return Number(statement.getAsObject().count || 0);
  } finally {
    statement.free();
  }
}

async function main() {
  const seedScript = `
    process.env.DB_PATH = ${JSON.stringify(dbPath)};
    const db = require("./db");
    (async () => {
      db.acquireWriteLock();
      try {
        await db.getDb();
        db.upsertUser("existing-user", "已有学生", "2026-07-01T08:00:00.000+08:00", "2026-07-01T08:00:00.000+08:00");
        db.insertEvent({
          id: "existing-event",
          user_id: "existing-user",
          type: "login",
          payload: {},
          created_at: "2026-07-01T08:00:00.000+08:00"
        });
        db.insertQuizResult({
          id: "existing-quiz",
          user_id: "existing-user",
          chapter_id: "V14-C1",
          chapter_label: "函数、极限与导数入口",
          unit_id: "V14-C1-M1-pre",
          unit_label: "知识前测",
          question_id: "existing-question",
          question_type: "single",
          phase: "pre",
          response: "A",
          is_correct: 1,
          status: "correct",
          score: 1,
          max_score: 1,
          created_at: "2026-07-01T08:00:00.000+08:00"
        });
        db.insertSnapshot({
          id: "existing-snapshot",
          user_id: "existing-user",
          reason: "seed",
          data: { completed: ["existing-unit"] },
          created_at: "2026-07-01T08:00:00.000+08:00"
        });
        db.saveNow();
      } finally {
        db.releaseWriteLock();
      }
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
  `;
  const seeded = runNode(["-e", seedScript]);
  assert.equal(seeded.status, 0, `${seeded.stdout}\n${seeded.stderr}`);

  fs.writeFileSync(sourcePath, JSON.stringify({
    participants: {
      "imported-user": {
        nickname: "导入学生",
        createdAt: "2026-07-02T08:00:00.000+08:00",
        lastSeenAt: "2026-07-02T08:00:00.000+08:00"
      }
    },
    events: [{
      id: "imported-event",
      participantId: "imported-user",
      type: "quiz_result",
      createdAt: "2026-07-02T08:00:00.000+08:00",
      payload: {
        id: "imported-quiz",
        chapterId: "V14-C1",
        chapterLabel: "函数、极限与导数入口",
        unitId: "V14-C1-M1-pre",
        unitLabel: "知识前测",
        questionId: "imported-question",
        questionType: "single",
        phase: "pre",
        response: "B",
        isCorrect: false,
        status: "incorrect",
        score: 0,
        maxScore: 1,
        timestamp: "2026-07-02T08:00:00.000+08:00"
      }
    }],
    snapshots: [{
      id: "imported-snapshot",
      participantId: "imported-user",
      reason: "legacy",
      snapshot: { completed: ["imported-unit"] },
      createdAt: "2026-07-02T08:00:00.000+08:00"
    }]
  }), "utf8");

  const beforeHash = hash(dbPath);
  const refused = runNode([
    "migrate.js",
    "--source", sourcePath,
    "--db", dbPath
  ]);
  assert.equal(refused.status, 2);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /--confirm-import/);
  assert.equal(hash(dbPath), beforeHash, "refused import must not alter the target database");

  const imported = runNode([
    "migrate.js",
    "--confirm-import",
    "--source", sourcePath,
    "--db", dbPath
  ]);
  assert.equal(imported.status, 0, `${imported.stdout}\n${imported.stderr}`);
  assert.match(imported.stdout, /Legacy import complete/);

  const backups = fs.readdirSync(tmpDir)
    .filter((name) => name.startsWith("existing.db.before-json-import-") && name.endsWith(".bak"));
  assert.equal(backups.length, 1);
  assert.equal(hash(path.join(tmpDir, backups[0])), beforeHash);
  assert.equal(fs.existsSync(`${dbPath}.lock`), false);

  const SQL = await initSqlJs();
  const database = new SQL.Database(fs.readFileSync(dbPath));
  assert.equal(queryCount(database, "users"), 2);
  assert.equal(queryCount(database, "events"), 2);
  assert.equal(queryCount(database, "quiz_results"), 2);
  assert.equal(queryCount(database, "snapshots"), 2);
  database.close();

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("migration safety tests passed");
}

main().catch((error) => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
