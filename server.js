const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
// Load .env (if present) so LLM_PROVIDER / PIONEER_API_KEY etc. can be configured without a process manager.
(function loadEnvFile() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      const first = val.charCodeAt(0);
      const last = val.charCodeAt(val.length - 1);
      if (val.length >= 2 && first === last && (first === 34 || first === 39)) val = val.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.warn(".env load skipped:", e.message);
  }
})();

const db = require("./db");
const kg = require("./lib/kg");
const coach = require("./lib/agentic-coach");
const orchestrator = require("./lib/agent-orchestrator");
const root = process.cwd();
const port = Number(process.argv[2] || process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const maxBodyBytes = 1024 * 1024;
const maxBufferedStaticBytes = 512 * 1024;
const maxGzipBytes = 256 * 1024;
const gzipCache = new Map();
const maxGzipCacheEntries = 32;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"
};

function send(res, status, body, type = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

function shouldCompress(req, type, size) {
  if (!/\btext\/|javascript|json|svg|xml/.test(type)) return false;
  if (!/\bgzip\b/.test(req.headers["accept-encoding"] || "")) return false;
  return size > 1024 && size <= maxGzipBytes;
}

function cacheControlFor(filePath, url) {
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  const ext = path.extname(filePath).toLowerCase();
  // Versioned assets (cache-busted with ?v= param) can be cached aggressively
  if (url && url.searchParams.has("v") && (ext === ".js" || ext === ".css")) return "public, max-age=604800, immutable";
  if (relative === "index.html" || relative === "admin.html") return "no-store, max-age=0, no-transform";
  if (ext === ".js" || ext === ".css") return "no-store, max-age=0";
  if (relative.startsWith("resources/") && ext === ".json") return "public, max-age=3600";
  if (relative.startsWith("resources/")) return "public, max-age=86400";
  return "public, max-age=3600";
}

function contentSecurityPolicyFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".html") return null;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' data: https://cdn.jsdelivr.net",
    "img-src 'self' data: blob:",
    "font-src 'self' data: about:",
    "media-src 'self' data: blob:",
    "frame-src 'self'",
    "child-src 'self'",
    "worker-src 'self' blob:",
    "connect-src 'self'"
  ].join("; ");
}

function staticHeaders(filePath, url, extraHeaders = {}) {
  const headers = {
    "Cache-Control": cacheControlFor(filePath, url),
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  };
  const csp = contentSecurityPolicyFor(filePath);
  if (csp) headers["Content-Security-Policy"] = csp;
  return headers;
}

function gzipCacheKey(filePath, data) {
  try {
    const stat = fs.statSync(filePath);
    return `${filePath}:${stat.mtimeMs}:${data.length}`;
  } catch {
    return `${filePath}:${data.length}`;
  }
}

function rememberGzip(key, value) {
  if (value.length > maxGzipBytes) return;
  gzipCache.set(key, value);
  if (gzipCache.size <= maxGzipCacheEntries) return;
  const oldest = gzipCache.keys().next().value;
  if (oldest) gzipCache.delete(oldest);
}

function isBlockedStaticResource(filePath) {
  const relative = path.relative(root, filePath).replaceAll(path.sep, "/");
  return /^resources\/open-maic\/[^/]+\/manifest\.json$/.test(relative);
}

function streamStaticFile(req, res, filePath, type, url, stat) {
  const headers = staticHeaders(filePath, url, {
    "Content-Length": String(stat.size)
  });
  res.writeHead(200, {
    "Content-Type": type,
    ...headers
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    console.error("Static stream error:", error.message);
    if (!res.headersSent) send(res, 500, "Internal server error");
    else res.destroy(error);
  });
  stream.pipe(res);
}

