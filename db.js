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

  d.run(`
    CREATE TABLE IF NOT EXISTS agent_decisions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      decision_type TEXT DEFAULT '',
      input_summary TEXT DEFAULT '{}',
      output_summary TEXT DEFAULT '{}',
      confidence REAL DEFAULT 0,
      llm_provider TEXT DEFAULT '',
      latency_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_ad_user ON agent_decisions(user_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_ad_type ON agent_decisions(agent_type)");

  d.run(`
    CREATE TABLE IF NOT EXISTS interaction_evidence_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      agent_decision_id TEXT DEFAULT '',
      chapter_id TEXT DEFAULT '',
      unit_id TEXT DEFAULT '',
      evidence_scope TEXT DEFAULT 'current',
      risk_level TEXT DEFAULT '',
      suggested_move TEXT DEFAULT '',
      friction_score REAL DEFAULT 0,
      engagement_score REAL DEFAULT 0,
      dwell_ms INTEGER DEFAULT 0,
      repeat_count INTEGER DEFAULT 0,
      answer_reveal_count INTEGER DEFAULT 0,
      short_answer_length INTEGER DEFAULT 0,
      parameter_change_count INTEGER DEFAULT 0,
      evidence_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_ies_decision ON interaction_evidence_snapshots(agent_decision_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_ies_user ON interaction_evidence_snapshots(user_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_ies_unit ON interaction_evidence_snapshots(unit_id)");
  d.run("CREATE INDEX IF NOT EXISTS idx_ies_created ON interaction_evidence_snapshots(created_at)");

  try { d.run("ALTER TABLE quiz_results ADD COLUMN ai_score REAL"); } catch {}
  try { d.run("ALTER TABLE quiz_results ADD COLUMN ai_confidence REAL"); } catch {}
  try { d.run("ALTER TABLE quiz_results ADD COLUMN ai_feedback TEXT DEFAULT ''"); } catch {}
  try { d.run("ALTER TABLE quiz_results ADD COLUMN ai_error_type TEXT DEFAULT ''"); } catch {}

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

function clearLearningDataForUser(userId) {
  execute("DELETE FROM quiz_results WHERE user_id = ?", [userId]);
  execute("DELETE FROM snapshots WHERE user_id = ?", [userId]);
}

// ---- Events ----

function insertEvent(record) {
  execute(
    "INSERT OR REPLACE INTO events (id, user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    [record.id, record.user_id, record.type, JSON.stringify(record.payload || {}), record.created_at]
  );
}

// ---- Agent Decisions ----

function insertAgentDecision(record) {
  execute(
    "INSERT OR REPLACE INTO agent_decisions (id, user_id, agent_type, decision_type, input_summary, output_summary, confidence, llm_provider, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [record.id, record.user_id, record.agent_type, record.decision_type || "", JSON.stringify(record.input_summary || {}), JSON.stringify(record.output_summary || {}), record.confidence || 0, record.llm_provider || "", record.latency_ms || 0, record.created_at]
  );
}

function insertInteractionEvidenceSnapshot(record) {
  const evidence = record.evidence && typeof record.evidence === "object" ? record.evidence : {};
  execute(
    `INSERT OR REPLACE INTO interaction_evidence_snapshots
      (id, user_id, agent_decision_id, chapter_id, unit_id, evidence_scope,
       risk_level, suggested_move, friction_score, engagement_score, dwell_ms,
       repeat_count, answer_reveal_count, short_answer_length, parameter_change_count,
       evidence_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.user_id, record.agent_decision_id || "",
      record.chapter_id || evidence.chapterId || "", record.unit_id || evidence.unitId || "",
      record.evidence_scope || "current", evidence.riskLevel || "", evidence.suggestedMove || "",
      Number(evidence.frictionScore || 0), Number(evidence.engagementScore || 0),
      Math.round(Number(evidence.dwellMs || 0)), Number(evidence.repeatCount || 0),
      Number(evidence.answerRevealCount || 0), Number(evidence.shortAnswerLength || 0),
      Number(evidence.parameterChangeCount || 0), JSON.stringify(evidence), record.created_at
    ]
  );
}

function insertInteractionEvidenceBatch(userId, decisionId, chapterId, interactionEvidence, createdAt) {
  if (!userId || !interactionEvidence || typeof interactionEvidence !== "object") return;
  const current = interactionEvidence.current && typeof interactionEvidence.current === "object"
    ? [interactionEvidence.current]
    : [];
  const chapter = Array.isArray(interactionEvidence.chapter) ? interactionEvidence.chapter : [];
  const rows = [
    ...current.map((evidence) => ({ evidence, scope: "current" })),
    ...chapter.map((evidence) => ({ evidence, scope: "chapter" }))
  ];
  rows.forEach((row, index) => {
    insertInteractionEvidenceSnapshot({
      id: `${decisionId || createdAt}-${row.scope}-${index}`,
      user_id: userId,
      agent_decision_id: decisionId || "",
      chapter_id: chapterId || row.evidence?.chapterId || "",
      unit_id: row.evidence?.unitId || "",
      evidence_scope: row.scope,
      evidence: row.evidence,
      created_at: createdAt
    });
  });
}

function updateQuizResultAiGrading(questionId, userId, { aiScore, aiConfidence, aiFeedback, aiErrorType, unitId = "" }) {
  const unitScope = unitId ? " AND unit_id = ?" : "";
  const unitParams = unitId ? [unitId] : [];

  // Skip score overwrite when API failed (aiScore is null) - preserve any existing valid score
  if (aiScore == null) {
    execute(
      `UPDATE quiz_results SET ai_confidence = ?, ai_feedback = ?, ai_error_type = ? WHERE question_id = ? AND user_id = ?${unitScope} AND is_correct = -1`,
      [aiConfidence || 0, aiFeedback || "", aiErrorType || "", questionId, userId, ...unitParams]
    );
    return;
  }
  const existing = queryOne(
    `SELECT max_score FROM quiz_results WHERE question_id = ? AND user_id = ?${unitScope} AND is_correct = -1 ORDER BY created_at DESC LIMIT 1`,
    [questionId, userId, ...unitParams]
  );
  const maxScore = Number(existing?.max_score || 0);
  const earnedScore = maxScore ? Math.round((Math.max(0, Math.min(100, Number(aiScore))) / 100) * maxScore * 10) / 10 : Number(aiScore);
  execute(
    `UPDATE quiz_results SET ai_score = ?, ai_confidence = ?, ai_feedback = ?, ai_error_type = ?, is_correct = CASE WHEN ? >= 60 THEN 1 ELSE 0 END, status = 'ai_reviewed', score = ? WHERE question_id = ? AND user_id = ?${unitScope} AND is_correct = -1`,
    [aiScore, aiConfidence || 0, aiFeedback || "", aiErrorType || "", aiScore, earnedScore, questionId, userId, ...unitParams]
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
           qr.is_correct, qr.status, qr.phase, qr.created_at,
           qr.ai_score, qr.ai_confidence, qr.ai_feedback, qr.ai_error_type
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
    source: payload.source || data.source || "",
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

function interactionActionCategory(eventType = "") {
  if (eventType === "interactive_ready" || eventType === "interactive_render") return "ready";
  if (eventType === "interactive_submit") return "submit";
  if (eventType === "parameter_change" || eventType === "parameter_commit") return "parameter";
  if (eventType === "interactive_input" || eventType === "interactive_change") return "input";
  if (eventType === "interactive_keydown") return "keyboard";
  if (eventType === "interactive_wheel" || eventType === "interactive_scroll") return "wheel";
  if (eventType === "interactive_click" || eventType === "interactive_double_click" || eventType === "interactive_context_menu") return "click";
  if (/^(interactive_|canvas_).*(pointer|drag)/.test(eventType)) return "gesture";
  if (eventType.startsWith("interactive_") || eventType.startsWith("canvas_")) return "other";
  return "";
}

function isCoursewareAction(meta) {
  return meta.source === "iframe" || Boolean(interactionActionCategory(meta.eventType));
}

function coursewareActionCoverage(dates) {
  const rows = interactionSourceRows(dates);
  const byType = new Map();
  const byCategory = new Map();
  let total = 0;

  rows.forEach((row) => {
    const meta = interactionMeta(row);
    if (!isCoursewareAction(meta)) return;
    const category = interactionActionCategory(meta.eventType) || "other";
    total += 1;

    const typeItem = byType.get(meta.eventType) || {
      event_type: meta.eventType,
      category,
      count: 0,
      users: new Set(),
      units: new Set(),
      sample_unit_id: "",
      sample_unit_label: "",
      last_at: ""
    };
    typeItem.count += 1;
    typeItem.users.add(meta.userId);
    if (meta.unitId) typeItem.units.add(meta.unitId);
    if (!typeItem.sample_unit_label && (meta.unitLabel || meta.unitId)) {
      const labels = unitDisplayMeta(meta.unitId, meta);
      typeItem.sample_unit_id = labels.unit_id || meta.unitId;
      typeItem.sample_unit_label = labels.unit_label || meta.unitLabel || meta.unitId;
    }
    if (!typeItem.last_at || meta.createdAt > typeItem.last_at) typeItem.last_at = meta.createdAt;
    byType.set(meta.eventType, typeItem);

    const catItem = byCategory.get(category) || {
      category,
      count: 0,
      users: new Set(),
      units: new Set()
    };
    catItem.count += 1;
    catItem.users.add(meta.userId);
    if (meta.unitId) catItem.units.add(meta.unitId);
    byCategory.set(category, catItem);
  });

  const serialize = (item) => ({
    ...item,
    users: item.users.size,
    units: item.units.size
  });

  return {
    total,
    categories: Array.from(byCategory.values()).map(serialize).sort((a, b) => b.count - a.count),
    types: Array.from(byType.values()).map(serialize).sort((a, b) => b.count - a.count)
  };
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
  const ensureItem = (meta, unitId = meta.unitId, fallback = {}) => {
    if (!unitId) return null;
    const labels = unitDisplayMeta(unitId, { ...meta, ...fallback });
    const key = `${labels.unit_id || unitId}|${meta.userId}`;
    const item = units.get(key) || {
      user_id: meta.userId,
      nickname: meta.nickname,
      chapter_id: labels.chapter_id || meta.chapterId,
      chapter_label: labels.chapter_label || meta.chapterLabel,
      unit_id: labels.unit_id || unitId,
      unit_label: labels.unit_label || fallback.unit_label || meta.unitLabel,
      unit_type: meta.unitType,
      module_role: meta.moduleRole,
      opens: 0,
      completes: 0,
      skips: 0,
      repeats: 0,
      seconds: 0,
      clicks: 0,
      gestures: 0,
      inputs: 0,
      submits: 0,
      keyboard_actions: 0,
      wheel_actions: 0,
      courseware_actions: 0,
      parameter_changes: 0,
      quiz_events: 0,
      last_at: meta.createdAt
    };
    if (meta.createdAt > item.last_at) item.last_at = meta.createdAt;
    units.set(key, item);
    return item;
  };
  rows.forEach((row) => {
    const meta = interactionMeta(row);
    if (meta.eventType === "skip_units") {
      const skippedIds = Array.isArray(meta.data.skippedUnitIds) ? meta.data.skippedUnitIds : [];
      skippedIds.forEach((unitId) => {
        const item = ensureItem(meta, unitId);
        if (item) item.skips += 1;
      });
    }
    if (meta.eventType === "skip_chapters") {
      const skippedChapterIds = Array.isArray(meta.data.skippedChapterIds) ? meta.data.skippedChapterIds : [];
      skippedChapterIds.forEach((chapterId) => {
        const item = ensureItem(meta, `${chapterId}-chapter`, {
          chapter_id: chapterId,
          chapter_label: chapterDisplayLabel(chapterId),
          unit_label: "整章"
        });
        if (item) item.skips += 1;
      });
    }
    if (!meta.unitId) return;
    const item = ensureItem(meta);
    if (!item) return;
    const isUnitOpen = ["unit_enter", "repeat_unit_enter", "unit_open"].includes(meta.eventType)
      || (meta.eventType === "click" && Boolean(meta.data.unit));
    if (isUnitOpen) item.opens += 1;
    if (["unit_complete", "complete_unit"].includes(meta.eventType)) item.completes += 1;
    if (meta.eventType === "repeat_unit_enter") item.repeats += 1;
    if (["time_on_unit", "unit_leave", "leave_unit"].includes(meta.eventType)) item.seconds += Math.round((meta.durationMs || meta.data.seconds * 1000 || 0) / 1000);
    if (/click|pointer|drag/.test(meta.eventType)) item.clicks += 1;
    if (isParameterOperation(meta)) item.parameter_changes += 1;
    if (isCoursewareAction(meta)) item.courseware_actions += 1;
    const actionCategory = interactionActionCategory(meta.eventType);
    if (actionCategory === "gesture") item.gestures += 1;
    if (actionCategory === "input") item.inputs += 1;
    if (actionCategory === "submit") item.submits += 1;
    if (actionCategory === "keyboard") item.keyboard_actions += 1;
    if (actionCategory === "wheel") item.wheel_actions += 1;
    if (/quiz|answer|question|short_answer/.test(meta.eventType)) item.quiz_events += 1;
    if (meta.createdAt > item.last_at) item.last_at = meta.createdAt;
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

function interactionDurationSeconds(meta) {
  const durationMs = Number(meta.durationMs || meta.data.durationMs || 0);
  const seconds = Number(meta.data.seconds || 0);
  return Math.max(0, Math.round(seconds || durationMs / 1000));
}

const EFFECTIVE_PATH_MIN_SECONDS = 10;

function pathAnalysis(dates) {
  const rows = interactionSourceRows(dates).slice().reverse();
  const paths = new Map();
  rows.forEach((row) => {
    const meta = interactionMeta(row);
    const isTimedUnitEvent = ["time_on_unit", "unit_leave", "leave_unit"].includes(meta.eventType);
    if (!isTimedUnitEvent || !meta.unitId) return;
    const seconds = interactionDurationSeconds(meta);
    if (seconds < EFFECTIVE_PATH_MIN_SECONDS) return;
    const item = paths.get(meta.userId) || {
      user_id: meta.userId,
      nickname: meta.nickname,
      steps: [],
      first_at: meta.createdAt,
      last_at: meta.createdAt,
      total_seconds: 0
    };
    item.total_seconds += seconds;
    const lastStep = item.steps[item.steps.length - 1];
    if (lastStep?.unit_id === meta.unitId) {
      lastStep.seconds += seconds;
      lastStep.events += 1;
      lastStep.last_at = meta.createdAt;
    } else {
      const labels = unitDisplayMeta(meta.unitId, meta);
      item.steps.push({
        chapter_id: labels.chapter_id,
        unit_id: meta.unitId,
        unit_label: labels.unit_label,
        module_role: meta.moduleRole,
        at: meta.createdAt,
        last_at: meta.createdAt,
        seconds,
        events: 1
      });
    }
    item.last_at = meta.createdAt;
    paths.set(meta.userId, item);
  });
  return Array.from(paths.values()).filter((item) => item.steps.length > 0).map((item) => ({
    ...item,
    step_count: item.steps.length,
    path_preview: item.steps.slice(0, 20).map((step) => step.unit_label || step.unit_id).join(" -> ")
  })).sort((a, b) => b.total_seconds - a.total_seconds || b.step_count - a.step_count).slice(0, 500);
}

function interactionDashboard(dates) {
  const rows = interactionRows(dates);
  return {
    summary: interactionSummary(rows),
    actionCoverage: coursewareActionCoverage(rows),
    pathRule: { minSeconds: EFFECTIVE_PATH_MIN_SECONDS, label: `单次模块停留至少 ${EFFECTIVE_PATH_MIN_SECONDS} 秒` },
    unitEngagement: unitEngagement(rows),
    skipRepeat: skipRepeatStats(rows),
    parameterChanges: parameterChangeStats(rows),
    pathAnalysis: pathAnalysis(rows)
  };
}

function parseJsonField(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function agenticDecisionTrace(dates = {}) {
  const df = dateFilter("ad.created_at", dates);
  const userId = String(dates?.userId || "").trim();
  const userClause = userId ? " AND ad.user_id = ?" : "";
  const rows = queryAll(
    `SELECT ad.*, u.nickname
     FROM agent_decisions ad
     LEFT JOIN users u ON u.id = ad.user_id
     WHERE ad.agent_type = 'orchestrator'${df.clause}${userClause}
     ORDER BY ad.created_at DESC
     LIMIT 500`,
    [...df.params, ...(userId ? [userId] : [])]
  );
  return rows.map((row) => {
    const input = parseJsonField(row.input_summary);
    const output = parseJsonField(row.output_summary);
    const planner = output.planner || {};
    const plannerTop = Array.isArray(planner.rankedSceneChoices) ? planner.rankedSceneChoices[0] || {} : {};
    const snapshot = queryOne(
      `SELECT * FROM interaction_evidence_snapshots
       WHERE agent_decision_id = ? AND evidence_scope = 'current'
       ORDER BY created_at DESC LIMIT 1`,
      [row.id]
    );
    const snapshotEvidence = snapshot ? parseJsonField(snapshot.evidence_json) : {};
    const evidence = Object.keys(snapshotEvidence).length ? snapshotEvidence : (output.interactionEvidence?.current || {});
    const unitId = input.currentUnitId || evidence.unitId || "";
    const unitMeta = unitDisplayMeta(unitId, { chapter_id: input.chapterId || evidence.chapterId || "" });
    const executedEvents = queryAll(
      `SELECT e.created_at, e.payload
       FROM events e
       WHERE e.user_id = ? AND e.type = 'interaction' AND e.created_at >= ?
       ORDER BY e.created_at ASC
       LIMIT 80`,
      [row.user_id, row.created_at]
    ).map((eventRow) => {
      const payload = parseJsonField(eventRow.payload);
      return { created_at: eventRow.created_at, payload };
    });
    const executed = executedEvents.find((eventRow) => {
      const data = eventRow.payload?.data || {};
      const eventType = eventRow.payload?.eventType || data.eventType || "";
      return eventType === "agentic_decision_executed" && data.sourceAgentDecisionId === row.id;
    }) || executedEvents.find((eventRow) => {
      const payload = eventRow.payload || {};
      const data = payload.data || {};
      const eventType = payload.eventType || payload.data?.eventType || "";
      return eventType === "agentic_decision_executed" && !data.sourceAgentDecisionId && (!unitId || data.fromUnitId === unitId);
    });
    const executedData = executed?.payload?.data || {};
    const outcome = unitId ? queryOne(
      `SELECT COUNT(*) as quiz_count,
              ROUND(AVG(CASE WHEN is_correct >= 0 THEN CAST(is_correct AS REAL) END) * 100, 1) as accuracy,
              SUM(score) as score,
              SUM(max_score) as max_score,
              MAX(created_at) as last_quiz_at
       FROM quiz_results
       WHERE user_id = ? AND created_at >= ? AND chapter_id = ?`,
      [row.user_id, row.created_at, input.chapterId || unitMeta.chapter_id || ""]
    ) : {};
    return {
      id: row.id,
      user_id: row.user_id,
      nickname: row.nickname || "",
      created_at: row.created_at,
      chapter_id: input.chapterId || unitMeta.chapter_id || evidence.chapterId || "",
      chapter_label: unitMeta.chapter_label,
      unit_id: unitId,
      unit_label: unitMeta.unit_label,
      suggested_action: output.action || "",
      qa_pass: output.qa?.pass ?? output.qa?.ok ?? null,
      evidence_snapshot_id: snapshot?.id || "",
      planner_strategy: planner.strategy || "",
      planner_action: planner.recommendedPath?.action || "",
      planner_target_id: planner.recommendedPath?.targetId || plannerTop.id || "",
      planner_target_label: planner.recommendedPath?.targetLabel || plannerTop.label || plannerTop.title || "",
      planner_top_score: plannerTop.score ?? "",
      planner_top_reasons: Array.isArray(plannerTop.reasons) ? plannerTop.reasons.join(";") : "",
      risk_level: evidence.riskLevel || "",
      suggested_move: evidence.suggestedMove || "",
      friction_score: evidence.frictionScore ?? "",
      engagement_score: evidence.engagementScore ?? "",
      dwell_ms: evidence.dwellMs || 0,
      repeat_count: evidence.repeatCount || 0,
      answer_reveal_count: evidence.answerRevealCount || 0,
      short_answer_length: evidence.shortAnswerLength || 0,
      learner_action: executedData.action || "",
      target_id: executedData.targetId || "",
      target_label: executedData.targetLabel || unitDisplayMeta(executedData.targetId || "").unit_label || "",
      executed_at: executed?.created_at || "",
      source_agent_decision_id: executedData.sourceAgentDecisionId || "",
      recommendation_created_at: executedData.recommendationCreatedAt || "",
      choice_latency_ms: executedData.choiceLatencyMs ?? "",
      candidate_actions: Array.isArray(executedData.candidateActions) ? executedData.candidateActions : [],
      selected_action_label: executedData.selectedActionLabel || "",
      selected_candidate_ids: Array.isArray(executedData.selectedCandidateIds) ? executedData.selectedCandidateIds : [],
      selected_scene_id: executedData.selectedSceneId || "",
      selected_scenario_type: executedData.selectedScenarioType || "",
      next_unit_id: executedData.nextUnitId || "",
      next_cluster_id: executedData.nextClusterId || "",
      next_cluster_label: executedData.nextClusterLabel || "",
      outcome_quiz_count: outcome?.quiz_count || 0,
      outcome_accuracy: outcome?.accuracy ?? null,
      outcome_score: outcome?.score || 0,
      outcome_max_score: outcome?.max_score || 0,
      outcome_last_quiz_at: outcome?.last_quiz_at || ""
    };
  });
}

function interactionEvidenceSnapshots(dates = {}) {
  const df = dateFilter("ies.created_at", dates);
  const userId = String(dates?.userId || "").trim();
  const userClause = userId ? " AND ies.user_id = ?" : "";
  return queryAll(
    `SELECT ies.*, u.nickname
     FROM interaction_evidence_snapshots ies
     LEFT JOIN users u ON u.id = ies.user_id
     WHERE 1=1${df.clause}${userClause}
     ORDER BY ies.created_at DESC
     LIMIT 1000`,
    [...df.params, ...(userId ? [userId] : [])]
  );
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
  clearLearningDataForUser,
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
  interactionDashboard,
  agenticDecisionTrace,
  interactionEvidenceSnapshots,
  insertAgentDecision,
  insertInteractionEvidenceBatch,
  insertInteractionEvidenceSnapshot,
  updateQuizResultAiGrading,
  interactionRows
};
