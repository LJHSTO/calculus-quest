const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "calculus-quest.db");

let db = null;
let saveTimer = null;

async function getDb() {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  initSchema();
  return db;
}

function getDbSync() {
  if (!db) throw new Error("Database not initialized. Call await getDb() first.");
  return db;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!db) return;
      const data = db.export();
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH + ".tmp", Buffer.from(data));
      fs.renameSync(DB_PATH + ".tmp", DB_PATH);
    } catch (e) {
      console.error("Failed to save database:", e.message);
    }
  }, 2000);
}

function saveNow() {
  clearTimeout(saveTimer);
  if (!db) return;
  const data = db.export();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema() {
  const d = getDbSync();
  d.run("PRAGMA foreign_keys = ON");
  d.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    )
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    )
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS quiz_results (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      chapter_id TEXT NOT NULL,
      chapter_label TEXT DEFAULT '',
      unit_id TEXT NOT NULL,
      unit_label TEXT DEFAULT '',
      question_id TEXT NOT NULL,
      question_type TEXT DEFAULT '',
      phase TEXT DEFAULT '',
      points REAL DEFAULT 0,
      response TEXT NOT NULL DEFAULT '',
      is_correct INTEGER NOT NULL DEFAULT 0,
      status TEXT DEFAULT '',
      score REAL DEFAULT 0,
      max_score REAL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_qr_user ON quiz_results(user_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_qr_chapter ON quiz_results(chapter_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_qr_unit ON quiz_results(unit_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_qr_created ON quiz_results(created_at)");
  d.run("CREATE INDEX IF NOT EXISTS idx_qr_correct ON quiz_results(is_correct)");

  d.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_ev_user ON events(user_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_ev_type ON events(type)");
  d.run("CREATE INDEX IF NOT EXISTS idx_ev_created ON events(created_at)");

  d.run(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_snap_user ON snapshots(user_id)");
  scheduleSave();
}

function queryOne(sql, params = []) {
  const d = getDbSync();
  const stmt = d.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function queryAll(sql, params = []) {
  const d = getDbSync();
  const stmt = d.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function execute(sql, params = []) {
  const d = getDbSync();
  d.run(sql, params);
  scheduleSave();
}

// ---- Users ----

function upsertUser(id, nickname, createdAt, lastSeenAt) {
  execute(
    "INSERT OR REPLACE INTO users (id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    [id, nickname, createdAt, lastSeenAt]
  );
}

function getUser(id) {
  return queryOne("SELECT * FROM users WHERE id = ?", [id]);
}

// ---- Sessions ----

function createSession(token, userId, createdAt) {
  execute(
    "INSERT OR REPLACE INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    [token, userId, createdAt, createdAt]
  );
}

function getSession(token) {
  return queryOne("SELECT * FROM sessions WHERE token = ?", [token]);
}

function touchSession(token, timestamp) {
  execute("UPDATE sessions SET last_seen_at = ? WHERE token = ?", [timestamp, token]);
}

// ---- Quiz Results ----

function insertQuizResult(record) {
  execute(
    `INSERT OR REPLACE INTO quiz_results
      (id, user_id, chapter_id, chapter_label, unit_id, unit_label,
       question_id, question_type, phase, points, response, is_correct,
       status, score, max_score, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.user_id, record.chapter_id, record.chapter_label || "",
      record.unit_id, record.unit_label || "", record.question_id,
      record.question_type || "", record.phase || "", record.points || 0,
      typeof record.response === "string" ? record.response : JSON.stringify(record.response),
      typeof record.is_correct === "number" ? record.is_correct : (record.is_correct ? 1 : 0), record.status || "",
      record.score || 0, record.max_score || 0, record.created_at
    ]
  );
}

function getQuizResultsByUser(userId, limit = 200) {
  return queryAll(
    "SELECT * FROM quiz_results WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit]
  );
}

// ---- Events ----

function insertEvent(record) {
  execute(
    "INSERT OR REPLACE INTO events (id, user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    [record.id, record.user_id, record.type, JSON.stringify(record.payload || {}), record.created_at]
  );
}

// ---- Snapshots ----

function insertSnapshot(record) {
  execute(
    "INSERT OR REPLACE INTO snapshots (id, user_id, reason, data, created_at) VALUES (?, ?, ?, ?, ?)",
    [record.id, record.user_id, record.reason || "", JSON.stringify(record.data || {}), record.created_at]
  );
}

function getLatestSnapshot(userId) {
  return queryOne(
    "SELECT * FROM snapshots WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
}

// ==================== Analytics Queries ====================

function dateFilter(prefix, dates) {
  if (!dates || (!dates.startDate && !dates.endDate)) return { clause: "", params: [] };
  const parts = [];
  const p = [];
  if (dates.startDate) { parts.push(`${prefix} >= ?`); p.push(dates.startDate); }
  if (dates.endDate) { parts.push(`${prefix} <= ?`); p.push(dates.endDate); }
  return { clause: parts.length ? " AND " + parts.join(" AND ") : "", params: p };
}

function statsOverview(dates) {
  const today = new Date().toISOString().slice(0, 10);
  const qrFilter = dateFilter("qr.created_at", dates);
  const evFilter = dateFilter("created_at", dates);
  const hasFilter = !!(dates && (dates.startDate || dates.endDate));
  // activeInRange: count distinct users within the date filter (or today if no filter)
  const activeQuery = hasFilter
    ? `SELECT COUNT(DISTINCT user_id) as c FROM events WHERE 1=1${evFilter.clause}`
    : "SELECT COUNT(DISTINCT user_id) as c FROM events WHERE created_at >= ?";
  const activeParams = hasFilter ? evFilter.params : [today];
  return {
    totalUsers: queryOne("SELECT COUNT(*) as c FROM users").c,
    totalQuizResults: queryOne(`SELECT COUNT(*) as c FROM quiz_results qr WHERE 1=1${qrFilter.clause}`, qrFilter.params).c,
    totalEvents: queryOne(`SELECT COUNT(*) as c FROM events WHERE 1=1${evFilter.clause}`, evFilter.params).c,
    activeToday: queryOne("SELECT COUNT(DISTINCT user_id) as c FROM events WHERE created_at >= ?", [today]).c,
    activeInRange: queryOne(activeQuery, activeParams).c,
    avgAccuracy: queryOne(`SELECT ROUND(AVG(CAST(qr.is_correct AS REAL)) * 100, 1) as c FROM quiz_results qr WHERE qr.is_correct >= 0${qrFilter.clause}`, qrFilter.params).c || 0
  };
}

function chapterAccuracy(dates) {
  const df = dateFilter("qr.created_at", dates);
  return queryAll(`
    SELECT u.nickname, qr.user_id, qr.chapter_id, qr.chapter_label,
           ROUND(AVG(CASE WHEN qr.is_correct >= 0 THEN CAST(qr.is_correct AS REAL) END) * 100, 1) as accuracy,
           COUNT(*) as total
    FROM quiz_results qr
    JOIN users u ON u.id = qr.user_id
    WHERE 1=1${df.clause}
    GROUP BY qr.user_id, qr.chapter_id
    ORDER BY qr.user_id, qr.chapter_id
  `, df.params);
}

function questionErrors(dates) {
  const df = dateFilter("created_at", dates);
  return queryAll(`
    SELECT question_id, unit_label, chapter_label, question_type,
           COUNT(*) as attempts,
           ROUND((1 - AVG(CASE WHEN is_correct >= 0 THEN CAST(is_correct AS REAL) END)) * 100, 1) as error_rate,
           ROUND(AVG(score), 1) as avg_score,
           ROUND(AVG(max_score), 1) as avg_max
    FROM quiz_results
    WHERE 1=1${df.clause}
    GROUP BY question_id
    ORDER BY error_rate DESC
  `, df.params);
}

function userProgress(dates) {
  const df = dateFilter("qr.created_at", dates);
  return queryAll(`
    SELECT u.id as user_id, u.nickname, u.last_seen_at,
           COUNT(DISTINCT qr.unit_id) as units_attempted,
           COUNT(qr.id) as quiz_count,
           ROUND(AVG(CASE WHEN qr.is_correct >= 0 THEN CAST(qr.is_correct AS REAL) END) * 100, 1) as avg_accuracy,
           ROUND(SUM(qr.score), 0) as total_score,
           ROUND(SUM(qr.max_score), 0) as total_max
    FROM users u
    LEFT JOIN quiz_results qr ON qr.user_id = u.id${df.clause}
    GROUP BY u.id
    ORDER BY quiz_count DESC
  `, df.params);
}

function dailyActivity(days = 30, dates) {
  const df = dateFilter("created_at", dates);
  return queryAll(
    `SELECT substr(created_at, 1, 10) as date,
            COUNT(DISTINCT user_id) as active_users,
            COUNT(*) as events_count,
            SUM(CASE WHEN type = 'quiz_result' THEN 1 ELSE 0 END) as quiz_submissions
     FROM events
     WHERE created_at >= date('now', ? || ' days')${df.clause}
     GROUP BY date
     ORDER BY date`,
    [String(-days), ...df.params]
  );
}

function phaseComparison(dates) {
  const df = dateFilter("qr.created_at", dates);
  return queryAll(`
    SELECT u.nickname, qr.user_id, qr.chapter_id, qr.chapter_label,
           ROUND(AVG(CASE WHEN qr.phase = 'pre' AND qr.is_correct >= 0 THEN CAST(qr.is_correct AS REAL) END) * 100, 1) as pre_accuracy,
           COUNT(CASE WHEN qr.phase = 'pre' THEN 1 END) as pre_count,
           ROUND(AVG(CASE WHEN qr.phase = 'post' AND qr.is_correct >= 0 THEN CAST(qr.is_correct AS REAL) END) * 100, 1) as post_accuracy,
           COUNT(CASE WHEN qr.phase = 'post' THEN 1 END) as post_count
    FROM quiz_results qr
    JOIN users u ON u.id = qr.user_id
    WHERE qr.phase IN ('pre', 'post')${df.clause}
    GROUP BY qr.user_id, qr.chapter_id
    HAVING pre_count > 0 OR post_count > 0
    ORDER BY qr.user_id, qr.chapter_id
  `, df.params);
}

function userDetail(userId, dates) {
  const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) return null;
  const qrDf = dateFilter("created_at", dates);
  const evDf = dateFilter("created_at", dates);
  const quizResults = queryAll(
    `SELECT * FROM quiz_results WHERE user_id = ?${qrDf.clause} ORDER BY created_at DESC LIMIT 500`,
    [userId, ...qrDf.params]
  );
  const events = queryAll(
    `SELECT * FROM events WHERE user_id = ?${evDf.clause} ORDER BY created_at DESC LIMIT 200`,
    [userId, ...evDf.params]
  );
  const chapterSummary = queryAll(`
    SELECT chapter_id, chapter_label,
           COUNT(*) as total, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
           ROUND(AVG(CASE WHEN is_correct >= 0 THEN CAST(is_correct AS REAL) END) * 100, 1) as accuracy,
           ROUND(AVG(score), 1) as avg_score
    FROM quiz_results WHERE user_id = ?${qrDf.clause} GROUP BY chapter_id ORDER BY chapter_id
  `, [userId, ...qrDf.params]);
  return { user, quizResults, events, chapterSummary };
}

function listUsers() {
  return queryAll(
    "SELECT u.*, (SELECT COUNT(*) FROM quiz_results WHERE user_id = u.id) as quiz_count FROM users u ORDER BY last_seen_at DESC"
  );
}

function questionTypeAccuracy(dates) {
  const df = dateFilter("created_at", dates);
  return queryAll(`
    SELECT question_type,
           COUNT(*) as total,
           ROUND(AVG(CASE WHEN is_correct >= 0 THEN CAST(is_correct AS REAL) END) * 100, 1) as accuracy,
           ROUND(AVG(score), 1) as avg_score,
           ROUND(AVG(max_score), 1) as avg_max
    FROM quiz_results
    WHERE question_type != ''${df.clause}
    GROUP BY question_type
    ORDER BY accuracy
  `, df.params);
}

function scoreDistribution(dates) {
  const df = dateFilter("created_at", dates);
  return queryAll(`
    SELECT
      CASE
        WHEN CAST(score AS REAL) / NULLIF(max_score, 0) >= 1.0 THEN '满分 (100%)'
        WHEN CAST(score AS REAL) / NULLIF(max_score, 0) >= 0.8 THEN '80-99%'
        WHEN CAST(score AS REAL) / NULLIF(max_score, 0) >= 0.6 THEN '60-79%'
        WHEN CAST(score AS REAL) / NULLIF(max_score, 0) >= 0.4 THEN '40-59%'
        WHEN CAST(score AS REAL) / NULLIF(max_score, 0) >= 0.2 THEN '20-39%'
        ELSE '0-19%'
      END as bucket,
      COUNT(*) as count,
      MIN(CAST(score AS REAL) / NULLIF(max_score, 0)) as min_ratio
    FROM quiz_results
    WHERE max_score > 0${df.clause}
    GROUP BY bucket
    ORDER BY min_ratio
  `, df.params);
}

function hourlyActivity(days = 30, dates) {
  const df = dateFilter("created_at", dates);
  return queryAll(
    `SELECT CAST(substr(created_at, 12, 2) AS INTEGER) as hour,
            COUNT(*) as events_count,
            COUNT(DISTINCT user_id) as active_users,
            SUM(CASE WHEN type = 'quiz_result' THEN 1 ELSE 0 END) as quiz_submissions
     FROM events
     WHERE created_at >= date('now', ? || ' days')${df.clause}
     GROUP BY hour
     ORDER BY hour`,
    [String(-days), ...df.params]
  );
}

function shortAnswerResponses(dates) {
  const df = dateFilter("qr.created_at", dates);
  return queryAll(`
    SELECT qr.id, u.nickname, qr.user_id, qr.chapter_label, qr.unit_label,
           qr.question_id, qr.response, qr.score, qr.max_score,
           qr.is_correct, qr.status, qr.phase, qr.created_at
    FROM quiz_results qr
    JOIN users u ON u.id = qr.user_id
    WHERE qr.question_type = 'short_answer'${df.clause}
    ORDER BY qr.created_at DESC
    LIMIT 500
  `, df.params);
}

function getEventsByType(type, limitOrOptions = 500, dates) {
  const options = typeof limitOrOptions === "object"
    ? limitOrOptions
    : { limit: limitOrOptions, dates };
  const limit = Math.max(1, Math.min(Number(options.limit || 500), 1000));
  const offset = Math.max(0, Number(options.offset || 0));
  const userId = String(options.userId || "").trim();
  const range = options.dates || dates;
  const df = dateFilter("e.created_at", range);
  const userClause = userId ? " AND e.user_id = ?" : "";
  const params = [type, ...df.params, ...(userId ? [userId] : [])];
  const total = queryOne(
    `SELECT COUNT(*) as c FROM events e JOIN users u ON u.id = e.user_id WHERE e.type = ?${df.clause}${userClause}`,
    params
  ).c;
  const rows = queryAll(
    `SELECT e.*, u.nickname FROM events e JOIN users u ON u.id = e.user_id WHERE e.type = ?${df.clause}${userClause} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { rows, total, limit, offset };
}

module.exports = {
  getDb,
  getDbSync,
  saveNow,
  upsertUser,
  getUser,
  createSession,
  getSession,
  touchSession,
  insertQuizResult,
  getQuizResultsByUser,
  insertEvent,
  insertSnapshot,
  getLatestSnapshot,
  statsOverview,
  chapterAccuracy,
  questionErrors,
  userProgress,
  dailyActivity,
  phaseComparison,
  userDetail,
  listUsers,
  questionTypeAccuracy,
  scoreDistribution,
  hourlyActivity,
  getEventsByType,
  shortAnswerResponses
};