function getDateRange(url) {
  const range = url.searchParams.get("range") || "";
  if (range) {
    const bj = new Date(new Date().getTime() + 8 * 3600 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    let start, end;
    switch (range) {
      case "today":
        start = fmt(bj); end = fmt(bj) + "T23:59:59.999";
        break;
      case "yesterday": {
        const y = new Date(bj.getTime() - 86400000);
        start = fmt(y); end = fmt(y) + "T23:59:59.999";
        break;
      }
     case "24h": {
       const pad = (n) => String(n).padStart(2, "0");
        const d = new Date(bj.getTime() - 86400000); // 24h ago Beijing time
       start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
       end = "";
       break;
     }
      case "14d": {
        const d = new Date(bj.getTime() - 14 * 86400000);
        start = fmt(d); end = fmt(bj) + "T23:59:59.999";
        break;
      }
      case "30d": {
        const d = new Date(bj.getTime() - 30 * 86400000);
        start = fmt(d); end = fmt(bj) + "T23:59:59.999";
        break;
      }
      case "month": {
        start = fmt(new Date(bj.getFullYear(), bj.getMonth(), 1));
        end = fmt(bj) + "T23:59:59.999";
        break;
      }
      default:
        start = ""; end = "";
    }
    return { startDate: start, endDate: end };
  }
  const start = url.searchParams.get("start_date") || "";
  const end = url.searchParams.get("end_date") || "";
  // adjust end_date to be inclusive (end of day)
  const endInclusive = end ? end + "T23:59:59.999" : "";
  return { startDate: start, endDate: endInclusive };
}

function nowIso() {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, -1) + "+08:00";
}

function cleanNickname(value = "") {
  return String(value).trim().replace(/\s+/g, " ").slice(0, 24);
}

function participantIdFor(nickname) {
  return `participant-${crypto.createHash("sha256").update(nickname).digest("hex").slice(0, 12)}`;
}

