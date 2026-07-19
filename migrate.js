const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const options = {
    source: path.join(__dirname, "data", "learning-records.json"),
    db: "",
    confirmed: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      const value = argv[++index];
      if (!value) throw new Error("--source requires a JSON file path.");
      options.source = path.resolve(value);
    } else if (arg === "--db") {
      const value = argv[++index];
      if (!value) throw new Error("--db requires a database file path.");
      options.db = path.resolve(value);
    } else if (arg === "--confirm-import") {
      options.confirmed = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node migrate.js --confirm-import [--source <learning-records.json>] [--db <database.db>]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function backupDatabase(databasePath) {
  if (!fs.existsSync(databasePath)) return "";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const backupPath = `${databasePath}.before-json-import-${stamp}.bak`;
  fs.copyFileSync(databasePath, backupPath);
  if (sha256(databasePath) !== sha256(backupPath)) {
    throw new Error("Database backup hash mismatch. Import refused.");
  }
  return backupPath;
}

const options = parseArgs(process.argv.slice(2));
const jsonPath = options.source;
if (!fs.existsSync(jsonPath)) {
  console.log(`No legacy learning records found at ${jsonPath}; nothing to import.`);
  process.exit(0);
}
if (!options.confirmed) {
  console.error("Legacy import refused. Re-run with --confirm-import after stopping the server and backing up the target database.");
  process.exit(2);
}
if (options.db) process.env.DB_PATH = options.db;

const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const db = require("./db");

async function run() {
  let d = null;
  let transactionOpen = false;
  let users = 0, sessions = 0, quizResults = 0, events = 0, snapshots = 0;
  let backupPath = "";

  try {
    db.acquireWriteLock();
    const safety = db.databaseSafetyInfo();
    backupPath = backupDatabase(safety.path);
    await db.getDb();
    d = db.getDbSync();
    d.run("BEGIN");
    transactionOpen = true;

    // Users
    if (raw.participants) {
      for (const [id, p] of Object.entries(raw.participants)) {
        db.upsertUser(id, p.nickname || "unknown", p.createdAt || "", p.lastSeenAt || "");
        users++;
      }
    }

    // Sessions
    if (raw.sessions) {
      for (const [token, s] of Object.entries(raw.sessions)) {
        db.createSession(token, s.participantId, s.createdAt || "");
        sessions++;
      }
    }

    // Events & QuizResults
    if (Array.isArray(raw.events)) {
      for (const e of raw.events) {
        db.insertEvent({
          id: e.id,
          user_id: e.participantId,
          type: e.type,
          payload: e.payload || {},
          created_at: e.createdAt
        });
        events++;

        if (e.type === "quiz_result") {
          const q = e.payload || {};
          db.insertQuizResult({
            id: q.id || e.id,
            user_id: e.participantId,
            chapter_id: q.chapterId || "",
            chapter_label: q.chapterLabel || "",
            unit_id: q.unitId || "",
            unit_label: q.unitLabel || "",
            question_id: q.questionId || "",
            question_type: q.questionType || "",
            phase: q.phase || "",
            points: q.points || 0,
            response: typeof q.response === "string" ? q.response : JSON.stringify(q.response || ""),
            is_correct: q.isCorrect === true ? 1 : q.isCorrect === false ? 0 : -1,
            status: q.status || "",
            score: q.score || 0,
            max_score: q.maxScore || 0,
            created_at: q.timestamp || e.createdAt
          });
          quizResults++;
        }
      }
    }

    // Also import standalone quizResults (in case they weren't captured as events)
    if (Array.isArray(raw.quizResults)) {
      for (const qr of raw.quizResults) {
        const q = qr.type === "quiz_result" ? (qr.payload || {}) : qr;
        const stmt = db.getDbSync().prepare("SELECT id FROM quiz_results WHERE id = ?");
        stmt.bind([q.id || qr.id]);
        const existing = stmt.step();
        stmt.free();
        if (!existing) {
          db.insertQuizResult({
            id: q.id || qr.id,
            user_id: q.participantId || qr.participantId || "",
            chapter_id: q.chapterId || "",
            chapter_label: q.chapterLabel || "",
            unit_id: q.unitId || "",
            unit_label: q.unitLabel || "",
            question_id: q.questionId || "",
            question_type: q.questionType || "",
            phase: q.phase || "",
            points: q.points || 0,
            response: typeof q.response === "string" ? q.response : JSON.stringify(q.response || ""),
            is_correct: q.isCorrect === true ? 1 : q.isCorrect === false ? 0 : -1,
            status: q.status || "",
            score: q.score || 0,
            max_score: q.maxScore || 0,
            created_at: q.timestamp || q.createdAt || qr.createdAt || ""
          });
          quizResults++;
        }
      }
    }

    // Snapshots
    if (Array.isArray(raw.snapshots)) {
      for (const s of raw.snapshots) {
        db.insertSnapshot({
          id: s.id,
          user_id: s.participantId,
          reason: s.reason || "",
          data: s.snapshot || {},
          created_at: s.createdAt
        });
        snapshots++;
      }
    }

    d.run("COMMIT");
    transactionOpen = false;
    db.saveNow();
    console.log(`Legacy import complete: ${users} users, ${sessions} sessions, ${quizResults} quiz results, ${events} events, ${snapshots} snapshots.`);
    if (backupPath) console.log(`Database backup: ${backupPath}`);
  } catch (error) {
    if (transactionOpen && d) {
      try { d.run("ROLLBACK"); } catch {}
      db.saveNow();
    }
    throw error;
  } finally {
    db.releaseWriteLock();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
