const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "calculus-quest.db");
const chapterOrder = ["A1", "A2a", "A2b", "A3", "A4", "C1", "D1", "D2"];
const chapterLabels = {
  A1: "变化与斜率",
  A2a: "向量：方向与长度",
  A2b: "内积与投影",
  A3: "空间变换与局部线性",
  A4: "曲面与正定性",
  C1: "导数、梯度与驻点",
  D1: "梯度下降",
  D2: "凸性与全局最优"
};
let courseLabelCache = null;

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

function chapterDisplayLabel(chapterId, fallback = "") {
  const index = chapterOrder.indexOf(chapterId);
  const label = chapterLabels[chapterId] || fallback || chapterId || "";
  return index >= 0 ? `第${index + 1}章 ${label}` : label;
}

function compactTitle(title = "") {
  return String(title || "")
    .replace(/^.*?：/, "")
    .replace(/实验|挑战|游戏|探针|同步器|生成器|分类器|播放器|仪表盘|可视化|大作战|大比拼|闯关|扫描仪/g, "")
    .replace(/^\d+_/, "")
    .replace(/\.html$/, "")
    .slice(0, 12);
}

function sceneLabel(scene = {}, index = 0, quizIndex = 0, quizTotal = 0) {
  if (scene.type === "quiz") {
    if (quizIndex === 0) return "前测";
    if (quizIndex === quizTotal - 1) return "后测";
    return "形成性测验";
  }
  if (scene.type === "slide") {
    if (/地图|路线/.test(scene.title || "")) return "概念地图";
    if (/公式|桥/.test(scene.title || "")) return "公式桥";
    if (/复盘|兜底|检查/.test(scene.title || "")) return "复盘页";
    return "讲解页";
  }
  return `实验：${compactTitle(scene.title || `模块${index + 1}`)}`;
}

function courseLabels() {
  if (courseLabelCache) return courseLabelCache;
  const labels = new Map();
  chapterOrder.forEach((chapterId) => {
    try {
      const manifestPath = path.join(process.cwd(), "resources", "open-maic", chapterId, "manifest.json");
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
      const quizTotal = scenes.filter((scene) => scene.type === "quiz").length;
      let quizIndex = 0;
      scenes.forEach((scene, index) => {
        const currentQuizIndex = scene.type === "quiz" ? quizIndex++ : -1;
        const unitId = `${chapterId}-scene-${scene.order || index + 1}`;
        labels.set(unitId, {
          chapter_id: chapterId,
          chapter_label: chapterDisplayLabel(chapterId),
          unit_id: unitId,
          unit_label: sceneLabel(scene, index, currentQuizIndex, quizTotal)
        });
      });
    } catch {
      // Label fallback is enough for admin statistics.
    }
  });
  courseLabelCache = labels;
  return labels;
}

