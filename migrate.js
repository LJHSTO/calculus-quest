const fs = require("fs");
const path = require("path");

const jsonPath = path.join(__dirname, "data", "learning-records.json");
if (!fs.existsSync(jsonPath)) {
  console.log("No learning-records.json found — nothing to migrate.");
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const db = require("./db");

async function run() {
  await db.getDb();
  // Make migration idempotent: clear existing data
  const d = db.getDbSync();
  d.run("DELETE FROM snapshots");
  d.run("DELETE FROM events");
  d.run("DELETE FROM quiz_results");
  d.run("DELETE FROM sessions");
  d.run("DELETE FROM users");
  let users = 0, sessions = 0, quizResults = 0, events = 0, snapshots = 0;

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
      // Check if this is a wrapped event or a raw quiz result
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

  console.log(`Migration complete: ${users} users, ${sessions} sessions, ${quizResults} quiz results, ${events} events, ${snapshots} snapshots`);
}

run();