function safePublicParticipant(row) {
  if (!row) return null;
  return {
    participantId: row.id,
    loginMode: "nickname",
    nickname: row.nickname,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

function summaryFromData(data) {
  if (!data) return {};
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return {
    completed: Array.isArray(parsed.completed) ? parsed.completed.length : 0,
    quizResults: Array.isArray(parsed.quizResults) ? parsed.quizResults.length : 0,
    logs: Array.isArray(parsed.logs) ? parsed.logs.length : 0,
    currentChapterId: parsed.currentChapterId || "",
    currentUnitId: parsed.currentUnitId || "",
    hasNote: Boolean(parsed.note)
  };
}

// Simple in-memory rate limiter: 120 req/min per IP for API routes
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 120;

function checkRateLimit(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.resetAt > RATE_LIMIT_WINDOW) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;

 // Cleanup stale entries periodically
 if (rateLimitMap.size > 5000) {
   for (const [key, val] of rateLimitMap) {
     if (now - val.resetAt > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
   }
 }
  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function bearerToken(req, body = {}) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return String(body.token || "").trim();
}

function authenticate(req, body = {}) {
  const token = bearerToken(req, body);
  if (!token) return null;
  const session = db.getSession(token);
  if (!session) return null;
  const participant = db.getUser(session.user_id);
  if (!participant) return null;
  const ts = nowIso();
  db.touchSession(token, ts);
  db.upsertUser(participant.id, participant.nickname, participant.created_at, ts);
  return { participant, token };
}

function persistClientQuizResults(participant, rows = []) {
  if (!participant || !Array.isArray(rows)) return;
  rows.forEach((row) => {
    if (!row || !row.questionId && !row.question_id) return;
    const questionId = row.questionId || row.question_id || "";
    const unitId = row.unitId || row.unit_id || "";
    db.insertQuizResult({
      id: row.id || `${participant.id}-${unitId}-${questionId}`,
      user_id: participant.id,
      chapter_id: row.chapterId || row.chapter_id || "",
      chapter_label: row.chapterLabel || row.chapter_label || "",
      unit_id: unitId,
      unit_label: row.unitLabel || row.unit_label || "",
      question_id: questionId,
      question_type: row.questionType || row.question_type || row.mode || "",
      phase: row.phase || "",
      points: row.points || 0,
      response: row.response ?? "",
      is_correct: row.isCorrect === true ? 1 : row.isCorrect === false ? 0 : -1,
      status: row.status || "",
      score: row.score || 0,
      max_score: row.maxScore || row.max_score || 0,
      created_at: row.timestamp || row.created_at || nowIso()
    });
  });
}

function persistGradingResults(participant, results = []) {
  if (!participant || !Array.isArray(results)) return;
  results.forEach((gr) => {
    if (!gr?.questionId) return;
    db.updateQuizResultAiGrading(gr.questionId, participant.id, {
      unitId: gr.unitId || gr.unit_id || "",
      aiScore: gr.score,
      aiConfidence: gr.confidence,
      aiFeedback: gr.feedback,
      aiErrorType: gr.errorType
    });
    db.insertAgentDecision({
      id: crypto.randomUUID(),
      user_id: participant.id,
      agent_type: "grading",
      decision_type: "grade",
      input_summary: { questionId: gr.questionId },
      output_summary: { score: gr.score, confidence: gr.confidence, errorType: gr.errorType },
      confidence: gr.confidence,
      llm_provider: gr.provider || "",
      latency_ms: 0,
      created_at: new Date().toISOString()
    });
  });
}

function getAdminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  try {
    const tokenFile = path.join(root, "data", "admin-token.txt");
    if (fs.existsSync(tokenFile)) return fs.readFileSync(tokenFile, "utf8").trim();
  } catch (e) {
    console.error("Failed to read admin-token.txt:", e.message);
  }
  return "";
}

function checkAdmin(req) {
  const configuredToken = getAdminToken();
  if (!configuredToken) return false;
  const requestedToken = bearerToken(req) || "";
  return requestedToken === configuredToken;
}

function safeStaticPath(urlPath) {
  let decoded = "/";
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (e) {
    console.error("Failed to decode URL path:", urlPath, e.message);
    return null;
  }
  const publicPath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  // Block access to sensitive directories
  if (/^(data|ops|config|node_modules|\.claude|\.git)(\/|$)/.test(publicPath)) return null;
  const filePath = path.resolve(root, publicPath);
  return filePath === root || filePath.startsWith(root + path.sep) ? filePath : null;
}

async function handleApi(req, res, url) {
  if (!checkRateLimit(req)) {
    sendJson(res, 429, { ok: false, message: "Too many requests. Please slow down." });
    return;
  }
  try {
    // ---- Auth ----
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, time: nowIso() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(req);
      const nickname = cleanNickname(body.nickname);
      if (!nickname) {
        sendJson(res, 400, { ok: false, message: "Nickname is required." });
        return;
      }
      const timestamp = nowIso();
      const participantId = participantIdFor(nickname);
      const existing = db.getUser(participantId);
      db.upsertUser(participantId, nickname, existing?.created_at || timestamp, timestamp);
      const token = crypto.randomBytes(24).toString("hex");
      db.createSession(token, participantId, timestamp);
      db.insertEvent({
        id: crypto.randomUUID(),
        user_id: participantId,
        type: "login",
        payload: { nickname },
        created_at: timestamp
      });
      const user = db.getUser(participantId);
      sendJson(res, 200, { ok: true, participant: safePublicParticipant(user), token });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/me") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      sendJson(res, 200, { ok: true, participant: safePublicParticipant(auth.participant) });
      return;
    }

    // ---- Learning Events ----
    if (req.method === "POST" && url.pathname === "/api/learning/event") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const eventId = crypto.randomUUID();
      const timestamp = nowIso();
      const eventType = String(body.type || "event").slice(0, 80);

      db.insertEvent({
        id: eventId,
        user_id: auth.participant.id,
        type: eventType,
        payload: body.payload || {},
        created_at: timestamp
      });

      // If it's a quiz_result, also insert into quiz_results table
      if (eventType === "quiz_result") {
        const q = body.payload || {};
        db.insertQuizResult({
          id: q.id || eventId,
          user_id: auth.participant.id,
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
          created_at: q.timestamp || timestamp
        });
      }

      sendJson(res, 200, { ok: true, eventId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/events") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
      const eventIds = [];
      const timestamp = nowIso();

      events.forEach((item) => {
        const eventId = crypto.randomUUID();
        eventIds.push(eventId);
        db.insertEvent({
          id: eventId,
          user_id: auth.participant.id,
          type: String(item.type || "event").slice(0, 80),
          payload: item.payload || {},
          created_at: timestamp
        });
      });

      sendJson(res, 200, { ok: true, eventIds });
      return;
    }

    // ---- Learning Snapshot ----
    if (req.method === "GET" && url.pathname === "/api/learning/snapshot") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const snap = db.getLatestSnapshot(auth.participant.id);
      if (!snap) { sendJson(res, 200, { ok: true, snapshot: null }); return; }
      let data = {};
      try { data = JSON.parse(snap.data); } catch { /* use empty */ }
      sendJson(res, 200, { ok: true, snapshot: { ...data, capturedAt: snap.created_at } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/snapshot") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const timestamp = nowIso();
      const snapshotData = body.snapshot || {};
      const snapshotId = crypto.randomUUID();

      db.insertSnapshot({
        id: snapshotId,
        user_id: auth.participant.id,
        reason: String(body.reason || "manual").slice(0, 80),
        data: snapshotData,
        created_at: timestamp
      });

     db.upsertUser(auth.participant.id, auth.participant.nickname, auth.participant.created_at, timestamp);
     sendJson(res, 200, { ok: true, snapshotId });
     return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/reset") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const timestamp = nowIso();
      const snapshotData = body.snapshot || {};
      const snapshotId = crypto.randomUUID();

      db.clearLearningDataForUser(auth.participant.id);
      db.insertSnapshot({
        id: snapshotId,
        user_id: auth.participant.id,
        reason: "reset",
        data: snapshotData,
        created_at: timestamp
      });
      db.upsertUser(auth.participant.id, auth.participant.nickname, auth.participant.created_at, timestamp);

      sendJson(res, 200, { ok: true, snapshotId, cleared: true });
      return;
    }

    // ---- Learning Quiz Results (for cross-browser sync - authoritative source) ----
    if (req.method === "GET" && url.pathname === "/api/learning/quiz-results") {
      const auth = authenticate(req);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const results = db.getQuizResultsByUser(auth.participant.id, 500);
      sendJson(res, 200, { ok: true, data: results });
      return;
    }

    // ---- Admin: Export raw data (backward compat) ----
    if (req.method === "GET" && url.pathname === "/api/admin/export") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const d = db.getDbSync();
      const users = [];
      const us = d.prepare("SELECT * FROM users");
      while (us.step()) users.push(us.getAsObject());
      us.free();

      const participants = {};
      for (const u of users) {
        const snap = db.getLatestSnapshot(u.id);
        participants[u.id] = {
          participantId: u.id, loginMode: "nickname", nickname: u.nickname,
          createdAt: u.created_at, updatedAt: u.last_seen_at, lastSeenAt: u.last_seen_at,
          stats: snap ? summaryFromData(snap.data) : {}
        };
      }
      const qrs = [];
      const qs = d.prepare("SELECT * FROM quiz_results");
      while (qs.step()) qrs.push(qs.getAsObject());
      qs.free();
      sendJson(res, 200, { ok: true, data: { version: 2, participants, quizResults: qrs } });
      return;
    }

    // ---- Admin Stats APIs ----
    if (req.method === "GET" && url.pathname === "/api/admin/stats/overview") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.statsOverview(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/chapter-accuracy") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.chapterAccuracy(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/question-errors") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.questionErrors(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/user-progress") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.userProgress(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/daily-activity") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.dailyActivity(30, dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/phase-comparison") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.phaseComparison(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/user-detail") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const userId = url.searchParams.get("userId") || "";
      if (!userId) { sendJson(res, 400, { ok: false, message: "userId required." }); return; }
      const dates = getDateRange(url);
      const detail = db.userDetail(userId, dates);
      if (!detail) { sendJson(res, 404, { ok: false, message: "User not found." }); return; }
      sendJson(res, 200, { ok: true, data: detail });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/users") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      sendJson(res, 200, { ok: true, data: db.listUsers() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/question-type-accuracy") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.questionTypeAccuracy(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/score-distribution") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.scoreDistribution(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/hourly-activity") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.hourlyActivity(30, dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/short-answer-responses") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      sendJson(res, 200, { ok: true, data: db.shortAnswerResponses(dates) });
      return;
    }
    
    // ---- Admin: Interactions tracking ----
    if (req.method === "GET" && url.pathname === "/api/admin/stats/interactions") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 100), 1000));
      const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
      const userId = url.searchParams.get("userId") || "";
      const data = db.getEventsByType("interaction", { limit, offset, userId, dates });
      sendJson(res, 200, { ok: true, data });
      return;
    }

    // ---- Learning KG plan + agentic narration ----
    if (req.method === "GET" && url.pathname === "/api/learning/kg") {
      sendJson(res, 200, { ok: true, kg: kg.getKg() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/grade") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const questions = Array.isArray(body.questions) ? body.questions.slice(0, 50) : [];
      try {
        const results = await orchestrator.gradeOnly(questions);
        persistGradingResults(auth.participant, results);
        sendJson(res, 200, { ok: true, results });
      } catch (err) {
        sendJson(res, 500, { ok: false, message: err.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/learning/kg/plan") {
      const body = await readJsonBody(req);
      const auth = authenticate(req, body);
      if (!auth) { sendJson(res, 401, { ok: false, message: "Not signed in." }); return; }
      const chapterId = String(body.chapterId || "").trim();
      const currentUnitId = String(body.currentUnitId || "").trim();
      if (!chapterId) { sendJson(res, 400, { ok: false, message: "chapterId required." }); return; }
      const sourceResults = Array.isArray(body.quizResults)
        ? body.quizResults.slice(0, 500)
        : db.getQuizResultsByUser(auth.participant.id, 200);
      persistClientQuizResults(auth.participant, sourceResults);
      const filtered = sourceResults.filter((row) => {
        const unitId = row.unit_id || row.unitId || "";
        const cid = row.chapter_id || row.chapterId || unitId.split("-scene-")[0];
        return cid === chapterId;
      });
      try {
        // Fetch recent interaction events from DB (client queue is flushed and cleared)
        const recentEvents = db.interactionRows({ userId: auth.participant.id }, 200)
          .map(row => { try { return typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload; } catch { return {}; } })
          .slice(-80);
        const result = await orchestrator.orchestrate({
          chapterId, currentUnitId, quizResults: filtered,
          quizQuestions: Array.isArray(body.quizQuestions) ? body.quizQuestions : [],
          interactionEvidence: body.interactionEvidence && typeof body.interactionEvidence === "object" ? body.interactionEvidence : null,
          interactionEvents: recentEvents,
          completedUnitIds: Array.isArray(body.completedUnitIds) ? body.completedUnitIds.slice(0, 500) : [],
          studentName: auth.participant.nickname || "同学"
        });
        persistGradingResults(auth.participant, result.gradingResults);
        const decisionId = crypto.randomUUID();
        const decisionCreatedAt = nowIso();
        db.insertAgentDecision({
          id: decisionId, user_id: auth.participant.id, agent_type: "orchestrator",
          decision_type: "plan", input_summary: { chapterId, currentUnitId },
          output_summary: { action: result.assessment?.suggestedAction, qa: result.qa, planner: result.planner, interactionEvidence: result.interactionEvidence },
          confidence: result.assessment?.confidenceLevel || 0, llm_provider: result.provider,
          latency_ms: result.latencyMs || 0, created_at: decisionCreatedAt
        });
        db.insertInteractionEvidenceBatch(auth.participant.id, decisionId, chapterId, result.interactionEvidence, decisionCreatedAt);
        sendJson(res, 200, { ok: true, decisionId, decisionCreatedAt, plan: result.plan, narration: result.narration, provider: result.provider, gradingResults: result.gradingResults, assessment: result.assessment, analytics: result.analytics, planner: result.planner, interactionEvidence: result.interactionEvidence });
      } catch (err) {
        const summary = kg.summariseQuizResults(filtered);
        const planResult = coach.plan({ chapterId, currentUnitId, quizSummary: summary });
        let narration = "", provider = "fallback";
        try { const out = await coach.explain(planResult, { studentName: auth.participant.nickname || "同学" }); narration = out.narration; provider = out.provider; } catch { narration = "（AI 助教暂时离线，下面是基于规则的建议。）"; }
        const fallbackEvidence = body.interactionEvidence && typeof body.interactionEvidence === "object" ? body.interactionEvidence : null;
        let decisionId = "";
        let decisionCreatedAt = "";
        if (fallbackEvidence) {
          decisionId = crypto.randomUUID();
          decisionCreatedAt = nowIso();
          db.insertAgentDecision({
            id: decisionId, user_id: auth.participant.id, agent_type: "orchestrator",
            decision_type: "plan_fallback", input_summary: { chapterId, currentUnitId },
            output_summary: { action: planResult?.suggestedAction || "", error: err.message, interactionEvidence: fallbackEvidence },
            confidence: 0, llm_provider: provider, latency_ms: 0, created_at: decisionCreatedAt
          });
          db.insertInteractionEvidenceBatch(auth.participant.id, decisionId, chapterId, fallbackEvidence, decisionCreatedAt);
        }
        sendJson(res, 200, { ok: true, decisionId, decisionCreatedAt, plan: planResult, narration, provider });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/interaction-dashboard") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.interactionDashboard(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/agentic-decision-trace") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.agenticDecisionTrace(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/interaction-evidence-snapshots") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.interactionEvidenceSnapshots(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/interaction-summary") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.interactionSummary(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/unit-engagement") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.unitEngagement(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/skip-repeat") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.skipRepeatStats(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/parameter-changes") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.parameterChangeStats(dates) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/stats/path-analysis") {
      if (!checkAdmin(req)) { sendJson(res, 403, { ok: false, message: "Admin token required." }); return; }
      const dates = getDateRange(url);
      dates.userId = url.searchParams.get("userId") || "";
      sendJson(res, 200, { ok: true, data: db.pathAnalysis(dates) });
      return;
    }

    sendJson(res, 404, { ok: false, message: "API endpoint not found." });
  } catch (error) {
    console.error("API error:", error);
    const status = error.message === "Request body is too large" ? 413
      : error.message === "Invalid JSON body" ? 400
      : 500;
    sendJson(res, status, { ok: false, message: status === 500 ? "Internal server error." : error.message });
  }
}

const server = http.createServer((req, res) => {
  // Security headers (defense-in-depth)
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  const filePath = safeStaticPath(url.pathname);
  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }
  if (isBlockedStaticResource(filePath)) {
    send(res, 410, "Full manifests are disabled. Use the lightweight index.json files.");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const type = types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    if (stat.size > maxBufferedStaticBytes || req.method === "HEAD") {
      streamStaticFile(req, res, filePath, type, url, stat);
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        send(res, 404, "Not found");
        return;
      }

      if (shouldCompress(req, type, stat.size)) {
        const cacheKey = gzipCacheKey(filePath, data);
        const cached = gzipCache.get(cacheKey);
        if (cached) {
          send(res, 200, cached, type, staticHeaders(filePath, url, {
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding"
          }));
          return;
        }
        zlib.gzip(data, (gzipError, compressed) => {
          if (gzipError) {
            send(res, 200, data, type, staticHeaders(filePath, url));
            return;
          }
          rememberGzip(cacheKey, compressed);
          send(res, 200, compressed, type, staticHeaders(filePath, url, {
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding"
          }));
        });
        return;
      }
      send(res, 200, data, type, staticHeaders(filePath, url));
    });
  });
});

// Initialize database on startup, then start server
db.getDb().then(() => {
 console.log("Database initialized.");
  // Migration: fix existing is_correct bug where pending short answers (-1) were stored as 1
 try {
    db.getDbSync().run(
     "UPDATE quiz_results SET is_correct = -1 WHERE question_type = 'short_answer' AND is_correct = 1"
   );
    const fixedCount = db.getDbSync().getRowsModified();
    if (fixedCount > 0) {
     db.saveNow();
      console.log(`Data migration: fixed ${fixedCount} short answer is_correct values.`);
   }
 } catch (e) {
   console.warn("Migration skipped:", e.message);
 }
 server.listen(port, host, () => {
    console.log(`Calculus Quest running at http://${host}:${port}/`);
    console.log(`Admin dashboard: http://${host}:${port}/admin.html`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