function unitDisplayMeta(unitId = "", fallback = {}) {
  const fromCourse = courseLabels().get(unitId);
  if (fromCourse) return fromCourse;
  const chapterId = fallback.chapter_id || fallback.chapterId || String(unitId).split("-scene-")[0] || "";
  return {
    chapter_id: chapterId,
    chapter_label: chapterDisplayLabel(chapterId, fallback.chapter_label || fallback.chapterLabel || ""),
    unit_id: unitId,
    unit_label: fallback.unit_label || fallback.unitLabel || unitId || ""
  };
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

function interactionRows(filter = {}, limit = 20000) {
  const df = dateFilter("e.created_at", filter);
  const userId = String(filter?.userId || "").trim();
  const userClause = userId ? " AND e.user_id = ?" : "";
  return queryAll(
    `SELECT e.*, u.nickname
     FROM events e
     JOIN users u ON u.id = e.user_id
     WHERE e.type = 'interaction'${df.clause}${userClause}
     ORDER BY e.created_at DESC
     LIMIT ?`,
    [...df.params, ...(userId ? [userId] : []), limit]
  ).map((row) => {
    let payload = {};
    try { payload = JSON.parse(row.payload || "{}"); } catch { payload = {}; }
    return { ...row, payload };
  });
}

function interactionSourceRows(source) {
  return Array.isArray(source) ? source : interactionRows(source);
}

function interactionPayloadType(payload) {
  return payload.eventType || payload.data?.eventType || "interaction";
}

function interactionPayloadData(payload) {
  return payload.data || {};
}

function interactionMeta(row) {
  const payload = row.payload || {};
  const data = interactionPayloadData(payload);
  return {
    eventType: interactionPayloadType(payload),
    userId: row.user_id,
    nickname: row.nickname || "",
    chapterId: payload.chapterId || data.chapterId || "",
    chapterLabel: payload.chapterLabel || data.chapterLabel || "",
    unitId: payload.unitId || data.unitId || data.unit || "",
    unitLabel: payload.unitLabel || data.unitLabel || "",
    unitType: payload.unitType || data.unitType || "",
    moduleRole: payload.moduleRole || data.moduleRole || (/^实验[:：]/.test(payload.unitLabel || data.unitLabel || "") ? "experiment" : ""),
    durationMs: payload.timing?.durationMs || data.durationMs || 0,
    createdAt: row.created_at,
    data
  };
}

function isParameterOperation(meta) {
  if (meta.eventType === "parameter_commit") return true;
  const id = meta.data.param || meta.data.id || meta.data.name || "";
  const inputType = String(meta.data.type || "").toLowerCase();
  return meta.eventType === "interactive_change" && (inputType === "range" || /slider/i.test(id));
}

function interactionSummary(dates) {
  const rows = interactionSourceRows(dates);
  const byType = new Map();
  const byRole = new Map();
  const activeUsers = new Set();
  rows.forEach((row) => {
    const meta = interactionMeta(row);
    activeUsers.add(meta.userId);
    byType.set(meta.eventType, (byType.get(meta.eventType) || 0) + 1);
    if (meta.moduleRole) byRole.set(meta.moduleRole, (byRole.get(meta.moduleRole) || 0) + 1);
  });
  return {
    total: rows.length,
    activeUsers: activeUsers.size,
    byType: Array.from(byType, ([event_type, count]) => ({ event_type, count })).sort((a, b) => b.count - a.count),
    byRole: Array.from(byRole, ([module_role, count]) => ({ module_role, count })).sort((a, b) => b.count - a.count)
  };
}

function unitEngagement(dates) {
  const rows = interactionSourceRows(dates);
  const units = new Map();
  rows.forEach((row) => {
    const meta = interactionMeta(row);
    if (!meta.unitId) return;
    const key = `${meta.unitId}|${meta.userId}`;
    const item = units.get(key) || {
      user_id: meta.userId,
      nickname: meta.nickname,
      chapter_id: meta.chapterId,
      chapter_label: meta.chapterLabel,
      unit_id: meta.unitId,
      unit_label: meta.unitLabel,
      unit_type: meta.unitType,
      module_role: meta.moduleRole,
      opens: 0,
      completes: 0,
      repeats: 0,
      seconds: 0,
      clicks: 0,
      parameter_changes: 0,
      quiz_events: 0,
      last_at: meta.createdAt
    };
    if (["unit_enter", "repeat_unit_enter", "unit_open"].includes(meta.eventType)) item.opens += 1;
    if (["unit_complete", "complete_unit"].includes(meta.eventType)) item.completes += 1;
    if (meta.eventType === "repeat_unit_enter") item.repeats += 1;
    if (["time_on_unit", "unit_leave", "leave_unit"].includes(meta.eventType)) item.seconds += Math.round((meta.durationMs || meta.data.seconds * 1000 || 0) / 1000);
    if (/click|pointer|drag/.test(meta.eventType)) item.clicks += 1;
    if (isParameterOperation(meta)) item.parameter_changes += 1;
    if (/quiz|answer|question|short_answer/.test(meta.eventType)) item.quiz_events += 1;
    if (meta.createdAt > item.last_at) item.last_at = meta.createdAt;
    units.set(key, item);
  });
  return Array.from(units.values()).map((item) => {
    const labels = unitDisplayMeta(item.unit_id, item);
    return {
      ...item,
      chapter_label: labels.chapter_label,
      unit_label: labels.unit_label
    };
  }).sort((a, b) => (b.seconds - a.seconds) || b.opens - a.opens).slice(0, 1000);
}

function skipRepeatStats(dates) {
  const rows = interactionSourceRows(dates);
  const modules = new Map();
  const ensureModule = (unitId, fallback = {}) => {
    const labels = unitDisplayMeta(unitId, fallback);
    const key = labels.unit_id || unitId || "unknown";
    const item = modules.get(key) || {
      chapter_id: labels.chapter_id,
      chapter_label: labels.chapter_label,
      unit_id: labels.unit_id || unitId,
      unit_label: labels.unit_label || unitId || "未知模块",
      skipped: 0,
      repeated: 0,
      users: new Set(),
      last_at: ""
    };
    modules.set(key, item);
    return item;
  };
  rows.forEach((row) => {
    const meta = interactionMeta(row);
    if (meta.eventType === "skip_units") {
      const skippedIds = Array.isArray(meta.data.skippedUnitIds) ? meta.data.skippedUnitIds : [];
      skippedIds.forEach((unitId) => {
        const item = ensureModule(unitId, meta);
        item.skipped += 1;
        item.users.add(meta.userId);
        if (!item.last_at || meta.createdAt > item.last_at) item.last_at = meta.createdAt;
      });
    }
    if (meta.eventType === "skip_chapters") {
      const skippedChapterIds = Array.isArray(meta.data.skippedChapterIds) ? meta.data.skippedChapterIds : [];
      skippedChapterIds.forEach((chapterId) => {
        const item = ensureModule(`${chapterId}-chapter`, {
          chapter_id: chapterId,
          chapter_label: chapterDisplayLabel(chapterId),
          unit_label: "整章"
        });
        item.skipped += 1;
        item.users.add(meta.userId);
        if (!item.last_at || meta.createdAt > item.last_at) item.last_at = meta.createdAt;
      });
    }
    if (meta.eventType === "repeat_unit_enter") {
      const item = ensureModule(meta.unitId, meta);
      item.repeated += 1;
      item.users.add(meta.userId);
      if (meta.createdAt > item.last_at) item.last_at = meta.createdAt;
    }
  });
  const resultRows = Array.from(modules.values()).map((item) => ({
    ...item,
    users: item.users.size,
    total: item.skipped + item.repeated
  })).sort((a, b) => b.total - a.total || b.skipped - a.skipped || String(b.last_at).localeCompare(String(a.last_at))).slice(0, 500);
  return { rows: resultRows };
}

function parameterChangeStats(dates) {
  const rows = interactionSourceRows(dates);
  const params = new Map();
  const users = new Set();
  const units = new Set();
  let operations = 0;
  rows.forEach((row) => {
    const meta = interactionMeta(row);
    if (!isParameterOperation(meta)) return;
    const param = meta.data.param || meta.data.name || meta.data.id || meta.data.label || "unknown";
    const key = `${meta.unitId}|${param}`;
    const item = params.get(key) || {
      chapter_id: meta.chapterId,
      unit_id: meta.unitId,
      unit_label: meta.unitLabel,
      module_role: meta.moduleRole,
      param,
      changes: 0,
      users: new Set()
    };
    item.changes += 1;
    item.users.add(meta.userId);
    users.add(meta.userId);
    if (meta.unitId) units.add(meta.unitId);
    operations += 1;
    params.set(key, item);
  });
  return {
    summary: {
      users: users.size,
      operations,
      experiments: units.size
    },
    rows: Array.from(params.values()).map((item) => ({
      ...item,
      users: item.users.size
    })).sort((a, b) => b.changes - a.changes).slice(0, 500)
  };
}

function pathAnalysis(dates) {
  const rows = interactionSourceRows(dates).slice().reverse();
  const paths = new Map();
  rows.forEach((row) => {
    const meta = interactionMeta(row);
    if (!["unit_enter", "repeat_unit_enter", "unit_open"].includes(meta.eventType) || !meta.unitId) return;
    const item = paths.get(meta.userId) || {
      user_id: meta.userId,
      nickname: meta.nickname,
      steps: [],
      first_at: meta.createdAt,
      last_at: meta.createdAt
    };
    if (item.steps[item.steps.length - 1]?.unit_id !== meta.unitId) {
      item.steps.push({
        chapter_id: meta.chapterId,
        unit_id: meta.unitId,
        unit_label: meta.unitLabel,
        module_role: meta.moduleRole,
        at: meta.createdAt
      });
    }
    item.last_at = meta.createdAt;
    paths.set(meta.userId, item);
  });
  return Array.from(paths.values()).map((item) => ({
    ...item,
    step_count: item.steps.length,
    path_preview: item.steps.slice(0, 20).map((step) => step.unit_label || step.unit_id).join(" -> ")
  })).sort((a, b) => b.step_count - a.step_count).slice(0, 500);
}

function interactionDashboard(dates) {
  const rows = interactionRows(dates);
  return {
    summary: interactionSummary(rows),
    unitEngagement: unitEngagement(rows),
    skipRepeat: skipRepeatStats(rows),
    parameterChanges: parameterChangeStats(rows),
    pathAnalysis: pathAnalysis(rows)
  };
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
  shortAnswerResponses,
  interactionSummary,
  unitEngagement,
  skipRepeatStats,
  parameterChangeStats,
  pathAnalysis,
  interactionDashboard
};
